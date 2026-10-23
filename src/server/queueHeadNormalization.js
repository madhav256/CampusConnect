import { getAdminDb } from "../../scripts/adminClient.mjs";

/**
 * Canonical Queue-Head Normalization Algorithm (`normalizeQueueHead`)
 * ADR-024 / Revision 33 Section 6.2.2
 *
 * Evaluates queue slots from startSequence up to coordinator.nextSequence.
 * Terminal holes ('claimed', 'declined', 'expired', 'withdrawn') are skipped.
 * Returns an explicit 4-outcome discriminated union:
 * - 'candidateFound'
 * - 'queueExhausted'
 * - 'limitReached'
 * - 'integrityError'
 *
 * @param {FirebaseFirestore.Transaction} transaction - Firestore transaction instance
 * @param {string} eventId - Unique event identifier
 * @param {object} coordinator - Event capacity coordinator document data
 * @param {number} [startSequence] - Sequence number to start scanning from (defaults to coordinator.headSequence)
 * @param {number} [maxScan=10] - Maximum slot document reads allowed in this normalization invocation
 * @param {FirebaseFirestore.Firestore} [db] - Optional Firestore instance, defaults to getAdminDb()
 * @returns {Promise<object>} NormalizationOutcome discriminated union
 */
export async function normalizeQueueHead(
  transaction,
  eventId,
  coordinator,
  startSequence,
  maxScan = 10,
  db
) {
  const firestore = db || getAdminDb();
  let currentSeq = startSequence !== undefined && startSequence !== null ? startSequence : coordinator.headSequence;
  const appendLimit = coordinator.nextSequence;
  let scannedSlots = 0;
  let holesSkipped = 0;

  while (currentSeq < appendLimit && scannedSlots < maxScan) {
    const slotRef = firestore.collection("eventWaitlistSlots").doc(`${eventId}_${currentSeq}`);
    const slotDoc = await transaction.get(slotRef);
    scannedSlots++;

    if (!slotDoc.exists) {
      return {
        outcome: "integrityError",
        reason: "missing_slot_document",
        sequenceNumber: currentSeq,
        slotReadsConsumed: scannedSlots,
        details: `Waitlist slot document missing at sequence ${currentSeq} between head ${coordinator.headSequence} and next ${appendLimit}`,
      };
    }

    const slotData = slotDoc.data();

    // Terminal statuses that represent validly skipped holes:
    if (["claimed", "declined", "expired", "withdrawn"].includes(slotData.status)) {
      currentSeq++;
      holesSkipped++;
      continue;
    }

    // Active candidate awaiting promotion:
    if (slotData.status === "waiting") {
      const memberRef = firestore.collection("eventWaitlistMembers").doc(`${eventId}_${slotData.userId}`);
      const memberDoc = await transaction.get(memberRef);

      if (!memberDoc.exists) {
        return {
          outcome: "integrityError",
          reason: "missing_companion_member",
          sequenceNumber: currentSeq,
          slotReadsConsumed: scannedSlots,
          details: `Waiting slot ${currentSeq} for user ${slotData.userId} lacks reciprocal eventWaitlistMembers document`,
        };
      }

      const memberData = memberDoc.data();
      if (memberData.status !== "waiting") {
        return {
          outcome: "integrityError",
          reason: "missing_companion_member",
          sequenceNumber: currentSeq,
          slotReadsConsumed: scannedSlots,
          details: `Companion member ${slotData.userId} status '${memberData.status}' does not match slot 'waiting'`,
        };
      }

      return {
        outcome: "candidateFound",
        candidateSlot: slotData,
        candidateMember: memberData,
        candidateSequence: currentSeq,
        holesSkipped,
        slotReadsConsumed: scannedSlots,
        normalizedHeadSequence: currentSeq,
      };
    }

    // Active offer encountered at evaluation pointer:
    if (slotData.status === "offered") {
      return {
        outcome: "integrityError",
        reason: "active_offer_at_evaluation_pointer",
        sequenceNumber: currentSeq,
        slotReadsConsumed: scannedSlots,
        details: `Encountered active offered slot at sequence ${currentSeq} during candidate normalization`,
      };
    }

    return {
      outcome: "integrityError",
      reason: "invalid_status",
      sequenceNumber: currentSeq,
      slotReadsConsumed: scannedSlots,
      details: `Slot ${currentSeq} contains invalid status: ${slotData.status}`,
    };
  }

  // Loop termination: queue exhausted
  if (currentSeq >= appendLimit) {
    return {
      outcome: "queueExhausted",
      normalizedHeadSequence: appendLimit,
      holesSkipped,
      slotReadsConsumed: scannedSlots,
    };
  }

  // Loop termination: bounded scan limit reached
  return {
    outcome: "limitReached",
    intermediateHeadSequence: currentSeq,
    scannedCount: scannedSlots,
    slotReadsConsumed: scannedSlots,
  };
}
