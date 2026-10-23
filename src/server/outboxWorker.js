import { getAdminDb, FieldValue, Timestamp } from "../../scripts/adminClient.mjs";

async function deliverSingleRecord(outboxRef, firestore, nowMillis, leaseDurationMs) {
  // Phase 1: Lease Acquisition
  let record;
  try {
    record = await firestore.runTransaction(async (transaction) => {
      const snap = await transaction.get(outboxRef);
      if (!snap.exists) return null;
      const data = snap.data();

      const lockedUntilMillis = data.lockedUntil?.toMillis
        ? data.lockedUntil.toMillis()
        : (data.lockedUntil?.seconds ? data.lockedUntil.seconds * 1000 : 0);
      const isPending = data.status === "pending";
      const isLeaseExpired = data.status === "processing" && lockedUntilMillis < nowMillis;

      if (!isPending && !isLeaseExpired) {
        return null; // Active lease or already processed
      }

      const nextRetryCount = (data.retryCount || 0) + 1;
      transaction.update(outboxRef, {
        status: "processing",
        lockedUntil: Timestamp.fromMillis(nowMillis + leaseDurationMs),
        retryCount: nextRetryCount,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { ...data, retryCount: nextRetryCount };
    });
  } catch (err) {
    return { status: "lease_acquisition_failed", error: err.message };
  }

  if (!record) {
    return { status: "ignored_or_locked" };
  }

  const { eventId, candidateSequence, recipientId } = record;

  try {
    // Phase 2: Check Preferences & Stale Status
    const userRef = firestore.collection("users").doc(recipientId);
    const eventRef = firestore.collection("events").doc(eventId);
    const slotRef = firestore.collection("eventWaitlistSlots").doc(`${eventId}_${candidateSequence}`);

    const [userSnap, eventSnap, slotSnap] = await Promise.all([
      userRef.get(),
      eventRef.get(),
      slotRef.get(),
    ]);

    // Preference Check: users/{userId}.notificationPreferences.eventWaitlistOffers
    if (userSnap.exists) {
      const userData = userSnap.data();
      const prefs = userData?.notificationPreferences;
      if (prefs && prefs.eventWaitlistOffers === false) {
        await outboxRef.update({
          status: "skipped_preference_disabled",
          lockedUntil: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { status: "skipped_preference_disabled" };
      }
    }

    // Stale Offer Check: slot must still be 'offered' and not expired
    const offerExpiresMillis = record.offerExpiresAt?.toMillis
      ? record.offerExpiresAt.toMillis()
      : (record.offerExpiresAt?.seconds ? record.offerExpiresAt.seconds * 1000 : 0);
    const slotStatus = slotSnap.exists ? slotSnap.data().status : null;

    if (slotStatus !== "offered" || (offerExpiresMillis && nowMillis >= offerExpiresMillis)) {
      await outboxRef.update({
        status: "abandoned_stale",
        lockedUntil: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { status: "abandoned_stale" };
    }

    // Phase 3: Retry-Safe Deterministic Notification Delivery
    const notifId = `offer_${eventId}_${candidateSequence}`;
    const notifRef = firestore.collection("users").doc(recipientId).collection("notifications").doc(notifId);

    const eventTitle = eventSnap.exists ? eventSnap.data().title || "Campus Event" : "Campus Event";

    await firestore.runTransaction(async (transaction) => {
      const notifSnap = await transaction.get(notifRef);
      if (!notifSnap.exists) {
        transaction.set(notifRef, {
          id: notifId,
          recipientId,
          actorId: "system",
          actorName: "CampusConnect Queue",
          actorAvatar: null,
          type: "event_waitlist_offer",
          referenceId: eventId,
          referenceTitle: eventTitle,
          slotSequence: candidateSequence,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      // If notification already exists: Do NOT overwrite isRead or createdAt!

      transaction.update(outboxRef, {
        status: "delivered",
        deliveredAt: FieldValue.serverTimestamp(),
        lockedUntil: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { status: "delivered", notificationId: notifId };
  } catch (err) {
    const currentRetries = record.retryCount || 1;
    if (currentRetries >= 3) {
      await outboxRef.update({
        status: "failed_terminal",
        lockedUntil: null,
        errorMessage: err.message,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { status: "failed_terminal", error: err.message };
    } else {
      await outboxRef.update({
        status: "pending",
        lockedUntil: null,
        errorMessage: err.message,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { status: "pending_retry", error: err.message };
    }
  }
}

/**
 * deliverWaitlistOfferNotification (Contract 8)
 * Processes staged outbox records, checks authoritative preferences,
 * and delivers retry-safe deterministic notifications.
 *
 * Supports both targeted single record mode ({ outboxId })
 * and scheduled / batch worker mode ({ limit }).
 *
 * @param {object} [params]
 * @param {string} [params.outboxId] - ID in format `${eventId}_${candidateSequence}` or `outbox_${eventId}_${candidateSequence}`
 * @param {number} [params.limit=50] - Maximum records to process in batch mode
 * @param {FirebaseFirestore.Firestore} [db] - Optional Firestore instance
 * @returns {Promise<object>} Result status and processed count
 */
export async function deliverWaitlistOfferNotification(params = {}, db) {
  const firestore = (db && db.collection ? db : (params && params.collection ? params : null)) || getAdminDb();
  const { outboxId } = params || {};
  const nowMillis = Date.now();
  const leaseDurationMs = 30000; // 30 seconds

  if (outboxId) {
    // Single-record mode
    let outboxRef = firestore.collection("eventWaitlistOutbox").doc(outboxId);
    let snap = await outboxRef.get();
    if (!snap.exists) {
      const altId = outboxId.startsWith("outbox_") ? outboxId.slice("outbox_".length) : `outbox_${outboxId}`;
      const altRef = firestore.collection("eventWaitlistOutbox").doc(altId);
      const altSnap = await altRef.get();
      if (altSnap.exists) {
        outboxRef = altRef;
      }
    }

    const result = await deliverSingleRecord(outboxRef, firestore, nowMillis, leaseDurationMs);
    const terminalStatuses = ["delivered", "skipped_preference_disabled", "abandoned_stale", "failed_terminal"];
    const isProcessed = terminalStatuses.includes(result.status);

    return {
      success: true,
      processedCount: isProcessed ? 1 : 0,
      ...result,
    };
  }

  // Batch mode: discover pending and expired lease records
  const limit = params.limit || 50;
  const [pendingSnap, processingSnap] = await Promise.all([
    firestore.collection("eventWaitlistOutbox")
      .where("status", "==", "pending")
      .limit(limit)
      .get(),
    firestore.collection("eventWaitlistOutbox")
      .where("status", "==", "processing")
      .limit(limit)
      .get(),
  ]);

  const candidateRefs = [];
  for (const doc of pendingSnap.docs) {
    candidateRefs.push(doc.ref);
  }
  for (const doc of processingSnap.docs) {
    const data = doc.data();
    const lockedUntilMillis = data.lockedUntil?.toMillis
      ? data.lockedUntil.toMillis()
      : (data.lockedUntil?.seconds ? data.lockedUntil.seconds * 1000 : 0);
    if (lockedUntilMillis < nowMillis) {
      candidateRefs.push(doc.ref);
    }
  }

  const batchToProcess = candidateRefs.slice(0, limit);
  let processedCount = 0;
  const results = [];
  const terminalStatuses = ["delivered", "skipped_preference_disabled", "abandoned_stale", "failed_terminal"];

  for (const ref of batchToProcess) {
    const res = await deliverSingleRecord(ref, firestore, nowMillis, leaseDurationMs);
    results.push(res);
    if (terminalStatuses.includes(res.status)) {
      processedCount++;
    }
  }

  return {
    success: true,
    processedCount,
    results,
  };
}
