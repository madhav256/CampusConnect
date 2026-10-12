/**
 * Milestone 20 — Unit 20.1: Event Domain Model & Fixtures
 * Post-M20 Hardening — Unit H1: Temporal Fixture Determinism
 *
 * Deterministic event fixtures, identifiers, relative temporal offsets, and domain invariants
 * for multi-tenant campus activities.
 * Enforces root collection pattern: events/{eventId}
 */

import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
} from "../constants.js";
import {
  COMMUNITY_APEX_AI,
  COMMUNITY_APEX_DESIGN,
  COMMUNITY_ST_JUDE_MED,
} from "./communities.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Immutable fields for an event document after creation.
 * Rules and service layers enforce that these fields cannot be modified.
 */
export const EVENT_IMMUTABLE_FIELDS = Object.freeze([
  "id",
  "campusId",
  "communityId",
  "createdBy",
  "createdAt",
  "visibility",
]);

/**
 * Mutable fields allowed for generic detail updates on upcoming events.
 * Reject any caller-supplied field outside this list before write.
 */
export const UPCOMING_MUTABLE_FIELDS = Object.freeze([
  "title",
  "slug",
  "description",
  "category",
  "location",
  "startAt",
  "endAt",
  "imageURL",
  "organizerName",
]);

/**
 * Mutable fields allowed for detail updates on ongoing events.
 * Reject any caller-supplied field outside this list before write.
 */
export const ONGOING_MUTABLE_FIELDS = Object.freeze([
  "location",
  "description",
  "imageURL",
  "endAt",
]);

/**
 * Normalizes any timestamp representation (Firestore Timestamp, Date, number, ISO string)
 * to numeric milliseconds, returning null if invalid, missing, non-finite, out of range, or unparseable.
 *
 * @param {any} val
 * @returns {number|null}
 */
function parseTimestampToMs(val) {
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
    return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? ms : null;
  }

  if (typeof val?.toMillis === "function") {
    try {
      const ms = val.toMillis();
      return typeof ms === "number" && Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? ms : null;
    } catch {
      return null;
    }
  }
  if (typeof val?.toDate === "function") {
    try {
      const d = val.toDate();
      return d instanceof Date && Number.isFinite(d.getTime()) ? d.getTime() : null;
    } catch {
      return null;
    }
  }
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof val === "number") {
    return Number.isFinite(val) && Math.abs(val) <= 8.64e15 ? val : null;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Pure domain helper to calculate the derived temporal state of an event.
 * Avoids storing brittle completion status in the database.
 * Fails closed by returning null on missing, malformed, or inverted timestamps.
 *
 * @param {object} event - Event object with startAt and endAt timestamps
 * @param {Date|number|string} [referenceDate=new Date()] - Reference point in time
 * @returns {"upcoming" | "ongoing" | "completed" | null}
 */
export function getEventTemporalState(event, referenceDate = new Date()) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const nowMs = parseTimestampToMs(referenceDate);
  if (nowMs === null) {
    return null;
  }

  const startMs = parseTimestampToMs(event.startAt);
  const endMs = parseTimestampToMs(event.endAt);
  if (startMs === null || endMs === null) {
    return null;
  }

  if (endMs < startMs) {
    return null;
  }

  if (nowMs < startMs) {
    return "upcoming";
  }
  if (nowMs <= endMs) {
    return "ongoing";
  }
  return "completed";
}

// ---------------------------------------------------------------------------
// Relative Temporal Event Fixture Definitions (Offsets from Seed Reference Time)
// ---------------------------------------------------------------------------

// 1. Apex Institute of Technology - AI & Robotics Hackathon (Tech, Upcoming: +3d)
export const EVENT_AI_HACKATHON_DEF = {
  id: "e2e-event-ai-hackathon",
  campusId: APEX_CAMPUS_ID,
  communityId: COMMUNITY_APEX_AI.id,
  title: "Apex Annual AI & Robotics Hackathon 2026",
  slug: "annual-ai-hackathon-2026",
  description:
    "Join us for a 24-hour sprint building autonomous agents, perception pipelines, and embedded machine learning systems. Hardware kits and compute credits provided.",
  category: EVENT_CATEGORIES.TECH,
  location: "Turing Auditorium & Robotics Lab, Tech Block",
  startOffsetMs: 3 * DAY_MS,
  endOffsetMs: 4 * DAY_MS,
  imageURL: null,
  createdBy: "e2e-student-a",
  organizerName: "Apex AI & Robotics Society",
  status: EVENT_STATUSES.PUBLISHED,
  visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
};

// 2. Apex Institute of Technology - UI/UX Design Sprint (Cultural, Upcoming: +5d)
export const EVENT_DESIGN_SPRINT_DEF = {
  id: "e2e-event-design-sprint",
  campusId: APEX_CAMPUS_ID,
  communityId: COMMUNITY_APEX_DESIGN.id,
  title: "Campus UI/UX Design Sprint & Workshop",
  slug: "campus-design-sprint",
  description:
    "Collaborative intensive sprint on accessible campus interfaces, design tokens, and creative computing prototypes. Open to all students interested in product design.",
  category: EVENT_CATEGORIES.CULTURAL,
  location: "Design Studio 4A, Creative Arts Wing",
  startOffsetMs: 5 * DAY_MS,
  endOffsetMs: 5 * DAY_MS + 7 * HOUR_MS,
  imageURL: null,
  createdBy: "e2e-student-a",
  organizerName: "Apex Design & Creative Arts",
  status: EVENT_STATUSES.PUBLISHED,
  visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
};

// 3. Apex Institute of Technology - Annual Campus Fest / Showcase (Tech, Upcoming: +7d)
export const EVENT_CAMPUS_FEST_DEF = {
  id: "e2e-event-campus-fest",
  campusId: APEX_CAMPUS_ID,
  communityId: COMMUNITY_APEX_AI.id,
  title: "Apex Annual Technology & Robotics Showcase",
  slug: "annual-robotics-showcase",
  description:
    "Campus-wide exhibition displaying autonomous robotics projects, student demonstrations, keynote lectures from visiting faculty, and inter-department project showcases.",
  category: EVENT_CATEGORIES.TECH,
  location: "Main Campus Convocation Hall",
  startOffsetMs: 7 * DAY_MS,
  endOffsetMs: 7 * DAY_MS + 8 * HOUR_MS,
  imageURL: null,
  createdBy: "e2e-student-a",
  organizerName: "Apex AI & Robotics Society",
  status: EVENT_STATUSES.PUBLISHED,
  visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
};

// 4. St. Jude University - Medical Ethics Symposium (Academic, Upcoming: +6d)
export const EVENT_ST_JUDE_SYMPOSIUM_DEF = {
  id: "e2e-event-st-jude-symposium",
  campusId: ST_JUDE_CAMPUS_ID,
  communityId: COMMUNITY_ST_JUDE_MED.id,
  title: "St. Jude Clinical Research & Medical Ethics Symposium",
  slug: "medical-ethics-symposium",
  description:
    "Annual healthcare symposium on clinical research governance, ethics in genomic medicine, patient data protection, and modern bioethics in university hospitals.",
  category: EVENT_CATEGORIES.ACADEMIC,
  location: "Hippocrates Hall, St. Jude Medical Complex",
  startOffsetMs: 6 * DAY_MS,
  endOffsetMs: 6 * DAY_MS + 7 * HOUR_MS,
  imageURL: null,
  createdBy: "e2e-student-st-jude",
  organizerName: "St. Jude Medical Society",
  status: EVENT_STATUSES.PUBLISHED,
  visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
};

// 5. Apex Institute of Technology - Members-Only Lab Hardware Sync (Community Only, Upcoming: +4d)
export const EVENT_AI_MEMBERS_ONLY_DEF = {
  id: "e2e-event-ai-members-only",
  campusId: APEX_CAMPUS_ID,
  communityId: COMMUNITY_APEX_AI.id,
  title: "Apex AI Lab Internal Planning & Hardware Sync",
  slug: "apex-ai-internal-planning",
  description:
    "Internal planning and compute cluster allocation for autonomous systems and rover hardware testing. Strictly restricted to active society members.",
  category: EVENT_CATEGORIES.TECH,
  location: "Robotics Lab 2, Tech Block",
  startOffsetMs: 4 * DAY_MS,
  endOffsetMs: 4 * DAY_MS + 90 * 60 * 1000,
  imageURL: null,
  createdBy: "e2e-student-a",
  organizerName: "Apex AI & Robotics Society",
  status: EVENT_STATUSES.PUBLISHED,
  visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY,
};

// 6. Apex Institute of Technology - Ongoing Rover Field Testing (Workshop, Ongoing: -1h to +2h)
export const EVENT_ONGOING_WORKSHOP_DEF = {
  id: "e2e-event-ongoing-workshop",
  campusId: APEX_CAMPUS_ID,
  communityId: COMMUNITY_APEX_AI.id,
  title: "Apex Autonomous Rover Live Field Workshop",
  slug: "autonomous-rover-live-workshop",
  description:
    "Live outdoor field telemetry, sensor calibration, and real-time obstacle avoidance testing on autonomous rover prototypes.",
  category: EVENT_CATEGORIES.WORKSHOP,
  location: "Robotics Arena & Outdoor Testbed, Tech Block",
  startOffsetMs: -1 * HOUR_MS,
  endOffsetMs: 2 * HOUR_MS,
  imageURL: null,
  createdBy: "e2e-student-a",
  organizerName: "Apex AI & Robotics Society",
  status: EVENT_STATUSES.PUBLISHED,
  visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
};

// 7. Apex Institute of Technology - Past Orientation & Welcome Mixer (Social, Past: -3d to -2d)
export const EVENT_PAST_ORIENTATION_DEF = {
  id: "e2e-event-past-orientation",
  campusId: APEX_CAMPUS_ID,
  communityId: COMMUNITY_APEX_AI.id,
  title: "Apex AI Society Fall Orientation & Welcome Mixer",
  slug: "apex-ai-fall-orientation",
  description:
    "Welcome orientation for new student inductees, research domain overview, and laboratory compute safety certification.",
  category: EVENT_CATEGORIES.SOCIAL,
  location: "Main Campus Convocation Hall",
  startOffsetMs: -3 * DAY_MS,
  endOffsetMs: -2 * DAY_MS,
  createdOffsetMs: -14 * DAY_MS,
  imageURL: null,
  createdBy: "e2e-student-a",
  organizerName: "Apex AI & Robotics Society",
  status: EVENT_STATUSES.PUBLISHED,
  visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
};

// 8. Apex Institute of Technology - Cancelled Guest Lecture (Cultural, Cancelled: +2d)
export const EVENT_CANCELLED_LECTURE_DEF = {
  id: "e2e-event-cancelled-lecture",
  campusId: APEX_CAMPUS_ID,
  communityId: COMMUNITY_APEX_DESIGN.id,
  title: "Guest Lecture: Typography in Spatial Computing",
  slug: "typography-spatial-computing-cancelled",
  description:
    "Special guest lecture exploring typographic contrast and readability in spatial interface canvases. Cancelled due to speaker travel disruptions.",
  category: EVENT_CATEGORIES.CULTURAL,
  location: "Design Studio 4A, Creative Arts Wing",
  startOffsetMs: 2 * DAY_MS,
  endOffsetMs: 2 * DAY_MS + 3 * HOUR_MS,
  imageURL: null,
  createdBy: "e2e-student-a",
  organizerName: "Apex Design & Creative Arts",
  status: EVENT_STATUSES.CANCELLED,
  visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
};

export const EVENT_DEFINITIONS = [
  EVENT_AI_HACKATHON_DEF,
  EVENT_DESIGN_SPRINT_DEF,
  EVENT_CAMPUS_FEST_DEF,
  EVENT_ST_JUDE_SYMPOSIUM_DEF,
  EVENT_AI_MEMBERS_ONLY_DEF,
  EVENT_ONGOING_WORKSHOP_DEF,
  EVENT_PAST_ORIENTATION_DEF,
  EVENT_CANCELLED_LECTURE_DEF,
];

/**
 * Resolves a single relative event fixture definition into a concrete event object with ISO timestamps.
 *
 * @param {object} def - Event fixture definition with startOffsetMs and endOffsetMs
 * @param {Date|number|string} [referenceDate=new Date()] - Seed or reference point in time
 * @returns {object} Concrete event document matching the locked 17-field schema
 */
export function resolveEventFixture(def, referenceDate = new Date()) {
  let refMs;
  if (typeof referenceDate?.toMillis === "function") {
    refMs = referenceDate.toMillis();
  } else if (typeof referenceDate?.toDate === "function") {
    refMs = referenceDate.toDate().getTime();
  } else if (typeof referenceDate?.seconds === "number") {
    refMs = referenceDate.seconds * 1000 + Math.floor((referenceDate.nanoseconds || 0) / 1e6);
  } else {
    refMs = new Date(referenceDate).getTime();
  }

  if (isNaN(refMs)) {
    refMs = Date.now();
  }

  const startAt = new Date(refMs + def.startOffsetMs).toISOString();
  const endAt = new Date(refMs + def.endOffsetMs).toISOString();
  const createdOffsetMs = def.createdOffsetMs ?? -7 * DAY_MS;
  const createdAt = new Date(refMs + createdOffsetMs).toISOString();
  const updatedAt = createdAt;

  return {
    id: def.id,
    campusId: def.campusId,
    communityId: def.communityId,
    title: def.title,
    slug: def.slug,
    description: def.description,
    category: def.category,
    location: def.location,
    startAt,
    endAt,
    imageURL: def.imageURL ?? null,
    createdBy: def.createdBy,
    organizerName: def.organizerName,
    status: def.status,
    visibility: def.visibility,
    createdAt,
    updatedAt,
  };
}

/**
 * Builds all deterministic event fixtures resolved against a specific reference date.
 *
 * @param {Date|number|string} [referenceDate=new Date()] - Reference point in time
 * @returns {Array<object>}
 */
export function buildEventFixtures(referenceDate = new Date()) {
  return EVENT_DEFINITIONS.map((def) => resolveEventFixture(def, referenceDate));
}

// ---------------------------------------------------------------------------
// Default Resolved Exports (evaluated at module import relative to current time)
// ---------------------------------------------------------------------------

export const EVENT_AI_HACKATHON = resolveEventFixture(EVENT_AI_HACKATHON_DEF);
export const EVENT_DESIGN_SPRINT = resolveEventFixture(EVENT_DESIGN_SPRINT_DEF);
export const EVENT_CAMPUS_FEST = resolveEventFixture(EVENT_CAMPUS_FEST_DEF);
export const EVENT_ST_JUDE_SYMPOSIUM = resolveEventFixture(EVENT_ST_JUDE_SYMPOSIUM_DEF);
export const EVENT_AI_MEMBERS_ONLY = resolveEventFixture(EVENT_AI_MEMBERS_ONLY_DEF);
export const EVENT_ONGOING_WORKSHOP = resolveEventFixture(EVENT_ONGOING_WORKSHOP_DEF);
export const EVENT_PAST_ORIENTATION = resolveEventFixture(EVENT_PAST_ORIENTATION_DEF);
export const EVENT_CANCELLED_LECTURE = resolveEventFixture(EVENT_CANCELLED_LECTURE_DEF);

export const EVENT_LIST = [
  EVENT_AI_HACKATHON,
  EVENT_DESIGN_SPRINT,
  EVENT_CAMPUS_FEST,
  EVENT_ST_JUDE_SYMPOSIUM,
  EVENT_AI_MEMBERS_ONLY,
  EVENT_ONGOING_WORKSHOP,
  EVENT_PAST_ORIENTATION,
  EVENT_CANCELLED_LECTURE,
];

export const EVENTS = Object.fromEntries(EVENT_LIST.map((e) => [e.id, e]));
