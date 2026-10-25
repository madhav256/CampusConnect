/**
 * Milestone 24 — Unit 24.3 / Section 10: Migration Tooling Tests
 *
 * Unit tests for migrateEventToCapped:
 * 1. Preflight validation & non-existent / already-capped checks
 * 2. Dry-run evaluations
 * 3. Phase 1 Lock & Phase 2 Over-capacity rollback when N > cap
 * 4. Phase 3 Atomic commit & Phase 4 parity read-back when N <= cap
 */

import process from "node:process";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { migrateEventToCapped } from "../../scripts/migrateUncappedToCapped.js";
import * as adminClient from "../../scripts/adminClient.mjs";

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

  describe("Default Admin Client Resolution & Fail-Closed Guard", () => {
    it("exports getAdminDb from adminClient.mjs and fails closed when invoked without FIRESTORE_EMULATOR_HOST", async () => {
      expect(typeof adminClient.getAdminDb).toBe("function");
      expect(typeof adminClient.getAdminApp).toBe("function");

      const prevEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
      const prevAllowProd = process.env.ALLOW_PRODUCTION_ADMIN_ACCESS;
      try {
        delete process.env.FIRESTORE_EMULATOR_HOST;
        delete process.env.ALLOW_PRODUCTION_ADMIN_ACCESS;

        await expect(
          migrateEventToCapped({
            eventId: "evt-test-1",
            targetCapacity: 10,
            dryRun: true,
          })
        ).rejects.toThrow(/FAIL-CLOSED GUARD/);
      } finally {
        if (prevEmulatorHost !== undefined) {
          process.env.FIRESTORE_EMULATOR_HOST = prevEmulatorHost;
        }
        if (prevAllowProd !== undefined) {
          process.env.ALLOW_PRODUCTION_ADMIN_ACCESS = prevAllowProd;
        }
      }
    });

    it("refuses emulator initialization if project ID points to production campusconnect-cf191", () => {
      const prevEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
      const prevGcloudProject = process.env.GCLOUD_PROJECT;
      try {
        process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
        process.env.GCLOUD_PROJECT = adminClient.PRODUCTION_PROJECT_ID;

        expect(() => adminClient.getAdminApp()).toThrow(/FAIL-CLOSED GUARD/);
      } finally {
        if (prevEmulatorHost === undefined) {
          delete process.env.FIRESTORE_EMULATOR_HOST;
        } else {
          process.env.FIRESTORE_EMULATOR_HOST = prevEmulatorHost;
        }
        if (prevGcloudProject === undefined) {
          delete process.env.GCLOUD_PROJECT;
        } else {
          process.env.GCLOUD_PROJECT = prevGcloudProject;
        }
      }
    });

    it("correctly distinguishes deployed Cloud Functions runtime from local/test environments", () => {
      expect(
        adminClient.isDeployedFunctionsRuntime({ K_SERVICE: "claimWaitlistOffer" })
      ).toBe(true);
      expect(
        adminClient.isDeployedFunctionsRuntime({ FUNCTION_TARGET: "claimWaitlistOffer" })
      ).toBe(true);
      expect(
        adminClient.isDeployedFunctionsRuntime({
          K_SERVICE: "claimWaitlistOffer",
          FUNCTIONS_EMULATOR: "true",
        })
      ).toBe(false);
      expect(
        adminClient.isDeployedFunctionsRuntime({
          K_SERVICE: "claimWaitlistOffer",
          FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
        })
      ).toBe(false);
      expect(
        adminClient.isDeployedFunctionsRuntime({
          K_SERVICE: "claimWaitlistOffer",
          VITEST: "true",
        })
      ).toBe(false);
    });
  });
});
