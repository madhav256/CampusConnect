/**
 * Milestone 24 — Unit 24.1: Waitlist Member Domain Model
 *
 * Private student queue index schema, validation, reciprocal slot reference,
 * and relative queue position calculation.
 * Enforces root collection pattern: eventWaitlistMembers/{eventId}_{userId}
 */

import {
  WAITLIST_MEMBER_STATUS_LIST,
} from "../constants.js";

/**
 * Locked schema keys for an Event Waitlist Member document:
 * root collection: eventWaitlistMembers/{eventId}_{userId}
 */
export const EVENT_WAITLIST_MEMBER_FIELDS = Object.freeze([
  "id",
  "eventId",
  "campusId",
  "userId",
  "sequenceNumber",
  "status",
  "joinedAt",
  "updatedAt",
]);

/**
 * Immutable fields for an Event Waitlist Member document after creation.
 */
export const EVENT_WAITLIST_MEMBER_IMMUTABLE_FIELDS = Object.freeze([
  "id",
  "eventId",
  "campusId",
  "userId",
  "sequenceNumber",
  "joinedAt",
]);

/**
 * Derives the deterministic document ID for an Event Waitlist Member.
 * Canonical pattern: {eventId}_{userId}
 *
 * @param {string} eventId - Target event ID
 * @param {string} userId - Target student UID
 * @returns {string} Deterministic document ID
 */
export function getEventWaitlistMemberId(eventId, userId) {
  if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
    throw new Error(
      `[getEventWaitlistMemberId] eventId must be a non-empty string. Received: "${eventId}"`
    );
  }
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error(
      `[getEventWaitlistMemberId] userId must be a non-empty string. Received: "${userId}"`
    );
  }
  return `${eventId.trim()}_${userId.trim()}`;
}

/**
 * Validates an Event Waitlist Member document data structure.
 *
 * @param {object} data - Waitlist member data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWaitlistMember(data) {
  const errors = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Member data must be a non-null object"] };
  }

  for (const field of EVENT_WAITLIST_MEMBER_FIELDS) {
    if (data[field] === undefined) {
      errors.push(`Missing required waitlist member field: "${field}"`);
    }
  }

  if (data.id && data.eventId && data.userId) {
    const expectedId = `${data.eventId}_${data.userId}`;
    if (data.id !== expectedId) {
      errors.push(`Member id "${data.id}" must match expected "${expectedId}"`);
    }
  }

  if (
    typeof data.sequenceNumber !== "number" ||
    !Number.isInteger(data.sequenceNumber) ||
    data.sequenceNumber < 1
  ) {
    errors.push(`sequenceNumber must be a positive integer. Received: ${data.sequenceNumber}`);
  }

  if (!WAITLIST_MEMBER_STATUS_LIST.includes(data.status)) {
    errors.push(
      `Invalid member status "${data.status}". Allowed statuses: ${WAITLIST_MEMBER_STATUS_LIST.join(", ")}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculates a student's relative queue position using the canonical zero-PII formula:
 * Queue Position = member.sequenceNumber - coordinator.headSequence + 1
 *
 * @param {number} memberSequence - The student's sequence number
 * @param {number} headSequence - The coordinator's current head sequence
 * @returns {number|null} 1-based queue position (1 = next in line), or 1 if already at/past head
 */
export function calculateQueuePosition(memberSequence, headSequence) {
  if (
    typeof memberSequence !== "number" ||
    !Number.isInteger(memberSequence) ||
    typeof headSequence !== "number" ||
    !Number.isInteger(headSequence)
  ) {
    return null;
  }

  const pos = memberSequence - headSequence + 1;
  return Math.max(1, pos);
}
