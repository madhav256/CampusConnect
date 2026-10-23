/**
 * Milestone 24 — Unit 24.3 / Section 10: Migration Tooling Tests
 *
 * Unit tests for migrateEventToCapped:
 * 1. Preflight validation & non-existent / already-capped checks
 * 2. Dry-run evaluations
 * 3. Phase 1 Lock & Phase 2 Over-capacity rollback when N > cap
 * 4. Phase 3 Atomic commit & Phase 4 parity read-back when N <= cap
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { migrateEventToCapped } from "../../scripts/migrateUncappedToCapped.js";

describe("Milestone 24 — Unit 24.3 / Section 10: Migration Tooling", () => {
  let mockEvent;
  let mockCoordinator;
  let mockRsvps;
  let mockFirestore;
  let mockBatch;

  beforeEach(() => {
    mockEvent = {
      id: "evt-test-1",
      campusId: "apex-university",
      title: "Test Orientation",
      capacity: null,
      confirmedCount: 5,
    };
    mockCoordinator = null;
    mockRsvps = [
      { id: "evt-test-1_u1" },
      { id: "evt-test-1_u2" },
      { id: "evt-test-1_u3" },
      { id: "evt-test-1_u4" },
      { id: "evt-test-1_u5" },
    ];

    const isDelete = (val) => Boolean(val && (val.constructor?.name === "DeleteTransform" || val?._methodName === "delete" || (typeof val === "object" && String(val).includes("DeleteTransform"))));

    const applyUpdates = (target, updates) => {
      for (const [key, val] of Object.entries(updates)) {
        if (isDelete(val)) {
          delete target[key];
        } else {
          target[key] = val;
        }
      }
    };

    mockBatch = {
      update: vi.fn((_ref, data) => {
        applyUpdates(mockEvent, data);
      }),
      set: vi.fn((_ref, data) => {
        mockCoordinator = { ...data };
      }),
      commit: vi.fn(async () => {}),
    };

    mockFirestore = {
      collection: vi.fn((collName) => {
        if (collName === "events") {
          return {
            doc: vi.fn((docId) => ({
              path: `events/${docId}`,
              get: vi.fn(async () => ({
                exists: Boolean(mockEvent && mockEvent.id === docId),
                data: () => ({ ...mockEvent }),
              })),
              update: vi.fn(async (patch) => {
                if (!mockEvent) throw new Error("Document not found");
                applyUpdates(mockEvent, patch);
              }),
            })),
          };
        }
        if (collName === "eventCapacities") {
          return {
            doc: vi.fn((docId) => ({
              path: `eventCapacities/${docId}`,
              get: vi.fn(async () => ({
                exists: Boolean(mockCoordinator && mockCoordinator.id === docId),
                data: () => (mockCoordinator ? { ...mockCoordinator } : null),
              })),
            })),
          };
        }
        if (collName === "eventRsvps") {
          return {
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                size: mockRsvps.length,
                docs: mockRsvps.map((r) => ({ id: r.id })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected collection: ${collName}`);
      }),
      batch: vi.fn(() => mockBatch),
    };
  });

  describe("Parameter Validation & Preflight", () => {
    it("rejects invalid eventId or targetCapacity", async () => {
      await expect(
        migrateEventToCapped({ eventId: "", targetCapacity: 10, firestoreInstance: mockFirestore })
      ).rejects.toThrow("eventId must be a non-empty string");

      await expect(
        migrateEventToCapped({ eventId: "evt-1", targetCapacity: 0, firestoreInstance: mockFirestore })
      ).rejects.toThrow("targetCapacity must be a positive integer");

      await expect(
        migrateEventToCapped({ eventId: "evt-1", targetCapacity: -5, firestoreInstance: mockFirestore })
      ).rejects.toThrow("targetCapacity must be a positive integer");
    });

    it("fails preflight if event does not exist", async () => {
      mockEvent = null;
      const res = await migrateEventToCapped({
        eventId: "evt-nonexistent",
        targetCapacity: 10,
        firestoreInstance: mockFirestore,
      });

      expect(res.success).toBe(false);
      expect(res.phase).toBe("preflight");
      expect(res.error).toContain("does not exist");
    });

    it("fails preflight if event already has an active coordinator", async () => {
      mockCoordinator = {
        id: "evt-test-1",
        capacity: 20,
        confirmedCount: 5,
      };

      const res = await migrateEventToCapped({
        eventId: "evt-test-1",
        targetCapacity: 20,
        firestoreInstance: mockFirestore,
      });

      expect(res.success).toBe(false);
      expect(res.phase).toBe("preflight");
      expect(res.error).toContain("already has an active coordinator");
    });
  });

  describe("Dry-run assessment", () => {
    it("reports successful assessment when RSVPs fit within target capacity", async () => {
      const res = await migrateEventToCapped({
        eventId: "evt-test-1",
        targetCapacity: 10, // 5 RSVPs <= 10 cap
        dryRun: true,
        firestoreInstance: mockFirestore,
      });

      expect(res.success).toBe(true);
      expect(res.phase).toBe("dry_run_assessment");
      expect(res.confirmedCount).toBe(5);
      expect(mockBatch.commit).not.toHaveBeenCalled();
    });

    it("reports failed assessment when RSVPs exceed target capacity", async () => {
      const res = await migrateEventToCapped({
        eventId: "evt-test-1",
        targetCapacity: 3, // 5 RSVPs > 3 cap
        dryRun: true,
        firestoreInstance: mockFirestore,
      });

      expect(res.success).toBe(false);
      expect(res.phase).toBe("dry_run_assessment");
      expect(res.confirmedCount).toBe(5);
      expect(mockBatch.commit).not.toHaveBeenCalled();
    });
  });

  describe("Live Migration Lifecycle & Over-capacity Rollback", () => {
    it("rolls back Phase 1 lock when authoritative RSVP count exceeds target capacity", async () => {
      const res = await migrateEventToCapped({
        eventId: "evt-test-1",
        targetCapacity: 4, // 5 RSVPs > 4 cap
        dryRun: false,
        firestoreInstance: mockFirestore,
      });

      expect(res.success).toBe(false);
      expect(res.phase).toBe("phase_2_capacity_check");
      expect(res.error).toContain("Rollback triggered");
      // Verify registrationStatus was cleared
      expect(mockEvent.registrationStatus).toBeUndefined();
      expect(mockBatch.commit).not.toHaveBeenCalled();
    });

    it("commits atomic transition and passes Phase 4 parity read-back when RSVPs fit capacity", async () => {
      const res = await migrateEventToCapped({
        eventId: "evt-test-1",
        targetCapacity: 10, // 5 RSVPs <= 10 cap
        dryRun: false,
        firestoreInstance: mockFirestore,
      });

      expect(res.success).toBe(true);
      expect(res.phase).toBe("completed");
      expect(res.coordinatorCreated).toBe(true);
      expect(res.confirmedCount).toBe(5);
      expect(res.targetCapacity).toBe(10);

      // Verify batch commit was called
      expect(mockBatch.commit).toHaveBeenCalled();

      // Verify coordinator was created with initial state
      expect(mockCoordinator).not.toBeNull();
      expect(mockCoordinator.confirmedCount).toBe(5);
      expect(mockCoordinator.headSequence).toBe(1);
      expect(mockCoordinator.nextSequence).toBe(1);
      expect(mockCoordinator.waitlistCount).toBe(0);

      // Verify event was updated with capacity and lock cleared
      expect(mockEvent.capacity).toBe(10);
      expect(mockEvent.registrationStatus).toBeUndefined();
    });
  });
});
