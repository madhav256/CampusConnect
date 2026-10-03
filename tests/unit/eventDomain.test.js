import { describe, expect, it, vi } from "vitest";
import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LIST,
  EVENT_STATUSES,
  EVENT_STATUS_LIST,
  EVENT_VISIBILITIES,
  EVENT_VISIBILITY_LIST,
} from "../../src/constants.js";
import {
  EVENTS,
  EVENT_LIST,
  EVENT_AI_HACKATHON,
  EVENT_DESIGN_SPRINT,
  EVENT_CAMPUS_FEST,
  EVENT_ST_JUDE_SYMPOSIUM,
  EVENT_AI_MEMBERS_ONLY,
  EVENT_IMMUTABLE_FIELDS,
  getEventTemporalState,
} from "../../src/data/events.js";
import { COMMUNITIES } from "../../src/data/communities.js";
import { seedEvents } from "../../scripts/seedEvents.mjs";

describe("Milestone 20 — Unit 20.1: Event Domain Model & Seeding Invariants", () => {
  describe("Event Constants & Enums", () => {
    it("exports all eight required event categories", () => {
      expect(EVENT_CATEGORIES.ACADEMIC).toBe("academic");
      expect(EVENT_CATEGORIES.TECH).toBe("tech");
      expect(EVENT_CATEGORIES.CULTURAL).toBe("cultural");
      expect(EVENT_CATEGORIES.SPORTS).toBe("sports");
      expect(EVENT_CATEGORIES.CAREER).toBe("career");
      expect(EVENT_CATEGORIES.WORKSHOP).toBe("workshop");
      expect(EVENT_CATEGORIES.SOCIAL).toBe("social");
      expect(EVENT_CATEGORIES.COMPETITION).toBe("competition");

      expect(EVENT_CATEGORY_LIST).toEqual([
        "academic",
        "tech",
        "cultural",
        "sports",
        "career",
        "workshop",
        "social",
        "competition",
      ]);
      expect(EVENT_CATEGORY_LIST).toHaveLength(8);
    });

    it("exports exact stored event statuses (published, cancelled)", () => {
      expect(EVENT_STATUSES.PUBLISHED).toBe("published");
      expect(EVENT_STATUSES.CANCELLED).toBe("cancelled");

      expect(EVENT_STATUS_LIST).toEqual(["published", "cancelled"]);
      expect(EVENT_STATUS_LIST).toHaveLength(2);
    });

    it("exports exact event visibilities (campus_public, community_only)", () => {
      expect(EVENT_VISIBILITIES.CAMPUS_PUBLIC).toBe("campus_public");
      expect(EVENT_VISIBILITIES.COMMUNITY_ONLY).toBe("community_only");

      expect(EVENT_VISIBILITY_LIST).toEqual([
        "campus_public",
        "community_only",
      ]);
      expect(EVENT_VISIBILITY_LIST).toHaveLength(2);
    });
  });

  describe("Event Fixtures & Schema Invariants", () => {
    it("contains exactly five deterministic fixtures with unique IDs", () => {
      expect(EVENT_LIST).toHaveLength(5);
      const ids = EVENT_LIST.map((e) => e.id);
      expect(new Set(ids).size).toBe(5);
      expect(ids).toContain("e2e-event-ai-hackathon");
      expect(ids).toContain("e2e-event-design-sprint");
      expect(ids).toContain("e2e-event-campus-fest");
      expect(ids).toContain("e2e-event-st-jude-symposium");
      expect(ids).toContain("e2e-event-ai-members-only");
    });

    it("EVENTS dictionary indexes each event by its canonical ID", () => {
      expect(EVENTS["e2e-event-ai-hackathon"]).toEqual(EVENT_AI_HACKATHON);
      expect(EVENTS["e2e-event-design-sprint"]).toEqual(EVENT_DESIGN_SPRINT);
      expect(EVENTS["e2e-event-campus-fest"]).toEqual(EVENT_CAMPUS_FEST);
      expect(EVENTS["e2e-event-st-jude-symposium"]).toEqual(EVENT_ST_JUDE_SYMPOSIUM);
      expect(EVENTS["e2e-event-ai-members-only"]).toEqual(EVENT_AI_MEMBERS_ONLY);
    });

    it("every event fixture satisfies the locked 17-field schema", () => {
      const expectedFields = [
        "id",
        "campusId",
        "communityId",
        "title",
        "slug",
        "description",
        "category",
        "location",
        "startAt",
        "endAt",
        "imageURL",
        "createdBy",
        "organizerName",
        "status",
        "visibility",
        "createdAt",
        "updatedAt",
      ];

      for (const event of EVENT_LIST) {
        for (const field of expectedFields) {
          expect(event).toHaveProperty(field);
        }

        // Identifier invariants
        expect(typeof event.id).toBe("string");
        expect(event.id.length).toBeGreaterThan(0);

        // Multi-tenancy invariants
        expect([APEX_CAMPUS_ID, ST_JUDE_CAMPUS_ID]).toContain(event.campusId);

        // Community reference invariants
        expect(typeof event.communityId).toBe("string");
        expect(COMMUNITIES[event.communityId]).toBeDefined();
        expect(COMMUNITIES[event.communityId].campusId).toBe(event.campusId);

        // Title and description invariants
        expect(typeof event.title).toBe("string");
        expect(event.title.length).toBeGreaterThanOrEqual(3);
        expect(typeof event.slug).toBe("string");
        expect(event.slug.length).toBeGreaterThan(0);
        expect(typeof event.description).toBe("string");
        expect(event.description.length).toBeGreaterThan(0);

        // Category, location, status, visibility
        expect(EVENT_CATEGORY_LIST).toContain(event.category);
        expect(typeof event.location).toBe("string");
        expect(event.location.length).toBeGreaterThan(0);
        expect(event.status).toBe(EVENT_STATUSES.PUBLISHED);
        expect(EVENT_VISIBILITY_LIST).toContain(event.visibility);

        // Creator and organizer
        expect(typeof event.createdBy).toBe("string");
        expect(event.createdBy.length).toBeGreaterThan(0);
        expect(typeof event.organizerName).toBe("string");
        expect(event.organizerName.length).toBeGreaterThan(0);

        // Optional image URL
        expect(event.imageURL === null || typeof event.imageURL === "string").toBe(true);

        // Timestamp validation & chronological invariant
        const startMs = new Date(event.startAt).getTime();
        const endMs = new Date(event.endAt).getTime();
        expect(Number.isNaN(startMs)).toBe(false);
        expect(Number.isNaN(endMs)).toBe(false);
        expect(endMs).toBeGreaterThanOrEqual(startMs);

        const createdMs = new Date(event.createdAt).getTime();
        const updatedMs = new Date(event.updatedAt).getTime();
        expect(Number.isNaN(createdMs)).toBe(false);
        expect(Number.isNaN(updatedMs)).toBe(false);
      }
    });

    it("Apex and St. Jude campuses have appropriate representative events", () => {
      const apexEvents = EVENT_LIST.filter((e) => e.campusId === APEX_CAMPUS_ID);
      const stJudeEvents = EVENT_LIST.filter((e) => e.campusId === ST_JUDE_CAMPUS_ID);

      expect(apexEvents).toHaveLength(4);
      expect(stJudeEvents).toHaveLength(1);

      expect(apexEvents.some((e) => e.category === EVENT_CATEGORIES.TECH)).toBe(true);
      expect(apexEvents.some((e) => e.category === EVENT_CATEGORIES.CULTURAL)).toBe(true);
      expect(stJudeEvents.some((e) => e.category === EVENT_CATEGORIES.ACADEMIC)).toBe(true);
    });
  });

  describe("Immutability Contract", () => {
    it("defines the exact five immutable fields per the locked architecture", () => {
      expect(EVENT_IMMUTABLE_FIELDS).toEqual([
        "id",
        "campusId",
        "communityId",
        "createdBy",
        "createdAt",
      ]);
      expect(EVENT_IMMUTABLE_FIELDS).toHaveLength(5);
    });

    it("all fixtures possess all five immutable fields", () => {
      for (const event of EVENT_LIST) {
        for (const immutableKey of EVENT_IMMUTABLE_FIELDS) {
          expect(event[immutableKey]).toBeDefined();
          expect(typeof event[immutableKey]).toBe("string");
        }
      }
    });
  });

  describe("Derived Temporal State Helper (Pure Domain Logic)", () => {
    const mockEvent = {
      startAt: "2026-10-15T10:00:00.000Z",
      endAt: "2026-10-15T18:00:00.000Z",
    };

    it("derives 'upcoming' when reference date is before startAt", () => {
      const beforeStart = new Date("2026-10-15T09:59:59.000Z");
      expect(getEventTemporalState(mockEvent, beforeStart)).toBe("upcoming");
    });

    it("derives 'ongoing' at exact startAt and during event duration", () => {
      const exactStart = new Date("2026-10-15T10:00:00.000Z");
      const midway = new Date("2026-10-15T14:00:00.000Z");
      const exactEnd = new Date("2026-10-15T18:00:00.000Z");

      expect(getEventTemporalState(mockEvent, exactStart)).toBe("ongoing");
      expect(getEventTemporalState(mockEvent, midway)).toBe("ongoing");
      expect(getEventTemporalState(mockEvent, exactEnd)).toBe("ongoing");
    });

    it("derives 'completed' immediately after endAt has elapsed", () => {
      const afterEnd = new Date("2026-10-15T18:00:01.000Z");
      const dayAfter = new Date("2026-10-16T12:00:00.000Z");

      expect(getEventTemporalState(mockEvent, afterEnd)).toBe("completed");
      expect(getEventTemporalState(mockEvent, dayAfter)).toBe("completed");
    });

    it("handles Firestore Timestamp-like objects with toMillis() method", () => {
      const timestampEvent = {
        startAt: { toMillis: () => 1700000000000 },
        endAt: { toMillis: () => 1700003600000 },
      };

      expect(getEventTemporalState(timestampEvent, 1699999999000)).toBe("upcoming");
      expect(getEventTemporalState(timestampEvent, 1700001000000)).toBe("ongoing");
      expect(getEventTemporalState(timestampEvent, 1700004000000)).toBe("completed");
    });

    it("falls back gracefully to 'upcoming' if event or timestamps are missing", () => {
      expect(getEventTemporalState(null)).toBe("upcoming");
      expect(getEventTemporalState({})).toBe("upcoming");
      expect(getEventTemporalState({ startAt: null })).toBe("upcoming");
    });
  });

  describe("seedEvents Function & Seeder Idempotency", () => {
    it("idempotently sets each event document with merge: true", async () => {
      const setMock = vi.fn().mockResolvedValue(undefined);
      const docMock = vi.fn((id) => ({
        id,
        set: setMock,
      }));
      const collectionMock = vi.fn((name) => {
        expect(name).toBe("events");
        return { doc: docMock };
      });

      const mockDb = { collection: collectionMock };
      const mockTimestamp = { seconds: 1700000000, nanoseconds: 0 };

      const seededIds = await seedEvents(mockDb, mockTimestamp);

      expect(seededIds).toEqual(EVENT_LIST.map((e) => e.id));
      expect(collectionMock).toHaveBeenCalledTimes(EVENT_LIST.length);

      for (const event of EVENT_LIST) {
        expect(docMock).toHaveBeenCalledWith(event.id);
        expect(setMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: event.id,
            campusId: event.campusId,
            communityId: event.communityId,
            title: event.title,
            slug: event.slug,
            category: event.category,
            location: event.location,
            status: event.status,
            visibility: event.visibility,
            createdAt: mockTimestamp,
            updatedAt: mockTimestamp,
          }),
          { merge: true }
        );
      }
    });

    it("running seeder twice produces deterministic output without duplicate document writes", async () => {
      const setMock = vi.fn().mockResolvedValue(undefined);
      const docMock = vi.fn((id) => ({
        id,
        set: setMock,
      }));
      const collectionMock = vi.fn(() => ({ doc: docMock }));
      const mockDb = { collection: collectionMock };
      const mockTimestamp = { seconds: 1700000000, nanoseconds: 0 };

      const run1 = await seedEvents(mockDb, mockTimestamp);
      const run2 = await seedEvents(mockDb, mockTimestamp);

      expect(run1).toEqual(run2);
      expect(new Set(run1).size).toBe(run1.length);
      expect(setMock).toHaveBeenCalledTimes(EVENT_LIST.length * 2);
    });
  });
});
