/**
 * Milestone 24 — Unit 24.1: Waitlist Slot Domain Model
 *
 * Queue slot document schema, validation, lifecycle statuses, and offer window resolution.
 * Enforces root collection pattern: eventWaitlistSlots/{eventId}_{sequenceNumber}
 */

import {
  WAITLIST_SLOT_STATUSES,
  WAITLIST_SLOT_STATUS_LIST,
  WAITLIST_TERMINAL_STATUSES,
  WAITLIST_ACTIVE_STATUSES,
} from "../constants.js";

/**
 * Locked schema keys for an Event Waitlist Slot document:
 * root collection: eventWaitlistSlots/{eventId}_{sequenceNumber}
 */
export const EVENT_WAITLIST_SLOT_FIELDS = Object.freeze([
  "id",
  "eventId",
  "campusId",
  "userId",
  "sequenceNumber",
  "status",
  "joinedAt",
  "offeredAt",
  "offerExpiresAt",
  "resolvedAt",
]);

/**
 * Immutable fields for an Event Waitlist Slot document after initial creation.
 */
export const EVENT_WAITLIST_SLOT_IMMUTABLE_FIELDS = Object.freeze([
  "id",
  "eventId",
  "campusId",
  "userId",
  "sequenceNumber",
  "joinedAt",
]);

/**
 * Derives the deterministic document ID for an Event Waitlist Slot.
 * Canonical pattern: {eventId}_{sequenceNumber}
 *
 * @param {string} eventId - Target event ID
 * @param {number|string} sequenceNumber - Assigned sequence integer
 * @returns {string} Deterministic document ID
 */
export function getEventWaitlistSlotId(eventId, sequenceNumber) {
  if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
    throw new Error(
      `[getEventWaitlistSlotId] eventId must be a non-empty string. Received: "${eventId}"`
    );
  }
  const seq = Number(sequenceNumber);
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(
      `[getEventWaitlistSlotId] sequenceNumber must be a positive integer. Received: ${sequenceNumber}`
    );
  }
  return `${eventId.trim()}_${seq}`;
}

/**
 * Checks if a waitlist slot status is a terminal (final) lifecycle state.
 *
 * @param {string} status - Slot status
 * @returns {boolean} True if status is claimed, declined, expired, or withdrawn
 */
export function isTerminalSlotStatus(status) {
  return WAITLIST_TERMINAL_STATUSES.includes(status);
}

/**
 * Checks if a waitlist slot status is an active (waiting or offered) state.
 *
 * @param {string} status - Slot status
 * @returns {boolean} True if status is waiting or offered
 */
export function isActiveSlotStatus(status) {
  return WAITLIST_ACTIVE_STATUSES.includes(status);
}

/**
 * Validates an Event Waitlist Slot document data structure.
 *
 * @param {object} data - Waitlist slot data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWaitlistSlot(data) {
  const errors = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Slot data must be a non-null object"] };
  }

  // Required core fields
  const coreFields = ["id", "eventId", "campusId", "userId", "sequenceNumber", "status", "joinedAt"];
  for (const field of coreFields) {
    if (data[field] === undefined) {
      errors.push(`Missing required slot field: "${field}"`);
    }
  }

  // ID match check
  if (data.id && data.eventId && data.sequenceNumber !== undefined) {
    const expectedId = `${data.eventId}_${data.sequenceNumber}`;
    if (data.id !== expectedId) {
      errors.push(`Slot id "${data.id}" must match expected "${expectedId}"`);
    }
  }

  // Sequence number validation
  if (
    typeof data.sequenceNumber !== "number" ||
    !Number.isInteger(data.sequenceNumber) ||
    data.sequenceNumber < 1
  ) {
    errors.push(`sequenceNumber must be a positive integer. Received: ${data.sequenceNumber}`);
  }

  // Status validation
  if (!WAITLIST_SLOT_STATUS_LIST.includes(data.status)) {
    errors.push(
      `Invalid slot status "${data.status}". Allowed statuses: ${WAITLIST_SLOT_STATUS_LIST.join(", ")}`
    );
  }

  // Conditional status requirements
  if (data.status === WAITLIST_SLOT_STATUSES.OFFERED) {
    if (!data.offeredAt) {
      errors.push(`Slot in status "offered" must include offeredAt timestamp`);
    }
    if (!data.offerExpiresAt) {
      errors.push(`Slot in status "offered" must include offerExpiresAt timestamp`);
    }
  }

  if (isTerminalSlotStatus(data.status)) {
    if (!data.resolvedAt) {
      errors.push(`Terminal slot in status "${data.status}" should include resolvedAt timestamp`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Checks whether an offer on a waitlist slot is currently active and unexpired.
 *
 * @param {object} slot - Waitlist slot document data
 * @param {number|Date} [now=Date.now()] - Current epoch timestamp in ms
 * @returns {boolean} True if slot is offered and current time is before expiry
 */
export function isOfferActive(slot, now = Date.now()) {
  if (!slot || slot.status !== WAITLIST_SLOT_STATUSES.OFFERED || !slot.offerExpiresAt) {
    return false;
  }
  const expiryMs = typeof slot.offerExpiresAt.toMillis === "function"
    ? slot.offerExpiresAt.toMillis()
    : slot.offerExpiresAt instanceof Date
    ? slot.offerExpiresAt.getTime()
    : Number(slot.offerExpiresAt);

  const currentMs = now instanceof Date ? now.getTime() : Number(now);
  return expiryMs > currentMs;
}

/**
 * Computes remaining time in milliseconds on an offered waitlist slot.
 *
 * @param {object} slot - Waitlist slot document data
 * @param {number|Date} [now=Date.now()] - Current epoch timestamp in ms
 * @returns {number} Milliseconds remaining (0 if expired or not offered)
 */
export function getOfferRemainingMs(slot, now = Date.now()) {
  if (!slot || slot.status !== WAITLIST_SLOT_STATUSES.OFFERED || !slot.offerExpiresAt) {
    return 0;
  }
  const expiryMs = typeof slot.offerExpiresAt.toMillis === "function"
    ? slot.offerExpiresAt.toMillis()
    : slot.offerExpiresAt instanceof Date
    ? slot.offerExpiresAt.getTime()
    : Number(slot.offerExpiresAt);

  const currentMs = now instanceof Date ? now.getTime() : Number(now);
  return Math.max(0, expiryMs - currentMs);
}
