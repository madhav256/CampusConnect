import { HttpsError as FirebaseHttpsError } from "firebase-functions/v2/https";
import { getAdminDb, FieldValue, Timestamp } from "../../scripts/adminClient.mjs";
import { normalizeQueueHead } from "./queueHeadNormalization.js";
import { dispatchContinuationTask } from "./taskDispatcher.js";

/**
 * Custom error helper matching Firebase Functions HttpsError codes
 */
export class HttpsError extends FirebaseHttpsError {
  constructor(code, message, details) {
    const canonicalCode = typeof code === "string" ? code.toLowerCase().replace(/_/g, "-") : code;
    super(canonicalCode, message, details);
    this.status = code;
  }
}

function resolveFirestore(db, context) {
  if (db && (db.runTransaction || db.collection)) return db;
  if (context && (context.runTransaction || context.collection) && !context.auth && !context.uid) {
    return context;
  }
  return getAdminDb();
}

export function extractAuth(context) {
  if (!context) return null;
  if (context.auth && context.auth.uid) {
    return {
      uid: context.auth.uid,
      campusId: context.auth.token?.campusId || context.auth.campusId || null,
      email: context.auth.token?.email || context.auth.email || null,
    };
  }
  if (context.uid) {
    return {
      uid: context.uid,
      campusId: context.token?.campusId || context.campusId || null,
      email: context.token?.email || context.email || null,
    };
  }
  return null;
}

async function resolveEffectiveCampusId(transaction, firestore, uid, userCampusId) {
  if (userCampusId) return userCampusId;
  const userDoc = await transaction.get(firestore.collection("users").doc(uid));
  return userDoc.exists ? userDoc.data()?.campusId : null;
}

/**
 * 1. cancelRsvpWithPromotion (PW-4)
 * Authenticated confirmed attendee withdraws. If waitlist is active, promotes normalized head candidate.
 */
export async function cancelRsvpWithPromotion(data, context, db) {
  const firestore = resolveFirestore(db, context);
  const { eventId } = data || {};
  const auth = extractAuth(context);
  if (!auth) {
    throw new HttpsError("UNAUTHENTICATED", "Authentication required");
  }
  const uid = auth.uid;
  const userCampusId = auth.campusId;

  if (!eventId || typeof eventId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(eventId)) {
    throw new HttpsError("INVALID_ARGUMENT", "Invalid eventId parameter");
  }

  const result = await firestore.runTransaction(async (transaction) => {
    const eventRef = firestore.collection("events").doc(eventId);
    const rsvpRef = firestore.collection("eventRsvps").doc(`${eventId}_${uid}`);
    const coordinatorRef = firestore.collection("eventCapacities").doc(eventId);

    const [eventSnap, rsvpSnap, capSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(rsvpRef),
      transaction.get(coordinatorRef),
    ]);

    if (!eventSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Event not found");
    }
    const event = eventSnap.data();

    const effectiveCampusId = await resolveEffectiveCampusId(transaction, firestore, uid, userCampusId);
    if (effectiveCampusId && event.campusId && event.campusId !== effectiveCampusId) {
      throw new HttpsError("PERMISSION_DENIED", "Campus tenancy violation");
    }

    if (event.registrationStatus === "migration_locked") {
      throw new HttpsError("ABORTED", "Registration temporarily locked for migration");
    }

    const nowMillis = Date.now();
    const eventStartMillis = event.startAt?.toMillis ? event.startAt.toMillis() : (event.startAt?.seconds ? event.startAt.seconds * 1000 : 0);
    if (eventStartMillis && nowMillis >= eventStartMillis) {
      throw new HttpsError("FAILED_PRECONDITION", "Event has already kicked off");
    }

    // Terminal Idempotency: If RSVP does not exist, return idempotent success
    if (!rsvpSnap.exists) {
      return { success: true, message: "RSVP already cancelled", idempotent: true, promoted: false, promotedSlotSequence: null };
    }

    if (!capSnap.exists) {
      // Uncapped event withdrawal
      transaction.delete(rsvpRef);
      return { success: true, promoted: false, promotedSlotSequence: null };
    }

    const coordinator = capSnap.data();

    // PW-3 Clean withdrawal fallback if waitlist is empty
    if (coordinator.waitlistCount <= 0) {
      transaction.delete(rsvpRef);
      transaction.update(coordinatorRef, {
        confirmedCount: FieldValue.increment(-1),
        waitlistCount: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { success: true, promoted: false, promotedSlotSequence: null };
    }

    // Waitlist > 0: normalize queue head
    const outcome = await normalizeQueueHead(transaction, eventId, coordinator);

    if (outcome.outcome === "candidateFound") {
      const candidateSeq = outcome.candidateSequence;
      const candidateUserId = outcome.candidateSlot.userId;

      const offerDurationMs = 24 * 60 * 60 * 1000; // 24 hours
      const offerDeadlineMillis = Math.min(nowMillis + offerDurationMs, eventStartMillis || (nowMillis + offerDurationMs));
      const offerExpiresAt = Timestamp.fromMillis(offerDeadlineMillis);

      transaction.delete(rsvpRef);
      transaction.update(coordinatorRef, {
        confirmedCount: FieldValue.increment(-1),
        offeredCount: FieldValue.increment(1),
        waitlistCount: FieldValue.increment(-1),
        headSequence: candidateSeq + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const slotRef = firestore.collection("eventWaitlistSlots").doc(`${eventId}_${candidateSeq}`);
      transaction.update(slotRef, {
        status: "offered",
        offeredAt: FieldValue.serverTimestamp(),
        offerExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const memberRef = firestore.collection("eventWaitlistMembers").doc(`${eventId}_${candidateUserId}`);
      transaction.update(memberRef, {
        status: "offered",
        offeredAt: FieldValue.serverTimestamp(),
        offerExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const outboxRef = firestore.collection("eventWaitlistOutbox").doc(`${eventId}_${candidateSeq}`);
      transaction.set(outboxRef, {
        id: `outbox_${eventId}_${candidateSeq}`,
        eventId,
        candidateSequence: candidateSeq,
        recipientId: candidateUserId,
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

      return { success: true, promoted: true, candidateSequence: candidateSeq, promotedSlotSequence: candidateSeq };
    }

    if (outcome.outcome === "queueExhausted") {
      transaction.delete(rsvpRef);
      transaction.update(coordinatorRef, {
        confirmedCount: FieldValue.increment(-1),
        waitlistCount: 0,
        headSequence: coordinator.nextSequence,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { success: true, promoted: false, promotedSlotSequence: null };
    }

    if (outcome.outcome === "limitReached") {
      transaction.delete(rsvpRef);
      transaction.update(coordinatorRef, {
        confirmedCount: FieldValue.increment(-1),
        headSequence: outcome.intermediateHeadSequence,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const continuationRef = firestore.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`);
      transaction.set(
        continuationRef,
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

      return { success: true, promoted: false, continuationStaged: true, promotedSlotSequence: null };
    }

    // integrityError
    throw new HttpsError("INTERNAL", `Integrity violation: ${outcome.details}`);
  });
  if (result?.continuationStaged) {
    await dispatchContinuationTask(eventId);
  }
  return result;
}

/**
 * 2. claimWaitlistOffer (PW-8 & PW-8B Unified)
 * Authenticated offered candidate claims offer, atomically promoting successor if vacancies remain.
 */
export async function claimWaitlistOffer(data, context, db) {
  const firestore = resolveFirestore(db, context);
  const { eventId, slotSequence } = data || {};
  const auth = extractAuth(context);
  if (!auth) {
    throw new HttpsError("UNAUTHENTICATED", "Authentication required");
  }
  const uid = auth.uid;
  const userCampusId = auth.campusId;

  if (
    !eventId ||
    typeof eventId !== "string" ||
    !/^[a-zA-Z0-9_-]+$/.test(eventId) ||
    typeof slotSequence !== "number" ||
    !Number.isInteger(slotSequence) ||
    slotSequence < 1
  ) {
    throw new HttpsError("INVALID_ARGUMENT", "Invalid eventId or slotSequence parameter");
  }

  const result = await firestore.runTransaction(async (transaction) => {
    const eventRef = firestore.collection("events").doc(eventId);
    const slotRef = firestore.collection("eventWaitlistSlots").doc(`${eventId}_${slotSequence}`);
    const coordinatorRef = firestore.collection("eventCapacities").doc(eventId);
    const rsvpRef = firestore.collection("eventRsvps").doc(`${eventId}_${uid}`);

    const [eventSnap, slotSnap, capSnap, rsvpSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(slotRef),
      transaction.get(coordinatorRef),
      transaction.get(rsvpRef),
    ]);

    if (!eventSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Event not found");
    }
    const event = eventSnap.data();

    const effectiveCampusId = await resolveEffectiveCampusId(transaction, firestore, uid, userCampusId);
    if (effectiveCampusId && event.campusId && event.campusId !== effectiveCampusId) {
      throw new HttpsError("PERMISSION_DENIED", "Campus tenancy violation");
    }

    if (event.registrationStatus === "migration_locked") {
      throw new HttpsError("ABORTED", "Registration migration locked");
    }

    const nowMillis = Date.now();
    const eventStartMillis = event.startAt?.toMillis ? event.startAt.toMillis() : (event.startAt?.seconds ? event.startAt.seconds * 1000 : 0);
    if (eventStartMillis && nowMillis >= eventStartMillis) {
      throw new HttpsError("FAILED_PRECONDITION", "Event has already kicked off");
    }

    if (!slotSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Waitlist slot not found");
    }
    const slot = slotSnap.data();

    if (slot.userId !== uid) {
      throw new HttpsError("PERMISSION_DENIED", "Slot does not belong to caller");
    }

    // Terminal Idempotency: Precedes companion member and lock checks
    if (slot.status === "claimed" && rsvpSnap.exists) {
      return { success: true, message: "Offer already claimed", idempotent: true, promotedSlotSequence: null };
    }

    if (slot.status !== "offered") {
      throw new HttpsError("FAILED_PRECONDITION", `Slot is not in offered status; current status: ${slot.status}`);
    }

    const offerExpiresMillis = slot.offerExpiresAt?.toMillis ? slot.offerExpiresAt.toMillis() : (slot.offerExpiresAt?.seconds ? slot.offerExpiresAt.seconds * 1000 : 0);
    if (offerExpiresMillis && nowMillis >= offerExpiresMillis) {
      throw new HttpsError("DEADLINE_EXCEEDED", "Waitlist offer has expired");
    }

    const memberRef = firestore.collection("eventWaitlistMembers").doc(`${eventId}_${uid}`);
    const memberSnap = await transaction.get(memberRef);
    if (!memberSnap.exists) {
      throw new HttpsError("FAILED_PRECONDITION", "Companion waitlist member document missing");
    }

    const coordinator = capSnap.exists ? capSnap.data() : { confirmedCount: 0, offeredCount: 1, waitlistCount: 0, headSequence: 1, nextSequence: 1 };

    // Check follow-on promotion eligibility and perform normalization READS before any writes:
    const vacanciesRemaining = (event.capacity || 0) - ((coordinator.confirmedCount + 1) + (coordinator.offeredCount - 1));
    let outcome = null;
    if (vacanciesRemaining > 0 && coordinator.waitlistCount > 0) {
      outcome = await normalizeQueueHead(transaction, eventId, coordinator);
    }

    // Base claim writes:
    transaction.set(rsvpRef, {
      id: `${eventId}_${uid}`,
      eventId,
      userId: uid,
      campusId: event.campusId,
      createdAt: FieldValue.serverTimestamp(),
    });

    transaction.update(slotRef, {
      status: "claimed",
      claimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.delete(memberRef);

    if (outcome && outcome.outcome === "candidateFound") {
      const candidateSeq = outcome.candidateSequence;
      const candidateUserId = outcome.candidateSlot.userId;

      const offerDurationMs = 24 * 60 * 60 * 1000;
      const offerDeadlineMillis = Math.min(nowMillis + offerDurationMs, eventStartMillis || (nowMillis + offerDurationMs));
      const nextOfferExpiresAt = Timestamp.fromMillis(offerDeadlineMillis);

      transaction.update(firestore.collection("eventWaitlistSlots").doc(`${eventId}_${candidateSeq}`), {
        status: "offered",
        offeredAt: FieldValue.serverTimestamp(),
        offerExpiresAt: nextOfferExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(firestore.collection("eventWaitlistMembers").doc(`${eventId}_${candidateUserId}`), {
        status: "offered",
        offeredAt: FieldValue.serverTimestamp(),
        offerExpiresAt: nextOfferExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(coordinatorRef, {
        confirmedCount: FieldValue.increment(1),
        offeredCount: FieldValue.increment(0), // +1 claimed, -1 claimed offered, +1 successor offered
        waitlistCount: FieldValue.increment(-1),
        headSequence: candidateSeq + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(firestore.collection("eventWaitlistOutbox").doc(`${eventId}_${candidateSeq}`), {
        id: `outbox_${eventId}_${candidateSeq}`,
        eventId,
        candidateSequence: candidateSeq,
        recipientId: candidateUserId,
        type: "event_waitlist_offer",
        status: "pending",
        offerExpiresAt: nextOfferExpiresAt,
        lockedUntil: null,
        deliveredAt: null,
        retryCount: 0,
        errorMessage: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { success: true, status: "claimed", followOnPromoted: true, candidateSequence: candidateSeq, promotedSlotSequence: candidateSeq };
    }

    if (outcome && outcome.outcome === "limitReached") {
      transaction.update(coordinatorRef, {
        confirmedCount: FieldValue.increment(1),
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

      return { success: true, status: "claimed", followOnPromoted: false, continuationStaged: true, candidateSequence: null, promotedSlotSequence: null };
    }

    // Default terminal claim (no follow-on or queue exhausted)
    transaction.update(coordinatorRef, {
      confirmedCount: FieldValue.increment(1),
      offeredCount: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, status: "claimed", followOnPromoted: false, candidateSequence: null, promotedSlotSequence: null };
  });
  if (result?.continuationStaged) {
    await dispatchContinuationTask(eventId);
  }
  return result;
}

/**
 * 3. declineWaitlistOffer (PW-9A & PW-9B Unified)
 * Authenticated offered candidate declines offer; rolls seat over to successor.
 */
export async function declineWaitlistOffer(data, context, db) {
  const firestore = resolveFirestore(db, context);
  const { eventId, slotSequence } = data || {};
  const auth = extractAuth(context);
  if (!auth) {
    throw new HttpsError("UNAUTHENTICATED", "Authentication required");
  }
  const uid = auth.uid;
  const userCampusId = auth.campusId;

  if (
    !eventId ||
    typeof eventId !== "string" ||
    !/^[a-zA-Z0-9_-]+$/.test(eventId) ||
    typeof slotSequence !== "number" ||
    !Number.isInteger(slotSequence) ||
    slotSequence < 1
  ) {
    throw new HttpsError("INVALID_ARGUMENT", "Invalid eventId or slotSequence parameter");
  }

  const result = await firestore.runTransaction(async (transaction) => {
    const eventRef = firestore.collection("events").doc(eventId);
    const slotRef = firestore.collection("eventWaitlistSlots").doc(`${eventId}_${slotSequence}`);
    const coordinatorRef = firestore.collection("eventCapacities").doc(eventId);

    const [eventSnap, slotSnap, capSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(slotRef),
      transaction.get(coordinatorRef),
    ]);

    if (!eventSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Event not found");
    }
    const event = eventSnap.data();

    const effectiveCampusId = await resolveEffectiveCampusId(transaction, firestore, uid, userCampusId);
    if (effectiveCampusId && event.campusId && event.campusId !== effectiveCampusId) {
      throw new HttpsError("PERMISSION_DENIED", "Campus tenancy violation");
    }

    if (event.registrationStatus === "migration_locked") {
      throw new HttpsError("ABORTED", "Registration temporarily locked for migration");
    }

    const nowMillis = Date.now();
    const eventStartMillis = event.startAt?.toMillis ? event.startAt.toMillis() : (event.startAt?.seconds ? event.startAt.seconds * 1000 : 0);
    if (eventStartMillis && nowMillis >= eventStartMillis) {
      throw new HttpsError("FAILED_PRECONDITION", "Event has kicked off");
    }

    if (!slotSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Waitlist slot not found");
    }
    const slot = slotSnap.data();

    if (slot.userId !== uid) {
      throw new HttpsError("PERMISSION_DENIED", "Slot does not belong to caller");
    }

    // Terminal Idempotency: If already declined, return idempotent success
    if (slot.status === "declined") {
      return { success: true, message: "Offer already declined", idempotent: true, promotedSlotSequence: null };
    }

    if (slot.status !== "offered") {
      throw new HttpsError("FAILED_PRECONDITION", "Slot is not offered");
    }

    const memberRef = firestore.collection("eventWaitlistMembers").doc(`${eventId}_${uid}`);
    const memberSnap = await transaction.get(memberRef);
    if (!memberSnap.exists) {
      throw new HttpsError("FAILED_PRECONDITION", "Companion waitlist member document missing");
    }

    const coordinator = capSnap.exists ? capSnap.data() : { confirmedCount: 0, offeredCount: 1, waitlistCount: 0, headSequence: 1, nextSequence: 1 };

    // Perform normalization READS before any writes:
    let outcome = null;
    if (coordinator.waitlistCount > 0) {
      outcome = await normalizeQueueHead(transaction, eventId, coordinator);
    }

    // Base decline writes
    transaction.update(slotRef, {
      status: "declined",
      declinedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.delete(memberRef);

    if (outcome && outcome.outcome === "candidateFound") {
      const candidateSeq = outcome.candidateSequence;
      const candidateUserId = outcome.candidateSlot.userId;

      const offerDurationMs = 24 * 60 * 60 * 1000;
      const offerDeadlineMillis = Math.min(nowMillis + offerDurationMs, eventStartMillis || (nowMillis + offerDurationMs));
      const offerExpiresAt = Timestamp.fromMillis(offerDeadlineMillis);

      transaction.update(firestore.collection("eventWaitlistSlots").doc(`${eventId}_${candidateSeq}`), {
        status: "offered",
        offeredAt: FieldValue.serverTimestamp(),
        offerExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(firestore.collection("eventWaitlistMembers").doc(`${eventId}_${candidateUserId}`), {
        status: "offered",
        offeredAt: FieldValue.serverTimestamp(),
        offerExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(coordinatorRef, {
        headSequence: candidateSeq + 1,
        waitlistCount: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(firestore.collection("eventWaitlistOutbox").doc(`${eventId}_${candidateSeq}`), {
        id: `outbox_${eventId}_${candidateSeq}`,
        eventId,
        candidateSequence: candidateSeq,
        recipientId: candidateUserId,
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

      return { success: true, status: "declined", rolloverOccurred: true, nextCandidateSequence: candidateSeq, promotedSlotSequence: candidateSeq };
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

      return { success: true, status: "declined", rolloverOccurred: false, continuationStaged: true, nextCandidateSequence: null, promotedSlotSequence: null };
    }

    // Queue exhausted or waitlistCount == 0
    transaction.update(coordinatorRef, {
      offeredCount: FieldValue.increment(-1),
      waitlistCount: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, status: "declined", rolloverOccurred: false, nextCandidateSequence: null, promotedSlotSequence: null };
  });
  if (result?.continuationStaged) {
    await dispatchContinuationTask(eventId);
  }
  return result;
}

/**
 * 4. leaveWaitlist (PW-5 Head Waiting Leave)
 * Authenticated waiting candidate at head of queue withdraws; advances head pointer past terminal holes.
 */
export async function leaveWaitlist(data, context, db) {
  const firestore = resolveFirestore(db, context);
  const { eventId } = data || {};
  const auth = extractAuth(context);
  if (!auth) {
    throw new HttpsError("UNAUTHENTICATED", "Authentication required");
  }
  const uid = auth.uid;
  const userCampusId = auth.campusId;

  if (!eventId || typeof eventId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(eventId)) {
    throw new HttpsError("INVALID_ARGUMENT", "Invalid eventId parameter");
  }

  const result = await firestore.runTransaction(async (transaction) => {
    const eventRef = firestore.collection("events").doc(eventId);
    const memberRef = firestore.collection("eventWaitlistMembers").doc(`${eventId}_${uid}`);
    const coordinatorRef = firestore.collection("eventCapacities").doc(eventId);

    const [eventSnap, memberSnap, capSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(memberRef),
      transaction.get(coordinatorRef),
    ]);

    if (!eventSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Event not found");
    }
    const event = eventSnap.data();

    const effectiveCampusId = await resolveEffectiveCampusId(transaction, firestore, uid, userCampusId);
    if (effectiveCampusId && event.campusId && event.campusId !== effectiveCampusId) {
      throw new HttpsError("PERMISSION_DENIED", "Campus tenancy violation");
    }

    if (event.registrationStatus === "migration_locked") {
      throw new HttpsError("ABORTED", "Registration temporarily locked for migration");
    }

    const nowMillis = Date.now();
    const eventStartMillis = event.startAt?.toMillis ? event.startAt.toMillis() : (event.startAt?.seconds ? event.startAt.seconds * 1000 : 0);
    if (eventStartMillis && nowMillis >= eventStartMillis) {
      throw new HttpsError("FAILED_PRECONDITION", "Event has kicked off");
    }

    if (!memberSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Waitlist membership not found");
    }
    const member = memberSnap.data();

    if (!capSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Event coordinator not found");
    }
    const coordinator = capSnap.data();

    // If candidate is non-head, advise client to use direct client batch PW-5
    if (member.sequenceNumber > coordinator.headSequence) {
      throw new HttpsError("FAILED_PRECONDITION", "Candidate is not at head of queue; use client batch");
    }

    const slotRef = firestore.collection("eventWaitlistSlots").doc(`${eventId}_${member.sequenceNumber}`);
    const slotSnap = await transaction.get(slotRef);
    if (!slotSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Waitlist slot document not found");
    }
    const slot = slotSnap.data();

    if (slot.status !== "waiting") {
      throw new HttpsError("FAILED_PRECONDITION", `Slot status is '${slot.status}', not 'waiting'`);
    }

    // Normalize forward from headSequence + 1
    const outcome = await normalizeQueueHead(transaction, eventId, coordinator, coordinator.headSequence + 1);

    transaction.update(slotRef, {
      status: "withdrawn",
      resolvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.delete(memberRef);

    if (outcome.outcome === "candidateFound") {
      transaction.update(coordinatorRef, {
        waitlistCount: FieldValue.increment(-1),
        headSequence: outcome.candidateSequence,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (outcome.outcome === "queueExhausted") {
      transaction.update(coordinatorRef, {
        waitlistCount: 0,
        headSequence: coordinator.nextSequence,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (outcome.outcome === "limitReached") {
      transaction.update(coordinatorRef, {
        waitlistCount: FieldValue.increment(-1),
        headSequence: outcome.intermediateHeadSequence,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(
        firestore.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`),
        {
          id: `continuation_${eventId}`,
          eventId,
          continuationType: "head_normalization",
          reason: "head_normalization_scan_limit",
          intermediateHeadSequence: outcome.intermediateHeadSequence,
          vacanciesRemaining: 0,
          targetBatch: 0,
          normalizationRequired: true,
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
    }

    return { success: true, status: "withdrawn", continuationStaged: outcome.outcome === "limitReached" };
  });
  if (result?.continuationStaged) {
    await dispatchContinuationTask(eventId);
  }
  return result;
}

/**
 * 5. promoteWaitlistCandidates (PW-7B)
 * Scans vacancies and promotes batch of waiting candidates (K <= 5, reads <= 10) using head normalization.
 */
export async function promoteWaitlistCandidates(data, context, db) {
  const firestore = resolveFirestore(db, context);
  const { eventId, maxBatch, maxSeats } = data || {};
  const auth = extractAuth(context);
  if (!auth) {
    throw new HttpsError("UNAUTHENTICATED", "Authentication required");
  }

  if (!eventId || typeof eventId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(eventId)) {
    throw new HttpsError("INVALID_ARGUMENT", "Invalid eventId parameter");
  }

  const requestedQuota = maxSeats !== undefined ? maxSeats : maxBatch;
  const serverBatch = Math.min(Math.max(1, requestedQuota || 5), 5);

  const result = await firestore.runTransaction(async (transaction) => {
    const eventRef = firestore.collection("events").doc(eventId);
    const coordinatorRef = firestore.collection("eventCapacities").doc(eventId);

    const [eventSnap, capSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(coordinatorRef),
    ]);

    if (!eventSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Event not found");
    }
    const event = eventSnap.data();

    if (!capSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Event coordinator not found");
    }
    const coordinator = capSnap.data();

    if (event.registrationStatus === "migration_locked") {
      throw new HttpsError("ABORTED", "Registration temporarily locked for migration");
    }

    const nowMillis = Date.now();
    const eventStartMillis = event.startAt?.toMillis ? event.startAt.toMillis() : (event.startAt?.seconds ? event.startAt.seconds * 1000 : 0);
    if (eventStartMillis && nowMillis >= eventStartMillis) {
      throw new HttpsError("FAILED_PRECONDITION", "Event has already kicked off");
    }

    const vacancies = (event.capacity || 0) - (coordinator.confirmedCount + coordinator.offeredCount);
    if (vacancies <= 0 || coordinator.waitlistCount <= 0) {
      return { promotedCount: 0, message: "No vacancies or waiting candidates" };
    }

    const targetN = Math.min(vacancies, coordinator.waitlistCount, serverBatch);

    // Phase 2: Gather candidate set strictly before writes
    const candidatesToPromote = [];
    let slotReadsCount = 0;
    let currentScanSeq = coordinator.headSequence;
    let queueExhausted = false;
    let limitReached = false;
    let intermediateHeadSeq = currentScanSeq;

    while (candidatesToPromote.length < targetN && slotReadsCount < 10) {
      const maxScan = Math.min(10, 10 - slotReadsCount);
      const outcome = await normalizeQueueHead(transaction, eventId, coordinator, currentScanSeq, maxScan, firestore);
      slotReadsCount += outcome.slotReadsConsumed;

      if (outcome.outcome === "candidateFound") {
        candidatesToPromote.push({
          candidateSeq: outcome.candidateSequence,
          userId: outcome.candidateSlot.userId,
          slotData: outcome.candidateSlot,
          memberData: outcome.candidateMember,
        });
        currentScanSeq = outcome.candidateSequence + 1;
      } else if (outcome.outcome === "queueExhausted") {
        queueExhausted = true;
        break;
      } else if (outcome.outcome === "limitReached") {
        limitReached = true;
        intermediateHeadSeq = outcome.intermediateHeadSequence;
        break;
      } else if (outcome.outcome === "integrityError") {
        throw new HttpsError("INTERNAL", `Integrity violation during promotion scan: ${outcome.details}`);
      }
    }

    const M = candidatesToPromote.length;

    if (M === 0) {
      if (queueExhausted) {
        transaction.update(coordinatorRef, {
          waitlistCount: 0,
          headSequence: coordinator.nextSequence,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (limitReached) {
        transaction.update(coordinatorRef, {
          headSequence: intermediateHeadSeq,
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.set(
          firestore.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`),
          {
            id: `continuation_${eventId}`,
            eventId,
            continuationType: "promotion",
            reason: "promotion_scan_limit",
            intermediateHeadSequence: intermediateHeadSeq,
            vacanciesRemaining: vacancies,
            targetBatch: serverBatch,
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
      }
      return { success: true, promotedCount: 0, continuationStaged: limitReached };
    }

    // Phase 4: Stage writes for M > 0
    const newHeadSequence = candidatesToPromote[M - 1].candidateSeq + 1;
    const offerDurationMs = 24 * 60 * 60 * 1000;
    const offerDeadlineMillis = Math.min(nowMillis + offerDurationMs, eventStartMillis || (nowMillis + offerDurationMs));
    const offerExpiresAt = Timestamp.fromMillis(offerDeadlineMillis);

    for (const candidate of candidatesToPromote) {
      transaction.update(firestore.collection("eventWaitlistSlots").doc(`${eventId}_${candidate.candidateSeq}`), {
        status: "offered",
        offeredAt: FieldValue.serverTimestamp(),
        offerExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(firestore.collection("eventWaitlistMembers").doc(`${eventId}_${candidate.userId}`), {
        status: "offered",
        offeredAt: FieldValue.serverTimestamp(),
        offerExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(firestore.collection("eventWaitlistOutbox").doc(`${eventId}_${candidate.candidateSeq}`), {
        id: `outbox_${eventId}_${candidate.candidateSeq}`,
        eventId,
        candidateSequence: candidate.candidateSeq,
        recipientId: candidate.userId,
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
    }

    transaction.update(coordinatorRef, {
      offeredCount: FieldValue.increment(M),
      waitlistCount: FieldValue.increment(-M),
      headSequence: newHeadSequence,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const residualVacancies = vacancies - M;
    const continuationNeeded = residualVacancies > 0 || limitReached;

    if (continuationNeeded) {
      transaction.set(
        firestore.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`),
        {
          id: `continuation_${eventId}`,
          eventId,
          continuationType: "promotion",
          reason: limitReached ? "promotion_scan_limit" : "promotion_partial_batch",
          intermediateHeadSequence: newHeadSequence,
          vacanciesRemaining: residualVacancies,
          targetBatch: serverBatch,
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
    }

    return {
      success: true,
      promotedCount: M,
      partialBatch: vacancies > M,
      continuationStaged: continuationNeeded,
    };
  });
  if (result?.continuationStaged) {
    await dispatchContinuationTask(eventId);
  }
  return result;
}

/**
 * 6. fastForwardWaitlistHead (PW-12)
 * Administrative / Maintenance helper to advance head pointer past terminal holes.
 */
export async function fastForwardWaitlistHead(data, context, db) {
  const firestore = resolveFirestore(db, context);
  const { eventId, maxScan = 10 } = data || {};

  if (!eventId || typeof eventId !== "string") {
    throw new HttpsError("INVALID_ARGUMENT", "Invalid eventId parameter");
  }

  const result = await firestore.runTransaction(async (transaction) => {
    const eventRef = firestore.collection("events").doc(eventId);
    const coordinatorRef = firestore.collection("eventCapacities").doc(eventId);
    const contRef = firestore.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`);

    const [eventSnap, capSnap, contSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(coordinatorRef),
      transaction.get(contRef),
    ]);

    if (!eventSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Event not found");
    }
    const event = eventSnap.data();

    if (!capSnap.exists) {
      throw new HttpsError("NOT_FOUND", "Event coordinator not found");
    }
    const coordinator = capSnap.data();

    if (event.registrationStatus === "migration_locked") {
      throw new HttpsError("ABORTED", "Registration temporarily locked for migration");
    }

    const outcome = await normalizeQueueHead(transaction, eventId, coordinator, coordinator.headSequence, maxScan, firestore);

    if (outcome.outcome === "candidateFound") {
      transaction.update(coordinatorRef, {
        headSequence: outcome.candidateSequence,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (outcome.outcome === "queueExhausted") {
      transaction.update(coordinatorRef, {
        headSequence: coordinator.nextSequence,
        waitlistCount: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (outcome.outcome === "limitReached") {
      transaction.update(coordinatorRef, {
        headSequence: outcome.intermediateHeadSequence,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const existingCont = contSnap.exists ? contSnap.data() : null;
      const isPromotionCont = existingCont && existingCont.continuationType === "promotion";

      if (isPromotionCont) {
        transaction.set(
          contRef,
          {
            id: `continuation_${eventId}`,
            eventId,
            normalizationRequired: true,
            generation: FieldValue.increment(1),
            retryCount: 0,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        transaction.set(
          contRef,
          {
            id: `continuation_${eventId}`,
            eventId,
            continuationType: "head_normalization",
            reason: "head_normalization_scan_limit",
            intermediateHeadSequence: outcome.intermediateHeadSequence,
            vacanciesRemaining: 0,
            targetBatch: 0,
            normalizationRequired: true,
            status: existingCont?.leaseWorkerId ? existingCont.status : "pending",
            generation: FieldValue.increment(1),
            retryCount: 0,
            errorMessage: null,
            createdAt: existingCont?.createdAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    return {
      success: true,
      outcome: outcome.outcome,
      continuationStaged: outcome.outcome === "limitReached",
      intermediateHeadSequence: outcome.outcome === "limitReached" ? outcome.intermediateHeadSequence : undefined,
    };
  });
  if (result?.continuationStaged) {
    await dispatchContinuationTask(eventId);
  }
  return result;
}
