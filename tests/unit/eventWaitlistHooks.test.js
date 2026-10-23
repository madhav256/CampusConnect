/**
 * Milestone 24 — Unit 24.2: useEventWaitlist React Hook Tests
 *
 * Tests for multi-document waitlist subscriptions (Member, Coordinator, Slot),
 * live relative queue position resolution, offer countdown calculation,
 * and user action handlers (join, leave, claim, decline).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { WAITLIST_SLOT_STATUSES } from "../../src/constants.js";
import { renderHook, act } from "./hookTestUtils";

const mocks = vi.hoisted(() => ({
  subscribeToWaitlistMember: vi.fn(),
  subscribeToWaitlistSlot: vi.fn(),
  subscribeToEventCapacity: vi.fn(),
  serviceJoinWaitlist: vi.fn(),
  withdrawNonHeadWaitlist: vi.fn(),
  serviceLeaveWaitlist: vi.fn(),
  claimWaitlistOffer: vi.fn(),
  declineWaitlistOffer: vi.fn(),
}));

vi.mock("../../src/services/eventCapacityService.js", () => ({
  subscribeToEventCapacity: mocks.subscribeToEventCapacity,
}));

vi.mock("../../src/services/eventWaitlistService.js", () => ({
  subscribeToWaitlistMember: mocks.subscribeToWaitlistMember,
  subscribeToWaitlistSlot: mocks.subscribeToWaitlistSlot,
  joinWaitlist: mocks.serviceJoinWaitlist,
  joinWaitlistBatch: mocks.serviceJoinWaitlist,
  withdrawNonHeadWaitlist: mocks.withdrawNonHeadWaitlist,
  leaveWaitlist: mocks.serviceLeaveWaitlist,
  claimWaitlistOffer: mocks.claimWaitlistOffer,
  declineWaitlistOffer: mocks.declineWaitlistOffer,
}));

import { useEventWaitlist } from "../../src/hooks/useEventWaitlist.js";

describe("Milestone 24 — Unit 24.2: useEventWaitlist Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles null/missing eventId and userId gracefully", () => {
    const { result } = renderHook(() => useEventWaitlist(null, null));

    expect(result.current.loading).toBe(false);
    expect(result.current.isOnWaitlist).toBe(false);
    expect(result.current.member).toBeNull();
    expect(result.current.slot).toBeNull();
    expect(mocks.subscribeToWaitlistMember).not.toHaveBeenCalled();
  });

  it("subscribes to member and coordinator, then resolves relative queue position", () => {
    let emitMember;
    let emitCoordinator;
    mocks.subscribeToWaitlistMember.mockImplementation((_e, _u, cb) => {
      emitMember = cb;
      return vi.fn();
    });
    mocks.subscribeToEventCapacity.mockImplementation((_e, cb) => {
      emitCoordinator = cb;
      return vi.fn();
    });
    mocks.subscribeToWaitlistSlot.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useEventWaitlist("evt-100", "usr-1"));

    // Emit coordinator with headSequence = 5
    act(() => {
      emitCoordinator({
        eventId: "evt-100",
        headSequence: 5,
        nextSequence: 10,
      });
    });

    // Emit member with sequenceNumber = 8
    act(() => {
      emitMember({
        id: "member_evt-100_usr-1",
        sequenceNumber: 8,
        status: "waiting",
      });
    });

    expect(result.current.isOnWaitlist).toBe(true);
    expect(result.current.isWaiting).toBe(true);
    // Relative position = 8 - 5 + 1 = 4
    expect(result.current.queuePosition).toBe(4);
  });

  it("subscribes to slot when sequenceNumber is known and detects active offer", () => {
    let emitMember;
    let emitSlot;
    mocks.subscribeToWaitlistMember.mockImplementation((_e, _u, cb) => {
      emitMember = cb;
      return vi.fn();
    });
    mocks.subscribeToEventCapacity.mockReturnValue(vi.fn());
    mocks.subscribeToWaitlistSlot.mockImplementation((_e, _s, cb) => {
      emitSlot = cb;
      return vi.fn();
    });

    const { result } = renderHook(() => useEventWaitlist("evt-100", "usr-1"));

    act(() => {
      emitMember({
        id: "member_evt-100_usr-1",
        sequenceNumber: 3,
        status: "waiting",
      });
    });

    expect(mocks.subscribeToWaitlistSlot).toHaveBeenCalledWith("evt-100", 3, expect.any(Function), expect.any(Function));

    // Emit slot in OFFERED state with 2 hours remaining
    const expiresAt = Date.now() + 7200000;
    act(() => {
      emitSlot({
        id: "slot_evt-100_3",
        sequenceNumber: 3,
        status: WAITLIST_SLOT_STATUSES.OFFERED,
        offerExpiresAt: expiresAt,
      });
    });

    expect(result.current.isOffered).toBe(true);
    expect(result.current.timeRemainingMs).toBeGreaterThan(0);
  });

  it("executes join action via serviceJoinWaitlist", async () => {
    mocks.subscribeToWaitlistMember.mockReturnValue(vi.fn());
    mocks.subscribeToEventCapacity.mockReturnValue(vi.fn());
    mocks.serviceJoinWaitlist.mockResolvedValueOnce({ success: true, sequenceNumber: 4 });

    const { result } = renderHook(() => useEventWaitlist("evt-100", "usr-1"));

    let joinRes;
    await act(async () => {
      joinRes = await result.current.join("apex-university");
    });

    expect(mocks.serviceJoinWaitlist).toHaveBeenCalledWith("evt-100", "usr-1", "apex-university");
    expect(joinRes.sequenceNumber).toBe(4);
  });

  it("routes leave() to client batch (PW-5 Non-Head) when sequenceNumber > headSequence", async () => {
    let emitMember;
    let emitCoordinator;
    mocks.subscribeToWaitlistMember.mockImplementation((_e, _u, cb) => {
      emitMember = cb;
      return vi.fn();
    });
    mocks.subscribeToEventCapacity.mockImplementation((_e, cb) => {
      emitCoordinator = cb;
      return vi.fn();
    });
    mocks.subscribeToWaitlistSlot.mockReturnValue(vi.fn());
    mocks.withdrawNonHeadWaitlist.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useEventWaitlist("evt-100", "usr-1"));

    act(() => {
      emitCoordinator({ headSequence: 2 });
      emitMember({ sequenceNumber: 5, status: "waiting" });
    });

    let leaveRes;
    await act(async () => {
      leaveRes = await result.current.leave();
    });

    expect(mocks.withdrawNonHeadWaitlist).toHaveBeenCalledWith("evt-100", "usr-1", 5);
    expect(leaveRes.method).toBe("client_batch_non_head");
    expect(mocks.serviceLeaveWaitlist).not.toHaveBeenCalled();
  });

  it("routes leave() to backend callable (PW-5 Head) when sequenceNumber <= headSequence", async () => {
    let emitMember;
    let emitCoordinator;
    mocks.subscribeToWaitlistMember.mockImplementation((_e, _u, cb) => {
      emitMember = cb;
      return vi.fn();
    });
    mocks.subscribeToEventCapacity.mockImplementation((_e, cb) => {
      emitCoordinator = cb;
      return vi.fn();
    });
    mocks.subscribeToWaitlistSlot.mockReturnValue(vi.fn());
    mocks.serviceLeaveWaitlist.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useEventWaitlist("evt-100", "usr-1"));

    act(() => {
      emitCoordinator({ headSequence: 5 });
      emitMember({ sequenceNumber: 5, status: "waiting" });
    });

    let leaveRes;
    await act(async () => {
      leaveRes = await result.current.leave();
    });

    expect(mocks.serviceLeaveWaitlist).toHaveBeenCalledWith({ eventId: "evt-100" });
    expect(leaveRes.method).toBe("callable_head");
    expect(mocks.withdrawNonHeadWaitlist).not.toHaveBeenCalled();
  });

  it("executes claim() via backend callable claimWaitlistOffer", async () => {
    let emitMember;
    mocks.subscribeToWaitlistMember.mockImplementation((_e, _u, cb) => {
      emitMember = cb;
      return vi.fn();
    });
    mocks.subscribeToEventCapacity.mockReturnValue(vi.fn());
    mocks.subscribeToWaitlistSlot.mockReturnValue(vi.fn());
    mocks.claimWaitlistOffer.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useEventWaitlist("evt-100", "usr-1"));

    act(() => {
      emitMember({ sequenceNumber: 3 });
    });

    let claimRes;
    await act(async () => {
      claimRes = await result.current.claim();
    });

    expect(mocks.claimWaitlistOffer).toHaveBeenCalledWith({ eventId: "evt-100", slotSequence: 3 });
    expect(claimRes.success).toBe(true);
  });

  it("executes decline() via backend callable declineWaitlistOffer", async () => {
    let emitMember;
    mocks.subscribeToWaitlistMember.mockImplementation((_e, _u, cb) => {
      emitMember = cb;
      return vi.fn();
    });
    mocks.subscribeToEventCapacity.mockReturnValue(vi.fn());
    mocks.subscribeToWaitlistSlot.mockReturnValue(vi.fn());
    mocks.declineWaitlistOffer.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useEventWaitlist("evt-100", "usr-1"));

    act(() => {
      emitMember({ sequenceNumber: 3 });
    });

    let declineRes;
    await act(async () => {
      declineRes = await result.current.decline();
    });

    expect(mocks.declineWaitlistOffer).toHaveBeenCalledWith({ eventId: "evt-100", slotSequence: 3 });
    expect(declineRes.success).toBe(true);
  });
});
