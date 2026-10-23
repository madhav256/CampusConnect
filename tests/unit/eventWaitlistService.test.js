/**
 * Milestone 24 — Unit 24.2: Event Waitlist Client Service Tests
 *
 * Tests for waitlist slot and member queries, reactive subscriptions,
 * PW-2 atomic join batch (3 documents), PW-5 Non-Head atomic withdrawal batch (3 documents),
 * and testable backend Callable Function integration boundaries.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { WAITLIST_SLOT_STATUSES } from "../../src/constants.js";

const mocks = vi.hoisted(() => {
  const mockBatch = {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  };
  const mockCallables = {
    claimWaitlistOffer: vi.fn(),
    declineWaitlistOffer: vi.fn(),
    leaveWaitlist: vi.fn(),
    cancelRsvpWithPromotion: vi.fn(),
    promoteWaitlistCandidates: vi.fn(),
  };
  return {
    doc: vi.fn((_db, coll, id, ...rest) => {
      const fullPath = rest.length ? `${coll}/${id}/${rest.join("/")}` : `${coll}/${id}`;
      return {
        path: fullPath,
        id: rest.length ? rest[rest.length - 1] : id,
        collection: coll,
      };
    }),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    writeBatch: vi.fn(() => mockBatch),
    mockBatch,
    onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => ({ _methodName: "serverTimestamp" })),
    increment: vi.fn((n) => ({ _methodName: "increment", delta: n })),
    httpsCallable: vi.fn((_fn, name) => mockCallables[name] || vi.fn()),
    mockCallables,
    mockDb: { id: "mock-db" },
    mockFunctions: { id: "mock-functions" },
  };
});

vi.mock("../../src/firebase/config", () => ({
  db: mocks.mockDb,
  functions: mocks.mockFunctions,
  isFirebaseConfigured: true,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
  writeBatch: mocks.writeBatch,
  onSnapshot: mocks.onSnapshot,
  serverTimestamp: mocks.serverTimestamp,
  increment: mocks.increment,
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: mocks.httpsCallable,
}));

import {
  waitlistSlotDocRef,
  waitlistMemberDocRef,
  getWaitlistSlot,
  getWaitlistMember,
  subscribeToWaitlistSlot,
  subscribeToWaitlistMember,
  joinWaitlistBatch,
  withdrawNonHeadWaitlist,
  claimWaitlistOffer,
  declineWaitlistOffer,
  leaveWaitlist,
  cancelRsvpWithPromotion,
  promoteWaitlistCandidates,
} from "../../src/services/eventWaitlistService.js";

describe("Milestone 24 — Unit 24.2: Event Waitlist Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Document references and queries", () => {
    it("generates correct document references for slots and members", () => {
      const slotRef = waitlistSlotDocRef("evt-100", 3);
      expect(slotRef.path).toBe("eventWaitlistSlots/evt-100_3");

      const memberRef = waitlistMemberDocRef("evt-100", "usr-abc");
      expect(memberRef.path).toBe("eventWaitlistMembers/evt-100_usr-abc");
    });

    it("fetches and normalizes waitlist slot document", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: "evt-100_3",
        data: () => ({
          eventId: "evt-100",
          sequenceNumber: 3,
          status: WAITLIST_SLOT_STATUSES.WAITING,
          userId: "usr-abc",
        }),
      });

      const slot = await getWaitlistSlot("evt-100", 3);
      expect(slot).not.toBeNull();
      expect(slot.sequenceNumber).toBe(3);
      expect(slot.status).toBe("waiting");
    });

    it("fetches and normalizes waitlist member document", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: "member_evt-100_usr-abc",
        data: () => ({
          eventId: "evt-100",
          userId: "usr-abc",
          sequenceNumber: 3,
          status: "waiting",
        }),
      });

      const member = await getWaitlistMember("evt-100", "usr-abc");
      expect(member).not.toBeNull();
      expect(member.sequenceNumber).toBe(3);
    });

    it("subscribes to waitlist slot reactively", () => {
      const unsubscribeMock = vi.fn();
      mocks.onSnapshot.mockImplementationOnce((_ref, onNext) => {
        onNext({
          exists: () => true,
          id: "slot_evt-100_3",
          data: () => ({
            eventId: "evt-100",
            sequenceNumber: 3,
            status: WAITLIST_SLOT_STATUSES.OFFERED,
          }),
        });
        return unsubscribeMock;
      });

      const callback = vi.fn();
      const unsub = subscribeToWaitlistSlot("evt-100", 3, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          sequenceNumber: 3,
          status: "offered",
        })
      );
      expect(unsub).toBe(unsubscribeMock);
    });

    it("subscribes to waitlist member reactively", () => {
      const unsubscribeMock = vi.fn();
      mocks.onSnapshot.mockImplementationOnce((_ref, onNext) => {
        onNext({
          exists: () => true,
          id: "evt-100_usr-abc",
          data: () => ({
            eventId: "evt-100",
            userId: "usr-abc",
            sequenceNumber: 3,
            status: "waiting",
          }),
        });
        return unsubscribeMock;
      });

      const callback = vi.fn();
      const unsub = subscribeToWaitlistMember("evt-100", "usr-abc", callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "usr-abc",
          sequenceNumber: 3,
        })
      );
      expect(unsub).toBe(unsubscribeMock);
    });
  });

  describe("Atomic Batches (PW-2 Join & PW-5 Non-Head Withdrawal)", () => {
    it("executes PW-2 Waitlist Join as a 3-document atomic batch write", async () => {
      // Coordinator getDoc returns nextSequence = 4
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: "evt-100",
        data: () => ({
          eventId: "evt-100",
          capacity: 50,
          headSequence: 1,
          nextSequence: 4,
          waitlistCount: 3,
        }),
      });

      const result = await joinWaitlistBatch("evt-100", "usr-new", "apex-university");

      expect(mocks.writeBatch).toHaveBeenCalled();

      // 1. Member document created at sequence 4
      expect(mocks.mockBatch.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventWaitlistMembers/evt-100_usr-new" }),
        expect.objectContaining({
          id: "evt-100_usr-new",
          eventId: "evt-100",
          userId: "usr-new",
          campusId: "apex-university",
          sequenceNumber: 4,
          status: "waiting",
        })
      );

      // 2. Slot document created at sequence 4
      expect(mocks.mockBatch.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventWaitlistSlots/evt-100_4" }),
        expect.objectContaining({
          id: "evt-100_4",
          eventId: "evt-100",
          userId: "usr-new",
          sequenceNumber: 4,
          status: "waiting",
        })
      );

      // 3. Coordinator nextSequence + 1 and waitlistCount + 1
      expect(mocks.mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventCapacities/evt-100" }),
        expect.objectContaining({
          nextSequence: expect.objectContaining({ _methodName: "increment", delta: 1 }),
          waitlistCount: expect.objectContaining({ _methodName: "increment", delta: 1 }),
        })
      );

      expect(mocks.mockBatch.commit).toHaveBeenCalled();
      expect(result.sequenceNumber).toBe(4);
    });

    it("executes PW-5 Non-Head Withdrawal as a 3-document atomic batch write", async () => {
      const result = await withdrawNonHeadWaitlist("evt-100", "usr-mid", 7);

      expect(mocks.writeBatch).toHaveBeenCalled();

      // 1. Member document deleted
      expect(mocks.mockBatch.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventWaitlistMembers/evt-100_usr-mid" })
      );

      // 2. Slot marked withdrawn
      expect(mocks.mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventWaitlistSlots/evt-100_7" }),
        expect.objectContaining({
          status: WAITLIST_SLOT_STATUSES.WITHDRAWN,
        })
      );

      // 3. Coordinator waitlistCount decremented by -1
      expect(mocks.mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventCapacities/evt-100" }),
        expect.objectContaining({
          waitlistCount: expect.objectContaining({ _methodName: "increment", delta: -1 }),
        })
      );

      expect(mocks.mockBatch.commit).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("Backend Callable Function Integration Boundaries", () => {
    it("calls claimWaitlistOffer callable with correct payload", async () => {
      mocks.mockCallables.claimWaitlistOffer.mockResolvedValueOnce({
        data: { success: true, rsvpId: "evt-1_usr-1" },
      });

      const res = await claimWaitlistOffer({ eventId: "evt-1", slotSequence: 2 });
      expect(mocks.mockCallables.claimWaitlistOffer).toHaveBeenCalledWith({
        eventId: "evt-1",
        slotSequence: 2,
      });
      expect(res.success).toBe(true);
    });

    it("calls declineWaitlistOffer callable with correct payload", async () => {
      mocks.mockCallables.declineWaitlistOffer.mockResolvedValueOnce({
        data: { success: true, slotSequence: 2 },
      });

      const res = await declineWaitlistOffer({ eventId: "evt-1", slotSequence: 2 });
      expect(mocks.mockCallables.declineWaitlistOffer).toHaveBeenCalledWith({
        eventId: "evt-1",
        slotSequence: 2,
      });
      expect(res.success).toBe(true);
    });

    it("calls leaveWaitlist callable with correct payload", async () => {
      mocks.mockCallables.leaveWaitlist.mockResolvedValueOnce({
        data: { success: true },
      });

      const res = await leaveWaitlist({ eventId: "evt-1" });
      expect(mocks.mockCallables.leaveWaitlist).toHaveBeenCalledWith({
        eventId: "evt-1",
      });
      expect(res.success).toBe(true);
    });

    it("calls cancelRsvpWithPromotion callable with correct payload", async () => {
      mocks.mockCallables.cancelRsvpWithPromotion.mockResolvedValueOnce({
        data: { success: true, promotedSlotSequence: 5 },
      });

      const res = await cancelRsvpWithPromotion({ eventId: "evt-1" });
      expect(mocks.mockCallables.cancelRsvpWithPromotion).toHaveBeenCalledWith({
        eventId: "evt-1",
      });
      expect(res.promotedSlotSequence).toBe(5);
    });

    it("calls promoteWaitlistCandidates callable with correct payload", async () => {
      mocks.mockCallables.promoteWaitlistCandidates.mockResolvedValueOnce({
        data: { promotedCount: 2 },
      });

      const res = await promoteWaitlistCandidates({ eventId: "evt-1", maxScan: 10 });
      expect(mocks.mockCallables.promoteWaitlistCandidates).toHaveBeenCalledWith({
        eventId: "evt-1",
        maxScan: 10,
      });
      expect(res.promotedCount).toBe(2);
    });
  });
});
