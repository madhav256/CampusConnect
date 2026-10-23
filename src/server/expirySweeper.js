import { getAdminDb, FieldValue, Timestamp } from "../../scripts/adminClient.mjs";
import { normalizeQueueHead } from "./queueHeadNormalization.js";
import { dispatchContinuationTask } from "./taskDispatcher.js";

/**
 * processExpiredOffers (Contract 6)
 * Scheduled background sweeper that discovers expired offers via circular checkpoint pagination,
 * handles post-start freeze, and rolls seats over to successor candidates.
 *
 * @param {object} [options]
 * @param {string} [options.workerId]
 * @param {FirebaseFirestore.Firestore} [db]
 * @returns {Promise<object>}
 */
export async function processExpiredOffers(options = {}, db) {
  const firestore = (db && (db.runTransaction || db.collection))
    ? db
    : (options && (options.runTransaction || options.collection))
    ? options
    : getAdminDb();
  const workerId = options.workerId || `sweeper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const checkpointRef = firestore.collection("systemWaitlistJobs").doc("expirySweeperCheckpoint");

  const nowMillis = Date.now();
  const nowTimestamp = Timestamp.fromMillis(nowMillis);
  const leaseDurationMs = 50000; // 50s lease

  // Phase 1: Acquire Exclusive Checkpoint Lease
  let checkpoint;
  try {
    checkpoint = await firestore.runTransaction(async (transaction) => {
      const snap = await transaction.get(checkpointRef);
      const data = snap.exists ? snap.data() : {
        cursorOfferExpiresAt: null,
        cursorSlotPath: null,
        cycleSequence: 0,
        leaseWorkerId: null,
        leaseExpiresAt: null,
        fencingToken: 0,
      };

      const leaseExpiresMillis = data.leaseExpiresAt?.toMillis ? data.leaseExpiresAt.toMillis() : (data.leaseExpiresAt?.seconds ? data.leaseExpiresAt.seconds * 1000 : 0);
      const isLeaseActive = data.leaseWorkerId !== null && leaseExpiresMillis >= nowMillis;

      if (isLeaseActive) {
        return null; // Another sweeper is actively running
      }

      const nextFencingToken = (data.fencingToken || 0) + 1;
      const updatedData = {
        cursorOfferExpiresAt: data.cursorOfferExpiresAt || null,
        cursorSlotPath: data.cursorSlotPath || null,
        cycleSequence: data.cycleSequence || 0,
        leaseWorkerId: workerId,
        leaseExpiresAt: Timestamp.fromMillis(nowMillis + leaseDurationMs),
        fencingToken: nextFencingToken,
        updatedAt: FieldValue.serverTimestamp(),
      };

      transaction.set(checkpointRef, updatedData, { merge: true });
      return updatedData;
    });
  } catch (err) {
    return { success: false, processedCount: 0, status: "lease_acquisition_failed", error: err.message };
  }

  if (!checkpoint) {
    return { success: true, processedCount: 0, status: "lease_locked", message: "Concurrent sweeper run active" };
  }

  const acquiredFencingToken = checkpoint.fencingToken;
  let cursorExpiresAt = checkpoint.cursorOfferExpiresAt;
  let cursorPath = checkpoint.cursorSlotPath;
  let cycleSequence = checkpoint.cycleSequence;

  let totalProcessed = 0;
  let rolledOverCount = 0;
  let exhaustedCount = 0;
  let deferredKickoffCount = 0;
  let lastEvaluatedDoc = null;

  const BATCH_LIMIT = options.limit || 25;
  let residualLimit = BATCH_LIMIT;
  let wrapArounds = 0;
  const MAX_WRAP_AROUNDS = 1;

  while (residualLimit > 0 && wrapArounds <= MAX_WRAP_AROUNDS) {
    let query = firestore.collectionGroup("eventWaitlistSlots")
      .where("status", "==", "offered")
      .where("offerExpiresAt", "<=", nowTimestamp)
      .orderBy("offerExpiresAt", "asc")
      .orderBy("__name__", "asc");

    if (cursorExpiresAt && cursorPath) {
      query = query.startAfter(cursorExpiresAt, cursorPath);
    }
    query = query.limit(residualLimit);

    const snapshot = await query.get();

    if (snapshot.empty) {
      // If resumed from a cursor and found nothing, execute same-invocation wrap-around from epoch
      if (cursorExpiresAt !== null && wrapArounds < MAX_WRAP_AROUNDS) {
        cursorExpiresAt = null;
        cursorPath = null;
        cycleSequence += 1;
        wrapArounds += 1;
        continue;
      }
      break;
    }

    // Process each expired slot
    for (const doc of snapshot.docs) {
      lastEvaluatedDoc = doc;
      const slotData = doc.data();
      const eventId = slotData.eventId;
      const slotSeq = slotData.sequenceNumber;

      try {
        const result = await firestore.runTransaction(async (transaction) => {
          const eventRef = firestore.collection("events").doc(eventId);
          const coordinatorRef = firestore.collection("eventCapacities").doc(eventId);
          const liveSlotRef = doc.ref;

          const [eventSnap, capSnap, liveSlotSnap] = await Promise.all([
            transaction.get(eventRef),
            transaction.get(coordinatorRef),
            transaction.get(liveSlotRef),
          ]);

          if (!eventSnap.exists || !capSnap.exists || !liveSlotSnap.exists) {
            return { action: "skipped_missing_document" };
          }

          const event = eventSnap.data();
          const coordinator = capSnap.data();
          const liveSlot = liveSlotSnap.data();

          // Idempotency check: must still be offered and expired
          const slotExpiresMillis = liveSlot.offerExpiresAt?.toMillis ? liveSlot.offerExpiresAt.toMillis() : (liveSlot.offerExpiresAt?.seconds ? liveSlot.offerExpiresAt.seconds * 1000 : 0);
          if (liveSlot.status !== "offered" || (slotExpiresMillis && nowMillis < slotExpiresMillis)) {
            return { action: "already_resolved" };
          }

          // Kickoff Freeze & Migration Lock: Zero lifecycle writes, cursor advances past
          const eventStartMillis = event.startAt?.toMillis ? event.startAt.toMillis() : (event.startAt?.seconds ? event.startAt.seconds * 1000 : 0);
          if ((eventStartMillis && nowMillis >= eventStartMillis) || event.registrationStatus === "migration_locked") {
            return { action: "deferred_frozen" };
          }

          const candidateUserId = liveSlot.userId;
          const memberRef = firestore.collection("eventWaitlistMembers").doc(`${eventId}_${candidateUserId}`);
          const memberSnap = await transaction.get(memberRef);

          // Execute normalization reads before any writes
          let outcome = null;
          if (coordinator.waitlistCount > 0) {
            outcome = await normalizeQueueHead(transaction, eventId, coordinator);
          }

          // Mark slot expired and delete companion member
          transaction.update(liveSlotRef, {
            status: "expired",
            resolvedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (memberSnap.exists) {
            transaction.delete(memberRef);
          }

          if (outcome && outcome.outcome === "candidateFound") {
            const successorSeq = outcome.candidateSequence;
            const successorUserId = outcome.candidateSlot.userId;

            const offerDurationMs = 24 * 60 * 60 * 1000;
            const offerDeadlineMillis = Math.min(nowMillis + offerDurationMs, eventStartMillis || (nowMillis + offerDurationMs));
            const offerExpiresAt = Timestamp.fromMillis(offerDeadlineMillis);

            transaction.update(firestore.collection("eventWaitlistSlots").doc(`${eventId}_${successorSeq}`), {
              status: "offered",
              offeredAt: FieldValue.serverTimestamp(),
              offerExpiresAt,
              updatedAt: FieldValue.serverTimestamp(),
            });

            transaction.update(firestore.collection("eventWaitlistMembers").doc(`${eventId}_${successorUserId}`), {
              status: "offered",
              offeredAt: FieldValue.serverTimestamp(),
              offerExpiresAt,
              updatedAt: FieldValue.serverTimestamp(),
            });

            transaction.update(coordinatorRef, {
              headSequence: successorSeq + 1,
              waitlistCount: FieldValue.increment(-1),
              updatedAt: FieldValue.serverTimestamp(),
            });

            transaction.set(firestore.collection("eventWaitlistOutbox").doc(`${eventId}_${successorSeq}`), {
              id: `outbox_${eventId}_${successorSeq}`,
              eventId,
              candidateSequence: successorSeq,
              recipientId: successorUserId,
              type: "event_waitlist_offer",
              status: "pending",
              offerExpiresAt,
              lockedUntil: null,
              deliveredAt: null,
              retryCount: 0,
              errorMessage: null,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });

            return { action: "rolled_over" };
          }

          if (outcome && outcome.outcome === "limitReached") {
            transaction.update(coordinatorRef, {
              offeredCount: FieldValue.increment(-1),
              headSequence: outcome.intermediateHeadSequence,
              updatedAt: FieldValue.serverTimestamp(),
            });

            transaction.set(
              firestore.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`),
              {
                id: `continuation_${eventId}`,
                eventId,
                continuationType: "promotion",
                reason: "promotion_scan_limit",
                intermediateHeadSequence: outcome.intermediateHeadSequence,
                vacanciesRemaining: 1,
                targetBatch: 1,
                normalizationRequired: false,
                status: "pending",
                leaseWorkerId: null,
                leaseExpiresAt: null,
                generation: FieldValue.increment(1),
                retryCount: 0,
                errorMessage: null,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            return { action: "exhausted_limit_reached" };
          }

          // Queue exhausted or waitlistCount == 0
          transaction.update(coordinatorRef, {
            offeredCount: FieldValue.increment(-1),
            waitlistCount: 0,
            headSequence: coordinator.nextSequence,
            updatedAt: FieldValue.serverTimestamp(),
          });

          return { action: "queue_exhausted" };
        });

        totalProcessed++;
        if (result.action === "exhausted_limit_reached") {
          await dispatchContinuationTask(eventId);
        } else if (result.action === "rolled_over") rolledOverCount++;
        else if (result.action === "queue_exhausted") exhaustedCount++;
        else if (result.action === "deferred_frozen") deferredKickoffCount++;
      } catch (slotErr) {
        console.error(`[processExpiredOffers] Failed processing slot ${eventId}_${slotSeq}:`, slotErr);
      }
    }

    residualLimit -= snapshot.docs.length;
    if (snapshot.docs.length < residualLimit) {
      break;
    }
  }

  // Phase 3: Checkpoint Advance & Release Lease with Fencing Token Check
  try {
    await firestore.runTransaction(async (transaction) => {
      const liveSnap = await transaction.get(checkpointRef);
      if (!liveSnap.exists) return;
      const liveData = liveSnap.data();

      // Fencing check: worker must still own lease with matching token
      if (liveData.fencingToken !== acquiredFencingToken || liveData.leaseWorkerId !== workerId) {
        return; // Lease lost or stolen
      }

      const shouldResetCursor = totalProcessed < BATCH_LIMIT || !lastEvaluatedDoc;
      const updatedCursorExpires = shouldResetCursor ? null : (lastEvaluatedDoc.data().offerExpiresAt || null);
      const updatedCursorPath = shouldResetCursor ? null : lastEvaluatedDoc.ref.path;
      const nextCycle = shouldResetCursor ? cycleSequence + 1 : cycleSequence;

      transaction.update(checkpointRef, {
        cursorOfferExpiresAt: updatedCursorExpires,
        cursorSlotPath: updatedCursorPath,
        cycleSequence: nextCycle,
        leaseWorkerId: null,
        leaseExpiresAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    console.warn("[processExpiredOffers] Checkpoint update warning:", err.message);
  }

  return {
    success: true,
    processedCount: totalProcessed,
    rolledOverCount,
    exhaustedCount,
    deferredKickoffCount,
    wrapArounds,
  };
}
