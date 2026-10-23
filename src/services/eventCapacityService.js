/**
 * Milestone 24 — Unit 24.2: Event Capacity Client Service
 *
 * Encapsulates Firestore operations for event capacity coordinators (eventCapacities/{eventId}).
 * Handles subscriptions, coordinator initialization, direct admission (PW-1),
 * cancellation without waitlist (PW-3), and capacity metrics resolution.
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config.js";
import {
  getEventCapacityId,
  createInitialEventCapacity,
  computeCapacityMetrics,
} from "../data/eventCapacities.js";
import { getEventRsvpId } from "../data/eventRsvps.js";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

/**
 * Returns a DocumentReference for an Event Capacity Coordinator document.
 * Root collection: eventCapacities/{eventId}
 *
 * @param {string} eventId
 * @returns {import("firebase/firestore").DocumentReference}
 */
export function eventCapacityDocRef(eventId) {
  const capId = getEventCapacityId(eventId);
  return doc(requireDb(), "eventCapacities", capId);
}

/**
 * Returns a CollectionReference for the root eventCapacities collection.
 *
 * @returns {import("firebase/firestore").CollectionReference}
 */
export function eventCapacitiesCollectionRef() {
  return collection(requireDb(), "eventCapacities");
}

/**
 * Normalizes coordinator document snapshot data.
 *
 * @param {import("firebase/firestore").DocumentSnapshot} snapshot
 * @returns {object|null}
 */
export function normalizeCoordinatorSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists()) {
    return null;
  }
  const data = snapshot.data();
  return {
    ...data,
    id: snapshot.id,
    confirmedCount: Number(data.confirmedCount) || 0,
    offeredCount: Number(data.offeredCount) || 0,
    waitlistCount: Number(data.waitlistCount) || 0,
    headSequence: Number(data.headSequence) || 1,
    nextSequence: Number(data.nextSequence) || 1,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt || null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt || null,
  };
}

/**
 * Fetches the Event Capacity Coordinator document for an event.
 *
 * @param {string} eventId - Target event ID
 * @returns {Promise<object|null>} Normalized coordinator data or null if not found
 */
export async function getEventCapacity(eventId) {
  const ref = eventCapacityDocRef(eventId);
  const snap = await getDoc(ref);
  return normalizeCoordinatorSnapshot(snap);
}

/**
 * Sets up a real-time listener for an Event Capacity Coordinator.
 *
 * @param {string} eventId - Target event ID
 * @param {(data: object|null) => void} onData - Callback with normalized data
 * @param {(err: Error) => void} [onError] - Optional error handler
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToEventCapacity(eventId, onData, onError) {
  if (!eventId) {
    onData(null);
    return () => {};
  }

  const ref = eventCapacityDocRef(eventId);
  return onSnapshot(
    ref,
    (snap) => {
      onData(normalizeCoordinatorSnapshot(snap));
    },
    (err) => {
      console.error(`[subscribeToEventCapacity] Error listening to event ${eventId}:`, err);
      if (onError) onError(err);
    }
  );
}

/**
 * Initializes a new Event Capacity Coordinator document for a capped event.
 * Enforces Option B schema and starting values (head = 1, next = 1).
 *
 * @param {string} eventId - Target event ID
 * @param {string} campusId - Target campus ID
 * @param {number} [initialConfirmedCount=0] - Initial confirmed count (0 for new events)
 * @returns {Promise<object>} Created coordinator data
 */
export async function initializeEventCapacityCoordinator(eventId, campusId, initialConfirmedCount = 0) {
  const ref = eventCapacityDocRef(eventId);
  const data = createInitialEventCapacity({
    eventId,
    campusId,
    confirmedCount: initialConfirmedCount,
    timestamp: serverTimestamp(),
  });

  await setDoc(ref, data);
  return {
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Executes Direct Admission (PW-1) via atomic client batch.
 * Allowed ONLY when waitlistCount === 0 and vacancy exists (confirmed + offered < capacity).
 *
 * Atomic writes:
 * 1. Create eventRsvps/{eventId}_{userId}
 * 2. Update eventCapacities/{eventId}: confirmedCount += 1, updatedAt = serverTimestamp()
 *
 * @param {string} eventId
 * @param {string} userId
 * @param {string} campusId
 * @returns {Promise<{ success: boolean, rsvpId: string }>}
 */
export async function executeDirectAdmission(eventId, userId, campusId) {
  const database = requireDb();
  const batch = writeBatch(database);

  const rsvpId = getEventRsvpId(eventId, userId);
  const rsvpRef = doc(database, "eventRsvps", rsvpId);
  const capRef = eventCapacityDocRef(eventId);

  batch.set(rsvpRef, {
    id: rsvpId,
    eventId,
    campusId,
    userId,
    createdAt: serverTimestamp(),
  });

  batch.update(capRef, {
    confirmedCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { success: true, rsvpId };
}

/**
 * Cancels an RSVP when waitlist is empty (PW-3) via atomic client batch.
 *
 * Atomic writes:
 * 1. Delete eventRsvps/{eventId}_{userId}
 * 2. Update eventCapacities/{eventId}: confirmedCount -= 1, updatedAt = serverTimestamp()
 *
 * @param {string} eventId
 * @param {string} userId
 * @returns {Promise<{ success: boolean }>}
 */
export async function cancelRsvpWithoutWaitlist(eventId, userId) {
  const database = requireDb();
  const batch = writeBatch(database);

  const rsvpId = getEventRsvpId(eventId, userId);
  const rsvpRef = doc(database, "eventRsvps", rsvpId);
  const capRef = eventCapacityDocRef(eventId);

  batch.delete(rsvpRef);
  batch.update(capRef, {
    confirmedCount: increment(-1),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { success: true };
}

/**
 * Pure helper to compute live metrics for an event and coordinator.
 *
 * @param {object} event
 * @param {object} [coordinator=null]
 * @returns {object} Derived metrics
 */
export function getEventCapacityMetrics(event, coordinator = null) {
  return computeCapacityMetrics({ event, coordinator });
}

export const directAdmissionBatch = executeDirectAdmission;
export const directCancellationWithoutWaitlistBatch = cancelRsvpWithoutWaitlist;
