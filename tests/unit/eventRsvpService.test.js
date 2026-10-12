import { describe, expect, it, vi, beforeEach } from "vitest";
import { APEX_CAMPUS_ID } from "../../src/constants.js";
import {
  EVENT_RSVPS,
  EVENT_RSVP_LIST,
} from "../../src/data/eventRsvps.js";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((_db, coll, id) => ({
    path: `${coll}/${id}`,
    id,
    collection: coll,
  })),
  collection: vi.fn((_db, name) => ({ path: name, name })),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  where: vi.fn((field, op, val) => ({ type: "where", field, op, val })),
  limit: vi.fn((count) => ({ type: "limit", count })),
  serverTimestamp: vi.fn(() => ({ _methodName: "serverTimestamp" })),
  mockDb: { id: "mock-db" },
}));

vi.mock("../../src/firebase/config", () => ({
  db: mocks.mockDb,
  isFirebaseConfigured: true,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  collection: mocks.collection,
  deleteDoc: mocks.deleteDoc,
  setDoc: mocks.setDoc,
  onSnapshot: mocks.onSnapshot,
  query: mocks.query,
  where: mocks.where,
  limit: mocks.limit,
  serverTimestamp: mocks.serverTimestamp,
}));

import {
  eventRsvpDocRef,
  eventRsvpsCollectionRef,
  normalizeTimestamp,
  normalizeEventRsvp,
  subscribeToMyEventRsvp,
  subscribeToEventAttendees,
  subscribeToMyRsvps,
  createEventRsvp,
  deleteEventRsvp,
} from "../../src/services/eventRsvpService.js";

describe("Milestone 21 — Unit 21.3: Event RSVP Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Reference Helpers & Schema Normalization", () => {
    it("eventRsvpDocRef returns deterministic document reference for valid IDs", () => {
      const ref = eventRsvpDocRef("event-123", "user-456");
      expect(ref.path).toBe("eventRsvps/event-123_user-456");
      expect(ref.id).toBe("event-123_user-456");
      expect(mocks.doc).toHaveBeenCalledWith(
        mocks.mockDb,
        "eventRsvps",
        "event-123_user-456"
      );
    });

    it("eventRsvpDocRef throws if eventId or userId is missing or invalid", () => {
      expect(() => eventRsvpDocRef("", "user-1")).toThrow();
      expect(() => eventRsvpDocRef("event-1", "")).toThrow();
      expect(() => eventRsvpDocRef(null, "user-1")).toThrow();
      expect(() => eventRsvpDocRef("event-1", null)).toThrow();
    });

    it("eventRsvpsCollectionRef returns reference to root eventRsvps collection", () => {
      const colRef = eventRsvpsCollectionRef();
      expect(colRef.path).toBe("eventRsvps");
      expect(mocks.collection).toHaveBeenCalledWith(mocks.mockDb, "eventRsvps");
    });

    it("normalizeTimestamp correctly converts Timestamps, Dates, strings, numbers, and null", () => {
      const testDate = new Date("2026-10-15T12:00:00.000Z");
      const mockTimestamp = {
        toDate: () => testDate,
        toMillis: () => testDate.getTime(),
      };

      expect(normalizeTimestamp(mockTimestamp)).toBe(testDate);
      expect(normalizeTimestamp(testDate)).toBe(testDate);
      expect(normalizeTimestamp("2026-10-15T12:00:00.000Z")?.toISOString()).toBe(
        testDate.toISOString()
      );
      expect(normalizeTimestamp(testDate.getTime())?.toISOString()).toBe(
        testDate.toISOString()
      );
      expect(normalizeTimestamp(null)).toBeNull();
      expect(normalizeTimestamp(undefined)).toBeNull();
      expect(normalizeTimestamp("invalid-date-format")).toBeNull();
      expect(normalizeTimestamp(new Date("invalid"))).toBeNull();
    });

    it("normalizeEventRsvp normalizes all 5 locked fields and excludes extra fields", () => {
      const rawData = {
        id: "e1_u1",
        eventId: "e1",
        campusId: APEX_CAMPUS_ID,
        userId: "u1",
        createdAt: new Date("2026-10-10T10:00:00.000Z"),
        // Extra extraneous fields that must not be in the normalized contract:
        status: "going",
        notes: "bringing snacks",
        checkIn: true,
      };

      const normalized = normalizeEventRsvp("e1_u1", rawData);
      expect(normalized).toEqual({
        id: "e1_u1",
        eventId: "e1",
        campusId: APEX_CAMPUS_ID,
        userId: "u1",
        createdAt: new Date("2026-10-10T10:00:00.000Z"),
      });

      expect(Object.keys(normalized)).toEqual([
        "id",
        "eventId",
        "campusId",
        "userId",
        "createdAt",
      ]);
    });

    it("normalizeEventRsvp supports snapshot-like objects and returns null on empty data", () => {
      const mockSnap = {
        id: "snap-id",
        data: () => ({
          eventId: "e1",
          campusId: APEX_CAMPUS_ID,
          userId: "u1",
          createdAt: "2026-10-10T10:00:00.000Z",
        }),
      };

      const normalized = normalizeEventRsvp(mockSnap);
      expect(normalized?.id).toBe("snap-id");
      expect(normalized?.eventId).toBe("e1");
      expect(normalized?.createdAt).toBeInstanceOf(Date);

      expect(normalizeEventRsvp(null)).toBeNull();
      expect(normalizeEventRsvp(undefined)).toBeNull();
      expect(normalizeEventRsvp("some-id", null)).toBeNull();
    });
  });

  describe("Q1: subscribeToMyEventRsvp", () => {
    it("subscribes to deterministic document path and emits normalized RSVP when exists", () => {
      let snapshotCallback;
      mocks.onSnapshot.mockImplementation((_ref, cb) => {
        snapshotCallback = cb;
        return vi.fn();
      });

      const cb = vi.fn();
      const onError = vi.fn();
      const unsubscribe = subscribeToMyEventRsvp("event-1", "user-1", cb, onError);

      expect(mocks.doc).toHaveBeenCalledWith(
        mocks.mockDb,
        "eventRsvps",
        "event-1_user-1"
      );
      expect(typeof unsubscribe).toBe("function");

      const mockSnap = {
        id: "event-1_user-1",
        exists: () => true,
        data: () => ({
          eventId: "event-1",
          campusId: APEX_CAMPUS_ID,
          userId: "user-1",
          createdAt: "2026-10-10T10:00:00.000Z",
        }),
      };

      snapshotCallback(mockSnap);
      expect(cb).toHaveBeenCalledWith({
        id: "event-1_user-1",
        eventId: "event-1",
        campusId: APEX_CAMPUS_ID,
        userId: "user-1",
        createdAt: expect.any(Date),
      });
      expect(onError).not.toHaveBeenCalled();
    });

    it("emits null when document snapshot does not exist (not going)", () => {
      let snapshotCallback;
      mocks.onSnapshot.mockImplementation((_ref, cb) => {
        snapshotCallback = cb;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToMyEventRsvp("event-1", "user-1", cb);

      const mockSnap = {
        id: "event-1_user-1",
        exists: () => false,
        data: () => null,
      };

      snapshotCallback(mockSnap);
      expect(cb).toHaveBeenCalledWith(null);
    });

    it("passes Firestore errors to onError callback", () => {
      let errorCallback;
      mocks.onSnapshot.mockImplementation((_ref, _cb, errCb) => {
        errorCallback = errCb;
        return vi.fn();
      });

      const cb = vi.fn();
      const onError = vi.fn();
      subscribeToMyEventRsvp("event-1", "user-1", cb, onError);

      const error = new Error("Permission denied");
      errorCallback(error);

      expect(onError).toHaveBeenCalledWith(error);
      expect(cb).not.toHaveBeenCalled();
    });

    it("safely handles missing or invalid arguments as a no-op", () => {
      const cb = vi.fn();
      const unsub = subscribeToMyEventRsvp("", "user-1", cb);
      expect(typeof unsub).toBe("function");
      expect(cb).toHaveBeenCalledWith(null);
      expect(mocks.onSnapshot).not.toHaveBeenCalled();

      const unsub2 = subscribeToMyEventRsvp("event-1", null, cb);
      expect(typeof unsub2).toBe("function");
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
    });

    it("REGRESSION: proves no fixture fallback occurs on empty snapshot or error", () => {
      let snapshotCallback;
      let errorCallback;
      mocks.onSnapshot.mockImplementation((_ref, cb, errCb) => {
        snapshotCallback = cb;
        errorCallback = errCb;
        return vi.fn();
      });

      const cb = vi.fn();
      const onError = vi.fn();

      // Use IDs that match existing fixtures in src/data/eventRsvps.js
      const targetFixture = EVENT_RSVP_LIST[0];
      subscribeToMyEventRsvp(
        targetFixture.eventId,
        targetFixture.userId,
        cb,
        onError
      );

      // Snapshot does not exist in Firestore
      snapshotCallback({
        id: targetFixture.id,
        exists: () => false,
        data: () => null,
      });

      expect(cb).toHaveBeenCalledWith(null);
      expect(cb).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: targetFixture.id })
      );
      expect(cb).not.toHaveBeenCalledWith(EVENT_RSVPS[targetFixture.id]);

      // Error event
      errorCallback(new Error("Network offline"));
      expect(onError).toHaveBeenCalled();
      // Should not have emitted any fixture to cb
      expect(cb).toHaveBeenCalledTimes(1); // Only the initial null
    });
  });

  describe("Q2: subscribeToMyRsvps", () => {
    it("subscribes with exact userId, campusId, and limit(50) constraints", () => {
      let snapshotCallback;
      mocks.onSnapshot.mockImplementation((_q, cb) => {
        snapshotCallback = cb;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToMyRsvps("user-1", APEX_CAMPUS_ID, cb);

      expect(mocks.collection).toHaveBeenCalledWith(mocks.mockDb, "eventRsvps");
      expect(mocks.query).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventRsvps" }),
        { type: "where", field: "userId", op: "==", val: "user-1" },
        { type: "where", field: "campusId", op: "==", val: APEX_CAMPUS_ID },
        { type: "limit", count: 50 }
      );

      const mockSnap = {
        docs: [
          {
            id: "e1_user-1",
            data: () => ({
              eventId: "e1",
              campusId: APEX_CAMPUS_ID,
              userId: "user-1",
              createdAt: "2026-10-10T10:00:00.000Z",
            }),
          },
        ],
      };

      snapshotCallback(mockSnap);
      expect(cb).toHaveBeenCalledWith([
        {
          id: "e1_user-1",
          eventId: "e1",
          campusId: APEX_CAMPUS_ID,
          userId: "user-1",
          createdAt: expect.any(Date),
        },
      ]);
    });

    it("passes custom limit option to query constraints and falls back on non-positive limit", () => {
      subscribeToMyRsvps("user-1", APEX_CAMPUS_ID, vi.fn(), vi.fn(), {
        limit: 25,
      });
      expect(mocks.limit).toHaveBeenCalledWith(25);

      subscribeToMyRsvps("user-1", APEX_CAMPUS_ID, vi.fn(), vi.fn(), {
        limit: -5,
      });
      expect(mocks.limit).toHaveBeenCalledWith(50);
    });

    it("safely handles missing userId or campusId as no-op emitting empty array", () => {
      const cb = vi.fn();
      const unsub = subscribeToMyRsvps(null, APEX_CAMPUS_ID, cb);
      expect(typeof unsub).toBe("function");
      expect(cb).toHaveBeenCalledWith([]);
      expect(mocks.onSnapshot).not.toHaveBeenCalled();

      const unsub2 = subscribeToMyRsvps("user-1", "", cb);
      expect(typeof unsub2).toBe("function");
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
    });

    it("forwards Firestore query errors to onError", () => {
      let errorCallback;
      mocks.onSnapshot.mockImplementation((_q, _cb, errCb) => {
        errorCallback = errCb;
        return vi.fn();
      });

      const onError = vi.fn();
      subscribeToMyRsvps("user-1", APEX_CAMPUS_ID, vi.fn(), onError);

      const err = new Error("Query failed");
      errorCallback(err);
      expect(onError).toHaveBeenCalledWith(err);
    });

    it("REGRESSION: proves no fixture fallback occurs on empty query result", () => {
      let snapshotCallback;
      mocks.onSnapshot.mockImplementation((_q, cb) => {
        snapshotCallback = cb;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToMyRsvps("e2e-student-b", APEX_CAMPUS_ID, cb);

      snapshotCallback({ docs: [] });
      expect(cb).toHaveBeenCalledWith([]);
      expect(cb).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ userId: "e2e-student-b" })])
      );
    });
  });

  describe("Q3: subscribeToEventAttendees", () => {
    it("subscribes with exact eventId, campusId, and limit(51) constraints", () => {
      let snapshotCallback;
      mocks.onSnapshot.mockImplementation((_q, cb) => {
        snapshotCallback = cb;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToEventAttendees("event-hackathon", APEX_CAMPUS_ID, cb);

      expect(mocks.query).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventRsvps" }),
        { type: "where", field: "eventId", op: "==", val: "event-hackathon" },
        { type: "where", field: "campusId", op: "==", val: APEX_CAMPUS_ID },
        { type: "limit", count: 51 }
      );

      const mockSnap = {
        docs: [
          {
            id: "event-hackathon_u1",
            data: () => ({
              eventId: "event-hackathon",
              campusId: APEX_CAMPUS_ID,
              userId: "u1",
              createdAt: "2026-10-10T10:00:00.000Z",
            }),
          },
        ],
      };

      snapshotCallback(mockSnap);
      expect(cb).toHaveBeenCalledWith({
        attendees: [
          {
            id: "event-hackathon_u1",
            eventId: "event-hackathon",
            campusId: APEX_CAMPUS_ID,
            userId: "u1",
            createdAt: expect.any(Date),
          },
        ],
        count: 1,
        hasMore: false,
      });
    });

    it("preserves bounded attendee result shape and hasMore behavior at the 51-document cap", () => {
      let snapshotCallback;
      mocks.onSnapshot.mockImplementation((_q, cb) => {
        snapshotCallback = cb;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToEventAttendees("event-large", APEX_CAMPUS_ID, cb);

      // Create 51 mock documents
      const docs51 = Array.from({ length: 51 }, (_, i) => ({
        id: `event-large_user-${i}`,
        data: () => ({
          eventId: "event-large",
          campusId: APEX_CAMPUS_ID,
          userId: `user-${i}`,
          createdAt: "2026-10-10T10:00:00.000Z",
        }),
      }));

      snapshotCallback({ docs: docs51 });

      expect(cb).toHaveBeenCalledWith({
        attendees: expect.any(Array),
        count: 50,
        hasMore: true,
      });

      const result = cb.mock.calls[0][0];
      expect(result.attendees).toHaveLength(50);
      expect(result.count).toBe(50);
      expect(result.hasMore).toBe(true);
    });

    it("reports hasMore as false and accurate count when documents are at 50", () => {
      let snapshotCallback;
      mocks.onSnapshot.mockImplementation((_q, cb) => {
        snapshotCallback = cb;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToEventAttendees("event-exact-50", APEX_CAMPUS_ID, cb);

      const docs50 = Array.from({ length: 50 }, (_, i) => ({
        id: `event-exact-50_user-${i}`,
        data: () => ({
          eventId: "event-exact-50",
          campusId: APEX_CAMPUS_ID,
          userId: `user-${i}`,
          createdAt: "2026-10-10T10:00:00.000Z",
        }),
      }));

      snapshotCallback({ docs: docs50 });

      const result = cb.mock.calls[0][0];
      expect(result.attendees).toHaveLength(50);
      expect(result.count).toBe(50);
      expect(result.hasMore).toBe(false);
    });

    it("emits empty attendee result shape when snapshot contains 0 documents", () => {
      let snapshotCallback;
      mocks.onSnapshot.mockImplementation((_q, cb) => {
        snapshotCallback = cb;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToEventAttendees("event-zero", APEX_CAMPUS_ID, cb);

      snapshotCallback({ docs: [] });

      expect(cb).toHaveBeenCalledWith({
        attendees: [],
        count: 0,
        hasMore: false,
      });
    });

    it("strictly caps attendees at 50 even if snapshot contains more than 51 documents", () => {
      let snapshotCallback;
      mocks.onSnapshot.mockImplementation((_q, cb) => {
        snapshotCallback = cb;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToEventAttendees("event-very-large", APEX_CAMPUS_ID, cb);

      const docs55 = Array.from({ length: 55 }, (_, i) => ({
        id: `event-very-large_user-${i}`,
        data: () => ({
          eventId: "event-very-large",
          campusId: APEX_CAMPUS_ID,
          userId: `user-${i}`,
          createdAt: "2026-10-10T10:00:00.000Z",
        }),
      }));

      snapshotCallback({ docs: docs55 });

      const result = cb.mock.calls[0][0];
      expect(result.attendees).toHaveLength(50);
      expect(result.count).toBe(50);
      expect(result.hasMore).toBe(true);
    });

    it("falls back to default limit of 51 when non-positive or non-numeric limit is provided", () => {
      subscribeToEventAttendees("event-hackathon", APEX_CAMPUS_ID, vi.fn(), vi.fn(), {
        limit: -10,
      });
      expect(mocks.limit).toHaveBeenCalledWith(51);

      subscribeToEventAttendees("event-hackathon", APEX_CAMPUS_ID, vi.fn(), vi.fn(), {
        limit: "not-a-number",
      });
      expect(mocks.limit).toHaveBeenCalledWith(51);
    });

    it("safely handles missing eventId or campusId emitting empty attendee shape", () => {
      const cb = vi.fn();
      const unsub = subscribeToEventAttendees("", APEX_CAMPUS_ID, cb);
      expect(typeof unsub).toBe("function");
      expect(cb).toHaveBeenCalledWith({
        attendees: [],
        count: 0,
        hasMore: false,
      });

      const unsub2 = subscribeToEventAttendees("event-1", null, cb);
      expect(typeof unsub2).toBe("function");
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
    });

    it("forwards query errors to onError", () => {
      let errorCallback;
      mocks.onSnapshot.mockImplementation((_q, _cb, errCb) => {
        errorCallback = errCb;
        return vi.fn();
      });

      const onError = vi.fn();
      subscribeToEventAttendees("event-1", APEX_CAMPUS_ID, vi.fn(), onError);

      const err = new Error("Query permission denied");
      errorCallback(err);
      expect(onError).toHaveBeenCalledWith(err);
    });
  });

  describe("Mutations: createEventRsvp & deleteEventRsvp", () => {
    it("createEventRsvp sets document with deterministic path, exactly 5 fields, and serverTimestamp()", async () => {
      mocks.setDoc.mockResolvedValueOnce();

      const result = await createEventRsvp({
        eventId: "event-ai",
        userId: "student-1",
        campusId: APEX_CAMPUS_ID,
      });

      expect(mocks.doc).toHaveBeenCalledWith(
        mocks.mockDb,
        "eventRsvps",
        "event-ai_student-1"
      );

      expect(mocks.setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventRsvps/event-ai_student-1" }),
        {
          id: "event-ai_student-1",
          eventId: "event-ai",
          campusId: APEX_CAMPUS_ID,
          userId: "student-1",
          createdAt: { _methodName: "serverTimestamp" },
        }
      );

      expect(result).toEqual({
        id: "event-ai_student-1",
        eventId: "event-ai",
        campusId: APEX_CAMPUS_ID,
        userId: "student-1",
        createdAt: { _methodName: "serverTimestamp" },
      });
      expect(Object.keys(result)).toEqual([
        "id",
        "eventId",
        "campusId",
        "userId",
        "createdAt",
      ]);
    });

    it("createEventRsvp throws on missing required parameters", async () => {
      await expect(
        createEventRsvp({ eventId: "", userId: "u1", campusId: APEX_CAMPUS_ID })
      ).rejects.toThrow("eventId, userId, and campusId are required");

      await expect(
        createEventRsvp({ eventId: "e1", userId: null, campusId: APEX_CAMPUS_ID })
      ).rejects.toThrow();

      await expect(
        createEventRsvp({ eventId: "e1", userId: "u1", campusId: undefined })
      ).rejects.toThrow();
    });

    it("createEventRsvp propagates Firestore errors", async () => {
      mocks.setDoc.mockRejectedValueOnce(
        new Error("permission-denied: event has ended")
      );

      await expect(
        createEventRsvp({
          eventId: "event-past",
          userId: "student-1",
          campusId: APEX_CAMPUS_ID,
        })
      ).rejects.toThrow("permission-denied: event has ended");
    });

    it("deleteEventRsvp deletes deterministic document path", async () => {
      mocks.deleteDoc.mockResolvedValueOnce();

      await deleteEventRsvp("event-ai", "student-1");

      expect(mocks.doc).toHaveBeenCalledWith(
        mocks.mockDb,
        "eventRsvps",
        "event-ai_student-1"
      );
      expect(mocks.deleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "eventRsvps/event-ai_student-1" })
      );
    });

    it("deleteEventRsvp throws on missing arguments", async () => {
      await expect(deleteEventRsvp("", "u1")).rejects.toThrow(
        "eventId and userId are required"
      );
      await expect(deleteEventRsvp("e1", "")).rejects.toThrow(
        "eventId and userId are required"
      );
    });

    it("deleteEventRsvp propagates Firestore errors", async () => {
      mocks.deleteDoc.mockRejectedValueOnce(new Error("permission-denied"));

      await expect(deleteEventRsvp("event-1", "user-1")).rejects.toThrow(
        "permission-denied"
      );
    });
  });
});
