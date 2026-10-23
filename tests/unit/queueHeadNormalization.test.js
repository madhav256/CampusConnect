import { describe, it, expect, vi } from "vitest";
import { normalizeQueueHead } from "../../src/server/queueHeadNormalization.js";

function createMockFirestore(slots = {}, members = {}) {
  return {
    collection: (colName) => ({
      doc: (docId) => ({
        path: `${colName}/${docId}`,
        colName,
        docId,
      }),
    }),
    _slots: slots,
    _members: members,
  };
}

function createMockTransaction(mockDb) {
  return {
    get: vi.fn(async (docRef) => {
      const { colName, docId } = docRef;
      if (colName === "eventWaitlistSlots") {
        if (docId in mockDb._slots) {
          return {
            exists: true,
            data: () => mockDb._slots[docId],
          };
        }
        return { exists: false, data: () => null };
      }
      if (colName === "eventWaitlistMembers") {
        if (docId in mockDb._members) {
          return {
            exists: true,
            data: () => mockDb._members[docId],
          };
        }
        return { exists: false, data: () => null };
      }
      return { exists: false, data: () => null };
    }),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

describe("normalizeQueueHead (ADR-024 Revision 33 Section 6.2.2)", () => {
  const eventId = "test_event_1";

  it("finds waiting candidate immediately at head sequence", async () => {
    const coordinator = { headSequence: 1, nextSequence: 3, waitlistCount: 1 };
    const mockDb = createMockFirestore(
      {
        [`${eventId}_1`]: {
          id: `${eventId}_1`,
          eventId,
          sequenceNumber: 1,
          userId: "user_alice",
          status: "waiting",
        },
      },
      {
        [`${eventId}_user_alice`]: {
          id: `${eventId}_user_alice`,
          eventId,
          userId: "user_alice",
          status: "waiting",
          sequenceNumber: 1,
        },
      }
    );
    const tx = createMockTransaction(mockDb);

    const result = await normalizeQueueHead(tx, eventId, coordinator, 1, 10, mockDb);

    expect(result.outcome).toBe("candidateFound");
    expect(result.candidateSequence).toBe(1);
    expect(result.normalizedHeadSequence).toBe(1);
    expect(result.holesSkipped).toBe(0);
    expect(result.slotReadsConsumed).toBe(1);
    expect(result.candidateSlot.userId).toBe("user_alice");
    expect(result.candidateMember.userId).toBe("user_alice");
  });

  it("skips terminal holes ('claimed', 'declined', 'expired', 'withdrawn') to find waiting candidate", async () => {
    const coordinator = { headSequence: 1, nextSequence: 6, waitlistCount: 1 };
    const mockDb = createMockFirestore(
      {
        [`${eventId}_1`]: { status: "claimed" },
        [`${eventId}_2`]: { status: "declined" },
        [`${eventId}_3`]: { status: "expired" },
        [`${eventId}_4`]: { status: "withdrawn" },
        [`${eventId}_5`]: {
          id: `${eventId}_5`,
          eventId,
          sequenceNumber: 5,
          userId: "user_bob",
          status: "waiting",
        },
      },
      {
        [`${eventId}_user_bob`]: {
          id: `${eventId}_user_bob`,
          eventId,
          userId: "user_bob",
          status: "waiting",
          sequenceNumber: 5,
        },
      }
    );
    const tx = createMockTransaction(mockDb);

    const result = await normalizeQueueHead(tx, eventId, coordinator, 1, 10, mockDb);

    expect(result.outcome).toBe("candidateFound");
    expect(result.candidateSequence).toBe(5);
    expect(result.normalizedHeadSequence).toBe(5);
    expect(result.holesSkipped).toBe(4);
    expect(result.slotReadsConsumed).toBe(5);
  });

  it("returns queueExhausted when all slots up to nextSequence are terminal holes", async () => {
    const coordinator = { headSequence: 1, nextSequence: 4, waitlistCount: 0 };
    const mockDb = createMockFirestore({
      [`${eventId}_1`]: { status: "claimed" },
      [`${eventId}_2`]: { status: "declined" },
      [`${eventId}_3`]: { status: "withdrawn" },
    });
    const tx = createMockTransaction(mockDb);

    const result = await normalizeQueueHead(tx, eventId, coordinator, 1, 10, mockDb);

    expect(result.outcome).toBe("queueExhausted");
    expect(result.normalizedHeadSequence).toBe(4);
    expect(result.holesSkipped).toBe(3);
    expect(result.slotReadsConsumed).toBe(3);
  });

  it("returns queueExhausted immediately when headSequence >= nextSequence", async () => {
    const coordinator = { headSequence: 5, nextSequence: 5, waitlistCount: 0 };
    const mockDb = createMockFirestore({});
    const tx = createMockTransaction(mockDb);

    const result = await normalizeQueueHead(tx, eventId, coordinator, 5, 10, mockDb);

    expect(result.outcome).toBe("queueExhausted");
    expect(result.normalizedHeadSequence).toBe(5);
    expect(result.holesSkipped).toBe(0);
    expect(result.slotReadsConsumed).toBe(0);
    expect(tx.get).not.toHaveBeenCalled();
  });

  it("returns limitReached when maxScan is reached before candidate or queue end", async () => {
    const coordinator = { headSequence: 1, nextSequence: 20, waitlistCount: 1 };
    // 10 holes in a row
    const slots = {};
    for (let i = 1; i <= 10; i++) {
      slots[`${eventId}_${i}`] = { status: "withdrawn" };
    }
    const mockDb = createMockFirestore(slots);
    const tx = createMockTransaction(mockDb);

    const result = await normalizeQueueHead(tx, eventId, coordinator, 1, 10, mockDb);

    expect(result.outcome).toBe("limitReached");
    expect(result.intermediateHeadSequence).toBe(11);
    expect(result.scannedCount).toBe(10);
    expect(result.slotReadsConsumed).toBe(10);
  });

  it("returns limitReached with custom maxScan", async () => {
    const coordinator = { headSequence: 1, nextSequence: 10, waitlistCount: 1 };
    const slots = {
      [`${eventId}_1`]: { status: "withdrawn" },
      [`${eventId}_2`]: { status: "claimed" },
      [`${eventId}_3`]: { status: "expired" },
      [`${eventId}_4`]: { status: "waiting", userId: "u4" },
    };
    const mockDb = createMockFirestore(slots);
    const tx = createMockTransaction(mockDb);

    // Limit scan to 3
    const result = await normalizeQueueHead(tx, eventId, coordinator, 1, 3, mockDb);

    expect(result.outcome).toBe("limitReached");
    expect(result.intermediateHeadSequence).toBe(4);
    expect(result.scannedCount).toBe(3);
    expect(result.slotReadsConsumed).toBe(3);
  });

  it("returns integrityError when a slot document is missing within [head, next)", async () => {
    const coordinator = { headSequence: 1, nextSequence: 4, waitlistCount: 1 };
    const mockDb = createMockFirestore({
      [`${eventId}_1`]: { status: "claimed" },
      // slot 2 is missing!
      [`${eventId}_3`]: { status: "waiting", userId: "u3" },
    });
    const tx = createMockTransaction(mockDb);

    const result = await normalizeQueueHead(tx, eventId, coordinator, 1, 10, mockDb);

    expect(result.outcome).toBe("integrityError");
    expect(result.reason).toBe("missing_slot_document");
    expect(result.sequenceNumber).toBe(2);
    expect(result.slotReadsConsumed).toBe(2);
  });

  it("returns integrityError when companion member document is missing", async () => {
    const coordinator = { headSequence: 1, nextSequence: 3, waitlistCount: 1 };
    const mockDb = createMockFirestore(
      {
        [`${eventId}_1`]: { status: "waiting", userId: "user_orphan" },
      },
      {} // empty members
    );
    const tx = createMockTransaction(mockDb);

    const result = await normalizeQueueHead(tx, eventId, coordinator, 1, 10, mockDb);

    expect(result.outcome).toBe("integrityError");
    expect(result.reason).toBe("missing_companion_member");
    expect(result.sequenceNumber).toBe(1);
    expect(result.details).toContain("lacks reciprocal eventWaitlistMembers");
  });

  it("returns integrityError when companion member status does not match 'waiting'", async () => {
    const coordinator = { headSequence: 1, nextSequence: 3, waitlistCount: 1 };
    const mockDb = createMockFirestore(
      {
        [`${eventId}_1`]: { status: "waiting", userId: "user_desync" },
      },
      {
        [`${eventId}_user_desync`]: { status: "offered" }, // desync!
      }
    );
    const tx = createMockTransaction(mockDb);

    const result = await normalizeQueueHead(tx, eventId, coordinator, 1, 10, mockDb);

    expect(result.outcome).toBe("integrityError");
    expect(result.reason).toBe("missing_companion_member");
    expect(result.sequenceNumber).toBe(1);
    expect(result.details).toContain("does not match slot 'waiting'");
  });

  it("returns integrityError when active 'offered' slot is encountered at evaluation pointer", async () => {
    const coordinator = { headSequence: 1, nextSequence: 3, waitlistCount: 1 };
    const mockDb = createMockFirestore({
      [`${eventId}_1`]: { status: "offered", userId: "user_offered" },
    });
    const tx = createMockTransaction(mockDb);

    const result = await normalizeQueueHead(tx, eventId, coordinator, 1, 10, mockDb);

    expect(result.outcome).toBe("integrityError");
    expect(result.reason).toBe("active_offer_at_evaluation_pointer");
    expect(result.sequenceNumber).toBe(1);
  });

  it("returns integrityError when invalid status is encountered", async () => {
    const coordinator = { headSequence: 1, nextSequence: 3, waitlistCount: 1 };
    const mockDb = createMockFirestore({
      [`${eventId}_1`]: { status: "unknown_corrupt_status", userId: "user_bad" },
    });
    const tx = createMockTransaction(mockDb);

    const result = await normalizeQueueHead(tx, eventId, coordinator, 1, 10, mockDb);

    expect(result.outcome).toBe("integrityError");
    expect(result.reason).toBe("invalid_status");
    expect(result.sequenceNumber).toBe(1);
  });
});
