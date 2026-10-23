/**
 * Milestone 24 — Unit 24.2: Event Waitlist Client Service
 *
 * Encapsulates client-side Firestore operations and backend Callable Function interfaces
 * for multi-slot waitlists, student queue membership, and seat claim lifecycle.
 */

import {
  doc,
  getDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions, isFirebaseConfigured } from "../firebase/config.js";
import {
  getEventWaitlistSlotId,
  isTerminalSlotStatus,
  isActiveSlotStatus,
  isOfferActive,
  getOfferRemainingMs,
} from "../data/eventWaitlistSlots.js";
import {
  getEventWaitlistMemberId,
  calculateQueuePosition,
} from "../data/eventWaitlistMembers.js";
import { eventCapacityDocRef, getEventCapacity } from "./eventCapacityService.js";
import { WAITLIST_SLOT_STATUSES, WAITLIST_MEMBER_STATUSES } from "../constants.js";



function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

function requireFunctions() {
  if (!functions) {
    throw new Error(
      "Firebase Functions is not configured. Verify your Firebase configuration."
    );
  }
  return functions;
}

/**
 * Returns a DocumentReference for an Event Waitlist Member document.
 * Root collection: eventWaitlistMembers/{eventId}_{userId}
 *
 * @param {string} eventId
 * @param {string} userId
 * @returns {import("firebase/firestore").DocumentReference}
 */
export function waitlistMemberDocRef(eventId, userId) {
  const memberId = getEventWaitlistMemberId(eventId, userId);
  return doc(requireDb(), "eventWaitlistMembers", memberId);
}

/**
 * Returns a DocumentReference for an Event Waitlist Slot document.
 * Root collection: eventWaitlistSlots/{eventId}_{sequenceNumber}
 *
 * @param {string} eventId
 * @param {number|string} sequenceNumber
 * @returns {import("firebase/firestore").DocumentReference}
 */
export function waitlistSlotDocRef(eventId, sequenceNumber) {
  const slotId = getEventWaitlistSlotId(eventId, sequenceNumber);
  return doc(requireDb(), "eventWaitlistSlots", slotId);
}

/**
 * Normalizes member document snapshot data.
 *
 * @param {import("firebase/firestore").DocumentSnapshot} snapshot
 * @returns {object|null}
 */
export function normalizeMemberSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    ...data,
    id: snapshot.id,
    sequenceNumber: Number(data.sequenceNumber) || 0,
    joinedAt: data.joinedAt?.toDate ? data.joinedAt.toDate() : data.joinedAt || null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt || null,
  };
}

/**
 * Normalizes slot document snapshot data.
 *
 * @param {import("firebase/firestore").DocumentSnapshot} snapshot
 * @returns {object|null}
 */
export function normalizeSlotSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    ...data,
    id: snapshot.id,
    sequenceNumber: Number(data.sequenceNumber) || 0,
    joinedAt: data.joinedAt?.toDate ? data.joinedAt.toDate() : data.joinedAt || null,
    offeredAt: data.offeredAt?.toDate ? data.offeredAt.toDate() : data.offeredAt || null,
    offerExpiresAt: data.offerExpiresAt?.toDate ? data.offerExpiresAt.toDate() : data.offerExpiresAt || null,
    resolvedAt: data.resolvedAt?.toDate ? data.resolvedAt.toDate() : data.resolvedAt || null,
  };
}

/**
 * Fetches the waitlist member document for a user.
 *
 * @param {string} eventId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getWaitlistMember(eventId, userId) {
  const ref = waitlistMemberDocRef(eventId, userId);
  const snap = await getDoc(ref);
  return normalizeMemberSnapshot(snap);
}

/**
 * Sets up a real-time listener for a student's waitlist member document.
 *
 * @param {string} eventId
 * @param {string} userId
 * @param {(member: object|null) => void} onData
 * @param {(err: Error) => void} [onError]
 * @returns {() => void}
 */
export function subscribeToWaitlistMember(eventId, userId, onData, onError) {
  if (!eventId || !userId) {
    onData(null);
    return () => {};
  }
  const ref = waitlistMemberDocRef(eventId, userId);
  return onSnapshot(
    ref,
    (snap) => {
      onData(normalizeMemberSnapshot(snap));
    },
    (err) => {
      console.error(`[subscribeToWaitlistMember] Error for user ${userId} on event ${eventId}:`, err);
      if (onError) onError(err);
    }
  );
}

/**
 * Fetches a waitlist slot document by sequence number.
 *
 * @param {string} eventId
 * @param {number} sequenceNumber
 * @returns {Promise<object|null>}
 */
export async function getWaitlistSlot(eventId, sequenceNumber) {
  const ref = waitlistSlotDocRef(eventId, sequenceNumber);
  const snap = await getDoc(ref);
  return normalizeSlotSnapshot(snap);
}

/**
 * Sets up a real-time listener for a waitlist slot document.
 *
 * @param {string} eventId
 * @param {number} sequenceNumber
 * @param {(slot: object|null) => void} onData
 * @param {(err: Error) => void} [onError]
 * @returns {() => void}
 */
export function subscribeToWaitlistSlot(eventId, sequenceNumber, onData, onError) {
  if (!eventId || !sequenceNumber) {
    onData(null);
    return () => {};
  }
  const ref = waitlistSlotDocRef(eventId, sequenceNumber);
  return onSnapshot(
    ref,
    (snap) => {
      onData(normalizeSlotSnapshot(snap));
    },
    (err) => {
      console.error(`[subscribeToWaitlistSlot] Error for slot ${sequenceNumber} on event ${eventId}:`, err);
      if (onError) onError(err);
    }
  );
}

/**
 * Joins the waitlist (Pathway PW-2) via atomic 3-document batch commit.
 * Requires:
 * 1. eventWaitlistSlots/{eventId}_{nextSequence} (create)
 * 2. eventWaitlistMembers/{eventId}_{userId} (create)
 * 3. eventCapacities/{eventId} (update waitlistCount + 1, nextSequence + 1)
 *
 * @param {string} eventId
 * @param {string} userId
 * @param {string} campusId
 * @returns {Promise<{ success: boolean, sequenceNumber: number }>}
 */
export async function joinWaitlist(eventId, userId, campusId) {
  const coordinator = await getEventCapacity(eventId);
  if (!coordinator) {
    throw new Error(`[joinWaitlist] Coordinator not found for event: ${eventId}`);
  }

  const assignedSeq = coordinator.nextSequence;
  const database = requireDb();
  const batch = writeBatch(database);

  const slotRef = waitlistSlotDocRef(eventId, assignedSeq);
  const memberRef = waitlistMemberDocRef(eventId, userId);
  const capRef = eventCapacityDocRef(eventId);

  const slotId = getEventWaitlistSlotId(eventId, assignedSeq);
  const memberId = getEventWaitlistMemberId(eventId, userId);

  batch.set(slotRef, {
    id: slotId,
    eventId,
    campusId,
    userId,
    sequenceNumber: assignedSeq,
    status: WAITLIST_SLOT_STATUSES.WAITING,
    joinedAt: serverTimestamp(),
  });

  batch.set(memberRef, {
    id: memberId,
    eventId,
    campusId,
    userId,
    sequenceNumber: assignedSeq,
    status: WAITLIST_MEMBER_STATUSES.WAITING,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(capRef, {
    waitlistCount: increment(1),
    nextSequence: increment(1),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { success: true, sequenceNumber: assignedSeq };
}

export const joinWaitlistBatch = joinWaitlist;

/**
 * Executes a direct client withdrawal for a non-head waiting candidate (PW-5 Non-Head).
 * Allowed ONLY when sequenceNumber > headSequence.
 *
 * Atomic writes:
 * 1. update eventWaitlistSlots/{eventId}_{seq}: status = 'withdrawn', resolvedAt = serverTimestamp()
 * 2. delete eventWaitlistMembers/{eventId}_{userId}
 * 3. update eventCapacities/{eventId}: waitlistCount -= 1, updatedAt = serverTimestamp()
 *
 * @param {string} eventId
 * @param {string} userId
 * @param {number} sequenceNumber
 * @returns {Promise<{ success: boolean }>}
 */
export async function withdrawNonHeadWaitlist(eventId, userId, sequenceNumber) {
  const database = requireDb();
  const batch = writeBatch(database);

  const slotRef = waitlistSlotDocRef(eventId, sequenceNumber);
  const memberRef = waitlistMemberDocRef(eventId, userId);
  const capRef = eventCapacityDocRef(eventId);

  batch.update(slotRef, {
    status: WAITLIST_SLOT_STATUSES.WITHDRAWN,
    resolvedAt: serverTimestamp(),
  });

  batch.delete(memberRef);

  batch.update(capRef, {
    waitlistCount: increment(-1),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { success: true };
}

// ============================================================================
// Backend Callable Integration Boundaries (M24.3 Integration Contracts)
// ============================================================================

/**
 * Claims an offered waitlist seat (PW-8 / PW-8B).
 * Calls Firebase Callable Function `claimWaitlistOffer`.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {number} params.slotSequence
 * @returns {Promise<{ success: boolean, rsvpId?: string, rolloverOccurred?: boolean }>}
 */
export async function claimWaitlistOffer({ eventId, slotSequence }) {
  if (!eventId || slotSequence == null) {
    throw new Error("[claimWaitlistOffer] Both eventId and slotSequence are required.");
  }
  const fn = httpsCallable(requireFunctions(), "claimWaitlistOffer");
  const result = await fn({ eventId, slotSequence: Number(slotSequence) });
  return result.data;
}

/**
 * Declines an offered waitlist seat (PW-9A / PW-9B).
 * Calls Firebase Callable Function `declineWaitlistOffer`.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {number} params.slotSequence
 * @returns {Promise<{ success: boolean, status: string, rolloverOccurred?: boolean }>}
 */
export async function declineWaitlistOffer({ eventId, slotSequence }) {
  if (!eventId || slotSequence == null) {
    throw new Error("[declineWaitlistOffer] Both eventId and slotSequence are required.");
  }
  const fn = httpsCallable(requireFunctions(), "declineWaitlistOffer");
  const result = await fn({ eventId, slotSequence: Number(slotSequence) });
  return result.data;
}

/**
 * Leaves the waitlist (PW-5 Head Waiting or unified leave).
 * Calls Firebase Callable Function `leaveWaitlist`.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @returns {Promise<{ success: boolean, status: string }>}
 */
export async function leaveWaitlist({ eventId }) {
  if (!eventId) {
    throw new Error("[leaveWaitlist] eventId is required.");
  }
  const fn = httpsCallable(requireFunctions(), "leaveWaitlist");
  const result = await fn({ eventId });
  return result.data;
}

/**
 * Cancels an RSVP on an event with an active waitlist, triggering promotional rollover (PW-4).
 * Calls Firebase Callable Function `cancelRsvpWithPromotion`.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @returns {Promise<{ success: boolean, candidatePromoted?: boolean }>}
 */
export async function cancelRsvpWithPromotion({ eventId }) {
  if (!eventId) {
    throw new Error("[cancelRsvpWithPromotion] eventId is required.");
  }
  const fn = httpsCallable(requireFunctions(), "cancelRsvpWithPromotion");
  const result = await fn({ eventId });
  return result.data;
}

/**
 * Triggers opportunistic promotion into newly opened vacancies (PW-7B).
 * Calls Firebase Callable Function `promoteWaitlistCandidates`.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {number} [params.targetVacancies]
 * @returns {Promise<{ success: boolean, promotedCount: number }>}
 */
export async function promoteWaitlistCandidates({ eventId, targetVacancies, maxScan }) {
  if (!eventId) {
    throw new Error("[promoteWaitlistCandidates] eventId is required.");
  }
  const fn = httpsCallable(requireFunctions(), "promoteWaitlistCandidates");
  const payload = { eventId };
  if (targetVacancies !== undefined) payload.targetVacancies = targetVacancies;
  if (maxScan !== undefined) payload.maxScan = maxScan;
  const result = await fn(payload);
  return result.data;
}

export {
  calculateQueuePosition,
  isOfferActive,
  getOfferRemainingMs,
  isTerminalSlotStatus,
  isActiveSlotStatus,
};
