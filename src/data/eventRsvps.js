/**
 * Milestone 21 — Unit 21.1: RSVP Domain Model & Fixtures
 *
 * Deterministic event RSVP fixtures, identifiers, relative temporal offsets,
 * and pure domain helpers for multi-tenant campus event participation.
 * Enforces root collection pattern: eventRsvps/{eventId}_{userId}
 */

import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  EVENT_STATUSES,
} from "../constants.js";
import { getEventTemporalState } from "./events.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Locked 5-field schema keys for an Event RSVP document:
 * root collection: eventRsvps/{eventId}_{userId}
 */
export const EVENT_RSVP_FIELDS = [
  "id",
  "eventId",
  "campusId",
  "userId",
  "createdAt",
];

/**
 * Immutable fields for an Event RSVP document.
 * RSVP documents represent immutable domain intent:
 * existence represents "going"; absence represents "not going".
 * Document updates are prohibited.
 */
export const EVENT_RSVP_IMMUTABLE_FIELDS = [
  "id",
  "eventId",
  "campusId",
  "userId",
  "createdAt",
];

/**
 * Client-derived RSVP display states (§11.2).
 * Computed dynamically; never persisted in Firestore.
 */
export const RSVP_DISPLAY_STATES = {
  NOT_GOING: "not_going",
  GOING: "going",
  ATTENDED_WINDOW_PASSED: "attended_window_passed",
  EVENT_CANCELLED: "event_cancelled",
  EVENT_UNAVAILABLE: "event_unavailable",
};

/**
 * Derives the deterministic document ID for an Event RSVP.
 * Canonical pattern: {eventId}_{userId}
 *
 * @param {string} eventId - Target event ID
 * @param {string} userId - Attending user UID
 * @returns {string} Deterministic document ID
 */
export function getEventRsvpId(eventId, userId) {
  if (!eventId || typeof eventId !== "string" || !userId || typeof userId !== "string") {
    throw new Error(
      `[getEventRsvpId] Both eventId and userId must be non-empty strings. Received eventId: "${eventId}", userId: "${userId}"`
    );
  }
  return `${eventId}_${userId}`;
}

/**
 * Maximum representable timestamp in JavaScript Date (ECMA-262: +- 8.64e15 ms relative to Unix epoch).
 */
export const MAX_REPRESENTABLE_DATE_MS = 8.64e15;

/**
 * Factory helper to construct a validated Event RSVP object adhering to the 5-field contract.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {string} params.userId
 * @param {string} params.campusId
 * @param {Date|number|string|object} [params.createdAt=new Date().toISOString()]
 * @returns {object} Validated 5-field RSVP object
 */
export function buildEventRsvp({
  eventId,
  userId,
  campusId,
  createdAt = new Date().toISOString(),
}) {
  if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
    throw new Error("[buildEventRsvp] eventId is required and must be a non-empty string.");
  }
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("[buildEventRsvp] userId is required and must be a non-empty string.");
  }
  if (!campusId || typeof campusId !== "string" || campusId.trim() === "") {
    throw new Error("[buildEventRsvp] campusId is required and must be a non-empty string.");
  }

  if (!isValidRsvpCreatedAt(createdAt)) {
    throw new Error(`[buildEventRsvp] Invalid createdAt value: ${createdAt}`);
  }

  let resolvedCreatedAt;
  if (createdAt instanceof Date) {
    resolvedCreatedAt = createdAt.toISOString();
  } else if (typeof createdAt?.toISOString === "function") {
    resolvedCreatedAt = createdAt.toISOString();
  } else if (typeof createdAt?.toDate === "function") {
    resolvedCreatedAt = createdAt.toDate().toISOString();
  } else if (typeof createdAt?.toMillis === "function") {
    resolvedCreatedAt = new Date(createdAt.toMillis()).toISOString();
  } else if (typeof createdAt?.seconds === "number") {
    const nanos = typeof createdAt.nanoseconds === "number" ? createdAt.nanoseconds : 0;
    resolvedCreatedAt = new Date(
      createdAt.seconds * 1000 + Math.floor(nanos / 1e6)
    ).toISOString();
  } else if (typeof createdAt === "number" || typeof createdAt === "string") {
    resolvedCreatedAt = new Date(createdAt).toISOString();
  } else {
    resolvedCreatedAt = new Date(createdAt).toISOString();
  }

  const id = getEventRsvpId(eventId, userId);

  return {
    id,
    eventId,
    campusId,
    userId,
    createdAt: resolvedCreatedAt,
  };
}

/**
 * Validates that createdAt satisfies the accepted temporal input contract:
 * - Valid Date instance (non-NaN, within representable Date range)
 * - Valid ISO 8601 or parseable date string (non-empty, within representable Date range)
 * - Valid finite numeric timestamp in milliseconds (within representable Date range)
 * - Valid timestamp-like object exposing .toDate(), .toMillis(), or numeric .seconds (with optional nanoseconds)
 * Rejects unsupported types (null, undefined, boolean, symbol, function, invalid strings, invalid dates, NaN, arrays, plain non-timestamp objects, out-of-range timestamps, throwing/invalid methods).
 *
 * @param {*} createdAt
 * @returns {boolean}
 */
export function isValidRsvpCreatedAt(createdAt) {
  if (createdAt === null || createdAt === undefined) {
    return false;
  }
  if (createdAt instanceof Date) {
    const ms = createdAt.getTime();
    return !isNaN(ms) && Math.abs(ms) <= MAX_REPRESENTABLE_DATE_MS;
  }
  if (typeof createdAt === "string") {
    if (createdAt.trim() === "") return false;
    const ms = Date.parse(createdAt);
    return Number.isFinite(ms) && !isNaN(ms) && Math.abs(ms) <= MAX_REPRESENTABLE_DATE_MS;
  }
  if (typeof createdAt === "number") {
    return (
      Number.isFinite(createdAt) &&
      !isNaN(createdAt) &&
      Math.abs(createdAt) <= MAX_REPRESENTABLE_DATE_MS
    );
  }
  if (typeof createdAt === "object" && !Array.isArray(createdAt)) {
    if (typeof createdAt.toDate === "function") {
      try {
        const d = createdAt.toDate();
        return (
          d instanceof Date &&
          !isNaN(d.getTime()) &&
          Math.abs(d.getTime()) <= MAX_REPRESENTABLE_DATE_MS
        );
      } catch {
        return false;
      }
    }
    if (typeof createdAt.toMillis === "function") {
      try {
        const ms = createdAt.toMillis();
        return (
          typeof ms === "number" &&
          Number.isFinite(ms) &&
          !isNaN(ms) &&
          Math.abs(ms) <= MAX_REPRESENTABLE_DATE_MS
        );
      } catch {
        return false;
      }
    }
    if (typeof createdAt.seconds === "number" && Number.isFinite(createdAt.seconds)) {
      const nanos =
        createdAt.nanoseconds === undefined
          ? 0
          : typeof createdAt.nanoseconds === "number" &&
            Number.isFinite(createdAt.nanoseconds) &&
            createdAt.nanoseconds >= 0 &&
            createdAt.nanoseconds < 1e9
          ? createdAt.nanoseconds
          : null;
      if (nanos === null) return false;
      const ms = createdAt.seconds * 1000 + Math.floor(nanos / 1e6);
      return Number.isFinite(ms) && !isNaN(ms) && Math.abs(ms) <= MAX_REPRESENTABLE_DATE_MS;
    }
  }
  return false;
}

/**
 * Pure domain validator ensuring an RSVP object strictly conforms to the 5-field contract.
 *
 * Requirements:
 * - Preserves exact 5-field schema: id, eventId, campusId, userId, createdAt
 * - Validates identifier fields (id, eventId, campusId, userId) are non-empty strings
 * - Validates id exactly matches `${eventId}_${userId}`
 * - Validates createdAt against accepted input contract
 * - Rejects unexpected fields, missing values, and unsupported types
 *
 * @param {object} rsvp
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEventRsvp(rsvp) {
  const errors = [];
  if (!rsvp || typeof rsvp !== "object" || Array.isArray(rsvp)) {
    return { valid: false, errors: ["RSVP must be a non-null object."] };
  }

  const keys = Object.keys(rsvp);
  const extraKeys = keys.filter((k) => !EVENT_RSVP_FIELDS.includes(k));
  if (extraKeys.length > 0) {
    errors.push(`RSVP contains unexpected fields: ${extraKeys.join(", ")}`);
  }

  const stringIdentifierFields = ["id", "eventId", "campusId", "userId"];
  for (const field of stringIdentifierFields) {
    const val = rsvp[field];
    if (val === undefined || val === null || val === "") {
      errors.push(`Missing required field: ${field}`);
    } else if (typeof val !== "string" || val.trim() === "") {
      errors.push(`Field "${field}" must be a non-empty string.`);
    }
  }

  if (rsvp.createdAt === undefined || rsvp.createdAt === null || rsvp.createdAt === "") {
    errors.push("Missing required field: createdAt");
  } else if (!isValidRsvpCreatedAt(rsvp.createdAt)) {
    errors.push(`Field "createdAt" must be a valid date, timestamp, or ISO string.`);
  }

  if (
    typeof rsvp.eventId === "string" &&
    typeof rsvp.userId === "string" &&
    rsvp.eventId.trim() !== "" &&
    rsvp.userId.trim() !== ""
  ) {
    const expectedId = `${rsvp.eventId}_${rsvp.userId}`;
    if (rsvp.id !== expectedId) {
      errors.push(`Document id "${rsvp.id}" does not match derived id "${expectedId}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Pure domain helper to calculate derived RSVP display state (§11.2).
 * Reuses getEventTemporalState; never relies on stored completion/attendance flags.
 *
 * @param {object|null} resolutionOrEvent - EventResolution ({ status, event, error }) or raw event object
 * @param {object|null} rsvp - RSVP document object or null/undefined
 * @param {Date|number|string} [referenceDate=new Date()] - Temporal reference point
 * @returns {"not_going" | "going" | "attended_window_passed" | "event_cancelled" | "event_unavailable"}
 */
export function getRsvpDisplayState(resolutionOrEvent, rsvp, referenceDate = new Date()) {
  if (!rsvp) {
    return RSVP_DISPLAY_STATES.NOT_GOING;
  }

  let event = null;
  if (resolutionOrEvent && typeof resolutionOrEvent === "object") {
    const isResolution =
      ("event" in resolutionOrEvent || "error" in resolutionOrEvent) &&
      ["available", "inaccessible", "error"].includes(resolutionOrEvent.status);

    if (isResolution) {
      if (resolutionOrEvent.status === "inaccessible" || resolutionOrEvent.status === "error") {
        return RSVP_DISPLAY_STATES.EVENT_UNAVAILABLE;
      }
      event = resolutionOrEvent.event;
    } else {
      event = resolutionOrEvent;
    }
  }

  if (!event) {
    return RSVP_DISPLAY_STATES.EVENT_UNAVAILABLE;
  }

  if (event.status === EVENT_STATUSES.CANCELLED) {
    return RSVP_DISPLAY_STATES.EVENT_CANCELLED;
  }

  const temporalState = getEventTemporalState(event, referenceDate);
  if (temporalState === "completed") {
    return RSVP_DISPLAY_STATES.ATTENDED_WINDOW_PASSED;
  }

  return RSVP_DISPLAY_STATES.GOING;
}

// ---------------------------------------------------------------------------
// Relative Temporal Event RSVP Fixture Definitions (Offsets from Seed Time)
// ---------------------------------------------------------------------------

// 1. Apex Institute of Technology - AI Hackathon (Student B / Jordan Taylor RSVP)
export const EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF = {
  id: "e2e-event-ai-hackathon_e2e-student-b",
  eventId: "e2e-event-ai-hackathon",
  campusId: APEX_CAMPUS_ID,
  userId: "e2e-student-b",
  createdOffsetMs: -2 * DAY_MS,
};

// 2. Apex Institute of Technology - Members-Only Lab Sync (Student B / Jordan Taylor RSVP)
export const EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B_DEF = {
  id: "e2e-event-ai-members-only_e2e-student-b",
  eventId: "e2e-event-ai-members-only",
  campusId: APEX_CAMPUS_ID,
  userId: "e2e-student-b",
  createdOffsetMs: -1 * DAY_MS,
};

// 3. Apex Institute of Technology - UI/UX Design Sprint (Student A / Alex Chen RSVP)
export const EVENT_RSVP_DESIGN_SPRINT_STUDENT_A_DEF = {
  id: "e2e-event-design-sprint_e2e-student-a",
  eventId: "e2e-event-design-sprint",
  campusId: APEX_CAMPUS_ID,
  userId: "e2e-student-a",
  createdOffsetMs: -3 * DAY_MS,
};

// 4. St. Jude University - Medical Ethics Symposium (Student St. Jude / Rohan Varma RSVP)
export const EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE_DEF = {
  id: "e2e-event-st-jude-symposium_e2e-student-st-jude",
  eventId: "e2e-event-st-jude-symposium",
  campusId: ST_JUDE_CAMPUS_ID,
  userId: "e2e-student-st-jude",
  createdOffsetMs: -2 * DAY_MS,
};

export const EVENT_RSVP_DEFINITIONS = [
  EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF,
  EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B_DEF,
  EVENT_RSVP_DESIGN_SPRINT_STUDENT_A_DEF,
  EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE_DEF,
];

/**
 * Resolves a single relative RSVP fixture definition into a concrete RSVP document.
 *
 * @param {object} def - RSVP fixture definition with createdOffsetMs
 * @param {Date|number|string} [referenceDate=new Date()] - Seed or reference point in time
 * @returns {object} Concrete RSVP document matching the locked 5-field schema
 */
export function resolveEventRsvpFixture(def, referenceDate = new Date()) {
  if (!def || typeof def !== "object") {
    throw new Error("[resolveEventRsvpFixture] A valid fixture definition object is required.");
  }
  if (referenceDate === null || referenceDate === undefined) {
    throw new Error("[resolveEventRsvpFixture] Invalid reference date: value cannot be null or undefined.");
  }

  let refMs;
  if (typeof referenceDate?.toMillis === "function") {
    try {
      refMs = referenceDate.toMillis();
    } catch {
      throw new Error(
        "[resolveEventRsvpFixture] Invalid reference date: referenceDate.toMillis() threw an error."
      );
    }
  } else if (typeof referenceDate?.toDate === "function") {
    try {
      const d = referenceDate.toDate();
      refMs = d instanceof Date ? d.getTime() : NaN;
    } catch {
      throw new Error(
        "[resolveEventRsvpFixture] Invalid reference date: referenceDate.toDate() threw an error."
      );
    }
  } else if (typeof referenceDate?.seconds === "number") {
    if (!Number.isFinite(referenceDate.seconds)) {
      throw new Error(
        "[resolveEventRsvpFixture] Invalid reference date: seconds must be a finite number."
      );
    }
    let nanos = 0;
    if (referenceDate.nanoseconds !== undefined) {
      if (
        typeof referenceDate.nanoseconds !== "number" ||
        !Number.isFinite(referenceDate.nanoseconds) ||
        referenceDate.nanoseconds < 0 ||
        referenceDate.nanoseconds >= 1_000_000_000
      ) {
        throw new Error(
          "[resolveEventRsvpFixture] Invalid reference date: nanoseconds must be a finite number between 0 and 999,999,999."
        );
      }
      nanos = referenceDate.nanoseconds;
    }
    refMs = referenceDate.seconds * 1000 + Math.floor(nanos / 1e6);
  } else if (referenceDate instanceof Date) {
    refMs = referenceDate.getTime();
  } else if (typeof referenceDate === "number") {
    refMs = referenceDate;
  } else if (typeof referenceDate === "string") {
    if (referenceDate.trim() === "") {
      throw new Error("[resolveEventRsvpFixture] Invalid reference date: empty string.");
    }
    refMs = Date.parse(referenceDate);
  } else {
    throw new Error(
      `[resolveEventRsvpFixture] Invalid reference date: unsupported type "${typeof referenceDate}". Expected Date, number, string, or Firestore Timestamp.`
    );
  }

  if (
    typeof refMs !== "number" ||
    !Number.isFinite(refMs) ||
    isNaN(refMs) ||
    Math.abs(refMs) > MAX_REPRESENTABLE_DATE_MS
  ) {
    throw new Error(
      `[resolveEventRsvpFixture] Invalid reference date: unable to parse "${referenceDate}" into a valid timestamp.`
    );
  }

  const createdOffsetMs = def.createdOffsetMs ?? -1 * DAY_MS;
  const targetMs = refMs + createdOffsetMs;
  if (!Number.isFinite(targetMs) || Math.abs(targetMs) > MAX_REPRESENTABLE_DATE_MS) {
    throw new Error(
      "[resolveEventRsvpFixture] Invalid reference date: calculated timestamp out of representable date range."
    );
  }

  const createdAt = new Date(targetMs).toISOString();

  return {
    id: def.id || getEventRsvpId(def.eventId, def.userId),
    eventId: def.eventId,
    campusId: def.campusId,
    userId: def.userId,
    createdAt,
  };
}

/**
 * Builds all deterministic RSVP fixtures resolved against a specific reference date.
 *
 * @param {Date|number|string} [referenceDate=new Date()] - Reference point in time
 * @returns {Array<object>}
 */
export function buildEventRsvpFixtures(referenceDate = new Date()) {
  return EVENT_RSVP_DEFINITIONS.map((def) => resolveEventRsvpFixture(def, referenceDate));
}

// ---------------------------------------------------------------------------
// Default Resolved Exports (evaluated relative to module evaluation time)
// ---------------------------------------------------------------------------

export const EVENT_RSVP_AI_HACKATHON_STUDENT_B = resolveEventRsvpFixture(
  EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF
);
export const EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B = resolveEventRsvpFixture(
  EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B_DEF
);
export const EVENT_RSVP_DESIGN_SPRINT_STUDENT_A = resolveEventRsvpFixture(
  EVENT_RSVP_DESIGN_SPRINT_STUDENT_A_DEF
);
export const EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE = resolveEventRsvpFixture(
  EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE_DEF
);

export const EVENT_RSVP_LIST = [
  EVENT_RSVP_AI_HACKATHON_STUDENT_B,
  EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B,
  EVENT_RSVP_DESIGN_SPRINT_STUDENT_A,
  EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE,
];

export const EVENT_RSVPS = Object.fromEntries(EVENT_RSVP_LIST.map((r) => [r.id, r]));
