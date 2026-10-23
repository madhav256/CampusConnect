/**
 * Milestone 24 — Unit 24.2: Event Capacity Domain Model Tests
 *
 * Comprehensive tests for event capacity coordinator schema, validation,
 * sequence monotonicity, capacity ceilings, and live metrics calculation.
 */

import { describe, expect, it } from "vitest";
import {
  EVENT_CAPACITY_FIELDS,
  EVENT_CAPACITY_IMMUTABLE_FIELDS,
  getEventCapacityId,
  isCappedEvent,
  createInitialEventCapacity,
  validateEventCapacity,
  computeCapacityMetrics,
} from "../../src/data/eventCapacities.js";
import { APEX_CAMPUS_ID } from "../../src/constants.js";

describe("Milestone 24 — Event Capacity Domain Model & Invariants", () => {
  describe("Schema and Deterministic IDs", () => {
    it("defines the locked 10-field schema for eventCapacities", () => {
      expect(EVENT_CAPACITY_FIELDS).toEqual([
        "id",
        "eventId",
        "campusId",
        "confirmedCount",
        "offeredCount",
        "waitlistCount",
        "headSequence",
        "nextSequence",
        "createdAt",
        "updatedAt",
      ]);
    });

    it("defines immutable fields prohibiting mutation after creation", () => {
      expect(EVENT_CAPACITY_IMMUTABLE_FIELDS).toEqual([
        "id",
        "eventId",
        "campusId",
        "createdAt",
      ]);
    });

    it("derives deterministic document ID equal to eventId", () => {
      expect(getEventCapacityId("event-123")).toBe("event-123");
      expect(getEventCapacityId("  event-trimmed  ")).toBe("event-trimmed");
    });

    it("throws on invalid or empty eventId", () => {
      expect(() => getEventCapacityId("")).toThrow();
      expect(() => getEventCapacityId(null)).toThrow();
      expect(() => getEventCapacityId(123)).toThrow();
    });
  });

  describe("createInitialEventCapacity Function", () => {
    it("creates an initial coordinator with head=1, next=1, and zero counts by default", () => {
      const coord = createInitialEventCapacity({
        eventId: "e1",
        campusId: APEX_CAMPUS_ID,
      });

      expect(coord).toEqual({
        id: "e1",
        eventId: "e1",
        campusId: APEX_CAMPUS_ID,
        confirmedCount: 0,
        offeredCount: 0,
        waitlistCount: 0,
        headSequence: 1,
        nextSequence: 1,
        createdAt: null,
        updatedAt: null,
      });
    });

    it("accepts an initial confirmedCount for migrated events", () => {
      const coord = createInitialEventCapacity({
        eventId: "e2",
        campusId: APEX_CAMPUS_ID,
        confirmedCount: 15,
      });

      expect(coord.confirmedCount).toBe(15);
      expect(coord.headSequence).toBe(1);
      expect(coord.nextSequence).toBe(1);
    });

    it("throws if campusId is missing or empty", () => {
      expect(() =>
        createInitialEventCapacity({ eventId: "e1", campusId: "" })
      ).toThrow();
      expect(() =>
        createInitialEventCapacity({ eventId: "e1", campusId: null })
      ).toThrow();
    });
  });

  describe("validateEventCapacity & Invariant Enforcement", () => {
    it("passes validation for a valid initial coordinator", () => {
      const valid = createInitialEventCapacity({
        eventId: "e1",
        campusId: APEX_CAMPUS_ID,
      });
      const result = validateEventCapacity(valid);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails validation if required fields are missing", () => {
      const incomplete = { id: "e1", eventId: "e1" };
      const result = validateEventCapacity(incomplete);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("fails validation if id does not match eventId", () => {
      const mismatch = {
        ...createInitialEventCapacity({ eventId: "e1", campusId: APEX_CAMPUS_ID }),
        id: "e2",
      };
      const result = validateEventCapacity(mismatch);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("must match eventId"))).toBe(true);
    });

    it("enforces non-negativity on all counter fields", () => {
      const negative = {
        ...createInitialEventCapacity({ eventId: "e1", campusId: APEX_CAMPUS_ID }),
        waitlistCount: -1,
      };
      const result = validateEventCapacity(negative);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cannot be negative"))).toBe(true);
    });

    it("enforces sequence numbers >= 1", () => {
      const invalidSeq = {
        ...createInitialEventCapacity({ eventId: "e1", campusId: APEX_CAMPUS_ID }),
        headSequence: 0,
      };
      const result = validateEventCapacity(invalidSeq);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("headSequence must be >= 1"))).toBe(true);
    });

    it("enforces Invariant 1: Monotonic Sequence (headSequence <= nextSequence)", () => {
      const validSeq = {
        ...createInitialEventCapacity({ eventId: "e1", campusId: APEX_CAMPUS_ID }),
        headSequence: 5,
        nextSequence: 10,
      };
      expect(validateEventCapacity(validSeq).valid).toBe(true);

      const equalSeq = {
        ...createInitialEventCapacity({ eventId: "e1", campusId: APEX_CAMPUS_ID }),
        headSequence: 10,
        nextSequence: 10,
      };
      expect(validateEventCapacity(equalSeq).valid).toBe(true);

      const violatedSeq = {
        ...createInitialEventCapacity({ eventId: "e1", campusId: APEX_CAMPUS_ID }),
        headSequence: 11,
        nextSequence: 10,
      };
      const res = validateEventCapacity(violatedSeq);
      expect(res.valid).toBe(false);
      expect(
        res.errors.some((e) => e.includes("Monotonic sequence invariant violated"))
      ).toBe(true);
    });

    it("enforces capacity ceiling invariant when capped event is provided", () => {
      const event = { id: "e1", capacity: 20 };
      const withinCapacity = {
        ...createInitialEventCapacity({ eventId: "e1", campusId: APEX_CAMPUS_ID }),
        confirmedCount: 18,
        offeredCount: 2,
      };
      expect(validateEventCapacity(withinCapacity, event).valid).toBe(true);

      const exceedingCapacity = {
        ...createInitialEventCapacity({ eventId: "e1", campusId: APEX_CAMPUS_ID }),
        confirmedCount: 19,
        offeredCount: 2, // 19 + 2 = 21 > 20
      };
      const res = validateEventCapacity(exceedingCapacity, event);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Capacity ceiling invariant violated"))).toBe(
        true
      );
    });
  });

  describe("computeCapacityMetrics Function", () => {
    it("handles uncapped events with open attendance", () => {
      const event = { id: "uncapped-1", title: "Open Talk" };
      const metrics = computeCapacityMetrics({ event });

      expect(metrics.isCapped).toBe(false);
      expect(metrics.capacity).toBeNull();
      expect(metrics.availableSeats).toBe(Infinity);
      expect(metrics.isFull).toBe(false);
      expect(metrics.canDirectRsvp).toBe(true);
      expect(metrics.canJoinWaitlist).toBe(false);
    });

    it("computes available vacancies on capped events with open seats", () => {
      const event = { id: "capped-1", capacity: 50 };
      const coordinator = {
        confirmedCount: 30,
        offeredCount: 5,
        waitlistCount: 0,
        headSequence: 1,
        nextSequence: 1,
      };
      const metrics = computeCapacityMetrics({ event, coordinator });

      expect(metrics.isCapped).toBe(true);
      expect(metrics.capacity).toBe(50);
      expect(metrics.allocatedSeats).toBe(35);
      expect(metrics.availableSeats).toBe(15);
      expect(metrics.isFull).toBe(false);
      expect(metrics.hasWaitlist).toBe(false);
      expect(metrics.canDirectRsvp).toBe(true);
      expect(metrics.canJoinWaitlist).toBe(false);
    });

    it("identifies full capped events without active waitlist", () => {
      const event = { id: "capped-2", capacity: 50 };
      const coordinator = {
        confirmedCount: 50,
        offeredCount: 0,
        waitlistCount: 0,
        headSequence: 1,
        nextSequence: 1,
      };
      const metrics = computeCapacityMetrics({ event, coordinator });

      expect(metrics.isFull).toBe(true);
      expect(metrics.availableSeats).toBe(0);
      expect(metrics.canDirectRsvp).toBe(false);
      expect(metrics.canJoinWaitlist).toBe(true);
    });

    it("blocks direct RSVP if waitlist exists even if vacant seats exist temporarily", () => {
      const event = { id: "capped-3", capacity: 50 };
      const coordinator = {
        confirmedCount: 40,
        offeredCount: 0,
        waitlistCount: 3, // Queue bypass protection
        headSequence: 1,
        nextSequence: 4,
      };
      const metrics = computeCapacityMetrics({ event, coordinator });

      expect(metrics.canDirectRsvp).toBe(false);
      expect(metrics.canJoinWaitlist).toBe(true);
      expect(metrics.hasWaitlist).toBe(true);
    });
  });

  describe("isCappedEvent Helper", () => {
    it("returns true only for objects with positive numerical capacity", () => {
      expect(isCappedEvent({ capacity: 100 })).toBe(true);
      expect(isCappedEvent({ capacity: 1 })).toBe(true);
      expect(isCappedEvent({ capacity: 0 })).toBe(false);
      expect(isCappedEvent({ capacity: -5 })).toBe(false);
      expect(isCappedEvent({ capacity: null })).toBe(false);
      expect(isCappedEvent({ capacity: undefined })).toBe(false);
      expect(isCappedEvent({ capacity: "50" })).toBe(false);
      expect(isCappedEvent(null)).toBe(false);
    });
  });
});
