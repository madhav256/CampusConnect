import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  EVENT_STATUSES,
} from "../../src/constants.js";
import {
  EVENT_RSVP_FIELDS,
  EVENT_RSVP_IMMUTABLE_FIELDS,
  RSVP_DISPLAY_STATES,
  MAX_REPRESENTABLE_DATE_MS,
  getEventRsvpId,
  buildEventRsvp,
  validateEventRsvp,
  isValidRsvpCreatedAt,
  getRsvpDisplayState,
  EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF,
  EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B_DEF,
  EVENT_RSVP_DESIGN_SPRINT_STUDENT_A_DEF,
  EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE_DEF,
  EVENT_RSVP_DEFINITIONS,
  resolveEventRsvpFixture,
  buildEventRsvpFixtures,
  EVENT_RSVP_AI_HACKATHON_STUDENT_B,
  EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B,
  EVENT_RSVP_DESIGN_SPRINT_STUDENT_A,
  EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE,
  EVENT_RSVP_LIST,
  EVENT_RSVPS,
} from "../../src/data/eventRsvps.js";
import { EVENT_LIST, EVENTS, buildEventFixtures } from "../../src/data/events.js";
import { E2E_USERS } from "../e2e/fixtures/testUsers.js";
import { seedEventRsvps } from "../../scripts/seedEventRsvps.mjs";

describe("Milestone 21 — Unit 21.1: RSVP Domain Model & Seeding Invariants", () => {
  describe("Locked Five-Field Schema & Immutability", () => {
    it("exports exactly five canonical schema fields", () => {
      expect(EVENT_RSVP_FIELDS).toEqual([
        "id",
        "eventId",
        "campusId",
        "userId",
        "createdAt",
      ]);
      expect(EVENT_RSVP_FIELDS).toHaveLength(5);
    });

    it("marks all five fields as immutable", () => {
      expect(EVENT_RSVP_IMMUTABLE_FIELDS).toEqual([
        "id",
        "eventId",
        "campusId",
        "userId",
        "createdAt",
      ]);
      expect(EVENT_RSVP_IMMUTABLE_FIELDS).toHaveLength(5);
    });

    it("does not include mutable status, counters, capacity, waitlists, or notifications", () => {
      const forbiddenFields = [
        "status",
        "counter",
        "attendeeCount",
        "capacity",
        "waitlist",
        "notes",
        "notifications",
        "updatedAt",
        "checkedIn",
        "communityId",
        "visibility",
      ];
      for (const field of forbiddenFields) {
        expect(EVENT_RSVP_FIELDS).not.toContain(field);
        expect(EVENT_RSVP_IMMUTABLE_FIELDS).not.toContain(field);
      }
    });

    it("exports all five derived RSVP display states", () => {
      expect(RSVP_DISPLAY_STATES).toEqual({
        NOT_GOING: "not_going",
        GOING: "going",
        ATTENDED_WINDOW_PASSED: "attended_window_passed",
        EVENT_CANCELLED: "event_cancelled",
        EVENT_UNAVAILABLE: "event_unavailable",
      });
    });
  });

  describe("Deterministic Document ID Derivation (`getEventRsvpId`)", () => {
    it("derives deterministic document ID in {eventId}_{userId} format", () => {
      const id = getEventRsvpId("e2e-event-ai-hackathon", "e2e-student-b");
      expect(id).toBe("e2e-event-ai-hackathon_e2e-student-b");
    });

    it("is strictly idempotent and deterministic across repeated invocations", () => {
      const id1 = getEventRsvpId("evt-123", "usr-456");
      const id2 = getEventRsvpId("evt-123", "usr-456");
      expect(id1).toBe(id2);
      expect(id1).toBe("evt-123_usr-456");
    });

    it("throws a clear error when eventId is missing, empty, or not a string", () => {
      expect(() => getEventRsvpId("", "usr-1")).toThrow(/Both eventId and userId must be non-empty strings/);
      expect(() => getEventRsvpId(null, "usr-1")).toThrow(/Both eventId and userId must be non-empty strings/);
      expect(() => getEventRsvpId(undefined, "usr-1")).toThrow(/Both eventId and userId must be non-empty strings/);
      expect(() => getEventRsvpId(123, "usr-1")).toThrow(/Both eventId and userId must be non-empty strings/);
    });

    it("throws a clear error when userId is missing, empty, or not a string", () => {
      expect(() => getEventRsvpId("evt-1", "")).toThrow(/Both eventId and userId must be non-empty strings/);
      expect(() => getEventRsvpId("evt-1", null)).toThrow(/Both eventId and userId must be non-empty strings/);
      expect(() => getEventRsvpId("evt-1", undefined)).toThrow(/Both eventId and userId must be non-empty strings/);
      expect(() => getEventRsvpId("evt-1", 456)).toThrow(/Both eventId and userId must be non-empty strings/);
    });
  });

  describe("Domain Factory & Validator (`buildEventRsvp`, `validateEventRsvp`)", () => {
    it("builds a valid 5-field RSVP object with derived ID and ISO timestamp", () => {
      const rsvp = buildEventRsvp({
        eventId: "e2e-event-ai-hackathon",
        userId: "e2e-student-b",
        campusId: APEX_CAMPUS_ID,
        createdAt: "2026-10-12T10:00:00.000Z",
      });

      expect(rsvp).toEqual({
        id: "e2e-event-ai-hackathon_e2e-student-b",
        eventId: "e2e-event-ai-hackathon",
        campusId: APEX_CAMPUS_ID,
        userId: "e2e-student-b",
        createdAt: "2026-10-12T10:00:00.000Z",
      });
      expect(Object.keys(rsvp)).toEqual(EVENT_RSVP_FIELDS);
    });

    it("accepts Date instances and normalizes them to ISO strings in buildEventRsvp", () => {
      const date = new Date("2026-10-10T12:00:00.000Z");
      const rsvp = buildEventRsvp({
        eventId: "e2e-event-test",
        userId: "e2e-student-a",
        campusId: APEX_CAMPUS_ID,
        createdAt: date,
      });

      expect(rsvp.createdAt).toBe("2026-10-10T12:00:00.000Z");
    });

    it("throws when required factory parameters are missing", () => {
      expect(() =>
        buildEventRsvp({ userId: "u1", campusId: APEX_CAMPUS_ID })
      ).toThrow(/eventId is required/);

      expect(() =>
        buildEventRsvp({ eventId: "e1", campusId: APEX_CAMPUS_ID })
      ).toThrow(/userId is required/);

      expect(() =>
        buildEventRsvp({ eventId: "e1", userId: "u1" })
      ).toThrow(/campusId is required/);
    });

    it("validateEventRsvp validates compliant 5-field RSVP objects", () => {
      const rsvp = buildEventRsvp({
        eventId: "e2e-event-ai-hackathon",
        userId: "e2e-student-b",
        campusId: APEX_CAMPUS_ID,
      });

      const result = validateEventRsvp(rsvp);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validateEventRsvp catches missing required fields", () => {
      const incomplete = {
        id: "evt_usr",
        eventId: "evt",
        userId: "usr",
        // campusId and createdAt missing
      };

      const result = validateEventRsvp(incomplete);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("campusId"))).toBe(true);
      expect(result.errors.some((e) => e.includes("createdAt"))).toBe(true);
    });

    it("validateEventRsvp catches unexpected extra fields violating the 5-field schema", () => {
      const extraFields = {
        id: "evt_usr",
        eventId: "evt",
        campusId: APEX_CAMPUS_ID,
        userId: "usr",
        createdAt: "2026-10-12T10:00:00.000Z",
        status: "going",
        counter: 1,
      };

      const result = validateEventRsvp(extraFields);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("unexpected fields"))).toBe(true);
    });

    it("validateEventRsvp catches mismatched document IDs", () => {
      const mismatched = {
        id: "wrong_id",
        eventId: "evt",
        campusId: APEX_CAMPUS_ID,
        userId: "usr",
        createdAt: "2026-10-12T10:00:00.000Z",
      };

      const result = validateEventRsvp(mismatched);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not match derived id"))).toBe(true);
    });

    it("validateEventRsvp rejects null or non-object values", () => {
      expect(validateEventRsvp(null).valid).toBe(false);
      expect(validateEventRsvp(undefined).valid).toBe(false);
      expect(validateEventRsvp("string").valid).toBe(false);
      expect(validateEventRsvp([]).valid).toBe(false);
      expect(validateEventRsvp(12345).valid).toBe(false);
      expect(validateEventRsvp(true).valid).toBe(false);
    });

    it("validateEventRsvp rejects non-string or whitespace-only identifier fields", () => {
      const base = {
        id: "evt-1_usr-1",
        eventId: "evt-1",
        campusId: APEX_CAMPUS_ID,
        userId: "usr-1",
        createdAt: "2026-10-12T10:00:00.000Z",
      };

      const invalidId = { ...base, id: 12345 };
      expect(validateEventRsvp(invalidId).valid).toBe(false);
      expect(
        validateEventRsvp(invalidId).errors.some((e) =>
          e.includes('Field "id" must be a non-empty string')
        )
      ).toBe(true);

      const invalidEventId = { ...base, eventId: 456 };
      expect(validateEventRsvp(invalidEventId).valid).toBe(false);
      expect(
        validateEventRsvp(invalidEventId).errors.some((e) =>
          e.includes('Field "eventId" must be a non-empty string')
        )
      ).toBe(true);

      const invalidCampusId = { ...base, campusId: true };
      expect(validateEventRsvp(invalidCampusId).valid).toBe(false);
      expect(
        validateEventRsvp(invalidCampusId).errors.some((e) =>
          e.includes('Field "campusId" must be a non-empty string')
        )
      ).toBe(true);

      const invalidUserId = { ...base, userId: ["usr-1"] };
      expect(validateEventRsvp(invalidUserId).valid).toBe(false);
      expect(
        validateEventRsvp(invalidUserId).errors.some((e) =>
          e.includes('Field "userId" must be a non-empty string')
        )
      ).toBe(true);

      const whitespaceId = { ...base, id: "   " };
      expect(validateEventRsvp(whitespaceId).valid).toBe(false);
      expect(
        validateEventRsvp(whitespaceId).errors.some((e) =>
          e.includes('Field "id" must be a non-empty string')
        )
      ).toBe(true);
    });

    it("validateEventRsvp rejects malformed timestamps and unsupported createdAt types", () => {
      const base = {
        id: "evt-1_usr-1",
        eventId: "evt-1",
        campusId: APEX_CAMPUS_ID,
        userId: "usr-1",
      };

      const malformedCases = [
        "not-a-valid-date",
        new Date("invalid"),
        true,
        {},
        [],
        NaN,
        null,
        undefined,
        "",
      ];

      for (const badCreatedAt of malformedCases) {
        const result = validateEventRsvp({ ...base, createdAt: badCreatedAt });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it("validateEventRsvp accepts valid createdAt formats matching the temporal contract", () => {
      const base = {
        id: "evt-1_usr-1",
        eventId: "evt-1",
        campusId: APEX_CAMPUS_ID,
        userId: "usr-1",
      };

      // ISO string
      expect(validateEventRsvp({ ...base, createdAt: "2026-10-12T10:00:00.000Z" }).valid).toBe(true);

      // Date instance
      expect(validateEventRsvp({ ...base, createdAt: new Date("2026-10-12T10:00:00.000Z") }).valid).toBe(true);

      // Numeric milliseconds
      expect(validateEventRsvp({ ...base, createdAt: 1760000000000 }).valid).toBe(true);

      // Firestore Timestamp-like with toDate
      expect(
        validateEventRsvp({
          ...base,
          createdAt: { toDate: () => new Date("2026-10-12T10:00:00.000Z") },
        }).valid
      ).toBe(true);

      // Firestore Timestamp-like with toMillis
      expect(
        validateEventRsvp({
          ...base,
          createdAt: { toMillis: () => 1760000000000 },
        }).valid
      ).toBe(true);

      // Firestore Timestamp-like with seconds
      expect(
        validateEventRsvp({
          ...base,
          createdAt: { seconds: 1760000000, nanoseconds: 0 },
        }).valid
      ).toBe(true);
    });

    it("isValidRsvpCreatedAt validates according to the accepted temporal contract", () => {
      expect(isValidRsvpCreatedAt(new Date())).toBe(true);
      expect(isValidRsvpCreatedAt("2026-10-12T10:00:00.000Z")).toBe(true);
      expect(isValidRsvpCreatedAt(1760000000000)).toBe(true);
      expect(isValidRsvpCreatedAt({ toDate: () => new Date() })).toBe(true);
      expect(isValidRsvpCreatedAt({ toMillis: () => 1760000000000 })).toBe(true);
      expect(isValidRsvpCreatedAt({ seconds: 1760000000, nanoseconds: 0 })).toBe(true);

      expect(isValidRsvpCreatedAt(null)).toBe(false);
      expect(isValidRsvpCreatedAt(undefined)).toBe(false);
      expect(isValidRsvpCreatedAt("")).toBe(false);
      expect(isValidRsvpCreatedAt("invalid")).toBe(false);
      expect(isValidRsvpCreatedAt(new Date("invalid"))).toBe(false);
      expect(isValidRsvpCreatedAt(true)).toBe(false);
      expect(isValidRsvpCreatedAt({})).toBe(false);
      expect(isValidRsvpCreatedAt([])).toBe(false);
      expect(isValidRsvpCreatedAt(NaN)).toBe(false);
    });

    it("buildEventRsvp successfully normalizes a valid toMillis()-only createdAt object", () => {
      const toMillisOnly = { toMillis: () => 1760000000000 };
      const rsvp = buildEventRsvp({
        eventId: "e2e-event-ai-hackathon",
        userId: "e2e-student-b",
        campusId: APEX_CAMPUS_ID,
        createdAt: toMillisOnly,
      });
      expect(rsvp.createdAt).toBe(new Date(1760000000000).toISOString());
      expect(rsvp.id).toBe("e2e-event-ai-hackathon_e2e-student-b");
      const val = validateEventRsvp(rsvp);
      expect(val.valid).toBe(true);
    });

    it("rejects out-of-range finite millisecond timestamps outside JavaScript Date bounds", () => {
      expect(MAX_REPRESENTABLE_DATE_MS).toBe(8.64e15);
      const outOfRange = MAX_REPRESENTABLE_DATE_MS + 1000;
      expect(isValidRsvpCreatedAt(outOfRange)).toBe(false);
      expect(isValidRsvpCreatedAt(-outOfRange)).toBe(false);

      expect(() =>
        buildEventRsvp({
          eventId: "e2e-event-ai-hackathon",
          userId: "e2e-student-b",
          campusId: APEX_CAMPUS_ID,
          createdAt: outOfRange,
        })
      ).toThrow(/Invalid createdAt value/);

      const rsvp = {
        id: "e2e-event-ai-hackathon_e2e-student-b",
        eventId: "e2e-event-ai-hackathon",
        campusId: APEX_CAMPUS_ID,
        userId: "e2e-student-b",
        createdAt: outOfRange,
      };
      const val = validateEventRsvp(rsvp);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.includes("must be a valid date"))).toBe(true);
    });

    it("rejects toMillis() method returning infinity, out-of-range, or invalid value", () => {
      expect(isValidRsvpCreatedAt({ toMillis: () => Infinity })).toBe(false);
      expect(isValidRsvpCreatedAt({ toMillis: () => -Infinity })).toBe(false);
      expect(isValidRsvpCreatedAt({ toMillis: () => 9e15 })).toBe(false);
      expect(isValidRsvpCreatedAt({ toMillis: () => "not-a-number" })).toBe(false);
      expect(isValidRsvpCreatedAt({ toMillis: () => NaN })).toBe(false);

      expect(() =>
        buildEventRsvp({
          eventId: "e2e-event-ai-hackathon",
          userId: "e2e-student-b",
          campusId: APEX_CAMPUS_ID,
          createdAt: { toMillis: () => Infinity },
        })
      ).toThrow(/Invalid createdAt value/);
    });

    it("rejects toMillis() or toDate() methods that throw an exception", () => {
      const throwingToMillis = {
        toMillis: () => {
          throw new Error("corrupted toMillis");
        },
      };
      expect(isValidRsvpCreatedAt(throwingToMillis)).toBe(false);
      expect(() =>
        buildEventRsvp({
          eventId: "e2e-event-ai-hackathon",
          userId: "e2e-student-b",
          campusId: APEX_CAMPUS_ID,
          createdAt: throwingToMillis,
        })
      ).toThrow(/Invalid createdAt value/);

      const throwingToDate = {
        toDate: () => {
          throw new Error("corrupted toDate");
        },
      };
      expect(isValidRsvpCreatedAt(throwingToDate)).toBe(false);
    });
  });

  describe("Derived RSVP Display State (`getRsvpDisplayState`)", () => {
    const mockRsvp = {
      id: "e2e-event-test_e2e-student-a",
      eventId: "e2e-event-test",
      campusId: APEX_CAMPUS_ID,
      userId: "e2e-student-a",
      createdAt: "2026-10-10T12:00:00.000Z",
    };

    const refTime = new Date("2026-10-12T12:00:00.000Z");

    const upcomingEvent = {
      id: "e2e-event-test",
      status: EVENT_STATUSES.PUBLISHED,
      startAt: "2026-10-15T10:00:00.000Z",
      endAt: "2026-10-16T10:00:00.000Z",
    };

    const ongoingEvent = {
      id: "e2e-event-test",
      status: EVENT_STATUSES.PUBLISHED,
      startAt: "2026-10-12T10:00:00.000Z",
      endAt: "2026-10-12T18:00:00.000Z",
    };

    const completedEvent = {
      id: "e2e-event-test",
      status: EVENT_STATUSES.PUBLISHED,
      startAt: "2026-10-08T10:00:00.000Z",
      endAt: "2026-10-09T10:00:00.000Z",
    };

    const cancelledEvent = {
      id: "e2e-event-test",
      status: EVENT_STATUSES.CANCELLED,
      startAt: "2026-10-15T10:00:00.000Z",
      endAt: "2026-10-16T10:00:00.000Z",
    };

    it("returns 'not_going' when rsvp is absent (null or undefined)", () => {
      expect(getRsvpDisplayState(upcomingEvent, null, refTime)).toBe("not_going");
      expect(getRsvpDisplayState(upcomingEvent, undefined, refTime)).toBe("not_going");
    });

    it("returns 'event_unavailable' when resolution is inaccessible or error", () => {
      const inaccessibleRes = { status: "inaccessible", event: null, error: null };
      expect(getRsvpDisplayState(inaccessibleRes, mockRsvp, refTime)).toBe("event_unavailable");

      const errorRes = { status: "error", event: null, error: new Error("Firestore error") };
      expect(getRsvpDisplayState(errorRes, mockRsvp, refTime)).toBe("event_unavailable");

      expect(getRsvpDisplayState(null, mockRsvp, refTime)).toBe("event_unavailable");
    });

    it("returns 'event_cancelled' when event status is cancelled", () => {
      expect(getRsvpDisplayState(cancelledEvent, mockRsvp, refTime)).toBe("event_cancelled");

      const cancelledRes = { status: "available", event: cancelledEvent, error: null };
      expect(getRsvpDisplayState(cancelledRes, mockRsvp, refTime)).toBe("event_cancelled");
    });

    it("returns 'attended_window_passed' when event temporal state is completed", () => {
      expect(getRsvpDisplayState(completedEvent, mockRsvp, refTime)).toBe("attended_window_passed");

      const completedRes = { status: "available", event: completedEvent, error: null };
      expect(getRsvpDisplayState(completedRes, mockRsvp, refTime)).toBe("attended_window_passed");
    });

    it("returns 'going' when event is published and upcoming", () => {
      expect(getRsvpDisplayState(upcomingEvent, mockRsvp, refTime)).toBe("going");

      const upcomingRes = { status: "available", event: upcomingEvent, error: null };
      expect(getRsvpDisplayState(upcomingRes, mockRsvp, refTime)).toBe("going");
    });

    it("returns 'going' when event is published and ongoing", () => {
      expect(getRsvpDisplayState(ongoingEvent, mockRsvp, refTime)).toBe("going");

      const ongoingRes = { status: "available", event: ongoingEvent, error: null };
      expect(getRsvpDisplayState(ongoingRes, mockRsvp, refTime)).toBe("going");
    });
  });

  describe("Deterministic Fixtures & Relationships", () => {
    it("defines exactly four deterministic RSVP fixtures", () => {
      expect(EVENT_RSVP_DEFINITIONS).toHaveLength(4);
      expect(EVENT_RSVP_LIST).toHaveLength(4);

      const ids = EVENT_RSVP_LIST.map((r) => r.id);
      expect(new Set(ids).size).toBe(4);
      expect(ids).toContain("e2e-event-ai-hackathon_e2e-student-b");
      expect(ids).toContain("e2e-event-ai-members-only_e2e-student-b");
      expect(ids).toContain("e2e-event-design-sprint_e2e-student-a");
      expect(ids).toContain("e2e-event-st-jude-symposium_e2e-student-st-jude");
    });

    it("maps canonical IDs in EVENT_RSVPS dictionary", () => {
      expect(EVENT_RSVPS["e2e-event-ai-hackathon_e2e-student-b"]).toEqual(
        EVENT_RSVP_AI_HACKATHON_STUDENT_B
      );
      expect(EVENT_RSVPS["e2e-event-ai-members-only_e2e-student-b"]).toEqual(
        EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B
      );
      expect(EVENT_RSVPS["e2e-event-design-sprint_e2e-student-a"]).toEqual(
        EVENT_RSVP_DESIGN_SPRINT_STUDENT_A
      );
      expect(EVENT_RSVPS["e2e-event-st-jude-symposium_e2e-student-st-jude"]).toEqual(
        EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE
      );
    });

    it("each resolved fixture strictly conforms to the 5-field schema", () => {
      for (const rsvp of EVENT_RSVP_LIST) {
        expect(Object.keys(rsvp).sort()).toEqual([...EVENT_RSVP_FIELDS].sort());
        const validation = validateEventRsvp(rsvp);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });

    it("references valid seeded events and users matching tenant campuses", () => {
      const seededEventIds = new Set(EVENT_LIST.map((e) => e.id));
      const seededUserUids = new Set(Object.values(E2E_USERS).map((u) => u.uid));

      for (const rsvp of EVENT_RSVP_LIST) {
        expect(seededEventIds.has(rsvp.eventId)).toBe(true);
        expect(seededUserUids.has(rsvp.userId)).toBe(true);

        const parentEvent = EVENTS[rsvp.eventId];
        expect(parentEvent).toBeDefined();
        expect(rsvp.campusId).toBe(parentEvent.campusId);

        const parentUser = Object.values(E2E_USERS).find((u) => u.uid === rsvp.userId);
        expect(parentUser).toBeDefined();
        expect(rsvp.campusId).toBe(parentUser.campusId);
      }
    });

    it("ensures Student C (e2e-student-c) has ZERO seeded RSVPs for a clean create journey", () => {
      const studentCRsvps = EVENT_RSVP_LIST.filter((r) => r.userId === "e2e-student-c");
      expect(studentCRsvps).toHaveLength(0);
    });

    it("defines valid relative fixture definitions", () => {
      expect(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF.campusId).toBe(APEX_CAMPUS_ID);
      expect(EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B_DEF.campusId).toBe(APEX_CAMPUS_ID);
      expect(EVENT_RSVP_DESIGN_SPRINT_STUDENT_A_DEF.campusId).toBe(APEX_CAMPUS_ID);
      expect(EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE_DEF.campusId).toBe(ST_JUDE_CAMPUS_ID);

      const refDate = new Date("2026-10-12T12:00:00.000Z");
      const resolved = resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, refDate);
      expect(resolved.id).toBe("e2e-event-ai-hackathon_e2e-student-b");
      expect(resolved.eventId).toBe("e2e-event-ai-hackathon");
      expect(resolved.userId).toBe("e2e-student-b");
    });

    it("resolveEventRsvpFixture produces deterministic ISO timestamps relative to reference date", () => {
      const refDate = new Date("2026-12-03T12:00:00.000Z");
      const fixtures = buildEventRsvpFixtures(refDate);

      expect(fixtures).toHaveLength(4);
      for (const f of fixtures) {
        const createdMs = new Date(f.createdAt).getTime();
        expect(isNaN(createdMs)).toBe(false);
        // Created timestamp should be before the reference date
        expect(createdMs).toBeLessThanOrEqual(refDate.getTime());
      }

      // Shifting reference date forward 60 days shifts createdAt by exactly 60 days
      const shiftedRef = new Date(refDate.getTime() + 60 * 24 * 60 * 60 * 1000);
      const shiftedFixtures = buildEventRsvpFixtures(shiftedRef);
      for (let i = 0; i < fixtures.length; i++) {
        const diff =
          new Date(shiftedFixtures[i].createdAt).getTime() -
          new Date(fixtures[i].createdAt).getTime();
        expect(diff).toBe(60 * 24 * 60 * 60 * 1000);
      }
    });

    it("resolveEventRsvpFixture throws clear error when referenceDate is invalid or unsupported type", () => {
      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, "not-a-date")
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, new Date("invalid"))
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, null)
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, {})
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, NaN)
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, Infinity)
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, -Infinity)
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, 8.65e15)
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, {
          toMillis: () => Infinity,
        })
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, {
          toMillis: () => "invalid",
        })
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, {
          toMillis: () => {
            throw new Error("corrupted toMillis");
          },
        })
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, {
          toDate: () => {
            throw new Error("corrupted toDate");
          },
        })
      ).toThrow(/Invalid reference date/);

      expect(() =>
        resolveEventRsvpFixture(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF, { seconds: Infinity })
      ).toThrow(/Invalid reference date/);
    });

    it("resolveEventRsvpFixture successfully resolves with valid Date, number, string, or Firestore Timestamp", () => {
      const def = EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF;

      // Date instance
      const resDate = resolveEventRsvpFixture(def, new Date("2026-10-12T12:00:00.000Z"));
      expect(resDate.createdAt).toBe("2026-10-10T12:00:00.000Z");

      // ISO string
      const resStr = resolveEventRsvpFixture(def, "2026-10-12T12:00:00.000Z");
      expect(resStr.createdAt).toBe("2026-10-10T12:00:00.000Z");

      // Number millis
      const ms = new Date("2026-10-12T12:00:00.000Z").getTime();
      const resNum = resolveEventRsvpFixture(def, ms);
      expect(resNum.createdAt).toBe("2026-10-10T12:00:00.000Z");

      // Firestore Timestamp-like with toMillis
      const resToMillis = resolveEventRsvpFixture(def, { toMillis: () => ms });
      expect(resToMillis.createdAt).toBe("2026-10-10T12:00:00.000Z");

      // Firestore Timestamp-like with toDate
      const resToDate = resolveEventRsvpFixture(def, {
        toDate: () => new Date("2026-10-12T12:00:00.000Z"),
      });
      expect(resToDate.createdAt).toBe("2026-10-10T12:00:00.000Z");

      // Firestore Timestamp object { seconds, nanoseconds }
      const resSeconds = resolveEventRsvpFixture(def, {
        seconds: Math.floor(ms / 1000),
        nanoseconds: 0,
      });
      expect(resSeconds.createdAt).toBe("2026-10-10T12:00:00.000Z");
    });

    it("resolveEventRsvpFixture correctly handles omitted nanoseconds and rejects invalid nanoseconds", () => {
      const def = EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF;
      const ms = new Date("2026-10-12T12:00:00.000Z").getTime();
      const seconds = Math.floor(ms / 1000);

      // Valid omitted nanoseconds defaults to 0
      const resOmitted = resolveEventRsvpFixture(def, { seconds });
      expect(resOmitted.createdAt).toBe("2026-10-10T12:00:00.000Z");

      // Valid Firestore Timestamp instance
      const ts = Timestamp.fromDate(new Date("2026-10-12T12:00:00.000Z"));
      const resTs = resolveEventRsvpFixture(def, ts);
      expect(resTs.createdAt).toBe("2026-10-10T12:00:00.000Z");

      // Valid nanoseconds within range [0, 999999999]
      const resNanos = resolveEventRsvpFixture(def, { seconds, nanoseconds: 500_000_000 });
      expect(resNanos.createdAt).toBe("2026-10-10T12:00:00.500Z");

      // Invalid nanoseconds cases: negative, >= 1e9, non-finite, non-numeric
      const invalidNanos = [
        -1,
        -500,
        1_000_000_000,
        1_500_000_000,
        Infinity,
        -Infinity,
        NaN,
        "500",
        null,
        true,
        {},
        [],
      ];

      for (const badNano of invalidNanos) {
        expect(() =>
          resolveEventRsvpFixture(def, { seconds, nanoseconds: badNano })
        ).toThrow(/Invalid reference date/);
      }
    });

    it("every seeded RSVP's createdAt strictly precedes its referenced event's startAt under default reference", () => {
      for (const rsvp of EVENT_RSVP_LIST) {
        const parentEvent = EVENTS[rsvp.eventId];
        expect(parentEvent).toBeDefined();

        const rsvpCreatedMs = new Date(rsvp.createdAt).getTime();
        const eventStartMs = new Date(parentEvent.startAt).getTime();

        expect(rsvpCreatedMs).toBeLessThan(eventStartMs);
      }
    });

    it("every seeded RSVP's createdAt strictly precedes its referenced event's startAt under shifted E2E_SEED_NOW reference", () => {
      const shiftedRef = new Date("2026-12-03T12:00:00.000Z");
      const shiftedEvents = buildEventFixtures(shiftedRef);
      const eventsMap = Object.fromEntries(shiftedEvents.map((e) => [e.id, e]));
      const shiftedRsvps = buildEventRsvpFixtures(shiftedRef);

      expect(shiftedRsvps).toHaveLength(4);

      for (const rsvp of shiftedRsvps) {
        const parentEvent = eventsMap[rsvp.eventId];
        expect(parentEvent).toBeDefined();

        const rsvpCreatedMs = new Date(rsvp.createdAt).getTime();
        const eventStartMs = new Date(parentEvent.startAt).getTime();

        expect(rsvpCreatedMs).toBeLessThan(eventStartMs);
      }
    });

    it("verifies chronological precedence using Firestore Timestamp representations", () => {
      const refDate = new Date("2026-10-12T12:00:00.000Z");
      const events = buildEventFixtures(refDate);
      const eventsMap = Object.fromEntries(events.map((e) => [e.id, e]));
      const rsvps = buildEventRsvpFixtures(refDate);

      for (const rsvp of rsvps) {
        const parentEvent = eventsMap[rsvp.eventId];
        const rsvpTimestamp = Timestamp.fromDate(new Date(rsvp.createdAt));
        const eventTimestamp = Timestamp.fromDate(new Date(parentEvent.startAt));

        expect(rsvpTimestamp.toMillis()).toBeLessThan(eventTimestamp.toMillis());
        expect(rsvpTimestamp.seconds).toBeLessThan(eventTimestamp.seconds);
      }
    });
  });

  describe("Seeder Infrastructure & Idempotency (`seedEventRsvps`)", () => {
    it("writes exact 5 fields with Firestore Timestamps to deterministic document paths", async () => {
      const writtenDocs = new Map();

      const mockDb = {
        collection: (colName) => {
          expect(colName).toBe("eventRsvps");
          return {
            doc: (docId) => ({
              set: async (data) => {
                writtenDocs.set(docId, data);
              },
            }),
          };
        },
      };

      const refDate = new Date("2026-10-12T12:00:00.000Z");
      const seededIds = await seedEventRsvps(mockDb, refDate);

      expect(seededIds).toHaveLength(4);
      expect(writtenDocs.size).toBe(4);

      for (const [docId, data] of writtenDocs.entries()) {
        expect(data.id).toBe(docId);
        expect(Object.keys(data).sort()).toEqual([...EVENT_RSVP_FIELDS].sort());
        expect(data.createdAt).toBeDefined();
        expect(
          typeof data.createdAt.toDate === "function" || data.createdAt.seconds !== undefined
        ).toBe(true);
      }
    });

    it("is completely idempotent across two consecutive runs", async () => {
      const writtenDocs = new Map();

      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const refDate = new Date("2026-10-12T12:00:00.000Z");
      const firstRunIds = await seedEventRsvps(mockDb, refDate);
      const firstSnapshot = new Map(writtenDocs);

      const secondRunIds = await seedEventRsvps(mockDb, refDate);

      expect(firstRunIds).toEqual(secondRunIds);
      expect(writtenDocs.size).toBe(firstSnapshot.size);

      for (const [id, data] of writtenDocs.entries()) {
        expect(firstSnapshot.get(id)).toEqual(data);
      }
    });

    it("skips duplicate IDs if present in an override list", async () => {
      const writtenDocs = new Map();

      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const duplicateList = [
        {
          id: "e1_u1",
          eventId: "e1",
          campusId: APEX_CAMPUS_ID,
          userId: "u1",
          createdAt: "2026-10-10T10:00:00.000Z",
        },
        {
          id: "e1_u1",
          eventId: "e1",
          campusId: APEX_CAMPUS_ID,
          userId: "u1",
          createdAt: "2026-10-10T10:00:00.000Z",
        },
      ];

      const seededIds = await seedEventRsvps(mockDb, new Date(), duplicateList);
      expect(seededIds).toEqual(["e1_u1"]);
      expect(writtenDocs.size).toBe(1);
    });

    it("rejects override with mismatched composite document ID and writes zero documents", async () => {
      const writtenDocs = new Map();
      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const malformed = [
        {
          id: "wrong_id",
          eventId: "evt-1",
          campusId: APEX_CAMPUS_ID,
          userId: "usr-1",
          createdAt: "2026-10-10T10:00:00.000Z",
        },
      ];

      await expect(seedEventRsvps(mockDb, new Date(), malformed)).rejects.toThrow(
        /Invalid RSVP document rejected before write/
      );
      expect(writtenDocs.size).toBe(0);
    });

    it("rejects override with unexpected extra fields and writes zero documents", async () => {
      const writtenDocs = new Map();
      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const extraFields = [
        {
          id: "evt-1_usr-1",
          eventId: "evt-1",
          campusId: APEX_CAMPUS_ID,
          userId: "usr-1",
          createdAt: "2026-10-10T10:00:00.000Z",
          status: "going",
        },
      ];

      await expect(seedEventRsvps(mockDb, new Date(), extraFields)).rejects.toThrow(
        /unexpected fields/
      );
      expect(writtenDocs.size).toBe(0);
    });

    it("rejects override with non-string or empty identifier fields and writes zero documents", async () => {
      const writtenDocs = new Map();
      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const wrongTypes = [
        {
          id: "evt-1_usr-1",
          eventId: 12345,
          campusId: APEX_CAMPUS_ID,
          userId: "usr-1",
          createdAt: "2026-10-10T10:00:00.000Z",
        },
      ];

      await expect(seedEventRsvps(mockDb, new Date(), wrongTypes)).rejects.toThrow(
        /must be a non-empty string/
      );
      expect(writtenDocs.size).toBe(0);
    });

    it("rejects override with invalid createdAt timestamp and writes zero documents", async () => {
      const writtenDocs = new Map();
      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const invalidDate = [
        {
          id: "evt-1_usr-1",
          eventId: "evt-1",
          campusId: APEX_CAMPUS_ID,
          userId: "usr-1",
          createdAt: "invalid-timestamp",
        },
      ];

      await expect(seedEventRsvps(mockDb, new Date(), invalidDate)).rejects.toThrow(
        /must be a valid date, timestamp, or ISO string/
      );
      expect(writtenDocs.size).toBe(0);
    });

    it("rejects override with missing required fields and writes zero documents", async () => {
      const writtenDocs = new Map();
      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const incomplete = [
        {
          id: "evt-1_usr-1",
          eventId: "evt-1",
          userId: "usr-1",
          createdAt: "2026-10-10T10:00:00.000Z",
          // campusId missing
        },
      ];

      await expect(seedEventRsvps(mockDb, new Date(), incomplete)).rejects.toThrow(
        /Missing required field: campusId/
      );
      expect(writtenDocs.size).toBe(0);
    });

    it("seeds valid toMillis()-only createdAt override, converting it to a valid Firestore Timestamp", async () => {
      const writtenDocs = new Map();
      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const toMillisList = [
        {
          id: "evt-1_usr-1",
          eventId: "evt-1",
          campusId: APEX_CAMPUS_ID,
          userId: "usr-1",
          createdAt: { toMillis: () => 1760000000000 },
        },
      ];

      const seededIds = await seedEventRsvps(mockDb, new Date(), toMillisList);
      expect(seededIds).toEqual(["evt-1_usr-1"]);
      expect(writtenDocs.size).toBe(1);

      const written = writtenDocs.get("evt-1_usr-1");
      expect(written.createdAt).toBeDefined();
      expect(typeof written.createdAt.toMillis).toBe("function");
      expect(written.createdAt.toMillis()).toBe(1760000000000);
    });

    it("rejects override with out-of-range timestamp and writes zero documents", async () => {
      const writtenDocs = new Map();
      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const outOfRangeList = [
        {
          id: "evt-1_usr-1",
          eventId: "evt-1",
          campusId: APEX_CAMPUS_ID,
          userId: "usr-1",
          createdAt: 8.65e15,
        },
      ];

      await expect(seedEventRsvps(mockDb, new Date(), outOfRangeList)).rejects.toThrow();
      expect(writtenDocs.size).toBe(0);
    });

    it("rejects override with throwing toMillis() and writes zero documents", async () => {
      const writtenDocs = new Map();
      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const throwingList = [
        {
          id: "evt-1_usr-1",
          eventId: "evt-1",
          campusId: APEX_CAMPUS_ID,
          userId: "usr-1",
          createdAt: {
            toMillis: () => {
              throw new Error("corrupted toMillis");
            },
          },
        },
      ];

      await expect(seedEventRsvps(mockDb, new Date(), throwingList)).rejects.toThrow();
      expect(writtenDocs.size).toBe(0);
    });

    it("rejects override with toMillis() returning Infinity and writes zero documents", async () => {
      const writtenDocs = new Map();
      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const infinityList = [
        {
          id: "evt-1_usr-1",
          eventId: "evt-1",
          campusId: APEX_CAMPUS_ID,
          userId: "usr-1",
          createdAt: { toMillis: () => Infinity },
        },
      ];

      await expect(seedEventRsvps(mockDb, new Date(), infinityList)).rejects.toThrow();
      expect(writtenDocs.size).toBe(0);
    });

    it("rejects override with throwing toDate() and writes zero documents", async () => {
      const writtenDocs = new Map();
      const mockDb = {
        collection: () => ({
          doc: (docId) => ({
            set: async (data) => {
              writtenDocs.set(docId, data);
            },
          }),
        }),
      };

      const throwingDateList = [
        {
          id: "evt-1_usr-1",
          eventId: "evt-1",
          campusId: APEX_CAMPUS_ID,
          userId: "usr-1",
          createdAt: {
            toDate: () => {
              throw new Error("corrupted toDate");
            },
          },
        },
      ];

      await expect(seedEventRsvps(mockDb, new Date(), throwingDateList)).rejects.toThrow();
      expect(writtenDocs.size).toBe(0);
    });
  });
});
