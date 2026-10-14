/**
 * Milestone 20 — Unit 20.3: Event Client Services & Hook Layer
 *
 * Authoritative client-side Event service for CampusConnect.
 * Encapsulates Firestore references, queries, normalization,
 * realtime subscriptions, and client mutations (create, update, cancel, delete).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../firebase/config";
import { fetchUserById } from "./userService.js";
import {
  EVENT_CATEGORY_LIST,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
  EVENT_VISIBILITY_LIST,
} from "../constants.js";
import {
  EVENT_IMMUTABLE_FIELDS,
  UPCOMING_MUTABLE_FIELDS,
  ONGOING_MUTABLE_FIELDS,
  getEventTemporalState,
} from "../data/events.js";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

/**
 * Returns a DocumentReference for an event document.
 *
 * @param {string} eventId
 * @returns {import("firebase/firestore").DocumentReference}
 */
export function eventDocRef(eventId) {
  if (!eventId || typeof eventId !== "string") {
    throw new Error("Event ID is required to resolve document reference.");
  }
  return doc(requireDb(), "events", eventId);
}

/**
 * Returns a CollectionReference for the root events collection.
 *
 * @returns {import("firebase/firestore").CollectionReference}
 */
export function eventsCollectionRef() {
  return collection(requireDb(), "events");
}

/**
 * Normalizes Firestore Timestamp, Date, number, or string into client Date or null.
 * Rejects non-finite, out-of-range, or malformed values by returning null.
 *
 * @param {any} val
 * @returns {Date|null}
 */
export function normalizeTimestamp(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "boolean") return null;

  if (val && typeof val === "object" && ("seconds" in val || "nanoseconds" in val)) {
    const sec = val.seconds;
    if (typeof sec !== "number" || !Number.isInteger(sec)) {
      return null;
    }
    let nano = 0;
    if (val.nanoseconds !== undefined) {
      nano = val.nanoseconds;
      if (typeof nano !== "number" || !Number.isInteger(nano) || nano < 0 || nano >= 1_000_000_000) {
        return null;
      }
    }
    const ms = sec * 1000 + Math.floor(nano / 1e6);
    if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) {
      return null;
    }
    if (typeof val.toDate === "function") {
      try {
        const d = val.toDate();
        if (d instanceof Date && Number.isFinite(d.getTime())) {
          return d;
        }
      } catch {
        return null;
      }
    }
    return new Date(ms);
  }

  if (typeof val?.toMillis === "function") {
    try {
      const ms = val.toMillis();
      if (typeof ms !== "number" || !Number.isFinite(ms) || Math.abs(ms) > 8.64e15) {
        return null;
      }
      if (typeof val.toDate === "function") {
        try {
          const d = val.toDate();
          if (d instanceof Date && Number.isFinite(d.getTime())) {
            return d;
          }
        } catch {
          return null;
        }
      }
      return new Date(ms);
    } catch {
      return null;
    }
  }
  if (typeof val?.toDate === "function") {
    try {
      const d = val.toDate();
      if (d instanceof Date && Number.isFinite(d.getTime())) {
        return d;
      }
      return null;
    } catch {
      return null;
    }
  }
  if (val instanceof Date) {
    return Number.isFinite(val.getTime()) ? val : null;
  }
  if (typeof val === "number") {
    return Number.isFinite(val) && Math.abs(val) <= 8.64e15 ? new Date(val) : null;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

/**
 * Converts a Date, ISO string, number, or Timestamp to a Firestore Timestamp.
 * Preserves genuine Timestamp instances directly.
 * Canonicalizes all other valid supported inputs using Timestamp.fromDate().
 * Rejects invalid, non-finite, out-of-range, or unparseable inputs.
 *
 * @param {any} val
 * @returns {Timestamp|Date|null}
 */
export function toFirestoreTimestamp(val) {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof Timestamp === "function" && val instanceof Timestamp) {
    return val;
  }
  const d = normalizeTimestamp(val);
  if (!d) {
    throw new Error("Invalid date provided.");
  }
  return typeof Timestamp?.fromDate === "function" ? Timestamp.fromDate(d) : d;
}

/**
 * Normalizes a raw Firestore event document into the locked 17-field event contract.
 * Supports both (eventId, data) and (documentSnapshot) or (documentObject) signatures.
 *
 * @param {string|import("firebase/firestore").DocumentSnapshot|object} eventIdOrDoc
 * @param {object|null} [maybeData]
 * @returns {object|null}
 */
export function normalizeEvent(eventIdOrDoc, maybeData) {
  let eventId = eventIdOrDoc;
  let data = maybeData;

  if (eventIdOrDoc && typeof eventIdOrDoc === "object") {
    if (typeof eventIdOrDoc.data === "function") {
      eventId = eventIdOrDoc.id;
      data = eventIdOrDoc.data();
    } else if (!maybeData) {
      eventId = eventIdOrDoc.id;
      data = eventIdOrDoc;
    }
  }

  if (!data) return null;

  return {
    id: eventId || data.id || "",
    campusId: data.campusId || "",
    communityId: data.communityId ?? null,
    title: data.title || "",
    slug: data.slug || eventId || "",
    description: data.description || "",
    category: data.category || "",
    location: data.location || "",
    startAt: normalizeTimestamp(data.startAt),
    endAt: normalizeTimestamp(data.endAt),
    imageURL: data.imageURL ?? null,
    createdBy: data.createdBy || "",
    organizerName: data.organizerName || "",
    status: data.status || EVENT_STATUSES.PUBLISHED,
    visibility: data.visibility || EVENT_VISIBILITIES.CAMPUS_PUBLIC,
    createdAt: normalizeTimestamp(data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt),
  };
}


/**
 * Sorts normalized events by startAt date.
 *
 * @param {Array<object>} events
 * @param {"asc"|"desc"} [order="asc"]
 * @returns {Array<object>}
 */
export function sortEventsByDate(events, order = "asc") {
  return [...events].sort((a, b) => {
    const timeA = a.startAt ? new Date(a.startAt).getTime() : 0;
    const timeB = b.startAt ? new Date(b.startAt).getTime() : 0;
    return order === "desc" ? timeB - timeA : timeA - timeB;
  });
}

/**
 * Pure helper to filter a list of normalized events.
 * Uses getEventTemporalState for temporal interpretation.
 *
 * @param {Array<object>} events
 * @param {object} [options]
 * @param {string} [options.category]
 * @param {string} [options.status]
 * @param {"upcoming"|"past"|"all"} [options.timeRange]
 * @param {Date|number|string} [options.referenceDate]
 * @returns {Array<object>}
 */
export function filterEvents(events, options = {}) {
  if (!Array.isArray(events)) return [];
  let filtered = [...events];

  if (options.category) {
    filtered = filtered.filter((e) => e.category === options.category);
  }

  if (options.status) {
    filtered = filtered.filter((e) => e.status === options.status);
  }

  if (options.timeRange && options.timeRange !== "all") {
    const refDate = options.referenceDate || new Date();
    if (options.timeRange === "upcoming") {
      filtered = filtered.filter((e) => getEventTemporalState(e, refDate) !== "completed");
    } else if (options.timeRange === "past" || options.timeRange === "completed") {
      filtered = filtered.filter((e) => getEventTemporalState(e, refDate) === "completed");
    }
  }

  return filtered;
}

/**
 * Normalizes query arguments for functions accepting optional options or callback.
 *
 * @param {object|function} optionsOrCallback
 * @param {function} [maybeCallback]
 * @param {function} [maybeOnError]
 * @returns {{ options: object, callback: function, onError: function }}
 */
function normalizeQueryArgs(optionsOrCallback, maybeCallback, maybeOnError) {
  let options = {};
  let callback;
  let onError;

  if (typeof optionsOrCallback === "function") {
    callback = optionsOrCallback;
    onError = maybeCallback;
  } else {
    options = optionsOrCallback || {};
    callback = maybeCallback;
    onError = maybeOnError;
  }
  return { options, callback, onError };
}

/**
 * @typedef {Object} EventResolution
 * @property {"available" | "inaccessible" | "error"} status
 * @property {object | null} event
 * @property {Error | null} error
 */

/**
 * Maps a Firestore document snapshot to an EventResolution.
 *
 * @param {import("firebase/firestore").DocumentSnapshot} snap
 * @returns {EventResolution}
 */
export function mapSnapshotToResolution(snap) {
  if (snap && typeof snap.exists === "function" && snap.exists()) {
    return {
      status: "available",
      event: normalizeEvent(snap.id, snap.data()),
      error: null,
    };
  }
  return {
    status: "inaccessible",
    event: null,
    error: null,
  };
}

/**
 * Maps a Firestore error to an EventResolution.
 * Permission-denied errors map to 'inaccessible', while unexpected errors map to 'error'.
 *
 * @param {any} err
 * @returns {EventResolution}
 */
export function mapErrorToResolution(err) {
  const code = err?.code;
  const message = err?.message || "";
  if (
    code === "permission-denied" ||
    code === "permission_denied" ||
    message.includes("permission-denied") ||
    message.includes("Missing or insufficient permissions")
  ) {
    return {
      status: "inaccessible",
      event: null,
      error: null,
    };
  }
  return {
    status: "error",
    event: null,
    error: err instanceof Error ? err : new Error(String(err || "Unknown Firestore error")),
  };
}

/**
 * Authoritative single event resolution from Firestore (§12.4).
 * Strictly queries Firestore with zero local fixture fallback.
 * Maps:
 * - snapshot exists -> { status: "available", event: NormalizedEvent, error: null }
 * - snapshot does not exist -> { status: "inaccessible", event: null, error: null }
 * - permission-denied -> { status: "inaccessible", event: null, error: null }
 * - other errors -> { status: "error", event: null, error: Error }
 *
 * @param {string} eventId
 * @returns {Promise<EventResolution>}
 */
export async function resolveEvent(eventId) {
  if (!eventId || typeof eventId !== "string") {
    return {
      status: "inaccessible",
      event: null,
      error: null,
    };
  }

  try {
    const eRef = eventDocRef(eventId);
    const snap = await getDoc(eRef);
    return mapSnapshotToResolution(snap);
  } catch (err) {
    return mapErrorToResolution(err);
  }
}

/**
 * Subscribes in real-time to authoritative single event resolution (§12.4).
 * Emits EventResolution objects ("available" | "inaccessible" | "error").
 *
 * @param {string} eventId
 * @param {(resolution: EventResolution) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToEventResolution(eventId, callback) {
  if (!eventId || typeof eventId !== "string") {
    if (typeof callback === "function") {
      callback({
        status: "inaccessible",
        event: null,
        error: null,
      });
    }
    return () => {};
  }

  try {
    const eRef = eventDocRef(eventId);
    return onSnapshot(
      eRef,
      (snap) => {
        if (typeof callback === "function") {
          callback(mapSnapshotToResolution(snap));
        }
      },
      (err) => {
        if (typeof callback === "function") {
          callback(mapErrorToResolution(err));
        }
      }
    );
  } catch (err) {
    if (typeof callback === "function") {
      callback(mapErrorToResolution(err));
    }
    return () => {};
  }
}

/**
 * Legacy getter for backward compatibility.
 * Fetches an individual event by document ID.
 * Returns null if the event document does not exist.
 * Propagates errors without fixture fallback.
 *
 * @param {string} eventId
 * @returns {Promise<object|null>}
 */
export async function getEventById(eventId) {
  if (!eventId || typeof eventId !== "string") {
    return null;
  }

  const eRef = eventDocRef(eventId);
  const snap = await getDoc(eRef);

  if (!snap.exists()) {
    return null;
  }

  return normalizeEvent(snap.id, snap.data());
}

/** Legacy alias for getEventById */
export const getEvent = getEventById;

/**
 * Subscribes in real-time to a single event document (legacy contract).
 *
 * @param {string} eventId
 * @param {function} callback
 * @param {function} [onError]
 * @returns {function} Unsubscribe function
 */
export function subscribeToEvent(eventId, callback, onError) {
  if (!eventId || typeof eventId !== "string") {
    if (callback) callback(null);
    return () => {};
  }

  try {
    const eRef = eventDocRef(eventId);
    return onSnapshot(
      eRef,
      (snap) => {
        if (snap.exists()) {
          if (callback) callback(normalizeEvent(snap.id, snap.data()));
        } else {
          if (callback) callback(null);
        }
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  } catch (err) {
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Fetches campus-scoped events compatible with Firestore Security Rules.
 * Defaults visibility to 'campus_public' for discovery queries.
 *
 * @param {string} campusId
 * @param {object} [options]
 * @returns {Promise<Array<object>>}
 */
export async function getEventsByCampus(campusId, options = {}) {
  if (!campusId || typeof campusId !== "string") {
    return [];
  }

  const visibility = options.visibility || EVENT_VISIBILITIES.CAMPUS_PUBLIC;
  const constraints = [
    where("campusId", "==", campusId),
    where("visibility", "==", visibility),
  ];

  if (options.category) {
    constraints.push(where("category", "==", options.category));
  }

  const colRef = eventsCollectionRef();
  const q = query(colRef, ...constraints);
  const snap = await getDocs(q);

  if (snap.empty) {
    return [];
  }

  const items = snap.docs.map((d) => normalizeEvent(d.id, d.data()));
  return filterEvents(sortEventsByDate(items, options.sortOrder), options);
}

/**
 * Subscribes in real-time to campus events.
 *
 * @param {string} campusId
 * @param {object|function} optionsOrCallback
 * @param {function} [maybeCallback]
 * @param {function} [maybeOnError]
 * @returns {function} Unsubscribe function
 */
export function subscribeToCampusEvents(
  campusId,
  optionsOrCallback,
  maybeCallback,
  maybeOnError
) {
  const { options, callback, onError } = normalizeQueryArgs(
    optionsOrCallback,
    maybeCallback,
    maybeOnError
  );

  if (!campusId || typeof campusId !== "string") {
    if (callback) callback([]);
    return () => {};
  }

  const visibility = options.visibility || EVENT_VISIBILITIES.CAMPUS_PUBLIC;
  const constraints = [
    where("campusId", "==", campusId),
    where("visibility", "==", visibility),
  ];

  if (options.category) {
    constraints.push(where("category", "==", options.category));
  }

  try {
    const colRef = eventsCollectionRef();
    const q = query(colRef, ...constraints);

    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => normalizeEvent(d.id, d.data()));
        const processed = filterEvents(
          sortEventsByDate(items, options.sortOrder),
          options
        );
        if (callback) callback(processed);
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  } catch (err) {
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Fetches community-scoped events.
 * For confirmed active community members (options.isMember === true), retrieves all
 * events sponsored by the community (both campus_public and community_only).
 * For non-members or unconfirmed visitors, strictly constrains to campus_public events
 * so every potential document returned is authorized by Firestore Security Rules.
 *
 * @param {string} communityId
 * @param {object} [options]
 * @param {boolean} [options.isMember=false] - Whether caller is confirmed active member
 * @param {string} [options.visibility] - Explicit visibility constraint
 * @param {string} [options.category] - Category filter
 * @param {string} [options.status] - Status filter
 * @param {"upcoming"|"past"|"all"} [options.timeRange] - Temporal filter
 * @param {"asc"|"desc"} [options.sortOrder] - Sort order by startAt
 * @returns {Promise<Array<object>>}
 */
export async function getEventsByCommunity(communityId, options = {}) {
  const campusId = typeof options === "string" ? options : options?.campusId;
  if (!communityId || typeof communityId !== "string" || !campusId || typeof campusId !== "string") {
    return [];
  }

  const isMember = Boolean(options.isMember);

  // For active members without an explicit visibility filter, fetch both
  // campus_public and community_only events via rule-compatible queries and merge.
  if (isMember && !options.visibility) {
    const [publicEvents, memberEvents] = await Promise.all([
      getEventsByCommunity(communityId, {
        ...options,
        visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
      }),
      getEventsByCommunity(communityId, {
        ...options,
        visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY,
      }),
    ]);
    const map = new Map();
    for (const e of publicEvents) map.set(e.id, e);
    for (const e of memberEvents) map.set(e.id, e);
    const combined = Array.from(map.values());
    return filterEvents(sortEventsByDate(combined, options.sortOrder), options);
  }

  const constraints = [
    where("communityId", "==", communityId),
    where("campusId", "==", campusId),
  ];

  if (options.visibility) {
    constraints.push(where("visibility", "==", options.visibility));
  } else if (!isMember) {
    constraints.push(where("visibility", "==", EVENT_VISIBILITIES.CAMPUS_PUBLIC));
  }

  if (options.category) {
    constraints.push(where("category", "==", options.category));
  }
  if (options.status) {
    constraints.push(where("status", "==", options.status));
  }

  const colRef = eventsCollectionRef();
  const q = query(colRef, ...constraints);
  const snap = await getDocs(q);

  if (snap.empty) {
    return [];
  }

  const items = snap.docs.map((d) => normalizeEvent(d.id, d.data()));
  return filterEvents(sortEventsByDate(items, options.sortOrder), options);
}

/**
 * Subscribes in real-time to community-scoped events.
 * Enforces member vs non-member visibility query constraints and campus tenant boundary.
 *
 * @param {string} communityId
 * @param {object|function} optionsOrCallback
 * @param {function} [maybeCallback]
 * @param {function} [maybeOnError]
 * @returns {function} Unsubscribe function
 */
export function subscribeToCommunityEvents(
  communityId,
  optionsOrCallback,
  maybeCallback,
  maybeOnError
) {
  const { options, callback, onError } = normalizeQueryArgs(
    optionsOrCallback,
    maybeCallback,
    maybeOnError
  );

  const campusId = typeof options === "string" ? options : options?.campusId;
  if (!communityId || typeof communityId !== "string" || !campusId || typeof campusId !== "string") {
    if (callback) callback([]);
    return () => {};
  }

  const isMember = Boolean(options.isMember);

  // For active members without an explicit visibility filter, subscribe to both
  // campus_public and community_only streams and merge real-time updates.
  if (isMember && !options.visibility) {
    let publicDocs = [];
    let memberDocs = [];
    const emit = () => {
      const map = new Map();
      for (const e of publicDocs) map.set(e.id, e);
      for (const e of memberDocs) map.set(e.id, e);
      const combined = Array.from(map.values());
      const processed = filterEvents(
        sortEventsByDate(combined, options.sortOrder),
        options
      );
      if (callback) callback(processed);
    };

    const unsubPublic = subscribeToCommunityEvents(
      communityId,
      { ...options, visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC },
      (items) => {
        publicDocs = items || [];
        emit();
      },
      onError
    );

    const unsubMember = subscribeToCommunityEvents(
      communityId,
      { ...options, visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY },
      (items) => {
        memberDocs = items || [];
        emit();
      },
      onError
    );

    return () => {
      if (typeof unsubPublic === "function") unsubPublic();
      if (typeof unsubMember === "function") unsubMember();
    };
  }

  const constraints = [
    where("communityId", "==", communityId),
    where("campusId", "==", campusId),
  ];

  if (options.visibility) {
    constraints.push(where("visibility", "==", options.visibility));
  } else if (!isMember) {
    constraints.push(where("visibility", "==", EVENT_VISIBILITIES.CAMPUS_PUBLIC));
  }

  if (options.category) {
    constraints.push(where("category", "==", options.category));
  }
  if (options.status) {
    constraints.push(where("status", "==", options.status));
  }

  try {
    const colRef = eventsCollectionRef();
    const q = query(colRef, ...constraints);

    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => normalizeEvent(d.id, d.data()));
        const processed = filterEvents(
          sortEventsByDate(items, options.sortOrder),
          options
        );
        if (callback) callback(processed);
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  } catch (err) {
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Creates a new client-created event.
 * Enforces sponsoring community existence, exact schema, and immutable fields.
 *
 * @param {object} eventData
 * @param {object} [currentUser]
 * @returns {Promise<string>} Created event ID
 */
export async function createEvent(eventData, currentUser = null) {
  if (!eventData || typeof eventData !== "object") {
    throw new Error("Event data object is required.");
  }

  // Sponsoring community validation (client events must have a sponsoring community)
  if (!eventData.communityId || typeof eventData.communityId !== "string" || !eventData.communityId.trim()) {
    throw new Error("A valid sponsoring communityId is required for client-created events.");
  }

  if (!eventData.title || typeof eventData.title !== "string" || !eventData.title.trim()) {
    throw new Error("Event title is required.");
  }

  const campusId = eventData.campusId || currentUser?.campusId;
  if (!campusId || typeof campusId !== "string") {
    throw new Error("Campus ID is required to create an event.");
  }

  const createdBy = eventData.createdBy || currentUser?.uid;
  if (!createdBy || typeof createdBy !== "string") {
    throw new Error("Event creator UID is required.");
  }

  if (!eventData.category || !EVENT_CATEGORY_LIST.includes(eventData.category)) {
    throw new Error(`Invalid event category: ${eventData.category}`);
  }

  const visibility = eventData.visibility || EVENT_VISIBILITIES.CAMPUS_PUBLIC;
  if (!EVENT_VISIBILITY_LIST.includes(visibility)) {
    throw new Error(`Invalid event visibility: ${visibility}`);
  }

  if (!eventData.startAt || !eventData.endAt) {
    throw new Error("Both startAt and endAt timestamps are required.");
  }

  const startMs = new Date(eventData.startAt).getTime();
  const endMs = new Date(eventData.endAt).getTime();
  if (isNaN(startMs) || isNaN(endMs)) {
    throw new Error("Invalid startAt or endAt timestamp.");
  }
  if (endMs < startMs) {
    throw new Error("Event end time must be after or equal to start time.");
  }

  const colRef = eventsCollectionRef();
  const targetDocRef = eventData.id ? doc(colRef, eventData.id) : doc(colRef);
  const eventId = targetDocRef.id;

  const slug = eventData.slug
    ? String(eventData.slug).trim()
    : eventData.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const payload = {
    id: eventId,
    campusId,
    communityId: eventData.communityId.trim(),
    title: eventData.title.trim(),
    slug: slug || eventId,
    description: eventData.description ? String(eventData.description).trim() : "",
    category: eventData.category,
    location: eventData.location ? String(eventData.location).trim() : "",
    startAt: toFirestoreTimestamp(eventData.startAt),
    endAt: toFirestoreTimestamp(eventData.endAt),
    imageURL: eventData.imageURL || null,
    createdBy,
    organizerName: eventData.organizerName ? String(eventData.organizerName).trim() : "",
    status: EVENT_STATUSES.PUBLISHED,
    visibility,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(targetDocRef, payload);
  return eventId;
}

/**
 * Updates mutable fields of an existing event according to Revision 9 lifecycle rules.
 * Enforces upcoming vs. ongoing allowlists, resulting chronology, and selective
 * timestamp canonicalization (omitting unchanged dates).
 *
 * @param {string} eventId
 * @param {object} updates
 * @param {object} currentEvent
 * @param {Date|number|string} [referenceNow=new Date()]
 * @returns {Promise<void>}
 */
export async function updateEvent(eventId, updates, currentEvent, referenceNow = new Date()) {
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    throw new Error("Event ID is required to update an event.");
  }
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("Updates object is required.");
  }
  if (!currentEvent || typeof currentEvent !== "object") {
    throw new Error("Current event object is required.");
  }

  // 1. Status decoupling: updateEvent cannot alter status
  if (updates.status !== undefined) {
    throw new Error("Status cannot be modified via updateEvent. Use cancelEvent or republishEvent.");
  }

  // 2. Reference time validation
  const refNow = normalizeTimestamp(referenceNow);
  if (!refNow || isNaN(refNow.getTime())) {
    throw new Error("Invalid reference time.");
  }

  // 3. Existing timestamp validation & stored chronological integrity
  const existingStartAt = normalizeTimestamp(currentEvent.startAt);
  const existingEndAt = normalizeTimestamp(currentEvent.endAt);
  if (
    !existingStartAt ||
    !existingEndAt ||
    isNaN(existingStartAt.getTime()) ||
    isNaN(existingEndAt.getTime()) ||
    existingEndAt.getTime() < existingStartAt.getTime()
  ) {
    throw new Error("Existing event startAt and endAt timestamps violate chronological integrity.");
  }

  // 4. Status precondition: only published events can receive detail edits
  if (currentEvent.status !== EVENT_STATUSES.PUBLISHED) {
    throw new Error("Only published events can be edited. Cancelled events must be republished before editing.");
  }

  // 5. Derived temporal state evaluation
  const state = getEventTemporalState(currentEvent, refNow);
  if (state === null) {
    throw new Error("Unable to resolve valid event temporal state.");
  }
  if (state === "completed") {
    throw new Error("Completed events are read-only and cannot be modified.");
  }
  if (state !== "upcoming" && state !== "ongoing") {
    throw new Error("Invalid event temporal state.");
  }

  const safePayload = {};

  // 6. Branch A: Upcoming Events (now < startAt)
  if (state === "upcoming") {
    for (const key of Object.keys(updates)) {
      if (EVENT_IMMUTABLE_FIELDS.includes(key)) {
        throw new Error(`Cannot modify immutable event field: ${key}`);
      }
      if (key === "updatedAt") {
        throw new Error("updatedAt cannot be supplied by caller.");
      }
      if (!UPCOMING_MUTABLE_FIELDS.includes(key)) {
        throw new Error(`Field '${key}' is not allowed for upcoming event edits.`);
      }
    }

    let resultingStartAt = existingStartAt;
    let resultingEndAt = existingEndAt;

    if (updates.startAt !== undefined) {
      const newStartAt = normalizeTimestamp(updates.startAt);
      if (!newStartAt || isNaN(newStartAt.getTime())) {
        throw new Error("Invalid startAt timestamp.");
      }
      if (newStartAt.getTime() <= refNow.getTime()) {
        throw new Error("Event start time must be strictly in the future.");
      }
      resultingStartAt = newStartAt;
    }

    if (updates.endAt !== undefined) {
      const newEndAt = normalizeTimestamp(updates.endAt);
      if (!newEndAt || isNaN(newEndAt.getTime())) {
        throw new Error("Invalid endAt timestamp.");
      }
      resultingEndAt = newEndAt;
    }

    // Chronological sanity across all upcoming edits (including non-date edits)
    if (resultingEndAt.getTime() < resultingStartAt.getTime()) {
      throw new Error("End date/time must be at or after start date/time.");
    }

    // Non-date allowlisted fields
    if (updates.title !== undefined) safePayload.title = String(updates.title).trim();
    if (updates.slug !== undefined) safePayload.slug = String(updates.slug).trim();
    if (updates.description !== undefined) safePayload.description = String(updates.description).trim();
    if (updates.category !== undefined) {
      if (!EVENT_CATEGORY_LIST.includes(updates.category)) {
        throw new Error(`Invalid event category: ${updates.category}`);
      }
      safePayload.category = updates.category;
    }
    if (updates.location !== undefined) safePayload.location = String(updates.location).trim();
    if (updates.organizerName !== undefined) safePayload.organizerName = String(updates.organizerName).trim();
    if (updates.imageURL !== undefined) safePayload.imageURL = updates.imageURL || null;

    // Selective timestamp canonicalization: include in payload ONLY if genuinely modified
    if (updates.startAt !== undefined && resultingStartAt.getTime() !== existingStartAt.getTime()) {
      safePayload.startAt = toFirestoreTimestamp(resultingStartAt);
    }
    if (updates.endAt !== undefined && resultingEndAt.getTime() !== existingEndAt.getTime()) {
      safePayload.endAt = toFirestoreTimestamp(resultingEndAt);
    }
  }

  // 7. Branch B: Ongoing Events (startAt <= now <= endAt)
  if (state === "ongoing") {
    for (const key of Object.keys(updates)) {
      if (EVENT_IMMUTABLE_FIELDS.includes(key)) {
        throw new Error(`Cannot modify immutable event field: ${key}`);
      }
      if (key === "updatedAt") {
        throw new Error("updatedAt cannot be supplied by caller.");
      }
      if (!ONGOING_MUTABLE_FIELDS.includes(key)) {
        throw new Error(`Field '${key}' is not allowed for ongoing event edits.`);
      }
    }

    if (updates.location !== undefined) safePayload.location = String(updates.location).trim();
    if (updates.description !== undefined) safePayload.description = String(updates.description).trim();
    if (updates.imageURL !== undefined) safePayload.imageURL = updates.imageURL || null;

    if (updates.endAt !== undefined) {
      const newEndAt = normalizeTimestamp(updates.endAt);
      if (!newEndAt || isNaN(newEndAt.getTime())) {
        throw new Error("Invalid endAt timestamp.");
      }

      if (newEndAt.getTime() === existingEndAt.getTime()) {
        // Unchanged: omit from write payload; enforce inclusive ongoing boundary
        if (refNow.getTime() > existingEndAt.getTime()) {
          throw new Error("Completed events are read-only and cannot be modified.");
        }
      } else {
        // Changed: extension only (cannot shorten) and must be strictly in the future
        if (newEndAt.getTime() < existingEndAt.getTime()) {
          throw new Error("Ongoing event end time cannot be shortened.");
        }
        if (newEndAt.getTime() <= refNow.getTime()) {
          throw new Error("Extended end time must be in the future.");
        }
        safePayload.endAt = toFirestoreTimestamp(newEndAt);
      }
    } else {
      // endAt not supplied: enforce inclusive ongoing boundary (now <= endAt)
      if (refNow.getTime() > existingEndAt.getTime()) {
        throw new Error("Completed events are read-only and cannot be modified.");
      }
    }
  }

  safePayload.updatedAt = serverTimestamp();

  const eRef = eventDocRef(eventId);
  await updateDoc(eRef, safePayload);
}

/**
 * Cancels an event by transitioning its status from 'published' to 'cancelled'.
 * Permitted only while upcoming or ongoing (now <= endAt).
 *
 * @param {string} eventId
 * @param {object} currentEvent
 * @param {Date|number|string} [referenceNow=new Date()]
 * @returns {Promise<void>}
 */
/**
 * Returns a DocumentReference for the event's notification delivery ledger.
 * Root collection: eventNotificationDeliveries/{eventId}
 *
 * @param {string} eventId
 * @returns {import("firebase/firestore").DocumentReference}
 */
export function deliveryLedgerDocRef(eventId) {
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    throw new Error("Event ID is required to resolve delivery ledger document reference.");
  }
  return doc(requireDb(), "eventNotificationDeliveries", eventId.trim());
}

/**
 * Generates a collision-resistant cancellation cycle ID satisfying the [10, 64] char constraint.
 *
 * @returns {string}
 */
export function generateCycleId() {
  const rand = Math.random().toString(36).substring(2, 12);
  const now = Date.now();
  return `cycle_${now}_${rand}`;
}

/**
 * Cancels an event by transitioning its status from 'published' to 'cancelled'
 * while atomically creating or reinitializing its delivery ledger at
 * eventNotificationDeliveries/{eventId} (Pathway B two-way atomic handshake).
 * Permitted only while upcoming or ongoing (now <= endAt).
 *
 * @param {string} eventId
 * @param {object} currentEvent
 * @param {Date|number|string} [referenceNow=new Date()]
 * @param {object|null} [actorProfile=null]
 * @returns {Promise<{ cycleId: string }>}
 */
export async function cancelEvent(
  eventId,
  currentEvent,
  referenceNow = new Date(),
  actorProfile = null
) {
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    throw new Error("Event ID is required to cancel an event.");
  }
  if (!currentEvent || typeof currentEvent !== "object") {
    throw new Error("Current event object is required.");
  }

  const refNow = normalizeTimestamp(referenceNow);
  if (!refNow || isNaN(refNow.getTime())) {
    throw new Error("Invalid reference time.");
  }

  const existingStartAt = normalizeTimestamp(currentEvent.startAt);
  const existingEndAt = normalizeTimestamp(currentEvent.endAt);
  if (
    !existingStartAt ||
    !existingEndAt ||
    isNaN(existingStartAt.getTime()) ||
    isNaN(existingEndAt.getTime()) ||
    existingEndAt.getTime() < existingStartAt.getTime()
  ) {
    throw new Error("Existing event startAt and endAt timestamps violate chronological integrity.");
  }

  if (currentEvent.status !== EVENT_STATUSES.PUBLISHED) {
    throw new Error("Only published events can be cancelled; event is already cancelled.");
  }

  const state = getEventTemporalState(currentEvent, refNow);
  if (state === null || state === "completed" || refNow.getTime() > existingEndAt.getTime()) {
    throw new Error("Completed events cannot be cancelled.");
  }

  const firestore = requireDb();
  const trimmedEventId = eventId.trim();
  const eRef = eventDocRef(trimmedEventId);
  const ledgerRef = deliveryLedgerDocRef(trimmedEventId);

  // Resolve actor identity
  const currentUid = auth?.currentUser?.uid || null;
  let profile = actorProfile;
  if (!profile && currentUid && typeof fetchUserById === "function") {
    try {
      profile = await fetchUserById(currentUid);
    } catch {
      profile = null;
    }
  }

  const actorId = currentUid || profile?.uid || profile?.id || currentEvent.createdBy;
  const actorName = profile?.displayName || "CampusConnect Student";
  const actorAvatar = profile?.photoURL || null;

  const cycleId = generateCycleId();

  // Inspect existing ledger state
  let existingLedgerSnap;
  try {
    existingLedgerSnap = await getDoc(ledgerRef);
  } catch {
    existingLedgerSnap = null;
  }

  const batch = writeBatch(firestore);

  batch.update(eRef, {
    status: EVENT_STATUSES.CANCELLED,
    updatedAt: serverTimestamp(),
  });

  if (!existingLedgerSnap || !existingLedgerSnap.exists()) {
    // Initial ledger creation
    const initialLedger = {
      id: trimmedEventId,
      eventId: trimmedEventId,
      cycleId,
      campusId: currentEvent.campusId,
      communityId: currentEvent.communityId,
      actorId,
      actorName,
      actorAvatar,
      status: "pending",
      checkpointVersion: 0,
      lastProcessedRsvpId: null,
      processedCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    batch.set(ledgerRef, initialLedger);
  } else {
    // Repeat cancellation after republication
    const ledgerData = existingLedgerSnap.data();
    if (ledgerData.status !== "completed" && ledgerData.status !== "superseded") {
      throw new Error(
        `Cannot cancel event while a delivery cycle is currently active (${ledgerData.status}).`
      );
    }
    const repeatLedgerUpdates = {
      cycleId,
      actorId,
      actorName,
      actorAvatar,
      status: "pending",
      checkpointVersion: 0,
      lastProcessedRsvpId: null,
      processedCount: 0,
      updatedAt: serverTimestamp(),
    };
    batch.update(ledgerRef, repeatLedgerUpdates);
  }

  await batch.commit();
  return { cycleId };
}

/**
 * Republishes a cancelled event by transitioning its status from 'cancelled' to 'published'.
 * Permitted only while upcoming (now < startAt).
 * If an active delivery ledger exists, marks it 'superseded' atomically in the same batch.
 *
 * @param {string} eventId
 * @param {object} currentEvent
 * @param {Date|number|string} [referenceNow=new Date()]
 * @returns {Promise<void>}
 */
export async function republishEvent(eventId, currentEvent, referenceNow = new Date()) {
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    throw new Error("Event ID is required to republish an event.");
  }
  if (!currentEvent || typeof currentEvent !== "object") {
    throw new Error("Current event object is required.");
  }

  const refNow = normalizeTimestamp(referenceNow);
  if (!refNow || isNaN(refNow.getTime())) {
    throw new Error("Invalid reference time.");
  }

  const existingStartAt = normalizeTimestamp(currentEvent.startAt);
  const existingEndAt = normalizeTimestamp(currentEvent.endAt);
  if (
    !existingStartAt ||
    !existingEndAt ||
    isNaN(existingStartAt.getTime()) ||
    isNaN(existingEndAt.getTime()) ||
    existingEndAt.getTime() < existingStartAt.getTime()
  ) {
    throw new Error("Existing event startAt and endAt timestamps violate chronological integrity.");
  }

  if (currentEvent.status !== EVENT_STATUSES.CANCELLED) {
    throw new Error("Only cancelled events can be republished.");
  }

  const state = getEventTemporalState(currentEvent, refNow);
  if (state !== "upcoming" || refNow.getTime() >= existingStartAt.getTime()) {
    throw new Error("Only upcoming cancelled events can be republished.");
  }

  const firestore = requireDb();
  const trimmedEventId = eventId.trim();
  const eRef = eventDocRef(trimmedEventId);
  const ledgerRef = deliveryLedgerDocRef(trimmedEventId);

  let ledgerSnap;
  try {
    ledgerSnap = await getDoc(ledgerRef);
  } catch {
    ledgerSnap = null;
  }

  if (ledgerSnap && ledgerSnap.exists()) {
    const ledgerData = ledgerSnap.data();
    if (ledgerData.status === "pending" || ledgerData.status === "in_progress") {
      const batch = writeBatch(firestore);
      batch.update(eRef, {
        status: EVENT_STATUSES.PUBLISHED,
        updatedAt: serverTimestamp(),
      });
      batch.update(ledgerRef, {
        status: "superseded",
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return;
    }
  }

  await updateDoc(eRef, {
    status: EVENT_STATUSES.PUBLISHED,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Hard deletes an event document.
 * Permitted only while upcoming (now < startAt) and with valid status (published or cancelled).
 * If the event is cancelled and has an active delivery ledger, supersedes the ledger atomically
 * alongside event deletion to prevent leaving an orphaned active ledger.
 * Authoritative admin role check is enforced by Firestore Security Rules.
 *
 * @param {string} eventId
 * @param {object} currentEvent
 * @param {Date|number|string} [referenceNow=new Date()]
 * @returns {Promise<void>}
 */
export async function deleteEvent(eventId, currentEvent, referenceNow = new Date()) {
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    throw new Error("Event ID is required to delete an event.");
  }
  if (!currentEvent || typeof currentEvent !== "object") {
    throw new Error("Current event object is required.");
  }

  const refNow = normalizeTimestamp(referenceNow);
  if (!refNow || isNaN(refNow.getTime())) {
    throw new Error("Invalid reference time.");
  }

  const existingStartAt = normalizeTimestamp(currentEvent.startAt);
  const existingEndAt = normalizeTimestamp(currentEvent.endAt);
  if (
    !existingStartAt ||
    !existingEndAt ||
    isNaN(existingStartAt.getTime()) ||
    isNaN(existingEndAt.getTime()) ||
    existingEndAt.getTime() < existingStartAt.getTime()
  ) {
    throw new Error("Existing event startAt and endAt timestamps violate chronological integrity.");
  }

  if (
    currentEvent.status !== EVENT_STATUSES.PUBLISHED &&
    currentEvent.status !== EVENT_STATUSES.CANCELLED
  ) {
    throw new Error("Invalid event status for deletion: status must be published or cancelled.");
  }

  const state = getEventTemporalState(currentEvent, refNow);
  if (state !== "upcoming" || refNow.getTime() >= existingStartAt.getTime()) {
    throw new Error("Only upcoming events can be deleted.");
  }

  const firestore = requireDb();
  const trimmedEventId = eventId.trim();
  const eRef = eventDocRef(trimmedEventId);

  if (currentEvent.status === EVENT_STATUSES.CANCELLED) {
    const ledgerRef = deliveryLedgerDocRef(trimmedEventId);
    let ledgerSnap;
    try {
      ledgerSnap = await getDoc(ledgerRef);
    } catch {
      ledgerSnap = null;
    }

    if (ledgerSnap && ledgerSnap.exists()) {
      const ledgerData = ledgerSnap.data();
      if (ledgerData.status === "pending" || ledgerData.status === "in_progress") {
        const batch = writeBatch(firestore);
        batch.delete(eRef);
        batch.update(ledgerRef, {
          status: "superseded",
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        return;
      }
    }
  }

  await deleteDoc(eRef);
}
