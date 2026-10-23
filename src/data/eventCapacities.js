/**
 * Milestone 24 — Unit 24.1: Event Capacity Coordinator Domain Model
 *
 * Coordinator document schema, validation, invariants, and metrics resolution
 * for capped events and multi-slot waitlists.
 * Enforces root collection pattern: eventCapacities/{eventId}
 */

/**
 * Locked schema keys for an Event Capacity Coordinator document:
 * root collection: eventCapacities/{eventId}
 */
export const EVENT_CAPACITY_FIELDS = Object.freeze([
  "id",
  "eventId",
  "campusId",
  "confirmedCount",
  "offeredCount",
  "waitlistCount",
  "headSequence",
  "nextSequence",
  "createdAt",
  "updatedAt",
]);

/**
 * Immutable fields for an Event Capacity Coordinator document after creation.
 */
export const EVENT_CAPACITY_IMMUTABLE_FIELDS = Object.freeze([
  "id",
  "eventId",
  "campusId",
  "createdAt",
]);

/**
 * Returns the canonical document ID for an Event Capacity Coordinator.
 * Canonical pattern: {eventId}
 *
 * @param {string} eventId - Target event ID
 * @returns {string} Deterministic document ID
 */
export function getEventCapacityId(eventId) {
  if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
    throw new Error(
      `[getEventCapacityId] eventId must be a non-empty string. Received: "${eventId}"`
    );
  }
  return eventId.trim();
}

/**
 * Checks whether an event is capped.
 *
 * @param {object} event - Event document data
 * @returns {boolean} True if event has a positive numerical capacity
 */
export function isCappedEvent(event) {
  return (
    event != null &&
    typeof event === "object" &&
    typeof event.capacity === "number" &&
    !Number.isNaN(event.capacity) &&
    event.capacity > 0
  );
}

/**
 * Creates an initial Event Capacity Coordinator document structure.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {string} params.campusId
 * @param {number} [params.confirmedCount=0]
 * @param {Date|any} [params.timestamp=null]
 * @returns {object} Valid initial coordinator data
 */
export function createInitialEventCapacity({
  eventId,
  campusId,
  confirmedCount = 0,
  timestamp = null,
}) {
  const validId = getEventCapacityId(eventId);
  if (!campusId || typeof campusId !== "string" || campusId.trim() === "") {
    throw new Error(
      `[createInitialEventCapacity] campusId must be a non-empty string. Received: "${campusId}"`
    );
  }

  const initialConfirmed = Math.max(0, Number(confirmedCount) || 0);

  return {
    id: validId,
    eventId: validId,
    campusId: campusId.trim(),
    confirmedCount: initialConfirmed,
    offeredCount: 0,
    waitlistCount: 0,
    headSequence: 1,
    nextSequence: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Validates an Event Capacity Coordinator document against domain invariants.
 *
 * Invariants:
 * 1. Monotonic Sequence: headSequence <= nextSequence
 * 2. Positivity: confirmedCount >= 0, offeredCount >= 0, waitlistCount >= 0, headSequence >= 1, nextSequence >= 1
 * 3. Total allocation ceiling: confirmedCount + offeredCount <= capacity (if event is provided and capped)
 *
 * @param {object} data - Coordinator data to validate
 * @param {object} [event=null] - Companion event object for capacity ceiling check
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEventCapacity(data, event = null) {
  const errors = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Coordinator data must be a non-null object"] };
  }

  // Required field checks
  for (const field of EVENT_CAPACITY_FIELDS) {
    if (data[field] === undefined) {
      errors.push(`Missing required coordinator field: "${field}"`);
    }
  }

  // ID match check
  if (data.id && data.eventId && data.id !== data.eventId) {
    errors.push(`Coordinator id "${data.id}" must match eventId "${data.eventId}"`);
  }

  // Counter type and non-negativity checks
  const numericFields = [
    "confirmedCount",
    "offeredCount",
    "waitlistCount",
    "headSequence",
    "nextSequence",
  ];

  for (const field of numericFields) {
    const val = data[field];
    if (typeof val !== "number" || Number.isNaN(val) || !Number.isInteger(val)) {
      errors.push(`Coordinator field "${field}" must be an integer. Received: ${val}`);
    } else if (val < 0) {
      errors.push(`Coordinator field "${field}" cannot be negative. Received: ${val}`);
    }
  }

  // Sequence pointers must be >= 1
  if (typeof data.headSequence === "number" && data.headSequence < 1) {
    errors.push(`headSequence must be >= 1. Received: ${data.headSequence}`);
  }
  if (typeof data.nextSequence === "number" && data.nextSequence < 1) {
    errors.push(`nextSequence must be >= 1. Received: ${data.nextSequence}`);
  }

  // Invariant 1: Monotonic Sequence Invariant
  if (
    typeof data.headSequence === "number" &&
    typeof data.nextSequence === "number" &&
    data.headSequence > data.nextSequence
  ) {
    errors.push(
      `Monotonic sequence invariant violated: headSequence (${data.headSequence}) cannot exceed nextSequence (${data.nextSequence})`
    );
  }

  // Invariant: Total allocation ceiling check when event is provided
  if (isCappedEvent(event)) {
    const totalAllocated = (data.confirmedCount || 0) + (data.offeredCount || 0);
    if (totalAllocated > event.capacity) {
      errors.push(
        `Capacity ceiling invariant violated: confirmedCount (${data.confirmedCount}) + offeredCount (${data.offeredCount}) = ${totalAllocated} exceeds event capacity (${event.capacity})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Computes live capacity metrics from an event and coordinator.
 *
 * @param {object} params
 * @param {object} params.event - Event document or data
 * @param {object} [params.coordinator=null] - Coordinator document or data
 * @returns {object} Derived metrics for UI and business logic
 */
export function computeCapacityMetrics({ event, coordinator = null }) {
  const capped = isCappedEvent(event);
  const capacity = capped ? event.capacity : null;

  const confirmedCount = Math.max(0, coordinator?.confirmedCount ?? 0);
  const offeredCount = Math.max(0, coordinator?.offeredCount ?? 0);
  const waitlistCount = Math.max(0, coordinator?.waitlistCount ?? 0);
  const headSequence = Math.max(1, coordinator?.headSequence ?? 1);
  const nextSequence = Math.max(headSequence, coordinator?.nextSequence ?? 1);

  const allocatedSeats = confirmedCount + offeredCount;
  const availableSeats = capped
    ? Math.max(0, capacity - allocatedSeats)
    : Infinity;

  const isFull = capped && allocatedSeats >= capacity;
  const isAtCapacity = isFull;
  const hasWaitlist = waitlistCount > 0;

  // Direct admission (PW-1) requires open vacancy AND empty waitlist
  const canDirectRsvp = capped
    ? availableSeats > 0 && waitlistCount === 0
    : true;

  // Waitlist join (PW-2) applies when capped event is full OR has active waitlist
  const canJoinWaitlist = capped && (isFull || waitlistCount > 0);

  return {
    isCapped: capped,
    capacity,
    confirmedCount,
    offeredCount,
    waitlistCount,
    headSequence,
    nextSequence,
    allocatedSeats,
    availableSeats,
    isFull,
    isAtCapacity,
    hasWaitlist,
    canDirectRsvp,
    canJoinWaitlist,
  };
}
