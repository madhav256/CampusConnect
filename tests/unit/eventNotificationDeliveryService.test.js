import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DELIVERY_LEDGER_STATUSES,
} from "../../src/constants.js";

const mocks = vi.hoisted(() => {
  return {
    doc: vi.fn((_db, coll, id, ...rest) => {
      const fullPath = rest.length ? `${coll}/${id}/${rest.join("/")}` : `${coll}/${id}`;
      return {
        path: fullPath,
        id: rest.length ? rest[rest.length - 1] : id,
        collection: coll,
      };
    }),
    collection: vi.fn((_db, name) => ({ path: name, name })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    mockBatch: {
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(() => Promise.resolve()),
    },
    writeBatch: vi.fn(),
    query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
    where: vi.fn((field, op, val) => ({ type: "where", field, op, val })),
    orderBy: vi.fn((field) => ({ type: "orderBy", field })),
    startAfter: vi.fn((cursor) => ({ type: "startAfter", cursor })),
    limit: vi.fn((count) => ({ type: "limit", count })),
    documentId: vi.fn(() => "__name__"),
    serverTimestamp: vi.fn(() => ({ _methodName: "serverTimestamp" })),
    mockDb: { id: "mock-db" },
  };
});

mocks.writeBatch.mockImplementation(() => mocks.mockBatch);

vi.mock("../../src/firebase/config.js", () => ({
  auth: { currentUser: { uid: "admin-1" } },
  db: mocks.mockDb,
  isFirebaseConfigured: true,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  collection: mocks.collection,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  writeBatch: mocks.writeBatch,
  query: mocks.query,
  where: mocks.where,
  orderBy: mocks.orderBy,
  startAfter: mocks.startAfter,
  limit: mocks.limit,
  documentId: mocks.documentId,
  serverTimestamp: mocks.serverTimestamp,
}));

import {
  deliverCancellationNotifications,
  resumeCancellationDelivery,
  getDeliveryLedger,
  reconcileDeliveryCycle,
  deliveryLedgerDocRef,
} from "../../src/services/eventNotificationDeliveryService.js";

describe("Milestone 23.3 — Resumable Event Notification Delivery Service", () => {
  const eventId = "event-hackathon";
  const cycleId = "cycle_1234567890_abcdef";
  const campusId = "apex-university";
  const communityId = "apex-ai-club";
  const originalActorId = "original-canceller";
  const originalActorName = "Lead Organizer";
  const originalActorAvatar = "https://avatar.test/organizer.png";

  const defaultLedgerData = {
    id: eventId,
    eventId,
    cycleId,
    campusId,
    communityId,
    actorId: originalActorId,
    actorName: originalActorName,
    actorAvatar: originalActorAvatar,
    status: DELIVERY_LEDGER_STATUSES.PENDING,
    checkpointVersion: 0,
    lastProcessedRsvpId: null,
    processedCount: 0,
  };

  const defaultEventData = {
    id: eventId,
    title: "AI Hackathon",
    status: "cancelled",
    campusId,
    communityId,
    createdBy: originalActorId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockBatch.set.mockClear();
    mocks.mockBatch.update.mockClear();
    mocks.mockBatch.commit.mockClear();
    mocks.mockBatch.commit.mockResolvedValue();

    // Default: event exists and is cancelled
    mocks.getDoc.mockImplementation((ref) => {
      if (ref.path === `eventNotificationDeliveries/${eventId}`) {
        return Promise.resolve({
          exists: () => true,
          id: eventId,
          data: () => ({ ...defaultLedgerData }),
        });
      }
      if (ref.path === `events/${eventId}`) {
        return Promise.resolve({
          exists: () => true,
          id: eventId,
          data: () => ({ ...defaultEventData }),
        });
      }
      return Promise.resolve({ exists: () => false });
    });
  });

  function createMockRsvpDocs(count, startIndex = 1) {
    const docs = [];
    for (let i = startIndex; i < startIndex + count; i++) {
      const docId = `rsvp_doc_${String(i).padStart(3, "0")}`;
      const userId = `student_${i}`;
      docs.push({
        id: docId,
        data: () => ({
          id: docId,
          eventId,
          campusId,
          userId,
        }),
      });
    }
    return docs;
  }

  describe("getDeliveryLedger & deliveryLedgerDocRef", () => {
    it("returns document reference with deterministic path", () => {
      const ref = deliveryLedgerDocRef(eventId);
      expect(ref.path).toBe(`eventNotificationDeliveries/${eventId}`);
    });

    it("throws on missing or empty eventId", () => {
      expect(() => deliveryLedgerDocRef("")).toThrow("Event ID is required");
      expect(() => deliveryLedgerDocRef(null)).toThrow("Event ID is required");
    });

    it("reads and normalizes an existing delivery ledger", async () => {
      const ledger = await getDeliveryLedger(eventId);
      expect(ledger).toEqual(
        expect.objectContaining({
          id: eventId,
          eventId,
          cycleId,
          campusId,
          status: DELIVERY_LEDGER_STATUSES.PENDING,
          checkpointVersion: 0,
          processedCount: 0,
        })
      );
    });

    it("returns null when delivery ledger does not exist", async () => {
      mocks.getDoc.mockResolvedValueOnce({ exists: () => false });
      const ledger = await getDeliveryLedger("non-existent");
      expect(ledger).toBeNull();
    });
  });

  describe("Recipient Count Handlers: 0, 1, 8, 9, and Multi-Chunk", () => {
    it("handles zero attendees by immediately completing the ledger in 1 commit", async () => {
      mocks.getDocs.mockResolvedValueOnce({ docs: [] });

      const result = await deliverCancellationNotifications(eventId);

      expect(result.status).toBe(DELIVERY_LEDGER_STATUSES.COMPLETED);
      expect(result.processedCount).toBe(0);
      expect(result.checkpointVersion).toBe(1);
      expect(result.batchesCommitted).toBe(1);

      // Verify no notifications were written
      expect(mocks.mockBatch.set).not.toHaveBeenCalled();

      // Verify completion checkpoint update
      expect(mocks.mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: `eventNotificationDeliveries/${eventId}` }),
        expect.objectContaining({
          status: DELIVERY_LEDGER_STATUSES.COMPLETED,
          checkpointVersion: 1,
          processedCount: 0,
          lastProcessedRsvpId: null,
        })
      );
      expect(mocks.mockBatch.commit).toHaveBeenCalledTimes(1);
    });

    it("handles exactly 1 attendee (partial chunk) by writing notification and completing in 1 batch", async () => {
      const rsvpDocs = createMockRsvpDocs(1);
      mocks.getDocs.mockResolvedValueOnce({ docs: rsvpDocs });

      const result = await deliverCancellationNotifications(eventId);

      expect(result.status).toBe(DELIVERY_LEDGER_STATUSES.COMPLETED);
      expect(result.processedCount).toBe(1);
      expect(result.checkpointVersion).toBe(1);
      expect(result.batchesCommitted).toBe(1);

      // Notification written
      expect(mocks.mockBatch.set).toHaveBeenCalledTimes(1);
      expect(mocks.mockBatch.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: `users/student_1/notifications/cancel_${eventId}_${cycleId}` }),
        expect.objectContaining({
          id: `cancel_${eventId}_${cycleId}`,
          recipientId: "student_1",
          actorId: originalActorId,
          actorName: originalActorName,
          type: "event_cancelled",
          referenceId: eventId,
          cycleId,
          referenceTitle: "AI Hackathon",
          isRead: false,
        })
      );

      // Checkpoint updated to completed
      expect(mocks.mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: `eventNotificationDeliveries/${eventId}` }),
        expect.objectContaining({
          status: DELIVERY_LEDGER_STATUSES.COMPLETED,
          checkpointVersion: 1,
          processedCount: 1,
          lastProcessedRsvpId: rsvpDocs[0].id,
        })
      );
    });

    it("handles exactly 8 attendees (exact chunk) with chunk 1 in_progress followed by empty-query completion", async () => {
      const rsvpDocs = createMockRsvpDocs(8);

      // Query 1: returns exactly 8 docs (CHUNK_SIZE)
      mocks.getDocs.mockResolvedValueOnce({ docs: rsvpDocs });
      // Query 2: returns empty query (no more docs)
      mocks.getDocs.mockResolvedValueOnce({ docs: [] });

      const result = await deliverCancellationNotifications(eventId);

      expect(result.status).toBe(DELIVERY_LEDGER_STATUSES.COMPLETED);
      expect(result.processedCount).toBe(8);
      expect(result.checkpointVersion).toBe(2);
      expect(result.batchesCommitted).toBe(2);

      // 8 notifications written in batch 1
      expect(mocks.mockBatch.set).toHaveBeenCalledTimes(8);

      // Checkpoint 1: status is in_progress
      expect(mocks.mockBatch.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ path: `eventNotificationDeliveries/${eventId}` }),
        expect.objectContaining({
          status: DELIVERY_LEDGER_STATUSES.IN_PROGRESS,
          checkpointVersion: 1,
          processedCount: 8,
          lastProcessedRsvpId: rsvpDocs[7].id,
        })
      );

      // Checkpoint 2: status is completed
      expect(mocks.mockBatch.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ path: `eventNotificationDeliveries/${eventId}` }),
        expect.objectContaining({
          status: DELIVERY_LEDGER_STATUSES.COMPLETED,
          checkpointVersion: 2,
          processedCount: 8,
          lastProcessedRsvpId: rsvpDocs[7].id,
        })
      );
      expect(mocks.mockBatch.commit).toHaveBeenCalledTimes(2);
    });

    it("handles 9 attendees across 2 batches (8 full + 1 partial)", async () => {
      const chunk1 = createMockRsvpDocs(8, 1);
      const chunk2 = createMockRsvpDocs(1, 9);

      mocks.getDocs.mockResolvedValueOnce({ docs: chunk1 });
      mocks.getDocs.mockResolvedValueOnce({ docs: chunk2 });

      const result = await deliverCancellationNotifications(eventId);

      expect(result.status).toBe(DELIVERY_LEDGER_STATUSES.COMPLETED);
      expect(result.processedCount).toBe(9);
      expect(result.checkpointVersion).toBe(2);
      expect(result.batchesCommitted).toBe(2);

      // Total 9 notifications written
      expect(mocks.mockBatch.set).toHaveBeenCalledTimes(9);

      // Batch 1: in_progress
      expect(mocks.mockBatch.update).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        expect.objectContaining({
          status: DELIVERY_LEDGER_STATUSES.IN_PROGRESS,
          checkpointVersion: 1,
          processedCount: 8,
          lastProcessedRsvpId: chunk1[7].id,
        })
      );

      // Batch 2: completed (since chunk2.length < 8)
      expect(mocks.mockBatch.update).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        expect.objectContaining({
          status: DELIVERY_LEDGER_STATUSES.COMPLETED,
          checkpointVersion: 2,
          processedCount: 9,
          lastProcessedRsvpId: chunk2[0].id,
        })
      );
    });

    it("handles multi-chunk total divisible by chunk size (16 attendees) ending in empty-query check", async () => {
      const chunk1 = createMockRsvpDocs(8, 1);
      const chunk2 = createMockRsvpDocs(8, 9);

      mocks.getDocs.mockResolvedValueOnce({ docs: chunk1 });
      mocks.getDocs.mockResolvedValueOnce({ docs: chunk2 });
      mocks.getDocs.mockResolvedValueOnce({ docs: [] });

      const result = await deliverCancellationNotifications(eventId);

      expect(result.status).toBe(DELIVERY_LEDGER_STATUSES.COMPLETED);
      expect(result.processedCount).toBe(16);
      expect(result.checkpointVersion).toBe(3);
      expect(result.batchesCommitted).toBe(3);
      expect(mocks.mockBatch.set).toHaveBeenCalledTimes(16);
    });
  });

  describe("Resumption, Concurrent Workers & Error Reconciliation", () => {
    it("resumes from persisted checkpoint cursor without reprocessing earlier recipients", async () => {
      // Ledger is already at checkpointVersion 1 with lastProcessedRsvpId = rsvp_doc_008
      mocks.getDoc.mockImplementation((ref) => {
        if (ref.path === `eventNotificationDeliveries/${eventId}`) {
          return Promise.resolve({
            exists: () => true,
            id: eventId,
            data: () => ({
              ...defaultLedgerData,
              status: DELIVERY_LEDGER_STATUSES.IN_PROGRESS,
              checkpointVersion: 1,
              lastProcessedRsvpId: "rsvp_doc_008",
              processedCount: 8,
            }),
          });
        }
        if (ref.path === `events/${eventId}`) {
          return Promise.resolve({
            exists: () => true,
            id: eventId,
            data: () => ({ ...defaultEventData }),
          });
        }
        return Promise.resolve({ exists: () => false });
      });

      const remainingDocs = createMockRsvpDocs(3, 9);
      mocks.getDocs.mockResolvedValueOnce({ docs: remainingDocs });

      const result = await resumeCancellationDelivery(eventId);

      expect(result.status).toBe(DELIVERY_LEDGER_STATUSES.COMPLETED);
      expect(result.processedCount).toBe(11);
      expect(result.checkpointVersion).toBe(2);

      // Verify query used startAfter with persisted cursor
      expect(mocks.startAfter).toHaveBeenCalledWith("rsvp_doc_008");
      // Only 3 notifications created
      expect(mocks.mockBatch.set).toHaveBeenCalledTimes(3);
    });

    it("preserves original actor attribution when a different admin resumes delivery", async () => {
      // Current user is admin-1, but ledger records originalActorId
      const rsvpDocs = createMockRsvpDocs(1);
      mocks.getDocs.mockResolvedValueOnce({ docs: rsvpDocs });

      await deliverCancellationNotifications(eventId);

      expect(mocks.mockBatch.set).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          actorId: originalActorId,
          actorName: originalActorName,
          actorAvatar: originalActorAvatar,
        })
      );
    });

    it("reconciles lost acknowledgement when batch committed on server before client error", async () => {
      const chunk1 = createMockRsvpDocs(8, 1);
      const chunk2 = createMockRsvpDocs(2, 9);

      mocks.getDocs.mockResolvedValueOnce({ docs: chunk1 });
      // Batch 1 commit throws network error on client
      mocks.mockBatch.commit.mockRejectedValueOnce(new Error("Network timeout"));

      // But when client refreshes ledger, it discovers checkpointVersion advanced to 1!
      let ledgerCallCount = 0;
      mocks.getDoc.mockImplementation((ref) => {
        if (ref.path === `eventNotificationDeliveries/${eventId}`) {
          ledgerCallCount++;
          if (ledgerCallCount > 1) {
            // Refreshed ledger reflects committed version
            return Promise.resolve({
              exists: () => true,
              id: eventId,
              data: () => ({
                ...defaultLedgerData,
                status: DELIVERY_LEDGER_STATUSES.IN_PROGRESS,
                checkpointVersion: 1,
                lastProcessedRsvpId: chunk1[7].id,
                processedCount: 8,
              }),
            });
          }
          return Promise.resolve({
            exists: () => true,
            id: eventId,
            data: () => ({ ...defaultLedgerData }),
          });
        }
        return Promise.resolve({
          exists: () => true,
          id: eventId,
          data: () => ({ ...defaultEventData }),
        });
      });

      // Next query returns chunk 2
      mocks.getDocs.mockResolvedValueOnce({ docs: chunk2 });
      mocks.mockBatch.commit.mockResolvedValueOnce();

      const result = await deliverCancellationNotifications(eventId);

      expect(result.status).toBe(DELIVERY_LEDGER_STATUSES.COMPLETED);
      expect(result.processedCount).toBe(10);
      expect(result.checkpointVersion).toBe(2);
    });

    it("halts delivery when event has been republished or cycle is superseded", async () => {
      mocks.getDoc.mockImplementation((ref) => {
        if (ref.path === `eventNotificationDeliveries/${eventId}`) {
          return Promise.resolve({
            exists: () => true,
            id: eventId,
            data: () => ({
              ...defaultLedgerData,
              status: DELIVERY_LEDGER_STATUSES.SUPERSEDED,
            }),
          });
        }
        return Promise.resolve({
          exists: () => true,
          id: eventId,
          data: () => ({ ...defaultEventData, status: "published" }),
        });
      });

      const result = await deliverCancellationNotifications(eventId);

      expect(result.status).toBe(DELIVERY_LEDGER_STATUSES.SUPERSEDED);
      expect(mocks.getDocs).not.toHaveBeenCalled();
      expect(mocks.mockBatch.commit).not.toHaveBeenCalled();
    });

    it("halts delivery when event has been hard-deleted", async () => {
      mocks.getDoc.mockImplementation((ref) => {
        if (ref.path === `eventNotificationDeliveries/${eventId}`) {
          return Promise.resolve({
            exists: () => true,
            id: eventId,
            data: () => ({ ...defaultLedgerData }),
          });
        }
        // Event does not exist
        return Promise.resolve({ exists: () => false });
      });

      const result = await deliverCancellationNotifications(eventId);

      expect(result.status).toBe("aborted");
      expect(result.message).toContain("Parent event document does not exist");
      expect(mocks.getDocs).not.toHaveBeenCalled();
    });
  });

  describe("reconcileDeliveryCycle", () => {
    it("reports terminal status for completed ledger", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: eventId,
        data: () => ({ ...defaultLedgerData, status: DELIVERY_LEDGER_STATUSES.COMPLETED }),
      });

      const res = await reconcileDeliveryCycle(eventId);
      expect(res.isTerminal).toBe(true);
      expect(res.status).toBe(DELIVERY_LEDGER_STATUSES.COMPLETED);
    });

    it("reports terminal status when parent event is published", async () => {
      mocks.getDoc.mockImplementation((ref) => {
        if (ref.path === `eventNotificationDeliveries/${eventId}`) {
          return Promise.resolve({
            exists: () => true,
            id: eventId,
            data: () => ({ ...defaultLedgerData, status: DELIVERY_LEDGER_STATUSES.IN_PROGRESS }),
          });
        }
        return Promise.resolve({
          exists: () => true,
          id: eventId,
          data: () => ({ ...defaultEventData, status: "published" }),
        });
      });

      const res = await reconcileDeliveryCycle(eventId);
      expect(res.isTerminal).toBe(true);
      expect(res.status).toBe("event_republished");
    });
  });
});
