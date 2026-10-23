/**
 * Milestone 24 — Unit 24.1: Waitlist Slot, Member, and Continuation Domain Models
 *
 * Domain schema, invariants, status classifiers, offer window resolution,
 * relative queue position calculation, and lease fencing.
 */

import { describe, expect, it } from "vitest";
import {
  WAITLIST_SLOT_STATUSES,
  WAITLIST_TERMINAL_STATUSES,
  WAITLIST_ACTIVE_STATUSES,
  CONTINUATION_STATUSES,
  CONTINUATION_STATUS_LIST,
  CONTINUATION_TYPES,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LIST,
} from "../../src/constants.js";
import {
  EVENT_WAITLIST_SLOT_FIELDS,
  EVENT_WAITLIST_SLOT_IMMUTABLE_FIELDS,
  getEventWaitlistSlotId,
  isTerminalSlotStatus,
  isActiveSlotStatus,
  validateWaitlistSlot,
  isOfferActive,
  getOfferRemainingMs,
} from "../../src/data/eventWaitlistSlots.js";
import {
  EVENT_WAITLIST_MEMBER_FIELDS,
  EVENT_WAITLIST_MEMBER_IMMUTABLE_FIELDS,
  getEventWaitlistMemberId,
  validateWaitlistMember,
  calculateQueuePosition,
} from "../../src/data/eventWaitlistMembers.js";
import {
  EVENT_WAITLIST_CONTINUATION_FIELDS,
  EVENT_WAITLIST_CONTINUATION_IMMUTABLE_FIELDS,
  getEventWaitlistContinuationId,
  validateWaitlistContinuation,
  isContinuationLeaseActive,
} from "../../src/data/eventWaitlistContinuations.js";

describe("Milestone 24 — Unit 24.1: Waitlist Domain Models", () => {
  describe("Waitlist Slot Domain (eventWaitlistSlots)", () => {
    it("defines locked schema fields matching ADR-024 specification", () => {
      expect(EVENT_WAITLIST_SLOT_FIELDS).toEqual([
        "id",
        "eventId",
        "campusId",
        "userId",
        "sequenceNumber",
        "status",
        "joinedAt",
        "offeredAt",
        "offerExpiresAt",
        "resolvedAt",
      ]);
      expect(Object.isFrozen(EVENT_WAITLIST_SLOT_FIELDS)).toBe(true);
    });

    it("defines immutable fields after slot creation", () => {
      expect(EVENT_WAITLIST_SLOT_IMMUTABLE_FIELDS).toEqual([
        "id",
        "eventId",
        "campusId",
        "userId",
        "sequenceNumber",
        "joinedAt",
      ]);
      expect(Object.isFrozen(EVENT_WAITLIST_SLOT_IMMUTABLE_FIELDS)).toBe(true);
    });

    it("generates deterministic slot IDs with getEventWaitlistSlotId", () => {
      expect(getEventWaitlistSlotId("evt-100", 1)).toBe("evt-100_1");
      expect(getEventWaitlistSlotId("evt-workshop", 42)).toBe("evt-workshop_42");
    });

    it("rejects invalid inputs for getEventWaitlistSlotId", () => {
      expect(() => getEventWaitlistSlotId("", 1)).toThrow("eventId must be a non-empty string");
      expect(() => getEventWaitlistSlotId(null, 1)).toThrow("eventId must be a non-empty string");
      expect(() => getEventWaitlistSlotId("evt-1", 0)).toThrow("sequenceNumber must be a positive integer");
      expect(() => getEventWaitlistSlotId("evt-1", -5)).toThrow("sequenceNumber must be a positive integer");
      expect(() => getEventWaitlistSlotId("evt-1", 1.5)).toThrow("sequenceNumber must be a positive integer");
    });

    it("classifies terminal and active slot statuses correctly", () => {
      expect(isTerminalSlotStatus(WAITLIST_SLOT_STATUSES.CLAIMED)).toBe(true);
      expect(isTerminalSlotStatus(WAITLIST_SLOT_STATUSES.DECLINED)).toBe(true);
      expect(isTerminalSlotStatus(WAITLIST_SLOT_STATUSES.EXPIRED)).toBe(true);
      expect(isTerminalSlotStatus(WAITLIST_SLOT_STATUSES.WITHDRAWN)).toBe(true);
      expect(isTerminalSlotStatus(WAITLIST_SLOT_STATUSES.WAITING)).toBe(false);
      expect(isTerminalSlotStatus(WAITLIST_SLOT_STATUSES.OFFERED)).toBe(false);

      expect(isActiveSlotStatus(WAITLIST_SLOT_STATUSES.WAITING)).toBe(true);
      expect(isActiveSlotStatus(WAITLIST_SLOT_STATUSES.OFFERED)).toBe(true);
      expect(isActiveSlotStatus(WAITLIST_SLOT_STATUSES.CLAIMED)).toBe(false);
      expect(isActiveSlotStatus(WAITLIST_SLOT_STATUSES.DECLINED)).toBe(false);

      expect(WAITLIST_TERMINAL_STATUSES).toContain(WAITLIST_SLOT_STATUSES.CLAIMED);
      expect(WAITLIST_ACTIVE_STATUSES).toContain(WAITLIST_SLOT_STATUSES.WAITING);
    });

    it("validates a correctly formed waiting waitlist slot", () => {
      const validSlot = {
        id: "evt-1_1",
        eventId: "evt-1",
        campusId: "apex-university",
        userId: "user-1",
        sequenceNumber: 1,
        status: WAITLIST_SLOT_STATUSES.WAITING,
        joinedAt: new Date(),
      };

      const result = validateWaitlistSlot(validSlot);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("validates an offered slot requiring offerExpiresAt", () => {
      const offeredSlot = {
        id: "evt-1_1",
        eventId: "evt-1",
        campusId: "apex-university",
        userId: "user-1",
        sequenceNumber: 1,
        status: WAITLIST_SLOT_STATUSES.OFFERED,
        joinedAt: new Date(),
        offeredAt: new Date(),
        offerExpiresAt: new Date(Date.now() + 86400000),
      };

      const result = validateWaitlistSlot(offeredSlot);
      expect(result.valid).toBe(true);
    });

    it("rejects offered slot without offerExpiresAt", () => {
      const invalidOffered = {
        id: "evt-1_1",
        eventId: "evt-1",
        campusId: "apex-university",
        userId: "user-1",
        sequenceNumber: 1,
        status: WAITLIST_SLOT_STATUSES.OFFERED,
        joinedAt: new Date(),
        offeredAt: new Date(),
      };

      const result = validateWaitlistSlot(invalidOffered);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("offerExpiresAt"))).toBe(true);
    });

    it("rejects slots with unknown statuses or invalid sequences", () => {
      const badStatus = {
        id: "evt-1_1",
        eventId: "evt-1",
        campusId: "apex-university",
        userId: "user-1",
        sequenceNumber: 1,
        status: "unknown_status",
        joinedAt: new Date(),
      };

      const resultStatus = validateWaitlistSlot(badStatus);
      expect(resultStatus.valid).toBe(false);

      const badSeq = {
        id: "evt-1_0",
        eventId: "evt-1",
        campusId: "apex-university",
        userId: "user-1",
        sequenceNumber: 0,
        status: WAITLIST_SLOT_STATUSES.WAITING,
        joinedAt: new Date(),
      };

      const resultSeq = validateWaitlistSlot(badSeq);
      expect(resultSeq.valid).toBe(false);
    });

    it("calculates offer remaining time and activity correctly", () => {
      const futureTime = Date.now() + 60000;
      const activeOffer = {
        status: WAITLIST_SLOT_STATUSES.OFFERED,
        offerExpiresAt: { toMillis: () => futureTime },
      };

      expect(isOfferActive(activeOffer, Date.now())).toBe(true);
      expect(getOfferRemainingMs(activeOffer, Date.now())).toBeGreaterThan(0);

      const pastTime = Date.now() - 5000;
      const expiredOffer = {
        status: WAITLIST_SLOT_STATUSES.OFFERED,
        offerExpiresAt: pastTime,
      };

      expect(isOfferActive(expiredOffer, Date.now())).toBe(false);
      expect(getOfferRemainingMs(expiredOffer, Date.now())).toBe(0);

      const waitingSlot = {
        status: WAITLIST_SLOT_STATUSES.WAITING,
      };
      expect(isOfferActive(waitingSlot)).toBe(false);
      expect(getOfferRemainingMs(waitingSlot)).toBe(0);
    });
  });

  describe("Waitlist Member Domain (eventWaitlistMembers)", () => {
    it("defines locked schema fields matching ADR-024 specification", () => {
      expect(EVENT_WAITLIST_MEMBER_FIELDS).toContain("id");
      expect(EVENT_WAITLIST_MEMBER_FIELDS).toContain("eventId");
      expect(EVENT_WAITLIST_MEMBER_FIELDS).toContain("userId");
      expect(EVENT_WAITLIST_MEMBER_FIELDS).toContain("campusId");
      expect(EVENT_WAITLIST_MEMBER_FIELDS).toContain("sequenceNumber");
      expect(EVENT_WAITLIST_MEMBER_FIELDS).toContain("status");
      expect(EVENT_WAITLIST_MEMBER_FIELDS).toContain("joinedAt");
      expect(EVENT_WAITLIST_MEMBER_FIELDS).toContain("updatedAt");
      expect(Object.isFrozen(EVENT_WAITLIST_MEMBER_FIELDS)).toBe(true);
    });

    it("defines immutable fields after member creation", () => {
      expect(EVENT_WAITLIST_MEMBER_IMMUTABLE_FIELDS).toEqual([
        "id",
        "eventId",
        "campusId",
        "userId",
        "sequenceNumber",
        "joinedAt",
      ]);
      expect(Object.isFrozen(EVENT_WAITLIST_MEMBER_IMMUTABLE_FIELDS)).toBe(true);
    });

    it("generates deterministic member IDs with getEventWaitlistMemberId", () => {
      expect(getEventWaitlistMemberId("evt-100", "usr-42")).toBe("evt-100_usr-42");
    });

    it("rejects empty eventId or userId in getEventWaitlistMemberId", () => {
      expect(() => getEventWaitlistMemberId("", "usr-1")).toThrow("eventId must be a non-empty string");
      expect(() => getEventWaitlistMemberId("evt-1", "")).toThrow("userId must be a non-empty string");
    });

    it("validates a correctly formed waitlist member", () => {
      const validMember = {
        id: "evt-1_usr-1",
        eventId: "evt-1",
        userId: "usr-1",
        campusId: "apex-university",
        sequenceNumber: 5,
        status: "waiting",
        joinedAt: new Date(),
        updatedAt: new Date(),
      };

      const result = validateWaitlistMember(validMember);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("calculates zero-PII relative queue position correctly", () => {
      // headSequence = 10
      // sequenceNumber = 10 -> Position 1 (head of queue)
      expect(calculateQueuePosition(10, 10)).toBe(1);

      // sequenceNumber = 11 -> Position 2
      expect(calculateQueuePosition(11, 10)).toBe(2);

      // sequenceNumber = 25 -> Position 16
      expect(calculateQueuePosition(25, 10)).toBe(16);

      // Candidate at or past head (pos <= 1) returns 1
      expect(calculateQueuePosition(9, 10)).toBe(1);
    });

    it("returns null on invalid or non-integer sequences in calculateQueuePosition", () => {
      expect(calculateQueuePosition("invalid", 10)).toBeNull();
      expect(calculateQueuePosition(10, null)).toBeNull();
      expect(calculateQueuePosition(1.5, 10)).toBeNull();
    });
  });

  describe("Waitlist Continuation Domain (eventWaitlistContinuations)", () => {
    it("defines locked schema fields matching ADR-024 specification", () => {
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("id");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("eventId");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("campusId");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("status");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("continuationType");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("vacanciesRemaining");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("intermediateHeadSequence");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("normalizationRequired");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("generation");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("leaseWorkerId");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("leaseExpiresAt");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("retryCount");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("reason");
      expect(EVENT_WAITLIST_CONTINUATION_FIELDS).toContain("updatedAt");
    });

    it("defines immutable fields after continuation creation", () => {
      expect(EVENT_WAITLIST_CONTINUATION_IMMUTABLE_FIELDS).toEqual([
        "id",
        "eventId",
        "campusId",
      ]);
      expect(Object.isFrozen(EVENT_WAITLIST_CONTINUATION_IMMUTABLE_FIELDS)).toBe(true);
    });

    it("generates deterministic continuation IDs with getEventWaitlistContinuationId", () => {
      expect(getEventWaitlistContinuationId("evt-100")).toBe("continuation_evt-100");
    });

    it("validates a correctly formed continuation document", () => {
      const continuation = {
        id: "continuation_evt-1",
        eventId: "evt-1",
        campusId: "apex-university",
        status: CONTINUATION_STATUSES.PENDING,
        continuationType: CONTINUATION_TYPES.PROMOTION,
        vacanciesRemaining: 2,
        intermediateHeadSequence: 10,
        normalizationRequired: false,
        generation: 1,
        leaseWorkerId: null,
        leaseExpiresAt: null,
        retryCount: 0,
        reason: null,
        updatedAt: new Date(),
      };

      const result = validateWaitlistContinuation(continuation);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("resolves continuation lease activity correctly", () => {
      const now = 1000000;
      const activeLeased = {
        status: CONTINUATION_STATUSES.PROCESSING,
        leaseWorkerId: "worker-cloud-function-abc",
        leaseExpiresAt: now + 30000,
      };

      expect(isContinuationLeaseActive(activeLeased, now)).toBe(true);

      const expiredLease = {
        status: CONTINUATION_STATUSES.PROCESSING,
        leaseWorkerId: "worker-cloud-function-abc",
        leaseExpiresAt: now - 1000,
      };

      expect(isContinuationLeaseActive(expiredLease, now)).toBe(false);

      const completedContinuation = {
        status: CONTINUATION_STATUSES.COMPLETED,
        leaseWorkerId: "worker-cloud-function-abc",
        leaseExpiresAt: now + 30000,
      };

      expect(isContinuationLeaseActive(completedContinuation, now)).toBe(false);
    });

    it("matches the exact approved continuation status contract from ADR-024 Revision 33", () => {
      expect(CONTINUATION_STATUSES).toEqual({
        PENDING: "pending",
        PROCESSING: "processing",
        COMPLETED: "completed",
        FAILED_INTEGRITY: "failed_integrity",
        FAILED_TERMINAL_RETRY: "failed_terminal_retry",
      });
      expect(CONTINUATION_STATUS_LIST).toEqual([
        "pending",
        "processing",
        "completed",
        "failed_integrity",
        "failed_terminal_retry",
      ]);
    });

    it("validates continuation documents with failed_integrity and failed_terminal_retry statuses", () => {
      const baseContinuation = {
        id: "continuation_evt-1",
        eventId: "evt-1",
        campusId: "apex-university",
        continuationType: CONTINUATION_TYPES.PROMOTION,
        vacanciesRemaining: 0,
        intermediateHeadSequence: 10,
        normalizationRequired: false,
        generation: 2,
        leaseWorkerId: null,
        leaseExpiresAt: null,
        retryCount: 3,
        reason: "Integrity check failed: missing candidate slot",
        updatedAt: new Date(),
      };

      const integrityResult = validateWaitlistContinuation({
        ...baseContinuation,
        status: CONTINUATION_STATUSES.FAILED_INTEGRITY,
      });
      expect(integrityResult.valid).toBe(true);
      expect(integrityResult.errors).toEqual([]);

      const retryResult = validateWaitlistContinuation({
        ...baseContinuation,
        status: CONTINUATION_STATUSES.FAILED_TERMINAL_RETRY,
        reason: "Transient retry limit exhausted (3/3)",
      });
      expect(retryResult.valid).toBe(true);
      expect(retryResult.errors).toEqual([]);
    });

    it("rejects unsupported continuation statuses such as dead_letter", () => {
      const invalidContinuation = {
        id: "continuation_evt-1",
        eventId: "evt-1",
        campusId: "apex-university",
        status: "dead_letter",
        continuationType: CONTINUATION_TYPES.PROMOTION,
        vacanciesRemaining: 0,
        intermediateHeadSequence: 10,
        normalizationRequired: false,
        generation: 1,
        leaseWorkerId: null,
        leaseExpiresAt: null,
        retryCount: 5,
        reason: "Moved to dead letter",
        updatedAt: new Date(),
      };

      const result = validateWaitlistContinuation(invalidContinuation);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((err) =>
          err.includes('Invalid continuation status "dead_letter"')
        )
      ).toBe(true);
    });
  });

  describe("Waitlist Notification Domain Invariants", () => {
    it("defines the canonical waitlist offer notification type as event_waitlist_offer", () => {
      expect(NOTIFICATION_TYPES.WAITLIST_OFFER).toBe("event_waitlist_offer");
      expect(NOTIFICATION_TYPE_LIST).toContain("event_waitlist_offer");
      expect(NOTIFICATION_TYPE_LIST).not.toContain("waitlist_offer");
    });
  });
});
