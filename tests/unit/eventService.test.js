import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  APEX_CAMPUS_ID,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
} from "../../src/constants.js";
import {
  COMMUNITY_APEX_AI,
} from "../../src/data/communities.js";
import { EVENT_AI_HACKATHON } from "../../src/data/events.js";

const mocks = vi.hoisted(() => {
  class MockTimestamp {
    constructor(seconds = 0, nanoseconds = 0) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    toDate() {
      return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6));
    }
    toMillis() {
      return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
    }
    static fromDate = vi.fn((d) => {
      const ms = d.getTime();
      const seconds = Math.floor(ms / 1000);
      const nanoseconds = Math.floor((ms - seconds * 1000) * 1e6);
      return new MockTimestamp(seconds, nanoseconds);
    });
  }

  return {
    doc: vi.fn((...args) => {
      if (args.length === 1) {
        const col = args[0]?.path || args[0]?.name || "events";
        return { path: `${col}/generated-doc-id`, id: "generated-doc-id", collection: col };
      }
      const [, coll, id] = args;
      const docId = id || "generated-doc-id";
      return { path: `${coll}/${docId}`, id: docId, collection: coll };
    }),
    collection: vi.fn((_db, name) => ({ path: name, name })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    mockBatch: {
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(() => Promise.resolve()),
    },
    writeBatch: vi.fn(),
    onSnapshot: vi.fn(),
    query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
    where: vi.fn((field, op, val) => ({ field, op, val })),
    serverTimestamp: vi.fn(() => ({ _methodName: "serverTimestamp" })),
    Timestamp: MockTimestamp,
    mockDb: { id: "mock-db" },
  };
});

mocks.writeBatch.mockImplementation(() => mocks.mockBatch);

vi.mock("../../src/firebase/config", () => ({
  auth: { currentUser: null },
  db: mocks.mockDb,
  isFirebaseConfigured: true,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  collection: mocks.collection,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  deleteDoc: mocks.deleteDoc,
  writeBatch: mocks.writeBatch,
  onSnapshot: mocks.onSnapshot,
  query: mocks.query,
  where: mocks.where,
  serverTimestamp: mocks.serverTimestamp,
  Timestamp: mocks.Timestamp,
}));

import {
  eventDocRef,
  eventsCollectionRef,
  normalizeTimestamp,
  normalizeEvent,
  mapSnapshotToResolution,
  mapErrorToResolution,
  sortEventsByDate,
  filterEvents,
  getEventById,
  resolveEvent,
  subscribeToEventResolution,
  getEvent,
  subscribeToEvent,
  getEventsByCampus,
  subscribeToCampusEvents,
  getEventsByCommunity,
  subscribeToCommunityEvents,
  createEvent,
  updateEvent,
  cancelEvent,
  republishEvent,
  deleteEvent,
  toFirestoreTimestamp,
} from "../../src/services/eventService.js";

describe("Milestone 20 — Unit 20.3: Event Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Reference Helpers & Document Normalization", () => {
    it("eventDocRef returns document reference for valid ID and throws on missing ID", () => {
      const ref = eventDocRef("event-123");
      expect(ref.path).toBe("events/event-123");
      expect(() => eventDocRef("")).toThrow("Event ID is required");
      expect(() => eventDocRef(null)).toThrow("Event ID is required");
    });

    it("eventsCollectionRef returns reference to root events collection", () => {
      const colRef = eventsCollectionRef();
      expect(colRef.path).toBe("events");
    });

    it("normalizeTimestamp converts Timestamps, Dates, strings, and handles null/invalid gracefully", () => {
      const date = new Date("2026-10-15T10:00:00Z");
      const mockTimestamp = { toDate: () => date, toMillis: () => date.getTime() };

      expect(normalizeTimestamp(mockTimestamp)).toBe(date);
      expect(normalizeTimestamp(date)).toBe(date);
      expect(normalizeTimestamp("2026-10-15T10:00:00Z")?.toISOString()).toBe(date.toISOString());
      expect(normalizeTimestamp(null)).toBeNull();
      expect(normalizeTimestamp(undefined)).toBeNull();
      expect(normalizeTimestamp("invalid-date-string")).toBeNull();
    });

    it("normalizeTimestamp handles numeric zero (epoch) and rejects non-finite and malformed values", () => {
      expect(normalizeTimestamp(0)).toEqual(new Date(0));
      expect(normalizeTimestamp(NaN)).toBeNull();
      expect(normalizeTimestamp(Infinity)).toBeNull();
      expect(normalizeTimestamp(-Infinity)).toBeNull();
      expect(normalizeTimestamp(1e25)).toBeNull();
      expect(normalizeTimestamp(false)).toBeNull();
      expect(normalizeTimestamp(true)).toBeNull();
      expect(normalizeTimestamp({ toMillis: () => Infinity })).toBeNull();
      expect(normalizeTimestamp({ seconds: Infinity, nanoseconds: 0 })).toBeNull();
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: Infinity })).toBeNull();
    });

    it("normalizeTimestamp validates seconds and nanoseconds representations strictly", () => {
      // Valid integer seconds with omitted nanoseconds
      expect(normalizeTimestamp({ seconds: 1700000000 })).toEqual(new Date(1700000000000));

      // Valid nanoseconds at 0 and 999_999_999
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: 0 })).toEqual(new Date(1700000000000));
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: 999_999_999 })).toEqual(new Date(1700000000999));

      // Valid negative seconds with non-negative nanoseconds
      expect(normalizeTimestamp({ seconds: -10, nanoseconds: 500_000_000 })).toEqual(new Date(-9500));
      expect(normalizeTimestamp({ seconds: 0, nanoseconds: 0 })).toEqual(new Date(0));

      // Genuine Timestamp mock with toDate() preserving reference
      const tsInstance = new mocks.Timestamp(1700000000, 500_000_000);
      expect(normalizeTimestamp(tsInstance)).toEqual(new Date(1700000000500));

      // Invalid fractional seconds
      expect(normalizeTimestamp({ seconds: 1700000000.5, nanoseconds: 0 })).toBeNull();
      expect(normalizeTimestamp({ seconds: 1700000000.5 })).toBeNull();

      // Invalid fractional, negative, or out-of-range nanoseconds
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: 500.5 })).toBeNull();
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: -1 })).toBeNull();
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: 1_000_000_000 })).toBeNull();
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: 1_000_000_001 })).toBeNull();

      // Explicitly supplied null, string, or boolean nanoseconds
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: null })).toBeNull();
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: "500" })).toBeNull();
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: false })).toBeNull();
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: true })).toBeNull();

      // Explicitly supplied null, string, or boolean seconds
      expect(normalizeTimestamp({ seconds: null, nanoseconds: 0 })).toBeNull();
      expect(normalizeTimestamp({ seconds: "1700000000", nanoseconds: 0 })).toBeNull();
      expect(normalizeTimestamp({ seconds: false, nanoseconds: 0 })).toBeNull();
      expect(normalizeTimestamp({ seconds: true, nanoseconds: 0 })).toBeNull();

      // Missing seconds when nanoseconds is present
      expect(normalizeTimestamp({ nanoseconds: 0 })).toBeNull();
      expect(normalizeTimestamp({ nanoseconds: 500 })).toBeNull();

      // Duck-typed methods with malformed seconds/nanoseconds fail closed
      expect(normalizeTimestamp({ seconds: 1700000000.5, toDate: () => new Date() })).toBeNull();
      expect(normalizeTimestamp({ seconds: 1700000000, nanoseconds: -1, toMillis: () => 1700000000000 })).toBeNull();
    });

    it("toFirestoreTimestamp converts valid inputs and rejects malformed timestamps", () => {
      // Null / undefined pass through as null
      expect(toFirestoreTimestamp(null)).toBeNull();
      expect(toFirestoreTimestamp(undefined)).toBeNull();

      // Numeric zero produces valid epoch Timestamp
      const epochTs = toFirestoreTimestamp(0);
      expect(epochTs.seconds).toBe(0);
      expect(epochTs.nanoseconds).toBe(0);

      // Valid seconds/nanoseconds object converts to Timestamp
      const converted = toFirestoreTimestamp({ seconds: 1700000000, nanoseconds: 500_000_000 });
      expect(converted.seconds).toBe(1700000000);
      expect(converted.nanoseconds).toBe(500_000_000);

      // Malformed inputs throw error
      expect(() => toFirestoreTimestamp({ seconds: 1700000000.5 })).toThrow("Invalid date provided.");
      expect(() => toFirestoreTimestamp({ seconds: 1700000000, nanoseconds: -1 })).toThrow("Invalid date provided.");
      expect(() => toFirestoreTimestamp({ seconds: 1700000000, nanoseconds: "500" })).toThrow("Invalid date provided.");
      expect(() => toFirestoreTimestamp({ nanoseconds: 0 })).toThrow("Invalid date provided.");
      expect(() => toFirestoreTimestamp("not-a-date")).toThrow("Invalid date provided.");
    });

    it("normalizeEvent handles null and undefined safely", () => {
      expect(normalizeEvent("e1", null)).toBeNull();
      expect(normalizeEvent("e1", undefined)).toBeNull();
    });

    it("normalizeEvent normalizes document data into the locked 17-field schema with defaults", () => {
      const raw = {
        campusId: APEX_CAMPUS_ID,
        communityId: COMMUNITY_APEX_AI.id,
        title: "Robotics Workshop",
        category: EVENT_CATEGORIES.TECH,
        location: "Lab 3",
        startAt: new Date("2026-10-15T09:00:00Z"),
        endAt: new Date("2026-10-15T17:00:00Z"),
        createdBy: "student-1",
        organizerName: "Robotics Club",
      };

      const normalized = normalizeEvent("event-test-1", raw);

      expect(normalized).toEqual({
        id: "event-test-1",
        campusId: APEX_CAMPUS_ID,
        communityId: COMMUNITY_APEX_AI.id,
        title: "Robotics Workshop",
        slug: "event-test-1",
        description: "",
        category: EVENT_CATEGORIES.TECH,
        location: "Lab 3",
        startAt: raw.startAt,
        endAt: raw.endAt,
        imageURL: null,
        createdBy: "student-1",
        organizerName: "Robotics Club",
        status: EVENT_STATUSES.PUBLISHED,
        visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
        createdAt: null,
        updatedAt: null,
      });
    });

    it("normalizeEvent extracts id and data from a Firestore DocumentSnapshot object", () => {
      const mockSnap = {
        id: "snap-event-101",
        data: () => ({
          campusId: APEX_CAMPUS_ID,
          title: "Snapshot Event",
          category: EVENT_CATEGORIES.SOCIAL,
          startAt: new Date("2026-10-20T10:00:00Z"),
          endAt: new Date("2026-10-20T12:00:00Z"),
        }),
      };

      const normalized = normalizeEvent(mockSnap);
      expect(normalized).not.toBeNull();
      expect(normalized.id).toBe("snap-event-101");
      expect(normalized.title).toBe("Snapshot Event");
      expect(normalized.category).toBe(EVENT_CATEGORIES.SOCIAL);
      expect(normalized.status).toBe(EVENT_STATUSES.PUBLISHED);
      expect(normalized.visibility).toBe(EVENT_VISIBILITIES.CAMPUS_PUBLIC);
    });

    it("normalizeEvent accepts a single document object without second argument", () => {
      const docObj = {
        id: "obj-event-202",
        campusId: APEX_CAMPUS_ID,
        title: "Object Event",
        category: EVENT_CATEGORIES.ACADEMIC,
      };

      const normalized = normalizeEvent(docObj);
      expect(normalized).not.toBeNull();
      expect(normalized.id).toBe("obj-event-202");
      expect(normalized.title).toBe("Object Event");
      expect(normalized.category).toBe(EVENT_CATEGORIES.ACADEMIC);
    });
  });

  describe("Sorting & Temporal Filtering", () => {
    const earlyEvent = {
      id: "early",
      startAt: new Date("2026-10-10T10:00:00Z"),
      endAt: new Date("2026-10-10T12:00:00Z"),
      category: EVENT_CATEGORIES.TECH,
      status: EVENT_STATUSES.PUBLISHED,
    };
    const midEvent = {
      id: "mid",
      startAt: new Date("2026-10-20T10:00:00Z"),
      endAt: new Date("2026-10-20T12:00:00Z"),
      category: EVENT_CATEGORIES.CULTURAL,
      status: EVENT_STATUSES.PUBLISHED,
    };
    const lateEvent = {
      id: "late",
      startAt: new Date("2026-10-30T10:00:00Z"),
      endAt: new Date("2026-10-30T12:00:00Z"),
      category: EVENT_CATEGORIES.TECH,
      status: EVENT_STATUSES.CANCELLED,
    };

    it("sortEventsByDate sorts events chronologically ascending and descending", () => {
      const asc = sortEventsByDate([midEvent, lateEvent, earlyEvent], "asc");
      expect(asc.map((e) => e.id)).toEqual(["early", "mid", "late"]);

      const desc = sortEventsByDate([midEvent, earlyEvent, lateEvent], "desc");
      expect(desc.map((e) => e.id)).toEqual(["late", "mid", "early"]);
    });

    it("filterEvents filters by category and status", () => {
      const techOnly = filterEvents([earlyEvent, midEvent, lateEvent], {
        category: EVENT_CATEGORIES.TECH,
      });
      expect(techOnly.map((e) => e.id)).toEqual(["early", "late"]);

      const publishedOnly = filterEvents([earlyEvent, midEvent, lateEvent], {
        status: EVENT_STATUSES.PUBLISHED,
      });
      expect(publishedOnly.map((e) => e.id)).toEqual(["early", "mid"]);
    });

    it("filterEvents applies derived temporal state filtering (upcoming vs past)", () => {
      const refDate = new Date("2026-10-15T00:00:00Z");

      const upcoming = filterEvents([earlyEvent, midEvent, lateEvent], {
        timeRange: "upcoming",
        referenceDate: refDate,
      });
      expect(upcoming.map((e) => e.id)).toEqual(["mid", "late"]);

      const past = filterEvents([earlyEvent, midEvent, lateEvent], {
        timeRange: "past",
        referenceDate: refDate,
      });
      expect(past.map((e) => e.id)).toEqual(["early"]);
    });
  });

  describe("Single Event Lookup & Subscription", () => {
    it("getEventById returns null for missing or invalid event ID", async () => {
      expect(await getEventById("")).toBeNull();
      expect(await getEventById(null)).toBeNull();
      expect(await getEventById(123)).toBeNull();
    });

    it("getEventById returns normalized event when document exists in Firestore", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: "e-1",
        data: () => ({
          title: "Hackathon",
          campusId: APEX_CAMPUS_ID,
          communityId: COMMUNITY_APEX_AI.id,
          category: EVENT_CATEGORIES.TECH,
        }),
      });

      const event = await getEventById("e-1");
      expect(event).not.toBeNull();
      expect(event.id).toBe("e-1");
      expect(event.title).toBe("Hackathon");
    });

    it("getEventById returns null without falling back to fixture when document does not exist in Firestore", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const event = await getEventById(EVENT_AI_HACKATHON.id);
      expect(event).toBeNull();
    });

    it("getEventById throws error without falling back to fixture on Firestore read error", async () => {
      mocks.getDoc.mockRejectedValueOnce(new Error("Permission denied"));

      await expect(getEventById(EVENT_AI_HACKATHON.id)).rejects.toThrow(
        "Permission denied"
      );
    });

    it("getEvent is an alias to getEventById", async () => {
      expect(getEvent).toBe(getEventById);
    });

    it("subscribeToEvent sets up onSnapshot listener and returns unsubscribe cleanup", () => {
      const unsub = vi.fn();
      mocks.onSnapshot.mockImplementation((_ref, onNext) => {
        onNext({
          exists: () => true,
          id: "e-live",
          data: () => ({ title: "Live Event", campusId: APEX_CAMPUS_ID }),
        });
        return unsub;
      });

      const callback = vi.fn();
      const cleanup = subscribeToEvent("e-live", callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ id: "e-live", title: "Live Event" })
      );
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });

    it("subscribeToEvent invokes onError on snapshot error", () => {
      const err = new Error("Permission denied");
      mocks.onSnapshot.mockImplementation((_ref, _onNext, onError) => {
        onError(err);
        return vi.fn();
      });

      const onError = vi.fn();
      subscribeToEvent("e-err", vi.fn(), onError);
      expect(onError).toHaveBeenCalledWith(err);
    });
  });

  describe("Strict Event Resolution Service (§12.4)", () => {
    it("mapSnapshotToResolution resolves real Firestore snapshot with Timestamps into complete 17-field normalized event with document id", () => {
      const mockTimestampStart = {
        toDate: () => new Date("2026-10-18T14:00:00Z"),
        toMillis: () => new Date("2026-10-18T14:00:00Z").getTime(),
      };
      const mockTimestampEnd = {
        toDate: () => new Date("2026-10-18T16:00:00Z"),
        toMillis: () => new Date("2026-10-18T16:00:00Z").getTime(),
      };
      const mockTimestampCreated = {
        toDate: () => new Date("2026-10-10T10:00:00Z"),
        toMillis: () => new Date("2026-10-10T10:00:00Z").getTime(),
      };

      const snap = {
        exists: () => true,
        id: "real-firestore-doc-id",
        data: () => ({
          campusId: APEX_CAMPUS_ID,
          communityId: COMMUNITY_APEX_AI.id,
          title: "Real Snapshot Event",
          description: "Full resolution description",
          category: EVENT_CATEGORIES.TECH,
          location: "Hall B",
          startAt: mockTimestampStart,
          endAt: mockTimestampEnd,
          imageURL: "https://example.com/banner.png",
          createdBy: "student-apex-1",
          organizerName: "Apex AI Organizers",
          status: EVENT_STATUSES.PUBLISHED,
          visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY,
          createdAt: mockTimestampCreated,
          updatedAt: mockTimestampCreated,
        }),
      };

      const resolution = mapSnapshotToResolution(snap);
      expect(resolution.status).toBe("available");
      expect(resolution.error).toBeNull();
      expect(resolution.event).toEqual({
        id: "real-firestore-doc-id",
        campusId: APEX_CAMPUS_ID,
        communityId: COMMUNITY_APEX_AI.id,
        title: "Real Snapshot Event",
        slug: "real-firestore-doc-id",
        description: "Full resolution description",
        category: EVENT_CATEGORIES.TECH,
        location: "Hall B",
        startAt: new Date("2026-10-18T14:00:00Z"),
        endAt: new Date("2026-10-18T16:00:00Z"),
        imageURL: "https://example.com/banner.png",
        createdBy: "student-apex-1",
        organizerName: "Apex AI Organizers",
        status: EVENT_STATUSES.PUBLISHED,
        visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY,
        createdAt: new Date("2026-10-10T10:00:00Z"),
        updatedAt: new Date("2026-10-10T10:00:00Z"),
      });
      expect(resolution.event.startAt instanceof Date).toBe(true);
      expect(resolution.event.endAt instanceof Date).toBe(true);
    });

    it("mapSnapshotToResolution resolves nonexistent snapshot to inaccessible", () => {
      const snap = { exists: () => false };
      expect(mapSnapshotToResolution(snap)).toEqual({
        status: "inaccessible",
        event: null,
        error: null,
      });
    });

    it("mapErrorToResolution maps permission-denied to inaccessible and unexpected to error", () => {
      const permErr = new Error("Permission denied");
      permErr.code = "permission-denied";
      expect(mapErrorToResolution(permErr)).toEqual({
        status: "inaccessible",
        event: null,
        error: null,
      });

      const unavailErr = new Error("Firestore unavailable");
      unavailErr.code = "unavailable";
      expect(mapErrorToResolution(unavailErr)).toEqual({
        status: "error",
        event: null,
        error: unavailErr,
      });
    });

    it("resolveEvent maps existing document to available without returning fixture data", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: "e-avail",
        data: () => ({
          title: "Authorized Workshop",
          campusId: APEX_CAMPUS_ID,
          communityId: COMMUNITY_APEX_AI.id,
          category: EVENT_CATEGORIES.TECH,
        }),
      });

      const res = await resolveEvent("e-avail");
      expect(res).toEqual({
        status: "available",
        event: expect.objectContaining({ id: "e-avail", title: "Authorized Workshop" }),
        error: null,
      });
    });

    it("resolveEvent maps missing document to inaccessible without fixture fallback", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const res = await resolveEvent(EVENT_AI_HACKATHON.id);
      expect(res).toEqual({
        status: "inaccessible",
        event: null,
        error: null,
      });
    });

    it("resolveEvent maps permission-denied error to inaccessible without fixture fallback", async () => {
      const err = new Error("Missing or insufficient permissions.");
      err.code = "permission-denied";
      mocks.getDoc.mockRejectedValueOnce(err);

      const res = await resolveEvent(EVENT_AI_HACKATHON.id);
      expect(res).toEqual({
        status: "inaccessible",
        event: null,
        error: null,
      });
    });

    it("resolveEvent maps unexpected Firestore error to error status without fixture fallback", async () => {
      const err = new Error("Internal server connection error");
      err.code = "unavailable";
      mocks.getDoc.mockRejectedValueOnce(err);

      const res = await resolveEvent(EVENT_AI_HACKATHON.id);
      expect(res.status).toBe("error");
      expect(res.event).toBeNull();
      expect(res.error).toBe(err);
    });

    it("resolveEvent handles invalid or empty eventId as inaccessible", async () => {
      expect(await resolveEvent("")).toEqual({
        status: "inaccessible",
        event: null,
        error: null,
      });
      expect(await resolveEvent(null)).toEqual({
        status: "inaccessible",
        event: null,
        error: null,
      });
    });

    it("subscribeToEventResolution emits available on existing snapshot and cleans up with unsubscribe", () => {
      const unsub = vi.fn();
      mocks.onSnapshot.mockImplementation((_ref, onNext) => {
        onNext({
          exists: () => true,
          id: "e-sub",
          data: () => ({ title: "Live Event", campusId: APEX_CAMPUS_ID }),
        });
        return unsub;
      });

      const cb = vi.fn();
      const cleanup = subscribeToEventResolution("e-sub", cb);

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "available",
          event: expect.objectContaining({ id: "e-sub", title: "Live Event" }),
          error: null,
        })
      );
      expect(typeof cleanup).toBe("function");
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });

    it("subscribeToEventResolution emits inaccessible on missing document", () => {
      mocks.onSnapshot.mockImplementation((_ref, onNext) => {
        onNext({ exists: () => false });
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToEventResolution("e-missing", cb);

      expect(cb).toHaveBeenCalledWith({
        status: "inaccessible",
        event: null,
        error: null,
      });
    });

    it("subscribeToEventResolution emits inaccessible on permission-denied error", () => {
      const err = new Error("Permission denied");
      err.code = "permission-denied";
      mocks.onSnapshot.mockImplementation((_ref, _onNext, onError) => {
        onError(err);
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToEventResolution("e-denied", cb);

      expect(cb).toHaveBeenCalledWith({
        status: "inaccessible",
        event: null,
        error: null,
      });
    });

    it("subscribeToEventResolution emits error on unexpected Firestore error", () => {
      const err = new Error("Backend timeout");
      err.code = "deadline-exceeded";
      mocks.onSnapshot.mockImplementation((_ref, _onNext, onError) => {
        onError(err);
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToEventResolution("e-fail", cb);

      expect(cb).toHaveBeenCalledWith({
        status: "error",
        event: null,
        error: err,
      });
    });
  });

  describe("Campus Events Query & Subscription", () => {
    it("getEventsByCampus returns empty array on missing campusId", async () => {
      expect(await getEventsByCampus("")).toEqual([]);
      expect(await getEventsByCampus(null)).toEqual([]);
    });

    it("getEventsByCampus enforces campus parity and defaults visibility to campus_public", async () => {
      mocks.getDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: "e-camp-1",
            data: () => ({
              title: "Campus Hack",
              campusId: APEX_CAMPUS_ID,
              visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
              startAt: new Date("2026-10-15T09:00:00Z"),
            }),
          },
        ],
      });

      const events = await getEventsByCampus(APEX_CAMPUS_ID);
      expect(mocks.where).toHaveBeenCalledWith("campusId", "==", APEX_CAMPUS_ID);
      expect(mocks.where).toHaveBeenCalledWith("visibility", "==", EVENT_VISIBILITIES.CAMPUS_PUBLIC);
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe("e-camp-1");
    });

    it("getEventsByCampus returns empty array without falling back to fixtures when Firestore returns empty", async () => {
      mocks.getDocs.mockResolvedValueOnce({
        empty: true,
        docs: [],
      });

      const events = await getEventsByCampus(APEX_CAMPUS_ID);
      expect(events).toEqual([]);
    });

    it("getEventsByCampus propagates error without falling back to fixtures on Firestore read failure", async () => {
      mocks.getDocs.mockRejectedValueOnce(new Error("Permission denied"));

      await expect(getEventsByCampus(APEX_CAMPUS_ID)).rejects.toThrow(
        "Permission denied"
      );
    });

    it("subscribeToCampusEvents registers listener with campus and visibility filters", () => {
      const unsub = vi.fn();
      mocks.onSnapshot.mockImplementation((_q, onNext) => {
        onNext({
          docs: [
            {
              id: "sub-1",
              data: () => ({
                title: "Subscribed Event",
                campusId: APEX_CAMPUS_ID,
                visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
                startAt: new Date("2026-10-15T09:00:00Z"),
              }),
            },
          ],
        });
        return unsub;
      });

      const callback = vi.fn();
      const cleanup = subscribeToCampusEvents(APEX_CAMPUS_ID, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: "sub-1" })])
      );
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });
  });

  describe("Community Events Query & Subscription", () => {
    it("getEventsByCommunity returns empty array on missing communityId or missing campusId without querying Firestore", async () => {
      expect(await getEventsByCommunity("", { campusId: APEX_CAMPUS_ID })).toEqual([]);
      expect(await getEventsByCommunity(null, { campusId: APEX_CAMPUS_ID })).toEqual([]);
      expect(await getEventsByCommunity(COMMUNITY_APEX_AI.id, "")).toEqual([]);
      expect(await getEventsByCommunity(COMMUNITY_APEX_AI.id, null)).toEqual([]);
      expect(await getEventsByCommunity(COMMUNITY_APEX_AI.id, { campusId: "" })).toEqual([]);
      expect(await getEventsByCommunity(COMMUNITY_APEX_AI.id, {})).toEqual([]);
      expect(mocks.getDocs).not.toHaveBeenCalled();
      expect(mocks.where).not.toHaveBeenCalled();
    });

    it("getEventsByCommunity for non-member contains communityId, campusId, and visibility == campus_public", async () => {
      mocks.getDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: "comm-event-public",
            data: () => ({
              title: "Club Demo",
              communityId: COMMUNITY_APEX_AI.id,
              campusId: APEX_CAMPUS_ID,
              visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
              startAt: new Date("2026-10-15T09:00:00Z"),
            }),
          },
        ],
      });

      const events = await getEventsByCommunity(COMMUNITY_APEX_AI.id, { campusId: APEX_CAMPUS_ID });
      expect(mocks.where).toHaveBeenCalledWith("communityId", "==", COMMUNITY_APEX_AI.id);
      expect(mocks.where).toHaveBeenCalledWith("campusId", "==", APEX_CAMPUS_ID);
      expect(mocks.where).toHaveBeenCalledWith("visibility", "==", EVENT_VISIBILITIES.CAMPUS_PUBLIC);
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe("comm-event-public");
    });

    it("getEventsByCommunity for active member queries both campus_public and community_only and merges them", async () => {
      mocks.getDocs
        .mockResolvedValueOnce({
          empty: false,
          docs: [
            {
              id: "comm-event-public",
              data: () => ({
                title: "Public Meet",
                communityId: COMMUNITY_APEX_AI.id,
                campusId: APEX_CAMPUS_ID,
                visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
                startAt: new Date("2026-10-15T09:00:00Z"),
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          empty: false,
          docs: [
            {
              id: "comm-event-private",
              data: () => ({
                title: "Members Workshop",
                communityId: COMMUNITY_APEX_AI.id,
                campusId: APEX_CAMPUS_ID,
                visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY,
                startAt: new Date("2026-10-16T09:00:00Z"),
              }),
            },
          ],
        });

      const events = await getEventsByCommunity(COMMUNITY_APEX_AI.id, {
        campusId: APEX_CAMPUS_ID,
        isMember: true,
      });
      expect(mocks.where).toHaveBeenCalledWith("communityId", "==", COMMUNITY_APEX_AI.id);
      expect(mocks.where).toHaveBeenCalledWith("campusId", "==", APEX_CAMPUS_ID);
      expect(mocks.where).toHaveBeenCalledWith("visibility", "==", EVENT_VISIBILITIES.CAMPUS_PUBLIC);
      expect(mocks.where).toHaveBeenCalledWith("visibility", "==", EVENT_VISIBILITIES.COMMUNITY_ONLY);
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.id)).toEqual(["comm-event-public", "comm-event-private"]);
    });

    it("getEventsByCommunity with explicit visibility retains communityId, campusId, and requested visibility", async () => {
      mocks.getDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: "comm-event-private",
            data: () => ({
              title: "Private Club",
              communityId: COMMUNITY_APEX_AI.id,
              campusId: APEX_CAMPUS_ID,
              visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY,
              startAt: new Date("2026-10-15T09:00:00Z"),
            }),
          },
        ],
      });

      await getEventsByCommunity(COMMUNITY_APEX_AI.id, {
        campusId: APEX_CAMPUS_ID,
        isMember: true,
        visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY,
      });

      expect(mocks.where).toHaveBeenCalledWith("communityId", "==", COMMUNITY_APEX_AI.id);
      expect(mocks.where).toHaveBeenCalledWith("campusId", "==", APEX_CAMPUS_ID);
      expect(mocks.where).toHaveBeenCalledWith("visibility", "==", EVENT_VISIBILITIES.COMMUNITY_ONLY);
    });

    it("getEventsByCommunity returns empty array without falling back to fixtures when Firestore returns empty", async () => {
      mocks.getDocs.mockResolvedValueOnce({
        empty: true,
        docs: [],
      });

      const events = await getEventsByCommunity(COMMUNITY_APEX_AI.id, {
        campusId: APEX_CAMPUS_ID,
      });
      expect(events).toEqual([]);
    });

    it("getEventsByCommunity propagates error without falling back to fixtures on Firestore read failure", async () => {
      mocks.getDocs.mockRejectedValueOnce(new Error("Permission denied"));

      await expect(
        getEventsByCommunity(COMMUNITY_APEX_AI.id, {
          campusId: APEX_CAMPUS_ID,
        })
      ).rejects.toThrow("Permission denied");
    });

    it("subscribeToCommunityEvents returns empty and no-op when campusId is missing", () => {
      const cb = vi.fn();
      const unsub = subscribeToCommunityEvents(COMMUNITY_APEX_AI.id, cb);
      expect(cb).toHaveBeenCalledWith([]);
      expect(typeof unsub).toBe("function");
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
      expect(mocks.where).not.toHaveBeenCalled();

      const cb2 = vi.fn();
      const unsub2 = subscribeToCommunityEvents(COMMUNITY_APEX_AI.id, { isMember: true }, cb2);
      expect(cb2).toHaveBeenCalledWith([]);
      expect(typeof unsub2).toBe("function");
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
      expect(mocks.where).not.toHaveBeenCalled();
    });

    it("subscribeToCommunityEvents for non-member contains communityId, campusId, and visibility == campus_public", () => {
      const unsub = vi.fn();
      mocks.onSnapshot.mockImplementation((_q, onNext) => {
        onNext({
          docs: [
            {
              id: "comm-sub-1",
              data: () => ({
                title: "Club Meet",
                communityId: COMMUNITY_APEX_AI.id,
                campusId: APEX_CAMPUS_ID,
                visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
                startAt: new Date("2026-10-15T09:00:00Z"),
              }),
            },
          ],
        });
        return unsub;
      });

      const callback = vi.fn();
      const cleanup = subscribeToCommunityEvents(
        COMMUNITY_APEX_AI.id,
        { campusId: APEX_CAMPUS_ID },
        callback
      );

      expect(mocks.where).toHaveBeenCalledWith("communityId", "==", COMMUNITY_APEX_AI.id);
      expect(mocks.where).toHaveBeenCalledWith("campusId", "==", APEX_CAMPUS_ID);
      expect(mocks.where).toHaveBeenCalledWith("visibility", "==", EVENT_VISIBILITIES.CAMPUS_PUBLIC);
      expect(callback).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: "comm-sub-1" })])
      );
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });

    it("subscribeToCommunityEvents for active member subscribes to both campus_public and community_only and merges them", () => {
      const unsub = vi.fn();
      mocks.onSnapshot.mockImplementation((_q, onNext) => {
        onNext({
          docs: [
            {
              id: "comm-sub-member",
              data: () => ({
                title: "Internal Meet",
                communityId: COMMUNITY_APEX_AI.id,
                campusId: APEX_CAMPUS_ID,
                visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY,
                startAt: new Date("2026-10-15T09:00:00Z"),
              }),
            },
          ],
        });
        return unsub;
      });

      const callback = vi.fn();
      const cleanup = subscribeToCommunityEvents(
        COMMUNITY_APEX_AI.id,
        { campusId: APEX_CAMPUS_ID, isMember: true },
        callback
      );

      expect(mocks.where).toHaveBeenCalledWith("communityId", "==", COMMUNITY_APEX_AI.id);
      expect(mocks.where).toHaveBeenCalledWith("campusId", "==", APEX_CAMPUS_ID);
      expect(mocks.where).toHaveBeenCalledWith("visibility", "==", EVENT_VISIBILITIES.CAMPUS_PUBLIC);
      expect(mocks.where).toHaveBeenCalledWith("visibility", "==", EVENT_VISIBILITIES.COMMUNITY_ONLY);
      expect(callback).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: "comm-sub-member" })])
      );
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });

    it("subscribeToCommunityEvents with explicit visibility retains communityId, campusId, and requested visibility", () => {
      const unsub = vi.fn();
      mocks.onSnapshot.mockImplementation((_q, onNext) => {
        onNext({ docs: [] });
        return unsub;
      });

      const callback = vi.fn();
      const cleanup = subscribeToCommunityEvents(
        COMMUNITY_APEX_AI.id,
        {
          campusId: APEX_CAMPUS_ID,
          isMember: true,
          visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY,
        },
        callback
      );

      expect(mocks.where).toHaveBeenCalledWith("communityId", "==", COMMUNITY_APEX_AI.id);
      expect(mocks.where).toHaveBeenCalledWith("campusId", "==", APEX_CAMPUS_ID);
      expect(mocks.where).toHaveBeenCalledWith("visibility", "==", EVENT_VISIBILITIES.COMMUNITY_ONLY);
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });
  });

  describe("Event Mutations (Create, Update, Cancel, Delete)", () => {
    const validCreateInput = {
      title: "New AI Workshop",
      campusId: APEX_CAMPUS_ID,
      communityId: COMMUNITY_APEX_AI.id,
      createdBy: "e2e-student-a",
      category: EVENT_CATEGORIES.TECH,
      location: "Room 101",
      startAt: "2026-10-25T10:00:00Z",
      endAt: "2026-10-25T14:00:00Z",
      organizerName: "Apex AI Society",
      description: "Hands-on machine learning.",
    };

    it("createEvent validates required fields and throws on missing inputs", async () => {
      await expect(createEvent(null)).rejects.toThrow("Event data object is required.");
      await expect(createEvent({ ...validCreateInput, title: "" })).rejects.toThrow("Event title is required.");
      await expect(createEvent({ ...validCreateInput, campusId: "" })).rejects.toThrow("Campus ID is required");
      await expect(createEvent({ ...validCreateInput, createdBy: "" })).rejects.toThrow("creator UID is required");
      await expect(createEvent({ ...validCreateInput, category: "invalid-category" })).rejects.toThrow("Invalid event category");
      await expect(createEvent({ ...validCreateInput, startAt: null })).rejects.toThrow("timestamps are required");
    });

    it("createEvent strictly requires a non-empty string communityId (no null client loophole)", async () => {
      await expect(createEvent({ ...validCreateInput, communityId: null })).rejects.toThrow(
        "A valid sponsoring communityId is required"
      );
      await expect(createEvent({ ...validCreateInput, communityId: "" })).rejects.toThrow(
        "A valid sponsoring communityId is required"
      );
      await expect(createEvent({ ...validCreateInput, communityId: "   " })).rejects.toThrow(
        "A valid sponsoring communityId is required"
      );
    });

    it("createEvent rejects endAt earlier than startAt", async () => {
      await expect(
        createEvent({
          ...validCreateInput,
          startAt: "2026-10-25T14:00:00Z",
          endAt: "2026-10-25T10:00:00Z",
        })
      ).rejects.toThrow("Event end time must be after or equal to start time.");
    });

    it("createEvent constructs exact 17-field payload with server timestamps and calls setDoc", async () => {
      mocks.setDoc.mockResolvedValueOnce();

      const eventId = await createEvent(validCreateInput);
      expect(typeof eventId).toBe("string");

      expect(mocks.setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: `events/${eventId}` }),
        expect.objectContaining({
          id: eventId,
          campusId: APEX_CAMPUS_ID,
          communityId: COMMUNITY_APEX_AI.id,
          title: "New AI Workshop",
          slug: "new-ai-workshop",
          description: "Hands-on machine learning.",
          category: EVENT_CATEGORIES.TECH,
          location: "Room 101",
          createdBy: "e2e-student-a",
          organizerName: "Apex AI Society",
          status: EVENT_STATUSES.PUBLISHED,
          visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
          createdAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
        })
      );
    });

    describe("toFirestoreTimestamp Helper", () => {
      it("canonicalizes Date objects to Firestore Timestamp instances", () => {
        const d = new Date("2026-10-20T10:00:00.000Z");
        const ts = toFirestoreTimestamp(d);
        expect(ts.toMillis()).toBe(d.getTime());
        expect(mocks.Timestamp.fromDate).toHaveBeenCalledWith(d);
      });

      it("converts ISO strings and numbers to Firestore Timestamp instances", () => {
        const iso = "2026-10-20T10:00:00.000Z";
        const ts = toFirestoreTimestamp(iso);
        expect(ts.toMillis()).toBe(new Date(iso).getTime());

        const ms = 1792490400000;
        const tsMs = toFirestoreTimestamp(ms);
        expect(tsMs.toMillis()).toBe(ms);
      });

      it("produces a Timestamp for numeric zero (Unix epoch)", () => {
        const ts = toFirestoreTimestamp(0);
        expect(ts.toMillis()).toBe(0);
        expect(mocks.Timestamp.fromDate).toHaveBeenCalledWith(new Date(0));
      });

      it("canonicalizes arbitrary Timestamp-like objects via Timestamp.fromDate instead of passing directly", () => {
        const d = new Date("2026-10-20T10:00:00.000Z");
        const duckType = { toDate: () => d, toMillis: () => d.getTime() };
        const ts = toFirestoreTimestamp(duckType);

        expect(ts).not.toBe(duckType);
        expect(ts).toBeInstanceOf(mocks.Timestamp);
        expect(ts.toMillis()).toBe(d.getTime());
        expect(mocks.Timestamp.fromDate).toHaveBeenCalledWith(expect.any(Date));
      });

      it("preserves genuine Firestore Timestamp instances directly without recreation", () => {
        const d = new Date("2026-10-20T10:00:00.000Z");
        const genuine = mocks.Timestamp.fromDate(d);
        mocks.Timestamp.fromDate.mockClear();

        const ts = toFirestoreTimestamp(genuine);
        expect(ts).toBe(genuine);
        expect(mocks.Timestamp.fromDate).not.toHaveBeenCalled();
      });

      it("throws clear error on invalid date inputs including NaN, non-finite, and malformed inputs", () => {
        expect(() => toFirestoreTimestamp("invalid-date")).toThrow("Invalid date provided.");
        expect(() => toFirestoreTimestamp(new Date(NaN))).toThrow("Invalid date provided.");
        expect(() => toFirestoreTimestamp(NaN)).toThrow("Invalid date provided.");
        expect(() => toFirestoreTimestamp(Infinity)).toThrow("Invalid date provided.");
        expect(() => toFirestoreTimestamp(-Infinity)).toThrow("Invalid date provided.");
        expect(() => toFirestoreTimestamp(1e25)).toThrow("Invalid date provided.");
        expect(() => toFirestoreTimestamp(false)).toThrow("Invalid date provided.");
        expect(() => toFirestoreTimestamp({ toMillis: () => Infinity })).toThrow("Invalid date provided.");
        expect(() => toFirestoreTimestamp({ seconds: Infinity, nanoseconds: 0 })).toThrow("Invalid date provided.");
      });

      it("returns null for null or undefined", () => {
        expect(toFirestoreTimestamp(null)).toBeNull();
        expect(toFirestoreTimestamp(undefined)).toBeNull();
      });
    });

    describe("Common Fail-Closed Validation (All 4 Mutation Methods)", () => {
      const fixedNow = new Date("2026-10-15T12:00:00.000Z");
      const baseUpcoming = {
        id: "e-fail-closed",
        campusId: APEX_CAMPUS_ID,
        communityId: COMMUNITY_APEX_AI.id,
        title: "Upcoming Robotics Workshop",
        slug: "upcoming-robotics-workshop",
        description: "Learn robotics hands-on.",
        category: EVENT_CATEGORIES.TECH,
        location: "Robotics Lab 1",
        startAt: new Date("2026-10-20T10:00:00.000Z"),
        endAt: new Date("2026-10-20T16:00:00.000Z"),
        imageURL: null,
        createdBy: "student-1",
        organizerName: "Robotics Club",
        status: EVENT_STATUSES.PUBLISHED,
        visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
      };

      it("rejects missing eventId across all methods before any Firestore write or deletion", async () => {
        await expect(updateEvent("", { title: "New" }, baseUpcoming, fixedNow)).rejects.toThrow("Event ID is required");
        await expect(cancelEvent("", baseUpcoming, fixedNow)).rejects.toThrow("Event ID is required");
        await expect(republishEvent("", baseUpcoming, fixedNow)).rejects.toThrow("Event ID is required");
        await expect(deleteEvent("", baseUpcoming, fixedNow)).rejects.toThrow("Event ID is required");

        expect(mocks.updateDoc).not.toHaveBeenCalled();
        expect(mocks.deleteDoc).not.toHaveBeenCalled();
      });

      it("rejects missing currentEvent across all methods before any Firestore write or deletion", async () => {
        await expect(updateEvent("e-1", { title: "New" }, null, fixedNow)).rejects.toThrow("Current event object is required");
        await expect(cancelEvent("e-1", null, fixedNow)).rejects.toThrow("Current event object is required");
        await expect(republishEvent("e-1", null, fixedNow)).rejects.toThrow("Current event object is required");
        await expect(deleteEvent("e-1", null, fixedNow)).rejects.toThrow("Current event object is required");

        expect(mocks.updateDoc).not.toHaveBeenCalled();
        expect(mocks.deleteDoc).not.toHaveBeenCalled();
      });

      it("rejects invalid referenceNow across all methods before any Firestore write or deletion", async () => {
        for (const badRef of [
          null,
          "invalid-date",
          new Date(NaN),
          { seconds: 1700000000.5 },
          { seconds: 1700000000, nanoseconds: -1 },
          { nanoseconds: 500 },
        ]) {
          await expect(updateEvent("e-1", { title: "New" }, baseUpcoming, badRef)).rejects.toThrow("Invalid reference time.");
          await expect(cancelEvent("e-1", baseUpcoming, badRef)).rejects.toThrow("Invalid reference time.");
          await expect(republishEvent("e-1", { ...baseUpcoming, status: EVENT_STATUSES.CANCELLED }, badRef)).rejects.toThrow("Invalid reference time.");
          await expect(deleteEvent("e-1", baseUpcoming, badRef)).rejects.toThrow("Invalid reference time.");
        }

        expect(mocks.updateDoc).not.toHaveBeenCalled();
        expect(mocks.deleteDoc).not.toHaveBeenCalled();
      });

      it("rejects missing or malformed stored dates across all methods before any Firestore write or deletion", async () => {
        const missingDates = [
          { ...baseUpcoming, startAt: null },
          { ...baseUpcoming, endAt: null },
          { ...baseUpcoming, startAt: "not-a-date" },
          { ...baseUpcoming, endAt: "not-a-date" },
          { ...baseUpcoming, startAt: { seconds: 1700000000.5, nanoseconds: 0 } },
          { ...baseUpcoming, endAt: { seconds: 1700003600, nanoseconds: -1 } },
          { ...baseUpcoming, startAt: { seconds: 1700000000, nanoseconds: 1_000_000_000 } },
          { ...baseUpcoming, endAt: { seconds: 1700003600, nanoseconds: "invalid" } },
          { ...baseUpcoming, startAt: { seconds: null, nanoseconds: 0 } },
          { ...baseUpcoming, endAt: { nanoseconds: 500 } },
          { ...baseUpcoming, startAt: { seconds: 1700000000, nanoseconds: null } },
          { ...baseUpcoming, endAt: { seconds: "bad", nanoseconds: 0 } },
        ];

        for (const badEvent of missingDates) {
          await expect(updateEvent("e-1", { title: "New" }, badEvent, fixedNow)).rejects.toThrow(
            "Existing event startAt and endAt timestamps violate chronological integrity."
          );
          await expect(cancelEvent("e-1", badEvent, fixedNow)).rejects.toThrow(
            "Existing event startAt and endAt timestamps violate chronological integrity."
          );
          await expect(republishEvent("e-1", { ...badEvent, status: EVENT_STATUSES.CANCELLED }, fixedNow)).rejects.toThrow(
            "Existing event startAt and endAt timestamps violate chronological integrity."
          );
          await expect(deleteEvent("e-1", badEvent, fixedNow)).rejects.toThrow(
            "Existing event startAt and endAt timestamps violate chronological integrity."
          );
        }

        expect(mocks.updateDoc).not.toHaveBeenCalled();
        expect(mocks.deleteDoc).not.toHaveBeenCalled();
      });

      it("rejects inverted stored chronology (endAt < startAt) across all methods before any write or deletion", async () => {
        const inverted = {
          ...baseUpcoming,
          startAt: new Date("2026-10-20T16:00:00.000Z"),
          endAt: new Date("2026-10-20T10:00:00.000Z"),
        };

        await expect(updateEvent("e-1", { title: "New" }, inverted, fixedNow)).rejects.toThrow(
          "Existing event startAt and endAt timestamps violate chronological integrity."
        );
        await expect(cancelEvent("e-1", inverted, fixedNow)).rejects.toThrow(
          "Existing event startAt and endAt timestamps violate chronological integrity."
        );
        await expect(republishEvent("e-1", { ...inverted, status: EVENT_STATUSES.CANCELLED }, fixedNow)).rejects.toThrow(
          "Existing event startAt and endAt timestamps violate chronological integrity."
        );
        await expect(deleteEvent("e-1", inverted, fixedNow)).rejects.toThrow(
          "Existing event startAt and endAt timestamps violate chronological integrity."
        );

        expect(mocks.updateDoc).not.toHaveBeenCalled();
        expect(mocks.deleteDoc).not.toHaveBeenCalled();
      });
    });

    describe("updateEvent — Preconditions, Allowlists & Field Validation", () => {
      const fixedNow = new Date("2026-10-15T12:00:00.000Z");
      const upcomingEvent = {
        id: "e-up-1",
        campusId: APEX_CAMPUS_ID,
        communityId: COMMUNITY_APEX_AI.id,
        title: "Original Title",
        slug: "original-title",
        description: "Original Description",
        category: EVENT_CATEGORIES.TECH,
        location: "Original Location",
        startAt: new Date("2026-10-20T10:00:00.000Z"),
        endAt: new Date("2026-10-20T16:00:00.000Z"),
        imageURL: null,
        createdBy: "student-1",
        organizerName: "Apex AI",
        status: EVENT_STATUSES.PUBLISHED,
        visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
      };

      const ongoingEvent = {
        ...upcomingEvent,
        id: "e-on-1",
        startAt: new Date("2026-10-15T10:00:00.000Z"),
        endAt: new Date("2026-10-15T16:00:00.000Z"),
      };

      const completedEvent = {
        ...upcomingEvent,
        id: "e-comp-1",
        startAt: new Date("2026-10-10T10:00:00.000Z"),
        endAt: new Date("2026-10-10T16:00:00.000Z"),
      };

      it("rejects caller-supplied status explicitly with dedicated message", async () => {
        await expect(
          updateEvent("e-up-1", { status: EVENT_STATUSES.CANCELLED }, upcomingEvent, fixedNow)
        ).rejects.toThrow("Status cannot be modified via updateEvent. Use cancelEvent or republishEvent.");
        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("rejects edits on non-published events (e.g. cancelled)", async () => {
        const cancelledEvent = { ...upcomingEvent, status: EVENT_STATUSES.CANCELLED };
        await expect(
          updateEvent("e-up-1", { title: "New Title" }, cancelledEvent, fixedNow)
        ).rejects.toThrow("Only published events can be edited. Cancelled events must be republished before editing.");
        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("rejects edits on completed events unconditionally", async () => {
        await expect(
          updateEvent("e-comp-1", { location: "New Location" }, completedEvent, fixedNow)
        ).rejects.toThrow("Completed events are read-only and cannot be modified.");
        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("rejects immutable fields, caller updatedAt, and unknown fields for upcoming events", async () => {
        const immutableFields = ["id", "campusId", "communityId", "createdBy", "createdAt", "visibility"];
        for (const field of immutableFields) {
          await expect(
            updateEvent("e-up-1", { [field]: "attack-val" }, upcomingEvent, fixedNow)
          ).rejects.toThrow(`Cannot modify immutable event field: ${field}`);
        }

        await expect(
          updateEvent("e-up-1", { updatedAt: new Date() }, upcomingEvent, fixedNow)
        ).rejects.toThrow("updatedAt cannot be supplied by caller.");

        await expect(
          updateEvent("e-up-1", { unknownField: "bad" }, upcomingEvent, fixedNow)
        ).rejects.toThrow("Field 'unknownField' is not allowed for upcoming event edits.");

        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("rejects invalid categories on upcoming events", async () => {
        await expect(
          updateEvent("e-up-1", { category: "non-existent-cat" }, upcomingEvent, fixedNow)
        ).rejects.toThrow("Invalid event category");
        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("rejects setting startAt to past or present relative to referenceNow", async () => {
        await expect(
          updateEvent("e-up-1", { startAt: new Date("2026-10-14T10:00:00.000Z") }, upcomingEvent, fixedNow)
        ).rejects.toThrow("Event start time must be strictly in the future.");

        await expect(
          updateEvent("e-up-1", { startAt: fixedNow }, upcomingEvent, fixedNow)
        ).rejects.toThrow("Event start time must be strictly in the future.");

        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("rejects resulting chronology violation (resultingEndAt < resultingStartAt) across permutations", async () => {
        // 1. Proposed start pushed after existing end
        await expect(
          updateEvent("e-up-1", { startAt: new Date("2026-10-21T00:00:00.000Z") }, upcomingEvent, fixedNow)
        ).rejects.toThrow("End date/time must be at or after start date/time.");

        // 2. Proposed end pulled before existing start
        await expect(
          updateEvent("e-up-1", { endAt: new Date("2026-10-19T00:00:00.000Z") }, upcomingEvent, fixedNow)
        ).rejects.toThrow("End date/time must be at or after start date/time.");

        // 3. Both supplied but inverted
        await expect(
          updateEvent(
            "e-up-1",
            { startAt: new Date("2026-10-22T10:00:00Z"), endAt: new Date("2026-10-21T10:00:00Z") },
            upcomingEvent,
            fixedNow
          )
        ).rejects.toThrow("End date/time must be at or after start date/time.");

        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("rejects malformed startAt and endAt updates with dedicated message", async () => {
        const malformedDates = [
          { seconds: 1700000000.5 },
          { seconds: 1700000000, nanoseconds: -1 },
          { seconds: 1700000000, nanoseconds: 1_000_000_000 },
          { nanoseconds: 0 },
          "invalid-date",
        ];

        for (const badDate of malformedDates) {
          await expect(
            updateEvent("e-up-1", { startAt: badDate }, upcomingEvent, fixedNow)
          ).rejects.toThrow("Invalid startAt timestamp.");
          await expect(
            updateEvent("e-up-1", { endAt: badDate }, upcomingEvent, fixedNow)
          ).rejects.toThrow("Invalid endAt timestamp.");
          await expect(
            updateEvent("e-on-1", { endAt: badDate }, ongoingEvent, fixedNow)
          ).rejects.toThrow("Invalid endAt timestamp.");
        }

        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("ongoing allowlist rejects title, slug, category, organizerName, startAt, and unknown fields", async () => {
        const forbiddenOngoing = ["title", "slug", "category", "organizerName", "startAt", "visibility", "randomField"];
        for (const field of forbiddenOngoing) {
          await expect(
            updateEvent("e-on-1", { [field]: "val" }, ongoingEvent, fixedNow)
          ).rejects.toThrow();
        }
        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });
    });

    describe("updateEvent — Write Payloads & Selective Timestamp Canonicalization", () => {
      const fixedNow = new Date("2026-10-15T12:00:00.000Z");
      const baseUpcoming = {
        id: "e-up-payload",
        campusId: APEX_CAMPUS_ID,
        communityId: COMMUNITY_APEX_AI.id,
        title: "Original Title",
        slug: "original-title",
        description: "Original Description",
        category: EVENT_CATEGORIES.TECH,
        location: "Lab 1",
        startAt: new Date("2026-10-20T10:00:00.000Z"),
        endAt: new Date("2026-10-20T16:00:00.000Z"),
        imageURL: "https://example.com/original.jpg",
        createdBy: "student-1",
        organizerName: "Apex AI",
        status: EVENT_STATUSES.PUBLISHED,
        visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
      };

      it("title-only edit writes only title and updatedAt; omits startAt and endAt", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        await updateEvent("e-up-payload", { title: "New Title" }, baseUpcoming, fixedNow);

        expect(mocks.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-up-payload" }),
          {
            title: "New Title",
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
      });

      it("description-only edit writes only description and updatedAt; omits dates", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        await updateEvent("e-up-payload", { description: "New Description" }, baseUpcoming, fixedNow);

        expect(mocks.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-up-payload" }),
          {
            description: "New Description",
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
      });

      it("omits unchanged startAt when supplied with same timestamp alongside title change", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        await updateEvent(
          "e-up-payload",
          { title: "New Title", startAt: new Date(baseUpcoming.startAt.getTime()) },
          baseUpcoming,
          fixedNow
        );

        expect(mocks.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-up-payload" }),
          {
            title: "New Title",
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
      });

      it("omits unchanged endAt when supplied with same timestamp alongside title change", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        await updateEvent(
          "e-up-payload",
          { title: "New Title", endAt: new Date(baseUpcoming.endAt.getTime()) },
          baseUpcoming,
          fixedNow
        );

        expect(mocks.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-up-payload" }),
          {
            title: "New Title",
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
      });

      it("omits BOTH startAt and endAt when both are supplied unchanged alongside title change", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        await updateEvent(
          "e-up-payload",
          {
            title: "New Title",
            startAt: baseUpcoming.startAt.toISOString(),
            endAt: baseUpcoming.endAt.toISOString(),
          },
          baseUpcoming,
          fixedNow
        );

        expect(mocks.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-up-payload" }),
          {
            title: "New Title",
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
      });

      it("genuine startAt change canonicalizes to Firestore Timestamp; omits unchanged endAt", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        const newStart = new Date("2026-10-20T12:00:00.000Z");
        await updateEvent("e-up-payload", { startAt: newStart }, baseUpcoming, fixedNow);

        expect(mocks.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-up-payload" }),
          {
            startAt: expect.objectContaining({ toMillis: expect.any(Function) }),
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
        const callPayload = mocks.updateDoc.mock.calls[0][1];
        expect(callPayload.endAt).toBeUndefined();
        expect(callPayload.startAt.toMillis()).toBe(newStart.getTime());
      });

      it("genuine endAt change canonicalizes to Firestore Timestamp; omits unchanged startAt", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        const newEnd = new Date("2026-10-20T18:00:00.000Z");
        await updateEvent("e-up-payload", { endAt: newEnd }, baseUpcoming, fixedNow);

        const callPayload = mocks.updateDoc.mock.calls[0][1];
        expect(callPayload.startAt).toBeUndefined();
        expect(callPayload.endAt.toMillis()).toBe(newEnd.getTime());
      });

      it("combined genuine date edit canonicalizes both to Firestore Timestamp instances", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        const newStart = new Date("2026-10-21T09:00:00.000Z");
        const newEnd = new Date("2026-10-21T17:00:00.000Z");
        await updateEvent("e-up-payload", { startAt: newStart, endAt: newEnd }, baseUpcoming, fixedNow);

        const callPayload = mocks.updateDoc.mock.calls[0][1];
        expect(callPayload.startAt.toMillis()).toBe(newStart.getTime());
        expect(callPayload.endAt.toMillis()).toBe(newEnd.getTime());
      });

      it("sanitizes string fields and normalizes falsy imageURL to null", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        await updateEvent(
          "e-up-payload",
          {
            title: "   Trimmed Title   ",
            slug: "   trimmed-slug   ",
            location: "   Hall B   ",
            description: "   Details   ",
            organizerName: "   Apex Org   ",
            imageURL: "",
          },
          baseUpcoming,
          fixedNow
        );

        expect(mocks.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-up-payload" }),
          {
            title: "Trimmed Title",
            slug: "trimmed-slug",
            location: "Hall B",
            description: "Details",
            organizerName: "Apex Org",
            imageURL: null,
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
      });
    });

    describe("updateEvent — Ongoing Event Behavior & Exact Boundaries", () => {
      const fixedNow = new Date("2026-10-15T12:00:00.000Z");
      const ongoingEvent = {
        id: "e-ongoing-boundaries",
        campusId: APEX_CAMPUS_ID,
        communityId: COMMUNITY_APEX_AI.id,
        title: "Live Field Workshop",
        slug: "live-field-workshop",
        description: "Field tests.",
        category: EVENT_CATEGORIES.WORKSHOP,
        location: "Outdoor Arena",
        startAt: new Date("2026-10-15T10:00:00.000Z"),
        endAt: new Date("2026-10-15T16:00:00.000Z"),
        imageURL: null,
        createdBy: "student-1",
        organizerName: "Apex AI",
        status: EVENT_STATUSES.PUBLISHED,
        visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
      };

      it("ongoing location-only edit succeeds and omits endAt from write payload", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        await updateEvent("e-ongoing-boundaries", { location: "Arena Bay 2" }, ongoingEvent, fixedNow);

        expect(mocks.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-ongoing-boundaries" }),
          {
            location: "Arena Bay 2",
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
      });

      it("ongoing edit with unchanged endAt supplied succeeds and omits endAt from write payload", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        await updateEvent(
          "e-ongoing-boundaries",
          { location: "Arena Bay 2", endAt: new Date(ongoingEvent.endAt.getTime()) },
          ongoingEvent,
          fixedNow
        );

        expect(mocks.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-ongoing-boundaries" }),
          {
            location: "Arena Bay 2",
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
      });

      it("ongoing end-time extension persists new endAt as Firestore Timestamp", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        const extendedEnd = new Date("2026-10-15T18:00:00.000Z");
        await updateEvent("e-ongoing-boundaries", { endAt: extendedEnd }, ongoingEvent, fixedNow);

        const callPayload = mocks.updateDoc.mock.calls[0][1];
        expect(callPayload.endAt.toMillis()).toBe(extendedEnd.getTime());
      });

      it("ongoing edit rejects end-time shortening (cannot shorten)", async () => {
        const shortenedEnd = new Date("2026-10-15T14:00:00.000Z");
        await expect(
          updateEvent("e-ongoing-boundaries", { endAt: shortenedEnd }, ongoingEvent, fixedNow)
        ).rejects.toThrow("Ongoing event end time cannot be shortened.");
        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("ongoing edit rejects end time not strictly in the future", async () => {
        const pastEnd = new Date("2026-10-15T11:00:00.000Z"); // Before fixedNow (12:00)
        await expect(
          updateEvent("e-ongoing-boundaries", { endAt: pastEnd }, ongoingEvent, fixedNow)
        ).rejects.toThrow("Ongoing event end time cannot be shortened.");
        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("permits ongoing location edit at exact boundary referenceNow === existingEndAt", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        const exactEndNow = new Date(ongoingEvent.endAt.getTime());
        await updateEvent("e-ongoing-boundaries", { location: "Final Stage" }, ongoingEvent, exactEndNow);

        expect(mocks.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-ongoing-boundaries" }),
          {
            location: "Final Stage",
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
      });

      it("permits end-time extension at exact boundary referenceNow === existingEndAt", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        const exactEndNow = new Date(ongoingEvent.endAt.getTime());
        const extendedEnd = new Date("2026-10-15T19:00:00.000Z");
        await updateEvent("e-ongoing-boundaries", { endAt: extendedEnd }, ongoingEvent, exactEndNow);

        const callPayload = mocks.updateDoc.mock.calls[0][1];
        expect(callPayload.endAt.toMillis()).toBe(extendedEnd.getTime());
      });

      it("denies ongoing edits at exact boundary referenceNow === existingEndAt + 1ms (fails closed)", async () => {
        const afterEndNow = new Date(ongoingEvent.endAt.getTime() + 1);
        await expect(
          updateEvent("e-ongoing-boundaries", { location: "Too Late" }, ongoingEvent, afterEndNow)
        ).rejects.toThrow("Completed events are read-only and cannot be modified.");
        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });
    });

    describe("cancelEvent — Preconditions, Boundaries & Transitions", () => {
      const fixedNow = new Date("2026-10-15T12:00:00.000Z");
      const publishedUpcoming = {
        id: "e-cancel-up",
        campusId: APEX_CAMPUS_ID,
        communityId: COMMUNITY_APEX_AI,
        createdBy: "creator-1",
        status: EVENT_STATUSES.PUBLISHED,
        startAt: new Date("2026-10-20T10:00:00.000Z"),
        endAt: new Date("2026-10-20T16:00:00.000Z"),
      };
      const publishedOngoing = {
        id: "e-cancel-on",
        campusId: APEX_CAMPUS_ID,
        communityId: COMMUNITY_APEX_AI,
        createdBy: "creator-1",
        status: EVENT_STATUSES.PUBLISHED,
        startAt: new Date("2026-10-15T10:00:00.000Z"),
        endAt: new Date("2026-10-15T16:00:00.000Z"),
      };

      beforeEach(() => {
        mocks.mockBatch.set.mockClear();
        mocks.mockBatch.update.mockClear();
        mocks.mockBatch.delete.mockClear();
        mocks.mockBatch.commit.mockClear();
        mocks.mockBatch.commit.mockResolvedValue();
        mocks.getDoc.mockResolvedValue({ exists: () => false });
      });

      it("cancels an upcoming published event with atomic ledger creation", async () => {
        const result = await cancelEvent("e-cancel-up", publishedUpcoming, fixedNow);

        expect(result).toHaveProperty("cycleId");
        expect(typeof result.cycleId).toBe("string");
        expect(result.cycleId.length).toBeGreaterThanOrEqual(10);

        expect(mocks.mockBatch.update).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-cancel-up" }),
          {
            status: EVENT_STATUSES.CANCELLED,
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );

        expect(mocks.mockBatch.set).toHaveBeenCalledWith(
          expect.objectContaining({ path: "eventNotificationDeliveries/e-cancel-up" }),
          expect.objectContaining({
            id: "e-cancel-up",
            eventId: "e-cancel-up",
            cycleId: result.cycleId,
            campusId: APEX_CAMPUS_ID,
            communityId: COMMUNITY_APEX_AI,
            status: "pending",
            checkpointVersion: 0,
            processedCount: 0,
            lastProcessedRsvpId: null,
          })
        );

        expect(mocks.mockBatch.commit).toHaveBeenCalledTimes(1);
      });

      it("cancels an ongoing published event with atomic ledger creation", async () => {
        await cancelEvent("e-cancel-on", publishedOngoing, fixedNow);

        expect(mocks.mockBatch.update).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-cancel-on" }),
          {
            status: EVENT_STATUSES.CANCELLED,
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
        expect(mocks.mockBatch.commit).toHaveBeenCalledTimes(1);
      });

      it("reinitializes ledger with fresh cycleId on repeat cancellation after completion", async () => {
        mocks.getDoc.mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            status: "completed",
            cycleId: "cycle_old_1234567890",
            checkpointVersion: 3,
            processedCount: 24,
          }),
        });

        const result = await cancelEvent("e-cancel-up", publishedUpcoming, fixedNow);

        expect(result.cycleId).not.toBe("cycle_old_1234567890");
        expect(mocks.mockBatch.update).toHaveBeenCalledWith(
          expect.objectContaining({ path: "eventNotificationDeliveries/e-cancel-up" }),
          expect.objectContaining({
            cycleId: result.cycleId,
            status: "pending",
            checkpointVersion: 0,
            processedCount: 0,
            lastProcessedRsvpId: null,
          })
        );
        expect(mocks.mockBatch.commit).toHaveBeenCalledTimes(1);
      });

      it("rejects repeat cancellation while a previous cycle is currently active", async () => {
        mocks.getDoc.mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            status: "in_progress",
            cycleId: "cycle_active_1234567890",
          }),
        });

        await expect(cancelEvent("e-cancel-up", publishedUpcoming, fixedNow)).rejects.toThrow(
          "Cannot cancel event while a delivery cycle is currently active (in_progress)."
        );
        expect(mocks.mockBatch.commit).not.toHaveBeenCalled();
      });

      it("rejects cancellation if event is already cancelled", async () => {
        const cancelledEvent = { ...publishedUpcoming, status: EVENT_STATUSES.CANCELLED };
        await expect(cancelEvent("e-cancel-up", cancelledEvent, fixedNow)).rejects.toThrow(
          "Only published events can be cancelled; event is already cancelled."
        );
        expect(mocks.mockBatch.commit).not.toHaveBeenCalled();
      });

      it("permits cancellation at exact boundary referenceNow === existingEndAt", async () => {
        const exactEndNow = new Date(publishedOngoing.endAt.getTime());
        await cancelEvent("e-cancel-on", publishedOngoing, exactEndNow);

        expect(mocks.mockBatch.update).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-cancel-on" }),
          {
            status: EVENT_STATUSES.CANCELLED,
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
        expect(mocks.mockBatch.commit).toHaveBeenCalledTimes(1);
      });

      it("rejects cancellation at referenceNow === existingEndAt + 1ms (completed)", async () => {
        const afterEndNow = new Date(publishedOngoing.endAt.getTime() + 1);
        await expect(cancelEvent("e-cancel-on", publishedOngoing, afterEndNow)).rejects.toThrow(
          "Completed events cannot be cancelled."
        );
        expect(mocks.mockBatch.commit).not.toHaveBeenCalled();
      });
    });

    describe("republishEvent — Preconditions, Boundaries & Transitions", () => {
      const fixedNow = new Date("2026-10-15T12:00:00.000Z");
      const cancelledUpcoming = {
        id: "e-republish-up",
        status: EVENT_STATUSES.CANCELLED,
        startAt: new Date("2026-10-20T10:00:00.000Z"),
        endAt: new Date("2026-10-20T16:00:00.000Z"),
      };
      const cancelledStarted = {
        id: "e-republish-started",
        status: EVENT_STATUSES.CANCELLED,
        startAt: new Date("2026-10-15T10:00:00.000Z"),
        endAt: new Date("2026-10-15T16:00:00.000Z"),
      };

      beforeEach(() => {
        mocks.mockBatch.update.mockClear();
        mocks.mockBatch.commit.mockClear();
        mocks.mockBatch.commit.mockResolvedValue();
        mocks.updateDoc.mockClear();
        mocks.getDoc.mockResolvedValue({ exists: () => false });
      });

      it("republishes an upcoming cancelled event without ledger via updateDoc", async () => {
        mocks.updateDoc.mockResolvedValueOnce();

        await republishEvent("e-republish-up", cancelledUpcoming, fixedNow);

        expect(mocks.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-republish-up" }),
          {
            status: EVENT_STATUSES.PUBLISHED,
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
      });

      it("republishes event and atomically supersedes active delivery ledger", async () => {
        mocks.getDoc.mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ status: "in_progress" }),
        });

        await republishEvent("e-republish-up", cancelledUpcoming, fixedNow);

        expect(mocks.mockBatch.update).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-republish-up" }),
          {
            status: EVENT_STATUSES.PUBLISHED,
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
        expect(mocks.mockBatch.update).toHaveBeenCalledWith(
          expect.objectContaining({ path: "eventNotificationDeliveries/e-republish-up" }),
          {
            status: "superseded",
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
        expect(mocks.mockBatch.commit).toHaveBeenCalledTimes(1);
      });

      it("rejects republishing if event is not cancelled (e.g. published)", async () => {
        const publishedEvent = { ...cancelledUpcoming, status: EVENT_STATUSES.PUBLISHED };
        await expect(republishEvent("e-republish-up", publishedEvent, fixedNow)).rejects.toThrow(
          "Only cancelled events can be republished."
        );
        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("rejects republishing once event has started (ongoing)", async () => {
        await expect(republishEvent("e-republish-started", cancelledStarted, fixedNow)).rejects.toThrow(
          "Only upcoming cancelled events can be republished."
        );
        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });

      it("rejects republishing once event has completed", async () => {
        const cancelledCompleted = {
          ...cancelledUpcoming,
          startAt: new Date("2026-10-10T10:00:00.000Z"),
          endAt: new Date("2026-10-10T16:00:00.000Z"),
        };
        await expect(republishEvent("e-republish-up", cancelledCompleted, fixedNow)).rejects.toThrow(
          "Only upcoming cancelled events can be republished."
        );
        expect(mocks.updateDoc).not.toHaveBeenCalled();
      });
    });

    describe("deleteEvent — Preconditions & Status Validation", () => {
      const fixedNow = new Date("2026-10-15T12:00:00.000Z");
      const upcomingPublished = {
        id: "e-del-pub",
        status: EVENT_STATUSES.PUBLISHED,
        startAt: new Date("2026-10-20T10:00:00.000Z"),
        endAt: new Date("2026-10-20T16:00:00.000Z"),
      };
      const upcomingCancelled = {
        id: "e-del-canc",
        status: EVENT_STATUSES.CANCELLED,
        startAt: new Date("2026-10-20T10:00:00.000Z"),
        endAt: new Date("2026-10-20T16:00:00.000Z"),
      };
      const ongoingPublished = {
        id: "e-del-on",
        status: EVENT_STATUSES.PUBLISHED,
        startAt: new Date("2026-10-15T10:00:00.000Z"),
        endAt: new Date("2026-10-15T16:00:00.000Z"),
      };

      beforeEach(() => {
        mocks.mockBatch.delete.mockClear();
        mocks.mockBatch.update.mockClear();
        mocks.mockBatch.commit.mockClear();
        mocks.mockBatch.commit.mockResolvedValue();
        mocks.deleteDoc.mockClear();
        mocks.getDoc.mockResolvedValue({ exists: () => false });
      });

      it("deletes a published upcoming event", async () => {
        mocks.deleteDoc.mockResolvedValueOnce();

        await deleteEvent("e-del-pub", upcomingPublished, fixedNow);

        expect(mocks.deleteDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-del-pub" })
        );
      });

      it("deletes a cancelled upcoming event without active ledger via deleteDoc", async () => {
        mocks.deleteDoc.mockResolvedValueOnce();

        await deleteEvent("e-del-canc", upcomingCancelled, fixedNow);

        expect(mocks.deleteDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-del-canc" })
        );
      });

      it("deletes cancelled event and atomically supersedes active delivery ledger", async () => {
        mocks.getDoc.mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ status: "in_progress" }),
        });

        await deleteEvent("e-del-canc", upcomingCancelled, fixedNow);

        expect(mocks.mockBatch.delete).toHaveBeenCalledWith(
          expect.objectContaining({ path: "events/e-del-canc" })
        );
        expect(mocks.mockBatch.update).toHaveBeenCalledWith(
          expect.objectContaining({ path: "eventNotificationDeliveries/e-del-canc" }),
          {
            status: "superseded",
            updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
          }
        );
        expect(mocks.mockBatch.commit).toHaveBeenCalledTimes(1);
      });

      it("rejects deletion for events with unexpected status (draft, completed, etc.)", async () => {
        const invalidStatuses = ["completed", "draft", "archived", "pending"];
        for (const badStatus of invalidStatuses) {
          const badEvent = { ...upcomingPublished, status: badStatus };
          await expect(deleteEvent("e-del-pub", badEvent, fixedNow)).rejects.toThrow(
            "Invalid event status for deletion: status must be published or cancelled."
          );
        }
        expect(mocks.deleteDoc).not.toHaveBeenCalled();
      });

      it("rejects deletion once event is ongoing or completed", async () => {
        await expect(deleteEvent("e-del-on", ongoingPublished, fixedNow)).rejects.toThrow(
          "Only upcoming events can be deleted."
        );

        const exactStartNow = new Date(upcomingPublished.startAt.getTime());
        await expect(deleteEvent("e-del-pub", upcomingPublished, exactStartNow)).rejects.toThrow(
          "Only upcoming events can be deleted."
        );

        expect(mocks.deleteDoc).not.toHaveBeenCalled();
      });
    });
  });
});
