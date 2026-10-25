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
  EVENT_DEFINITIONS,
  EVENT_AI_HACKATHON,
  EVENT_DESIGN_SPRINT,
  EVENT_CAMPUS_FEST,
  EVENT_ST_JUDE_SYMPOSIUM,
  EVENT_AI_MEMBERS_ONLY,
  EVENT_ONGOING_WORKSHOP,
  EVENT_PAST_ORIENTATION,
  EVENT_CANCELLED_LECTURE,
  EVENT_IMMUTABLE_FIELDS,
  UPCOMING_MUTABLE_FIELDS,
  ONGOING_MUTABLE_FIELDS,
  getEventTemporalState,
  resolveEventFixture,
  buildEventFixtures,
} from "../../src/data/events.js";
import { COMMUNITIES } from "../../src/data/communities.js";
import { seedEvents, resolveSeedReferenceTime } from "../../scripts/seedEvents.mjs";

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

  describe("Event Fixtures & Schema Invariants (Hardening H1: Temporal Fixture Determinism)", () => {
    it("contains exactly eight deterministic fixtures with unique IDs", () => {
      expect(EVENT_LIST).toHaveLength(8);
      const ids = EVENT_LIST.map((e) => e.id);
      expect(new Set(ids).size).toBe(8);
      expect(ids).toContain("e2e-event-ai-hackathon");
      expect(ids).toContain("e2e-event-design-sprint");
      expect(ids).toContain("e2e-event-campus-fest");
      expect(ids).toContain("e2e-event-st-jude-symposium");
      expect(ids).toContain("e2e-event-ai-members-only");
      expect(ids).toContain("e2e-event-ongoing-workshop");
      expect(ids).toContain("e2e-event-past-orientation");
      expect(ids).toContain("e2e-event-cancelled-lecture");
    });

    it("EVENTS dictionary indexes each event by its canonical ID", () => {
      expect(EVENTS["e2e-event-ai-hackathon"]).toEqual(EVENT_AI_HACKATHON);
      expect(EVENTS["e2e-event-design-sprint"]).toEqual(EVENT_DESIGN_SPRINT);
      expect(EVENTS["e2e-event-campus-fest"]).toEqual(EVENT_CAMPUS_FEST);
      expect(EVENTS["e2e-event-st-jude-symposium"]).toEqual(EVENT_ST_JUDE_SYMPOSIUM);
      expect(EVENTS["e2e-event-ai-members-only"]).toEqual(EVENT_AI_MEMBERS_ONLY);
      expect(EVENTS["e2e-event-ongoing-workshop"]).toEqual(EVENT_ONGOING_WORKSHOP);
      expect(EVENTS["e2e-event-past-orientation"]).toEqual(EVENT_PAST_ORIENTATION);
      expect(EVENTS["e2e-event-cancelled-lecture"]).toEqual(EVENT_CANCELLED_LECTURE);
    });

    it("every event fixture satisfies the locked 17-field schema without extraneous fields", () => {
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
        expect(Object.keys(event).sort()).toEqual([...expectedFields].sort());

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
        expect(EVENT_STATUS_LIST).toContain(event.status);
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

    it("Apex and St. Jude campuses have appropriate representative events across categories", () => {
      const apexEvents = EVENT_LIST.filter((e) => e.campusId === APEX_CAMPUS_ID);
      const stJudeEvents = EVENT_LIST.filter((e) => e.campusId === ST_JUDE_CAMPUS_ID);

      expect(apexEvents).toHaveLength(7);
      expect(stJudeEvents).toHaveLength(1);

      expect(apexEvents.some((e) => e.category === EVENT_CATEGORIES.TECH)).toBe(true);
      expect(apexEvents.some((e) => e.category === EVENT_CATEGORIES.CULTURAL)).toBe(true);
      expect(apexEvents.some((e) => e.category === EVENT_CATEGORIES.WORKSHOP)).toBe(true);
      expect(apexEvents.some((e) => e.category === EVENT_CATEGORIES.SOCIAL)).toBe(true);
      expect(stJudeEvents.some((e) => e.category === EVENT_CATEGORIES.ACADEMIC)).toBe(true);
    });

    it("includes published fixtures and exactly one cancelled fixture", () => {
      const published = EVENT_LIST.filter((e) => e.status === EVENT_STATUSES.PUBLISHED);
      const cancelled = EVENT_LIST.filter((e) => e.status === EVENT_STATUSES.CANCELLED);

      expect(published).toHaveLength(7);
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].id).toBe("e2e-event-cancelled-lecture");
    });
  });

  describe("Relative Temporal Offset Determinism (buildEventFixtures & resolveEventFixture)", () => {
    const fixedSeed = new Date("2026-10-01T12:00:00.000Z");
    const seedMs = fixedSeed.getTime();
    const HOUR_MS = 60 * 60 * 1000;
    const DAY_MS = 24 * HOUR_MS;

    it("resolves all 8 definitions against a designated seed reference time", () => {
      expect(EVENT_DEFINITIONS).toHaveLength(8);
      const single = resolveEventFixture(EVENT_DEFINITIONS[0], fixedSeed);
      expect(single.id).toBe("e2e-event-ai-hackathon");

      const fixtures = buildEventFixtures(fixedSeed);
      expect(fixtures).toHaveLength(8);

      const byId = Object.fromEntries(fixtures.map((e) => [e.id, e]));

      // 1. Upcoming Hackathon (+3d to +4d)
      expect(new Date(byId["e2e-event-ai-hackathon"].startAt).getTime()).toBe(seedMs + 3 * DAY_MS);
      expect(new Date(byId["e2e-event-ai-hackathon"].endAt).getTime()).toBe(seedMs + 4 * DAY_MS);
      expect(getEventTemporalState(byId["e2e-event-ai-hackathon"], fixedSeed)).toBe("upcoming");

      // 2. Ongoing Workshop (-1h to +2h)
      expect(new Date(byId["e2e-event-ongoing-workshop"].startAt).getTime()).toBe(seedMs - 1 * HOUR_MS);
      expect(new Date(byId["e2e-event-ongoing-workshop"].endAt).getTime()).toBe(seedMs + 2 * HOUR_MS);
      expect(getEventTemporalState(byId["e2e-event-ongoing-workshop"], fixedSeed)).toBe("ongoing");

      // 3. Past Orientation (-3d to -2d)
      expect(new Date(byId["e2e-event-past-orientation"].startAt).getTime()).toBe(seedMs - 3 * DAY_MS);
      expect(new Date(byId["e2e-event-past-orientation"].endAt).getTime()).toBe(seedMs - 2 * DAY_MS);
      expect(getEventTemporalState(byId["e2e-event-past-orientation"], fixedSeed)).toBe("completed");

      // 4. Cancelled Lecture (+2d)
      expect(new Date(byId["e2e-event-cancelled-lecture"].startAt).getTime()).toBe(seedMs + 2 * DAY_MS);
      expect(byId["e2e-event-cancelled-lecture"].status).toBe(EVENT_STATUSES.CANCELLED);
    });

    it("shifting seed reference time by +60 days produces strictly shifted timestamps preserving relative state", () => {
      const shiftedSeed = new Date(seedMs + 60 * DAY_MS);
      const fixtures = buildEventFixtures(shiftedSeed);
      const byId = Object.fromEntries(fixtures.map((e) => [e.id, e]));

      expect(getEventTemporalState(byId["e2e-event-ai-hackathon"], shiftedSeed)).toBe("upcoming");
      expect(getEventTemporalState(byId["e2e-event-ongoing-workshop"], shiftedSeed)).toBe("ongoing");
      expect(getEventTemporalState(byId["e2e-event-past-orientation"], shiftedSeed)).toBe("completed");
    });
  });

  describe("Seed Reference Time Resolution (resolveSeedReferenceTime)", () => {
    it("returns current Date when override is empty, null, or undefined", () => {
      const before = Date.now();
      const res = resolveSeedReferenceTime();
      const after = Date.now();

      expect(res).toBeInstanceOf(Date);
      expect(res.getTime()).toBeGreaterThanOrEqual(before);
      expect(res.getTime()).toBeLessThanOrEqual(after);

      expect(resolveSeedReferenceTime(null)).toBeInstanceOf(Date);
      expect(resolveSeedReferenceTime("")).toBeInstanceOf(Date);
    });

    it("parses valid ISO 8601 string overrides deterministically", () => {
      const iso = "2026-11-15T08:30:00.000Z";
      const res = resolveSeedReferenceTime(iso);
      expect(res.toISOString()).toBe(iso);
    });

    it("parses numeric millisecond timestamps and numeric strings", () => {
      const ms = 1793500000000;
      expect(resolveSeedReferenceTime(ms).getTime()).toBe(ms);
      expect(resolveSeedReferenceTime(String(ms)).getTime()).toBe(ms);
    });

    it("passes through valid Date objects", () => {
      const d = new Date("2026-12-01T00:00:00.000Z");
      expect(resolveSeedReferenceTime(d)).toEqual(d);
    });

    it("throws clear errors on invalid date strings or unparseable input", () => {
      expect(() => resolveSeedReferenceTime("not-a-valid-date")).toThrow(
        /Invalid E2E_SEED_NOW date format/
      );
      expect(() => resolveSeedReferenceTime(new Date("invalid"))).toThrow(
        /Invalid Date object/
      );
      expect(() => resolveSeedReferenceTime({})).toThrow(
        /Unsupported E2E_SEED_NOW type/
      );
    });
  });

  describe("Immutability & Mutability Contracts", () => {
    it("defines the exact six immutable fields per the locked Revision 9 architecture", () => {
      expect(EVENT_IMMUTABLE_FIELDS).toEqual([
        "id",
        "campusId",
        "communityId",
        "createdBy",
        "createdAt",
        "visibility",
      ]);
      expect(EVENT_IMMUTABLE_FIELDS).toHaveLength(6);
      expect(Object.isFrozen(EVENT_IMMUTABLE_FIELDS)).toBe(true);
    });

    it("defines and freezes UPCOMING_MUTABLE_FIELDS allowlist", () => {
      expect(UPCOMING_MUTABLE_FIELDS).toEqual([
        "title",
        "slug",
        "description",
        "category",
        "location",
        "startAt",
        "endAt",
        "imageURL",
        "organizerName",
        "capacity",
      ]);
      expect(UPCOMING_MUTABLE_FIELDS).toHaveLength(10);
      expect(Object.isFrozen(UPCOMING_MUTABLE_FIELDS)).toBe(true);
    });

    it("defines and freezes ONGOING_MUTABLE_FIELDS allowlist", () => {
      expect(ONGOING_MUTABLE_FIELDS).toEqual([
        "location",
        "description",
        "imageURL",
        "endAt",
      ]);
      expect(ONGOING_MUTABLE_FIELDS).toHaveLength(4);
      expect(Object.isFrozen(ONGOING_MUTABLE_FIELDS)).toBe(true);
    });

    it("all fixtures possess all six immutable fields", () => {
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

    it("derives 'upcoming' when reference date is strictly before startAt", () => {
      const beforeStart = new Date("2026-10-15T09:59:59.000Z");
      expect(getEventTemporalState(mockEvent, beforeStart)).toBe("upcoming");
    });

    it("derives 'ongoing' at exact startAt, during event duration, and at exact endAt", () => {
      const exactStart = new Date("2026-10-15T10:00:00.000Z");
      const midway = new Date("2026-10-15T14:00:00.000Z");
      const exactEnd = new Date("2026-10-15T18:00:00.000Z");

      expect(getEventTemporalState(mockEvent, exactStart)).toBe("ongoing");
      expect(getEventTemporalState(mockEvent, midway)).toBe("ongoing");
      expect(getEventTemporalState(mockEvent, exactEnd)).toBe("ongoing");
    });

    it("derives 'completed' immediately after endAt has elapsed (+1ms boundary)", () => {
      const atEndPlusOneMs = new Date("2026-10-15T18:00:00.001Z");
      const afterEnd = new Date("2026-10-15T18:00:01.000Z");
      const dayAfter = new Date("2026-10-16T12:00:00.000Z");

      expect(getEventTemporalState(mockEvent, atEndPlusOneMs)).toBe("completed");
      expect(getEventTemporalState(mockEvent, afterEnd)).toBe("completed");
      expect(getEventTemporalState(mockEvent, dayAfter)).toBe("completed");
    });

    it("handles Firestore Timestamp-like objects with toMillis() method", () => {
      const timestampEvent = {
        startAt: { toMillis: () => 1700000000000 },
        endAt: { toMillis: () => 1700003600000 },
      };

      expect(getEventTemporalState(timestampEvent, 1699999999000)).toBe("upcoming");
      expect(getEventTemporalState(timestampEvent, 1700000000000)).toBe("ongoing");
      expect(getEventTemporalState(timestampEvent, 1700001000000)).toBe("ongoing");
      expect(getEventTemporalState(timestampEvent, 1700003600000)).toBe("ongoing");
      expect(getEventTemporalState(timestampEvent, 1700003600001)).toBe("completed");
      expect(getEventTemporalState(timestampEvent, 1700004000000)).toBe("completed");
    });

    it("fails closed (returns null) if event or timestamps are missing, null, or malformed", () => {
      expect(getEventTemporalState(null)).toBeNull();
      expect(getEventTemporalState(undefined)).toBeNull();
      expect(getEventTemporalState("not-an-object")).toBeNull();
      expect(getEventTemporalState({})).toBeNull();
      expect(getEventTemporalState({ startAt: null, endAt: "2026-10-15T18:00:00.000Z" })).toBeNull();
      expect(getEventTemporalState({ startAt: "2026-10-15T10:00:00.000Z", endAt: null })).toBeNull();
      expect(getEventTemporalState({ startAt: "invalid", endAt: "2026-10-15T18:00:00.000Z" })).toBeNull();
      expect(getEventTemporalState({ startAt: "2026-10-15T10:00:00.000Z", endAt: "invalid" })).toBeNull();
    });

    it("fails closed (returns null) if referenceDate is missing or unparseable", () => {
      expect(getEventTemporalState(mockEvent, null)).toBeNull();
      expect(getEventTemporalState(mockEvent, "invalid-date-string")).toBeNull();
      expect(getEventTemporalState(mockEvent, new Date(NaN))).toBeNull();
    });

    it("handles numeric zero (Unix epoch) as valid timestamps", () => {
      const epochEvent = { startAt: 0, endAt: 3600000 };
      expect(getEventTemporalState(epochEvent, -1000)).toBe("upcoming");
      expect(getEventTemporalState(epochEvent, 0)).toBe("ongoing");
      expect(getEventTemporalState(epochEvent, 1800000)).toBe("ongoing");
      expect(getEventTemporalState(epochEvent, 3600000)).toBe("ongoing");
      expect(getEventTemporalState(epochEvent, 3600001)).toBe("completed");
    });

    it("fails closed (returns null) for non-finite or out-of-range timestamp methods/properties", () => {
      expect(getEventTemporalState({ startAt: { toMillis: () => Infinity }, endAt: 1700003600000 }, 1700000000000)).toBeNull();
      expect(getEventTemporalState({ startAt: 1700000000000, endAt: { toMillis: () => -Infinity } }, 1700000000000)).toBeNull();
      expect(getEventTemporalState({ startAt: { toMillis: () => NaN }, endAt: 1700003600000 }, 1700000000000)).toBeNull();
      expect(getEventTemporalState({ startAt: { toDate: () => new Date(NaN) }, endAt: 1700003600000 }, 1700000000000)).toBeNull();
      expect(getEventTemporalState({ startAt: { seconds: Infinity, nanoseconds: 0 }, endAt: 1700003600000 }, 1700000000000)).toBeNull();
      expect(getEventTemporalState({ startAt: 1700000000000, endAt: { seconds: 1700003600, nanoseconds: Infinity } }, 1700000000000)).toBeNull();
      expect(getEventTemporalState({ startAt: 1e25, endAt: 1e26 }, 1700000000000)).toBeNull();
      expect(getEventTemporalState(mockEvent, { toMillis: () => Infinity })).toBeNull();
      expect(getEventTemporalState(mockEvent, Infinity)).toBeNull();
      expect(getEventTemporalState(mockEvent, false)).toBeNull();
    });

    it("fails closed (returns null) if existing stored chronology is inverted (endAt < startAt)", () => {
      const invertedEvent = {
        startAt: "2026-10-15T18:00:00.000Z",
        endAt: "2026-10-15T10:00:00.000Z",
      };
      expect(getEventTemporalState(invertedEvent, new Date("2026-10-15T09:00:00.000Z"))).toBeNull();
      expect(getEventTemporalState(invertedEvent, new Date("2026-10-15T12:00:00.000Z"))).toBeNull();
      expect(getEventTemporalState(invertedEvent, new Date("2026-10-15T20:00:00.000Z"))).toBeNull();
    });

    it("handles valid seconds/nanoseconds representations including omitted nanoseconds, boundaries, and negative seconds", () => {
      // Omitted nanoseconds
      const omittedNanoEvent = {
        startAt: { seconds: 1700000000 },
        endAt: { seconds: 1700003600 },
      };
      expect(getEventTemporalState(omittedNanoEvent, 1699999999000)).toBe("upcoming");
      expect(getEventTemporalState(omittedNanoEvent, 1700000000000)).toBe("ongoing");
      expect(getEventTemporalState(omittedNanoEvent, 1700003600000)).toBe("ongoing");
      expect(getEventTemporalState(omittedNanoEvent, 1700003600001)).toBe("completed");

      // Nanoseconds at boundary values 0 and 999_999_999
      const boundaryNanoEvent = {
        startAt: { seconds: 1700000000, nanoseconds: 0 },
        endAt: { seconds: 1700000000, nanoseconds: 999_999_999 },
      };
      expect(getEventTemporalState(boundaryNanoEvent, 1700000000000)).toBe("ongoing");
      expect(getEventTemporalState(boundaryNanoEvent, 1700000000999)).toBe("ongoing");
      expect(getEventTemporalState(boundaryNanoEvent, 1700000001000)).toBe("completed");

      // Valid negative seconds with non-negative nanoseconds (pre-epoch)
      const preEpochEvent = {
        startAt: { seconds: -100, nanoseconds: 0 }, // -100,000 ms
        endAt: { seconds: -50, nanoseconds: 500_000_000 }, // -49,500 ms
      };
      expect(getEventTemporalState(preEpochEvent, -100001)).toBe("upcoming");
      expect(getEventTemporalState(preEpochEvent, -100000)).toBe("ongoing");
      expect(getEventTemporalState(preEpochEvent, -49500)).toBe("ongoing");
      expect(getEventTemporalState(preEpochEvent, -49499)).toBe("completed");
    });

    it("fails closed (returns null) for malformed seconds/nanoseconds representations", () => {
      const validEnd = { seconds: 1700003600, nanoseconds: 0 };
      const ref = 1700000000000;

      // Fractional seconds
      expect(getEventTemporalState({ startAt: { seconds: 1700000000.5, nanoseconds: 0 }, endAt: validEnd }, ref)).toBeNull();
      expect(getEventTemporalState({ startAt: { seconds: 1700000000 }, endAt: { seconds: 1700003600.2 } }, ref)).toBeNull();

      // Fractional nanoseconds
      expect(getEventTemporalState({ startAt: { seconds: 1700000000, nanoseconds: 100.5 }, endAt: validEnd }, ref)).toBeNull();

      // Negative nanoseconds
      expect(getEventTemporalState({ startAt: { seconds: 1700000000, nanoseconds: -1 }, endAt: validEnd }, ref)).toBeNull();

      // Out-of-range nanoseconds (>= 1_000_000_000)
      expect(getEventTemporalState({ startAt: { seconds: 1700000000, nanoseconds: 1_000_000_000 }, endAt: validEnd }, ref)).toBeNull();
      expect(getEventTemporalState({ startAt: { seconds: 1700000000, nanoseconds: 1_000_000_001 }, endAt: validEnd }, ref)).toBeNull();

      // Explicitly supplied null, string, or boolean nanoseconds
      expect(getEventTemporalState({ startAt: { seconds: 1700000000, nanoseconds: null }, endAt: validEnd }, ref)).toBeNull();
      expect(getEventTemporalState({ startAt: { seconds: 1700000000, nanoseconds: "500" }, endAt: validEnd }, ref)).toBeNull();
      expect(getEventTemporalState({ startAt: { seconds: 1700000000, nanoseconds: false }, endAt: validEnd }, ref)).toBeNull();
      expect(getEventTemporalState({ startAt: { seconds: 1700000000, nanoseconds: true }, endAt: validEnd }, ref)).toBeNull();

      // Explicitly supplied null, string, or boolean seconds
      expect(getEventTemporalState({ startAt: { seconds: null, nanoseconds: 0 }, endAt: validEnd }, ref)).toBeNull();
      expect(getEventTemporalState({ startAt: { seconds: "1700000000", nanoseconds: 0 }, endAt: validEnd }, ref)).toBeNull();
      expect(getEventTemporalState({ startAt: { seconds: false, nanoseconds: 0 }, endAt: validEnd }, ref)).toBeNull();
      expect(getEventTemporalState({ startAt: { seconds: true, nanoseconds: 0 }, endAt: validEnd }, ref)).toBeNull();

      // Missing seconds when nanoseconds is present
      expect(getEventTemporalState({ startAt: { nanoseconds: 0 }, endAt: validEnd }, ref)).toBeNull();
      expect(getEventTemporalState({ startAt: { nanoseconds: 500 }, endAt: validEnd }, ref)).toBeNull();

      // Malformed seconds/nanoseconds in referenceDate
      expect(getEventTemporalState(mockEvent, { seconds: 1700000000.5, nanoseconds: 0 })).toBeNull();
      expect(getEventTemporalState(mockEvent, { seconds: 1700000000, nanoseconds: -1 })).toBeNull();
      expect(getEventTemporalState(mockEvent, { seconds: 1700000000, nanoseconds: "invalid" })).toBeNull();
      expect(getEventTemporalState(mockEvent, { nanoseconds: 0 })).toBeNull();
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
