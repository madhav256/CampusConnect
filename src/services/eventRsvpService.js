/**
 * Milestone 21 — Unit 21.3: RSVP Client Services & Hook Layer
 *
 * Authoritative client-side Event RSVP service for CampusConnect.
 * Encapsulates Firestore references, queries (Q1, Q2, Q3), normalization,
 * real-time subscriptions, and deterministic mutations (create, delete).
 */

import {
  collection,
  doc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  limit as firestoreLimit,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import { getEventRsvpId } from "../data/eventRsvps.js";
import { isCappedEvent } from "../data/eventCapacities.js";
import { getEventById } from "./eventService.js";
import { getEventCapacity } from "./eventCapacityService.js";
import { cancelRsvpWithPromotion } from "./eventWaitlistService.js";
import { fetchUserById } from "./userService.js";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

/**
 * Returns a DocumentReference for a deterministic event RSVP document.
 * Root collection: eventRsvps/{eventId}_{userId}
 *
 * @param {string} eventId
 * @param {string} userId
 * @returns {import("firebase/firestore").DocumentReference}
 */
export function eventRsvpDocRef(eventId, userId) {
  const rsvpId = getEventRsvpId(eventId, userId);
  return doc(requireDb(), "eventRsvps", rsvpId);
}

/**
 * Returns a CollectionReference for the root eventRsvps collection.
 *
 * @returns {import("firebase/firestore").CollectionReference}
 */
export function eventRsvpsCollectionRef() {
  return collection(requireDb(), "eventRsvps");
}

/**
 * Normalizes Firestore Timestamp, Date, or string into client Date or null.
 *
 * @param {any} val
 * @returns {Date|null}
 */
export function normalizeTimestamp(val) {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  if (typeof val.toMillis === "function") return new Date(val.toMillis());
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Normalizes a raw Firestore event RSVP document snapshot or object
 * into the locked 5-field RSVP contract:
 * { id, eventId, campusId, userId, createdAt }
 *
 * @param {string|import("firebase/firestore").DocumentSnapshot|object} idOrDoc
 * @param {object|null} [maybeData]
 * @returns {object|null}
 */
export function normalizeEventRsvp(idOrDoc, maybeData) {
  let id = idOrDoc;
  let data = maybeData;

  if (idOrDoc && typeof idOrDoc === "object") {
    if (typeof idOrDoc.data === "function") {
      id = idOrDoc.id;
      data = idOrDoc.data();
    } else if (!maybeData) {
      id = idOrDoc.id;
      data = idOrDoc;
    }
  }

  if (!data) return null;

  return {
    id: id || data.id || "",
    eventId: data.eventId || "",
    campusId: data.campusId || "",
    userId: data.userId || "",
    createdAt: normalizeTimestamp(data.createdAt),
  };
}

/**
 * Subscribes in real-time to a deterministic event RSVP document (Q1).
 * Emits the normalized 5-field RSVP when present, and null when absent.
 * Zero fixture fallback on absent document or Firestore error.
 *
 * @param {string} eventId
 * @param {string} userId
 * @param {(rsvp: object|null) => void} cb
 * @param {(error: Error) => void} [onError]
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToMyEventRsvp(eventId, userId, cb, onError) {
  if (!eventId || !userId || typeof eventId !== "string" || typeof userId !== "string") {
    if (typeof cb === "function") {
      cb(null);
    }
    return () => {};
  }

  try {
    const rRef = eventRsvpDocRef(eventId, userId);
    return onSnapshot(
      rRef,
      (snap) => {
        if (typeof cb === "function") {
          if (snap.exists()) {
            cb(normalizeEventRsvp(snap.id, snap.data()));
          } else {
            cb(null);
          }
        }
      },
      (err) => {
        if (typeof onError === "function") {
          onError(err);
        }
      }
    );
  } catch (err) {
    if (typeof onError === "function") {
      onError(err);
    }
    return () => {};
  }
}

/**
 * Subscribes in real-time to event attendees (Q3).
 * Query: where("eventId", "==", eventId), where("campusId", "==", campusId), limit(limit)
 * Returns { attendees, count, hasMore } preserving the 51-document cap for the 50+ convention.
 * Zero fixture fallback on error or empty results.
 *
 * @param {string} eventId
 * @param {string} campusId
 * @param {({ attendees: Array<object>, count: number, hasMore: boolean }) => void} cb
 * @param {(error: Error) => void} [onError]
 * @param {object} [options]
 * @param {number} [options.limit=51]
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToEventAttendees(
  eventId,
  campusId,
  cb,
  onError,
  { limit = 51 } = {}
) {
  if (!eventId || !campusId || typeof eventId !== "string" || typeof campusId !== "string") {
    if (typeof cb === "function") {
      cb({ attendees: [], count: 0, hasMore: false });
    }
    return () => {};
  }

  const effectiveLimit = Number.isInteger(limit) && limit > 0 ? limit : 51;

  try {
    const colRef = collection(requireDb(), "eventRsvps");
    const q = query(
      colRef,
      where("eventId", "==", eventId),
      where("campusId", "==", campusId),
      firestoreLimit(effectiveLimit)
    );

    return onSnapshot(
      q,
      (snap) => {
        if (typeof cb === "function") {
          const rawDocs = snap.docs.map((d) => normalizeEventRsvp(d.id, d.data()));
          const hasMore = rawDocs.length >= effectiveLimit;
          const maxAttendees = effectiveLimit > 1 ? effectiveLimit - 1 : 1;
          const attendees = hasMore ? rawDocs.slice(0, maxAttendees) : rawDocs;
          cb({
            attendees,
            count: attendees.length,
            hasMore,
          });
        }
      },
      (err) => {
        if (typeof onError === "function") {
          onError(err);
        }
      }
    );
  } catch (err) {
    if (typeof onError === "function") {
      onError(err);
    }
    return () => {};
  }
}

/**
 * Subscribes in real-time to the current user's RSVPs across the campus (Q2).
 * Query: where("userId", "==", userId), where("campusId", "==", campusId), limit(limit)
 * Normalizes all documents into the 5-field contract.
 * Zero fixture fallback on error or empty results.
 *
 * @param {string} userId
 * @param {string} campusId
 * @param {(rsvps: Array<object>) => void} cb
 * @param {(error: Error) => void} [onError]
 * @param {object} [options]
 * @param {number} [options.limit=50]
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToMyRsvps(
  userId,
  campusId,
  cb,
  onError,
  { limit = 50 } = {}
) {
  if (!userId || !campusId || typeof userId !== "string" || typeof campusId !== "string") {
    if (typeof cb === "function") {
      cb([]);
    }
    return () => {};
  }

  const effectiveLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;

  try {
    const colRef = collection(requireDb(), "eventRsvps");
    const q = query(
      colRef,
      where("userId", "==", userId),
      where("campusId", "==", campusId),
      firestoreLimit(effectiveLimit)
    );

    return onSnapshot(
      q,
      (snap) => {
        if (typeof cb === "function") {
          const items = snap.docs.map((d) => normalizeEventRsvp(d.id, d.data()));
          cb(items);
        }
      },
      (err) => {
        if (typeof onError === "function") {
          onError(err);
        }
      }
    );
  } catch (err) {
    if (typeof onError === "function") {
      onError(err);
    }
    return () => {};
  }
}

/**
 * Creates the deterministic RSVP document adhering strictly to the 5-field schema
 * and atomically creates the organizer notification (rsvp_${eventId}_${userId})
 * in the same Firestore writeBatch if the organizer is not the actor.
 *
 * Root collection: eventRsvps/{eventId}_{userId}
 * Notification: users/{organizerId}/notifications/rsvp_{eventId}_{userId}
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {string} params.userId
 * @param {string} params.campusId
 * @param {object|null} [params.event] Optional preloaded event object
 * @param {object|null} [params.userProfile] Optional preloaded actor public profile
 * @returns {Promise<object>} Created RSVP document payload
 */
export async function createEventRsvp({
  eventId,
  userId,
  campusId,
  event = null,
  coordinator = null,
  userProfile = null,
}) {
  if (
    !eventId ||
    !userId ||
    !campusId ||
    typeof eventId !== "string" ||
    typeof userId !== "string" ||
    typeof campusId !== "string"
  ) {
    throw new Error("eventId, userId, and campusId are required to create an RSVP.");
  }

  const id = getEventRsvpId(eventId, userId);
  const rRef = eventRsvpDocRef(eventId, userId);

  const rsvpDoc = {
    id,
    eventId,
    campusId,
    userId,
    createdAt: serverTimestamp(),
  };

  let targetEvent = event;
  if (!targetEvent && typeof getEventById === "function") {
    try {
      targetEvent = await getEventById(eventId);
    } catch {
      targetEvent = null;
    }
  }

  let targetCoordinator = coordinator;
  const eventIsCapped =
    isCappedEvent(targetEvent) || Boolean(targetCoordinator?.capacity > 0);

  if (eventIsCapped && !targetCoordinator && typeof getEventCapacity === "function") {
    try {
      targetCoordinator = await getEventCapacity(eventId);
    } catch {
      targetCoordinator = null;
    }
  }

  if (eventIsCapped && targetCoordinator) {
    const capLimit =
      typeof targetEvent?.capacity === "number"
        ? targetEvent.capacity
        : targetCoordinator.capacity;
    const allocatedSeats =
      (Number(targetCoordinator.confirmedCount) || 0) +
      (Number(targetCoordinator.offeredCount) || 0);
    const waitlistCount = Number(targetCoordinator.waitlistCount) || 0;
    if (
      (typeof capLimit === "number" && allocatedSeats >= capLimit) ||
      waitlistCount > 0
    ) {
      throw new Error(
        "Event is at capacity or has an active waitlist. Please join the waitlist."
      );
    }
  }

  let actorProfile = userProfile;
  if (!actorProfile && typeof fetchUserById === "function") {
    try {
      actorProfile = await fetchUserById(userId);
    } catch {
      actorProfile = null;
    }
  }

  const shouldNotifyOrganizer = Boolean(
    targetEvent &&
    targetEvent.createdBy &&
    targetEvent.createdBy !== userId
  );

  const firestore = requireDb();
  const batch = writeBatch(firestore);

  batch.set(rRef, rsvpDoc);

  // Pathway PW-1: Atomic coordinator confirmedCount increment for capped events
  if (eventIsCapped) {
    const capRef = doc(firestore, "eventCapacities", eventId);
    batch.update(capRef, {
      confirmedCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }

  if (shouldNotifyOrganizer) {
    const notifId = `rsvp_${eventId}_${userId}`;
    const notifRef = doc(firestore, "users", targetEvent.createdBy, "notifications", notifId);

    const notifDoc = {
      id: notifId,
      recipientId: targetEvent.createdBy,
      actorId: userId,
      actorName: actorProfile?.displayName || "CampusConnect Student",
      actorAvatar: actorProfile?.photoURL || null,
      type: "event_rsvp",
      referenceId: eventId,
      isRead: false,
      createdAt: serverTimestamp(),
    };

    if (targetEvent.title && typeof targetEvent.title === "string") {
      const trimmedTitle = targetEvent.title.trim();
      if (trimmedTitle.length > 0) {
        notifDoc.referenceTitle = trimmedTitle.slice(0, 100);
      }
    }

    batch.set(notifRef, notifDoc);
  }

  await batch.commit();
  return rsvpDoc;
}

/**
 * Deletes the deterministic RSVP document for the given event and user.
 * For capped events:
 * - Pathway PW-3 (waitlistCount === 0): atomically deletes the RSVP and decrements
 *   eventCapacities/{eventId}.confirmedCount in a single writeBatch.
 * - Pathway PW-4 (waitlistCount > 0): invokes the cancelRsvpWithPromotion callable
 *   to atomically cancel the RSVP and promote the head waitlist candidate.
 * For uncapped events: deletes eventRsvps/{eventId}_{userId} directly.
 *
 * @param {string} eventId
 * @param {string} userId
 * @param {object} [options]
 * @param {object|null} [options.event]
 * @param {object|null} [options.coordinator]
 * @returns {Promise<any>}
 */
export async function deleteEventRsvp(eventId, userId, options = {}) {
  if (
    !eventId ||
    !userId ||
    typeof eventId !== "string" ||
    typeof userId !== "string"
  ) {
    throw new Error("eventId and userId are required to delete an RSVP.");
  }

  const rRef = eventRsvpDocRef(eventId, userId);

  let targetEvent = options?.event || null;
  let targetCoordinator = options?.coordinator || null;

  if (!targetEvent && !targetCoordinator && typeof getEventById === "function") {
    try {
      targetEvent = await getEventById(eventId);
    } catch {
      targetEvent = null;
    }
  }

  const eventIsCapped =
    isCappedEvent(targetEvent) || Boolean(targetCoordinator);

  if (eventIsCapped) {
    if (!targetCoordinator && typeof getEventCapacity === "function") {
      try {
        targetCoordinator = await getEventCapacity(eventId);
      } catch {
        targetCoordinator = null;
      }
    }

    const waitlistCount = Number(targetCoordinator?.waitlistCount) || 0;
    if (waitlistCount > 0) {
      // Pathway PW-4: Active waitlist exists -> delegate to backend callable
      return await cancelRsvpWithPromotion({ eventId });
    }

    // Pathway PW-3: Empty waitlist -> atomic client batch decrementing confirmedCount
    const firestore = requireDb();
    const batch = writeBatch(firestore);
    const capRef = doc(firestore, "eventCapacities", eventId);
    batch.delete(rRef);
    batch.update(capRef, {
      confirmedCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return;
  }

  await deleteDoc(rRef);
}
