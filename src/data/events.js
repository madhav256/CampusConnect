/**
 * Milestone 20 — Unit 20.1: Event Domain Model & Fixtures
 *
 * Deterministic event fixtures, identifiers, and domain invariants for multi-tenant campus activities.
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

/**
 * Immutable fields for an event document after creation.
 * Rules and service layers enforce that these fields cannot be modified.
 */
export const EVENT_IMMUTABLE_FIELDS = [
  "id",
  "campusId",
  "communityId",
  "createdBy",
  "createdAt",
];

/**
 * Pure domain helper to calculate the derived temporal state of an event.
 * Avoids storing brittle completion status in the database.
 *
 * @param {object} event - Event object with startAt and endAt timestamps
 * @param {Date|number|string} [referenceDate=new Date()] - Reference point in time
 * @returns {"upcoming" | "ongoing" | "completed"}
 */
export function getEventTemporalState(event, referenceDate = new Date()) {
  if (!event || !event.startAt || !event.endAt) {
    return "upcoming";
  }

  const nowMs = new Date(referenceDate).getTime();
  const startMs =
    typeof event.startAt?.toMillis === "function"
      ? event.startAt.toMillis()
      : new Date(event.startAt).getTime();
  const endMs =
    typeof event.endAt?.toMillis === "function"
      ? event.endAt.toMillis()
      : new Date(event.endAt).getTime();

  if (nowMs < startMs) {
    return "upcoming";
  }
  if (nowMs <= endMs) {
    return "ongoing";
  }
  return "completed";
}

// 1. Apex Institute of Technology - AI & Robotics Hackathon (Tech)
export const EVENT_AI_HACKATHON = {
  id: "e2e-event-ai-hackathon",
  campusId: APEX_CAMPUS_ID,
  communityId: COMMUNITY_APEX_AI.id,
  title: "Apex Annual AI & Robotics Hackathon 2026",
  slug: "annual-ai-hackathon-2026",
  description:
    "Join us for a 24-hour sprint building autonomous agents, perception pipelines, and embedded machine learning systems. Hardware kits and compute credits provided.",
  category: EVENT_CATEGORIES.TECH,
  location: "Turing Auditorium & Robotics Lab, Tech Block",
  startAt: "2026-10-15T09:00:00.000Z",
  endAt: "2026-10-16T09:00:00.000Z",
  imageURL: null,
  createdBy: "e2e-student-a",
  organizerName: "Apex AI & Robotics Society",
  status: EVENT_STATUSES.PUBLISHED,
  visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

// 2. Apex Institute of Technology - UI/UX Design Sprint (Cultural / Creative)
export const EVENT_DESIGN_SPRINT = {
  id: "e2e-event-design-sprint",
  campusId: APEX_CAMPUS_ID,
  communityId: COMMUNITY_APEX_DESIGN.id,
  title: "Campus UI/UX Design Sprint & Workshop",
  slug: "campus-design-sprint",
  description:
    "Collaborative intensive sprint on accessible campus interfaces, design tokens, and creative computing prototypes. Open to all students interested in product design.",
  category: EVENT_CATEGORIES.CULTURAL,
  location: "Design Studio 4A, Creative Arts Wing",
  startAt: "2026-10-18T10:00:00.000Z",
  endAt: "2026-10-18T17:00:00.000Z",
  imageURL: null,
  createdBy: "e2e-student-a",
  organizerName: "Apex Design & Creative Arts",
  status: EVENT_STATUSES.PUBLISHED,
  visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

// 3. Apex Institute of Technology - Annual Campus Fest / Showcase (Tech)
export const EVENT_CAMPUS_FEST = {
  id: "e2e-event-campus-fest",
  campusId: APEX_CAMPUS_ID,
  communityId: COMMUNITY_APEX_AI.id,
  title: "Apex Annual Technology & Robotics Showcase",
  slug: "annual-robotics-showcase",
  description:
    "Campus-wide exhibition displaying autonomous robotics projects, student demonstrations, keynote lectures from visiting faculty, and inter-department project showcases.",
  category: EVENT_CATEGORIES.TECH,
  location: "Main Campus Convocation Hall",
  startAt: "2026-10-25T10:00:00.000Z",
  endAt: "2026-10-25T18:00:00.000Z",
  imageURL: null,
  createdBy: "e2e-student-a",
  organizerName: "Apex AI & Robotics Society",
  status: EVENT_STATUSES.PUBLISHED,
  visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

// 4. St. Jude University - Medical Ethics Symposium (Academic)
export const EVENT_ST_JUDE_SYMPOSIUM = {
  id: "e2e-event-st-jude-symposium",
  campusId: ST_JUDE_CAMPUS_ID,
  communityId: COMMUNITY_ST_JUDE_MED.id,
  title: "St. Jude Clinical Research & Medical Ethics Symposium",
  slug: "medical-ethics-symposium",
  description:
    "Annual healthcare symposium on clinical research governance, ethics in genomic medicine, patient data protection, and modern bioethics in university hospitals.",
  category: EVENT_CATEGORIES.ACADEMIC,
  location: "Hippocrates Hall, St. Jude Medical Complex",
  startAt: "2026-10-20T09:30:00.000Z",
  endAt: "2026-10-20T16:30:00.000Z",
  imageURL: null,
  createdBy: "e2e-student-st-jude",
  organizerName: "St. Jude Medical Society",
  status: EVENT_STATUSES.PUBLISHED,
  visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

export const EVENTS = {
  [EVENT_AI_HACKATHON.id]: EVENT_AI_HACKATHON,
  [EVENT_DESIGN_SPRINT.id]: EVENT_DESIGN_SPRINT,
  [EVENT_CAMPUS_FEST.id]: EVENT_CAMPUS_FEST,
  [EVENT_ST_JUDE_SYMPOSIUM.id]: EVENT_ST_JUDE_SYMPOSIUM,
};

export const EVENT_LIST = [
  EVENT_AI_HACKATHON,
  EVENT_DESIGN_SPRINT,
  EVENT_CAMPUS_FEST,
  EVENT_ST_JUDE_SYMPOSIUM,
];
