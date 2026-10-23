/**
 * Milestone 24 — Unit 24.1: Waitlist Continuation Domain Model
 *
 * Durable background task staging document schema, validation, lease fencing,
 * and recovery state resolution.
 * Enforces root collection pattern: eventWaitlistContinuations/{eventId}
 */

import {
  CONTINUATION_STATUSES,
  CONTINUATION_STATUS_LIST,
  CONTINUATION_TYPE_LIST,
} from "../constants.js";

/**
 * Locked schema keys for an Event Waitlist Continuation document:
 * root collection: eventWaitlistContinuations/{eventId}
 */
export const EVENT_WAITLIST_CONTINUATION_FIELDS = Object.freeze([
  "id",
  "eventId",
  "campusId",
  "status",
  "continuationType",
  "vacanciesRemaining",
  "intermediateHeadSequence",
  "normalizationRequired",
  "generation",
  "leaseWorkerId",
  "leaseExpiresAt",
  "retryCount",
  "reason",
  "updatedAt",
]);

/**
 * Immutable fields for an Event Waitlist Continuation document after creation.
 */
export const EVENT_WAITLIST_CONTINUATION_IMMUTABLE_FIELDS = Object.freeze([
  "id",
  "eventId",
  "campusId",
]);

/**
 * Derives the canonical document ID for an Event Waitlist Continuation document.
 * Canonical pattern: continuation_{eventId}
 *
 * @param {string} eventId - Target event ID
 * @returns {string} Deterministic document ID
 */
export function getEventWaitlistContinuationId(eventId) {
  if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
    throw new Error(
      `[getEventWaitlistContinuationId] eventId must be a non-empty string. Received: "${eventId}"`
    );
  }
  return `continuation_${eventId.trim()}`;
}

/**
 * Validates an Event Waitlist Continuation document data structure.
 *
 * @param {object} data - Continuation data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWaitlistContinuation(data) {
  const errors = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Continuation data must be a non-null object"] };
  }

  for (const field of EVENT_WAITLIST_CONTINUATION_FIELDS) {
    if (data[field] === undefined) {
      errors.push(`Missing required continuation field: "${field}"`);
    }
  }

  if (data.id && data.eventId) {
    const expectedId = `continuation_${data.eventId}`;
    if (data.id !== expectedId) {
      errors.push(`Continuation id "${data.id}" must match expected "${expectedId}"`);
    }
  }

  if (!CONTINUATION_STATUS_LIST.includes(data.status)) {
    errors.push(
      `Invalid continuation status "${data.status}". Allowed statuses: ${CONTINUATION_STATUS_LIST.join(", ")}`
    );
  }

  if (!CONTINUATION_TYPE_LIST.includes(data.continuationType)) {
    errors.push(
      `Invalid continuation type "${data.continuationType}". Allowed types: ${CONTINUATION_TYPE_LIST.join(", ")}`
    );
  }

  if (
    typeof data.intermediateHeadSequence !== "number" ||
    !Number.isInteger(data.intermediateHeadSequence) ||
    data.intermediateHeadSequence < 1
  ) {
    errors.push(
      `intermediateHeadSequence must be a positive integer. Received: ${data.intermediateHeadSequence}`
    );
  }

  if (
    typeof data.generation !== "number" ||
    !Number.isInteger(data.generation) ||
    data.generation < 1
  ) {
    errors.push(`generation must be a positive integer >= 1. Received: ${data.generation}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Checks whether an exclusive worker lease on a continuation is currently active.
 *
 * @param {object} continuation - Continuation document data
 * @param {number|Date} [now=Date.now()] - Current epoch timestamp in ms
 * @returns {boolean} True if continuation has processing status and active lease
 */
export function isContinuationLeaseActive(continuation, now = Date.now()) {
  if (
    !continuation ||
    continuation.status !== CONTINUATION_STATUSES.PROCESSING ||
    !continuation.leaseWorkerId ||
    !continuation.leaseExpiresAt
  ) {
    return false;
  }

  const expiryMs = typeof continuation.leaseExpiresAt.toMillis === "function"
    ? continuation.leaseExpiresAt.toMillis()
    : continuation.leaseExpiresAt instanceof Date
    ? continuation.leaseExpiresAt.getTime()
    : Number(continuation.leaseExpiresAt);

  const currentMs = now instanceof Date ? now.getTime() : Number(now);
  return expiryMs >= currentMs;
}
