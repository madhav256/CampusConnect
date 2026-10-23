/* global process */
/**
 * Milestone 24 — Unit 24.3 / Section 10: Data Model Migration Tooling
 *
 * Migration script to transition uncapped events to capped coordinated events
 * with an atomic Event Capacity Coordinator document.
 *
 * STAGED IN M24.2 — DO NOT EXECUTE AGAINST PRODUCTION DATA UNTIL M24.4.
 *
 * Sequence (ADR-024 Section 10):
 * Phase 1: Set Migration Lock (registrationStatus = 'migration_locked')
 * Phase 2: Authoritative count query on eventRsvps (N)
 *          If N > targetCapacity: Rollback lock and abort
 * Phase 3: Atomic commit: Set capacity = target, remove lock, create coordinator
 * Phase 4: Read back and verify counter parity (confirmedCount === N)
 */

import { getAdminFirestore, FieldValue } from "./adminClient.mjs";

/**
 * Executes migration of a single uncapped event to a capped event with coordinator.
 *
 * @param {object} params
 * @param {string} params.eventId - Target event ID
 * @param {number} params.targetCapacity - Positive integer capacity to assign
 * @param {boolean} [params.dryRun=false] - If true, evaluates phases without committing changes
 * @param {object} [params.firestoreInstance=null] - Optional Firestore instance for unit testing
 * @returns {Promise<{
 *   success: boolean,
 *   phase: string,
 *   confirmedCount: number,
 *   targetCapacity: number,
 *   coordinatorCreated: boolean,
 *   details?: string,
 *   error?: string
 * }>}
 */
export async function migrateEventToCapped({
  eventId,
  targetCapacity,
  dryRun = false,
  firestoreInstance = null,
}) {
  if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
    throw new Error("[migrateEventToCapped] eventId must be a non-empty string.");
  }

  const capacity = Number(targetCapacity);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error(
      `[migrateEventToCapped] targetCapacity must be a positive integer > 0. Received: ${targetCapacity}`
    );
  }

  const db = firestoreInstance || getAdminFirestore();
  const eventRef = db.collection("events").doc(eventId);
  const capRef = db.collection("eventCapacities").doc(eventId);
  const rsvpsColl = db.collection("eventRsvps");

  // Read initial event
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    return {
      success: false,
      phase: "preflight",
      confirmedCount: 0,
      targetCapacity: capacity,
      coordinatorCreated: false,
      error: `Event "${eventId}" does not exist.`,
    };
  }

  const eventData = eventSnap.data();

  // Preflight check: must not already be capped or have active coordinator
  const capSnap = await capRef.get();
  if (capSnap.exists) {
    return {
      success: false,
      phase: "preflight",
      confirmedCount: capSnap.data().confirmedCount || 0,
      targetCapacity: capacity,
      coordinatorCreated: false,
      error: `Event "${eventId}" already has an active coordinator document.`,
    };
  }

  if (dryRun) {
    // Dry-run mode: count RSVPs and return assessment without writing
    const rsvpSnap = await rsvpsColl.where("eventId", "==", eventId).get();
    const count = rsvpSnap.size;
    const canMigrate = count <= capacity;

    return {
      success: canMigrate,
      phase: "dry_run_assessment",
      confirmedCount: count,
      targetCapacity: capacity,
      coordinatorCreated: false,
      details: canMigrate
        ? `Dry run successful: Event has ${count} RSVPs, fitting within target capacity ${capacity}.`
        : `Dry run failed: Event has ${count} RSVPs, exceeding target capacity ${capacity}.`,
    };
  }

  // =========================================================================
  // Phase 1: Set Migration Lock
  // =========================================================================
  await eventRef.update({
    registrationStatus: "migration_locked",
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Verify lock active
  const lockedSnap = await eventRef.get();
  if (lockedSnap.data().registrationStatus !== "migration_locked") {
    throw new Error("[migrateEventToCapped] Failed to verify migration_locked status on event.");
  }

  // =========================================================================
  // Phase 2: Authoritative count query (eventId == eId)
  // =========================================================================
  const rsvpQuerySnap = await rsvpsColl.where("eventId", "==", eventId).get();
  const confirmedCount = rsvpQuerySnap.size;

  if (confirmedCount > capacity) {
    // Rollback Phase 1 lock
    await eventRef.update({
      registrationStatus: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: false,
      phase: "phase_2_capacity_check",
      confirmedCount,
      targetCapacity: capacity,
      coordinatorCreated: false,
      error: `Rollback triggered: Current RSVP count (${confirmedCount}) exceeds target capacity (${capacity}). Lock cleared.`,
    };
  }

  // =========================================================================
  // Phase 3: Atomic Commit (Assign capacity, remove lock, create coordinator)
  // =========================================================================
  const batch = db.batch();

  // Update event
  batch.update(eventRef, {
    capacity,
    registrationStatus: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Create coordinator
  batch.set(capRef, {
    id: eventId,
    eventId,
    campusId: eventData.campusId,
    confirmedCount,
    offeredCount: 0,
    waitlistCount: 0,
    headSequence: 1,
    nextSequence: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // =========================================================================
  // Phase 4: Read back and verify counter parity
  // =========================================================================
  const postCapSnap = await capRef.get();
  const postEventSnap = await eventRef.get();

  const finalCap = postCapSnap.data();
  const finalEvent = postEventSnap.data();

  const parityOk =
    finalCap.confirmedCount === confirmedCount &&
    finalCap.headSequence === 1 &&
    finalCap.nextSequence === 1 &&
    finalEvent.capacity === capacity &&
    !finalEvent.registrationStatus;

  if (!parityOk) {
    throw new Error(
      `[migrateEventToCapped] Phase 4 Parity Verification Failed: ${JSON.stringify({
        expectedCount: confirmedCount,
        actualCount: finalCap.confirmedCount,
        capacity: finalEvent.capacity,
        status: finalEvent.registrationStatus,
      })}`
    );
  }

  return {
    success: true,
    phase: "completed",
    confirmedCount,
    targetCapacity: capacity,
    coordinatorCreated: true,
    details: `Successfully migrated event "${eventId}" to capacity ${capacity} with ${confirmedCount} confirmed seats.`,
  };
}

// Staged CLI guard (DO NOT RUN IN PRODUCTION WITHOUT EXPLICIT AUTHORIZATION IN M24.4)
if (process.argv[1] && process.argv[1].endsWith("migrateUncappedToCapped.js")) {
  console.log("================================================================================");
  console.log("CampusConnect — M24.2 Data Model Migration Tool (Staged)");
  console.log("NOTE: This tool is staged in Milestone 24.2. Do NOT run against production data.");
  console.log("Actual execution is gated for Milestone 24.4 under verified administrative lock.");
  console.log("================================================================================");
}
