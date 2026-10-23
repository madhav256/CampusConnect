/**
 * Milestone 24 — Unit 24.2: Event Capacity Client Service Tests
 *
 * Tests for event capacity coordinator queries, reactive subscriptions,
 * initialization, atomic Direct Admission (PW-1) batch, atomic Direct Cancellation (PW-3) batch,
 * and capacity metrics calculations.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const mockBatch = {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
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
    mockDb: { id: "mock-db" },
  };
});

vi.mock("../../src/firebase/config", () => ({
  db: mocks.mockDb,
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

import {
  eventCapacityDocRef,
  getEventCapacity,
  subscribeToEventCapacity,
  initializeEventCapacityCoordinator,
  directAdmissionBatch,
  directCancellationWithoutWaitlistBatch,
  getEventCapacityMetrics,
} from "../../src/services/eventCapacityService.js";

describe("Milestone 24 — Unit 24.2: Event Capacity Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Document references & queries", () => {
    it("generates correct document reference under eventCapacities collection", () => {
      const ref = eventCapacityDocRef("evt-123");
      expect(ref.path).toBe("eventCapacities/evt-123");
      expect(ref.id).toBe("evt-123");
    });

    it("fetches and normalizes event capacity document", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: "evt-123",
        data: () => ({
          eventId: "evt-123",
          capacity: 50,
          confirmedCount: 10,
          offeredCount: 0,
          waitlistCount: 0,
          headSequence: 1,
          nextSequence: 1,
        }),
      });

      const result = await getEventCapacity("evt-123");
      expect(result).not.toBeNull();
      expect(result.eventId).toBe("evt-123");
      expect(result.capacity).toBe(50);
      expect(result.confirmedCount).toBe(10);
    });

    it("returns null when event capacity document does not exist", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const result = await getEventCapacity("evt-nonexistent");
      expect(result).toBeNull();
    });

    it("subscribes to event capacity updates reactively", () => {
      const unsubscribeMock = vi.fn();
      mocks.onSnapshot.mockImplementationOnce((_ref, onNext) => {
        onNext({
          exists: () => true,
          id: "evt-123",
          data: () => ({
            eventId: "evt-123",
            capacity: 25,
            confirmedCount: 5,
            headSequence: 1,
            nextSequence: 1,
          }),
        });
        return unsubscribeMock;
      });

      const callback = vi.fn();
      const unsub = subscribeToEventCapacity("evt-123", callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-123",
          capacity: 25,
          confirmedCount: 5,
        })
      );
      expect(unsub).toBe(unsubscribeMock);
    });
  });

  describe("Coordinator Initialization", () => {
    it("initializes coordinator document with zero counters and sequence 1", async () => {
      mocks.setDoc.mockResolvedValueOnce();

      const result = await initializeEventCapacityCoordinator("evt-new", "apex-university", 0);

      expect(mocks.doc).toHaveBeenCalledWith(mocks.mockDb, "eventCapacities", "evt-new");
      expect(mocks.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: "evt-new",
          eventId: "evt-new",
          campusId: "apex-university",
          confirmedCount: 0,
          offeredCount: 0,
          waitlistCount: 0,
          headSequence: 1,
          nextSequence: 1,
        })
      );
      expect(result.confirmedCount).toBe(0);
      expect(result.headSequence).toBe(1);
      expect(result.nextSequence).toBe(1);
    });

    it("rejects initialization with invalid capacity or missing parameters", async () => {
      await expect(initializeEventCapacityCoordinator("", "apex-university")).rejects.toThrow(
        "eventId must be a non-empty string"
      );
      await expect(initializeEventCapacityCoordinator("evt-1", "")).rejects.toThrow(
        "campusId must be a non-empty string"
      );
    });
  });

  describe("Atomic Batches (PW-1 Direct Admission & PW-3 Direct Cancellation)", () => {
    it("executes PW-1 Direct Admission as an atomic batch write", async () => {
      const result = await directAdmissionBatch("evt-100", "usr-1", "apex-university");

      expect(mocks.writeBatch).toHaveBeenCalled();
      // 1. Coordinator confirmedCount + 1
      expect(mocks.mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventCapacities/evt-100" }),
        expect.objectContaining({
          confirmedCount: expect.objectContaining({ _methodName: "increment", delta: 1 }),
        })
      );
      // 2. RSVP document created
      expect(mocks.mockBatch.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventRsvps/evt-100_usr-1" }),
        expect.objectContaining({
          id: "evt-100_usr-1",
          eventId: "evt-100",
          userId: "usr-1",
          campusId: "apex-university",
        })
      );
      expect(mocks.mockBatch.commit).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.rsvpId).toBe("evt-100_usr-1");
    });

    it("executes PW-3 Direct Cancellation without waitlist as an atomic batch write", async () => {
      const result = await directCancellationWithoutWaitlistBatch("evt-100", "usr-1");

      expect(mocks.writeBatch).toHaveBeenCalled();
      // 1. Coordinator confirmedCount - 1
      expect(mocks.mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventCapacities/evt-100" }),
        expect.objectContaining({
          confirmedCount: expect.objectContaining({ _methodName: "increment", delta: -1 }),
        })
      );
      // 2. RSVP document deleted
      expect(mocks.mockBatch.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventRsvps/evt-100_usr-1" })
      );
      expect(mocks.mockBatch.commit).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("Metrics Calculation", () => {
    it("computes accurate metrics for uncapped events", () => {
      const event = { id: "evt-uncapped", capacity: null, confirmedCount: 15 };
      const metrics = getEventCapacityMetrics(event, null);

      expect(metrics.isCapped).toBe(false);
      expect(metrics.isFull).toBe(false);
      expect(metrics.canDirectRsvp).toBe(true);
    });

    it("computes accurate metrics for capped coordinated events", () => {
      const event = { id: "evt-capped", capacity: 20, confirmedCount: 18 };
      const coordinator = {
        capacity: 20,
        confirmedCount: 18,
        offeredCount: 1,
        waitlistCount: 3,
      };

      const metrics = getEventCapacityMetrics(event, coordinator);
      expect(metrics.isCapped).toBe(true);
      expect(metrics.capacity).toBe(20);
      expect(metrics.confirmedCount).toBe(18);
      expect(metrics.offeredCount).toBe(1);
      expect(metrics.waitlistCount).toBe(3);
      expect(metrics.allocatedSeats).toBe(19); // 18 + 1
      expect(metrics.availableSeats).toBe(1); // 20 - 19
      expect(metrics.isFull).toBe(false);
      expect(metrics.canDirectRsvp).toBe(false); // waitlistCount > 0 blocks direct RSVP!
    });
  });
});
