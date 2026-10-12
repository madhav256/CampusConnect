import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
} from "../../src/constants.js";
import {
  COMMUNITY_APEX_AI,
  COMMUNITY_ST_JUDE_MED,
} from "../../src/data/communities.js";
import { EVENT_AI_HACKATHON } from "../../src/data/events.js";

const mocks = vi.hoisted(() => ({
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
  onSnapshot: vi.fn(),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  serverTimestamp: vi.fn(() => ({ _methodName: "serverTimestamp" })),
  Timestamp: {
    fromDate: vi.fn((d) => ({
      toDate: () => d,
      toMillis: () => d.getTime(),
      seconds: Math.floor(d.getTime() / 1000),
      nanoseconds: 0,
    })),
  },
  mockDb: { id: "mock-db" },
}));

vi.mock("../../src/firebase/config", () => ({
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
  deleteEvent,
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

    it("updateEvent validates inputs and strips immutable fields", async () => {
      await expect(updateEvent("", {})).rejects.toThrow("Event ID is required");
      await expect(updateEvent("e-1", null)).rejects.toThrow("Updates object is required");

      mocks.updateDoc.mockResolvedValueOnce();

      await updateEvent("e-1", {
        id: "attempt-hijack-id",
        campusId: ST_JUDE_CAMPUS_ID,
        communityId: COMMUNITY_ST_JUDE_MED.id,
        createdBy: "attacker-uid",
        createdAt: "2020-01-01T00:00:00Z",
        title: "Legitimate Title Update",
        location: "Auditorium B",
      });

      // Verify immutable fields are never present in the payload sent to updateDoc
      expect(mocks.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "events/e-1" }),
        expect.not.objectContaining({
          id: "attempt-hijack-id",
          campusId: ST_JUDE_CAMPUS_ID,
          communityId: COMMUNITY_ST_JUDE_MED.id,
          createdBy: "attacker-uid",
          createdAt: "2020-01-01T00:00:00Z",
        })
      );
      expect(mocks.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "events/e-1" }),
        expect.objectContaining({
          title: "Legitimate Title Update",
          location: "Auditorium B",
          updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
        })
      );
    });

    it("updateEvent validates mutable fields and rejects invalid endAt < startAt", async () => {
      await expect(
        updateEvent("e-1", { category: "unsupported-category" })
      ).rejects.toThrow("Invalid event category");

      await expect(
        updateEvent("e-1", {
          startAt: new Date("2026-10-25T14:00:00Z"),
          endAt: new Date("2026-10-25T10:00:00Z"),
        })
      ).rejects.toThrow("Event end time must be after or equal to start time.");
    });

    it("cancelEvent sets status to cancelled and preserves updatedAt timestamp", async () => {
      mocks.updateDoc.mockResolvedValueOnce();

      await cancelEvent("e-cancel-me");
      expect(mocks.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "events/e-cancel-me" }),
        {
          status: EVENT_STATUSES.CANCELLED,
          updatedAt: expect.objectContaining({ _methodName: "serverTimestamp" }),
        }
      );
    });

    it("deleteEvent invokes deleteDoc on canonical event path", async () => {
      mocks.deleteDoc.mockResolvedValueOnce();

      await deleteEvent("e-delete-me");
      expect(mocks.deleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "events/e-delete-me" })
      );
    });
  });
});
