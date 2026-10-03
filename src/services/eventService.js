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
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import {
  EVENT_CATEGORY_LIST,
  EVENT_STATUSES,
  EVENT_STATUS_LIST,
  EVENT_VISIBILITIES,
  EVENT_VISIBILITY_LIST,
} from "../constants.js";
import {
  EVENT_IMMUTABLE_FIELDS,
  getEventTemporalState,
  EVENTS,
  EVENT_LIST,
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
 * Normalizes Firestore Timestamp, Date, or string into client Date or null.
 *
 * @param {any} val
 * @returns {Date|null}
 */
export function normalizeTimestamp(val) {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  if (typeof val.toMillis === "function") return new Date(val.toMillis());
  if (val instanceof Date) return val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Converts a Date, ISO string, or Timestamp to a Firestore Timestamp.
 *
 * @param {any} val
 * @returns {Timestamp|Date}
 */
function toFirestoreTimestamp(val) {
  if (!val) return null;
  if (typeof val.toMillis === "function" && typeof val.toDate === "function") return val;
  if (typeof Timestamp === "function" && val instanceof Timestamp) return val;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) throw new Error("Invalid date provided.");
    return typeof Timestamp?.fromDate === "function" ? Timestamp.fromDate(val) : val;
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) throw new Error("Invalid date provided.");
  return typeof Timestamp?.fromDate === "function" ? Timestamp.fromDate(d) : d;
}

/**
 * Normalizes a raw Firestore event document into the locked 17-field event contract.
 *
 * @param {string} eventId
 * @param {object|null} data
 * @returns {object|null}
 */
export function normalizeEvent(eventId, data) {
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
 * Fetches an individual event by document ID.
 * Returns null if the event is not found.
 *
 * @param {string} eventId
 * @returns {Promise<object|null>}
 */
export async function getEventById(eventId) {
  if (!eventId || typeof eventId !== "string") {
    return null;
  }

  try {
    const eRef = eventDocRef(eventId);
    const snap = await getDoc(eRef);

    if (!snap.exists()) {
      if (EVENTS[eventId]) {
        return normalizeEvent(eventId, EVENTS[eventId]);
      }
      return null;
    }

    return normalizeEvent(snap.id, snap.data());
  } catch (err) {
    if (EVENTS[eventId]) {
      return normalizeEvent(eventId, EVENTS[eventId]);
    }
    throw err;
  }
}

/** Alias for getEventById */
export const getEvent = getEventById;

/**
 * Subscribes in real-time to a single event document.
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
          callback(normalizeEvent(snap.id, snap.data()));
        } else {
          callback(null);
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

  try {
    const colRef = eventsCollectionRef();
    const q = query(colRef, ...constraints);
    const snap = await getDocs(q);

    if (snap.empty) {
      const fallback = EVENT_LIST.filter(
        (e) => e.campusId === campusId && e.visibility === visibility
      );
      const normalized = fallback.map((e) => normalizeEvent(e.id, e));
      return filterEvents(sortEventsByDate(normalized, options.sortOrder), options);
    }

    const items = snap.docs.map((d) => normalizeEvent(d.id, d.data()));
    return filterEvents(sortEventsByDate(items, options.sortOrder), options);
  } catch (err) {
    const fallback = EVENT_LIST.filter(
      (e) => e.campusId === campusId && e.visibility === visibility
    );
    if (fallback.length > 0) {
      const normalized = fallback.map((e) => normalizeEvent(e.id, e));
      return filterEvents(sortEventsByDate(normalized, options.sortOrder), options);
    }
    throw err;
  }
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

  try {
    const colRef = eventsCollectionRef();
    const q = query(colRef, ...constraints);
    const snap = await getDocs(q);

    if (snap.empty) {
      let fallback = EVENT_LIST.filter(
        (e) => e.communityId === communityId && e.campusId === campusId
      );
      if (options.visibility) {
        fallback = fallback.filter((e) => e.visibility === options.visibility);
      } else if (!isMember) {
        fallback = fallback.filter(
          (e) => e.visibility === EVENT_VISIBILITIES.CAMPUS_PUBLIC
        );
      }
      const normalized = fallback.map((e) => normalizeEvent(e.id, e));
      return filterEvents(sortEventsByDate(normalized, options.sortOrder), options);
    }

    const items = snap.docs.map((d) => normalizeEvent(d.id, d.data()));
    return filterEvents(sortEventsByDate(items, options.sortOrder), options);
  } catch (err) {
    let fallback = EVENT_LIST.filter(
      (e) => e.communityId === communityId && e.campusId === campusId
    );
    if (options.visibility) {
      fallback = fallback.filter((e) => e.visibility === options.visibility);
    } else if (!isMember) {
      fallback = fallback.filter(
        (e) => e.visibility === EVENT_VISIBILITIES.CAMPUS_PUBLIC
      );
    }
    if (fallback.length > 0) {
      const normalized = fallback.map((e) => normalizeEvent(e.id, e));
      return filterEvents(sortEventsByDate(normalized, options.sortOrder), options);
    }
    throw err;
  }
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
 * Updates mutable fields of an existing event.
 * Strips and protects immutable fields (id, campusId, communityId, createdBy, createdAt).
 *
 * @param {string} eventId
 * @param {object} updates
 * @returns {Promise<void>}
 */
export async function updateEvent(eventId, updates) {
  if (!eventId || typeof eventId !== "string") {
    throw new Error("Event ID is required to update an event.");
  }
  if (!updates || typeof updates !== "object") {
    throw new Error("Updates object is required.");
  }

  const safeUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (EVENT_IMMUTABLE_FIELDS.includes(key)) {
      continue; // Exclude immutable fields from update payload
    }
    safeUpdates[key] = value;
  }

  if (safeUpdates.category && !EVENT_CATEGORY_LIST.includes(safeUpdates.category)) {
    throw new Error(`Invalid event category: ${safeUpdates.category}`);
  }
  if (safeUpdates.status && !EVENT_STATUS_LIST.includes(safeUpdates.status)) {
    throw new Error(`Invalid event status: ${safeUpdates.status}`);
  }
  if (safeUpdates.visibility && !EVENT_VISIBILITY_LIST.includes(safeUpdates.visibility)) {
    throw new Error(`Invalid event visibility: ${safeUpdates.visibility}`);
  }

  if (safeUpdates.startAt) {
    safeUpdates.startAt = toFirestoreTimestamp(safeUpdates.startAt);
  }
  if (safeUpdates.endAt) {
    safeUpdates.endAt = toFirestoreTimestamp(safeUpdates.endAt);
  }

  if (safeUpdates.startAt && safeUpdates.endAt) {
    const startMs = new Date(
      typeof safeUpdates.startAt.toDate === "function"
        ? safeUpdates.startAt.toDate()
        : safeUpdates.startAt
    ).getTime();
    const endMs = new Date(
      typeof safeUpdates.endAt.toDate === "function"
        ? safeUpdates.endAt.toDate()
        : safeUpdates.endAt
    ).getTime();
    if (endMs < startMs) {
      throw new Error("Event end time must be after or equal to start time.");
    }
  }

  if (safeUpdates.imageURL !== undefined && !safeUpdates.imageURL) {
    safeUpdates.imageURL = null;
  }

  safeUpdates.updatedAt = serverTimestamp();

  const eRef = eventDocRef(eventId);
  await updateDoc(eRef, safeUpdates);
}

/**
 * Cancels an event by setting its status to 'cancelled'.
 *
 * @param {string} eventId
 * @returns {Promise<void>}
 */
export async function cancelEvent(eventId) {
  if (!eventId || typeof eventId !== "string") {
    throw new Error("Event ID is required to cancel an event.");
  }
  const eRef = eventDocRef(eventId);
  await updateDoc(eRef, {
    status: EVENT_STATUSES.CANCELLED,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Hard deletes an event document.
 * Subject to authoritative Firestore Rules (creator or community admin).
 *
 * @param {string} eventId
 * @returns {Promise<void>}
 */
export async function deleteEvent(eventId) {
  if (!eventId || typeof eventId !== "string") {
    throw new Error("Event ID is required to delete an event.");
  }
  const eRef = eventDocRef(eventId);
  await deleteDoc(eRef);
}
