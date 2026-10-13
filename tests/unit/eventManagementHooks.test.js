import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "./hookTestUtils.js";
import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  EVENT_STATUSES,
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../../src/constants.js";
import { COMMUNITY_APEX_AI } from "../../src/data/communities.js";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  useCommunityMembers: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  republishEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("../../src/hooks/useAuth.js", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("../../src/hooks/useCampus.js", () => ({
  useCampus: () => mocks.useOptionalCampus() || { campusId: APEX_CAMPUS_ID },
  useOptionalCampus: () => mocks.useOptionalCampus(),
}));

vi.mock("../../src/hooks/useCommunityMembers.js", () => ({
  useCommunityMembers: (commId, uid) => mocks.useCommunityMembers(commId, uid),
}));

vi.mock("../../src/services/eventService.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    updateEvent: mocks.updateEvent,
    cancelEvent: mocks.cancelEvent,
    republishEvent: mocks.republishEvent,
    deleteEvent: mocks.deleteEvent,
  };
});

import { useEventManagement } from "../../src/hooks/useEventManagement.js";

describe("Milestone 22 — Unit 22.3: Event Management Hooks", () => {
  const buildEvent = (overrides = {}) => {
    const now = Date.now();
    return {
      id: "event-101",
      campusId: APEX_CAMPUS_ID,
      communityId: COMMUNITY_APEX_AI.id,
      title: "AI & Autonomous Agents Hackathon",
      status: EVENT_STATUSES.PUBLISHED,
      startAt: new Date(now + 2 * 60 * 60 * 1000), // +2h
      endAt: new Date(now + 4 * 60 * 60 * 1000), // +4h
      ...overrides,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { uid: "test-user-admin", campusId: APEX_CAMPUS_ID },
    });
    mocks.useOptionalCampus.mockReturnValue({
      campusId: APEX_CAMPUS_ID,
    });
    mocks.useCommunityMembers.mockReturnValue({
      membership: {
        id: `${COMMUNITY_APEX_AI.id}_test-user-admin`,
        role: COMMUNITY_MEMBER_ROLES.ADMIN,
        status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
      },
      isLoading: false,
      error: null,
    });
    mocks.updateEvent.mockResolvedValue();
    mocks.cancelEvent.mockResolvedValue();
    mocks.republishEvent.mockResolvedValue();
    mocks.deleteEvent.mockResolvedValue();
  });

  describe("1. Authority & Governance Evaluation", () => {
    it("computes isLeader=true and isAdmin=true for active community admin", () => {
      mocks.useCommunityMembers.mockReturnValueOnce({
        membership: {
          role: COMMUNITY_MEMBER_ROLES.ADMIN,
          status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
        },
        isLoading: false,
      });

      const { result } = renderHook(() => useEventManagement(buildEvent()));

      expect(result.current.isLeader).toBe(true);
      expect(result.current.isAdmin).toBe(true);
      expect(result.current.canDelete).toBe(true);
      expect(result.current.canEdit).toBe(true);
    });

    it("computes isLeader=true and isAdmin=false for active community moderator", () => {
      mocks.useCommunityMembers.mockReturnValueOnce({
        membership: {
          role: COMMUNITY_MEMBER_ROLES.MODERATOR,
          status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
        },
        isLoading: false,
      });

      const { result } = renderHook(() => useEventManagement(buildEvent()));

      expect(result.current.isLeader).toBe(true);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.canDelete).toBe(false); // Moderator cannot delete
      expect(result.current.canEdit).toBe(true);
      expect(result.current.canCancel).toBe(true);
    });

    it("computes isLeader=false and isAdmin=false for regular active member", () => {
      mocks.useCommunityMembers.mockReturnValueOnce({
        membership: {
          role: COMMUNITY_MEMBER_ROLES.MEMBER,
          status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
        },
        isLoading: false,
      });

      const { result } = renderHook(() => useEventManagement(buildEvent()));

      expect(result.current.isLeader).toBe(false);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canCancel).toBe(false);
      expect(result.current.canDelete).toBe(false);
    });

    it("computes isLeader=false and isAdmin=false for inactive or pending membership", () => {
      mocks.useCommunityMembers.mockReturnValueOnce({
        membership: {
          role: COMMUNITY_MEMBER_ROLES.ADMIN,
          status: COMMUNITY_MEMBER_STATUSES.PENDING,
        },
        isLoading: false,
      });

      const { result } = renderHook(() => useEventManagement(buildEvent()));

      expect(result.current.isLeader).toBe(false);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.canEdit).toBe(false);
    });

    it("computes isLeader=false and isAdmin=false when user has no membership (null)", () => {
      mocks.useCommunityMembers.mockReturnValueOnce({
        membership: null,
        isLoading: false,
      });

      const { result } = renderHook(() => useEventManagement(buildEvent()));

      expect(result.current.isLeader).toBe(false);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canCancel).toBe(false);
    });

    it("handles unauthenticated user (user: null) safely without crash", () => {
      mocks.useAuth.mockReturnValueOnce({ user: null });
      mocks.useCommunityMembers.mockReturnValueOnce({
        membership: null,
        isLoading: false,
      });

      const { result } = renderHook(() => useEventManagement(buildEvent()));

      expect(result.current.isLeader).toBe(false);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(mocks.useCommunityMembers).toHaveBeenCalledWith(
        COMMUNITY_APEX_AI.id,
        null
      );
    });
  });

  describe("2. Campus-Scoped Tenant Parity & Isolation", () => {
    it("evaluates hasCampusParity=true when event campusId matches context campusId", () => {
      const { result } = renderHook(() => useEventManagement(buildEvent()));

      expect(result.current.effectiveCampusId).toBe(APEX_CAMPUS_ID);
      expect(result.current.hasCampusParity).toBe(true);
      expect(result.current.canEdit).toBe(true);
    });

    it("forces all mutation permissions to false when event campusId differs (cross-campus)", () => {
      // Event belongs to St. Jude, but caller context is Apex
      const crossCampusEvent = buildEvent({ campusId: ST_JUDE_CAMPUS_ID });

      const { result } = renderHook(() => useEventManagement(crossCampusEvent));

      expect(result.current.effectiveCampusId).toBe(APEX_CAMPUS_ID);
      expect(result.current.hasCampusParity).toBe(false);
      // Leadership data might say admin, but cross-campus tenant isolation denies all management actions
      expect(result.current.isLeader).toBe(true);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canCancel).toBe(false);
      expect(result.current.canRepublish).toBe(false);
      expect(result.current.canDelete).toBe(false);
    });

    it("fails closed when campus context is completely unavailable (null)", () => {
      mocks.useOptionalCampus.mockReturnValueOnce(null);
      mocks.useAuth.mockReturnValueOnce({
        user: { uid: "test-user-admin", campusId: null },
      });

      const { result } = renderHook(() => useEventManagement(buildEvent()));

      expect(result.current.effectiveCampusId).toBeNull();
      expect(result.current.hasCampusParity).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canCancel).toBe(false);
      expect(result.current.canDelete).toBe(false);
    });

    it("accepts explicit campusId override matching event campusId", () => {
      mocks.useOptionalCampus.mockReturnValueOnce({ campusId: ST_JUDE_CAMPUS_ID });

      // Override with APEX_CAMPUS_ID matching event
      const { result } = renderHook(() =>
        useEventManagement(buildEvent(), null, APEX_CAMPUS_ID)
      );

      expect(result.current.effectiveCampusId).toBe(APEX_CAMPUS_ID);
      expect(result.current.hasCampusParity).toBe(true);
      expect(result.current.canEdit).toBe(true);
    });

    it("fails closed when event lacks campusId", () => {
      const eventNoCampus = buildEvent({ campusId: null });

      const { result } = renderHook(() => useEventManagement(eventNoCampus));

      expect(result.current.hasCampusParity).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canDelete).toBe(false);
    });
  });

  describe("3. Fail-Closed Sponsoring Community Resolution", () => {
    it("fails closed when event.communityId is null", () => {
      const eventNullCommunity = buildEvent({ communityId: null });

      const { result } = renderHook(() => useEventManagement(eventNullCommunity));

      expect(result.current.isLeader).toBe(false);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canCancel).toBe(false);
      expect(result.current.canRepublish).toBe(false);
      expect(result.current.canDelete).toBe(false);
      expect(mocks.useCommunityMembers).toHaveBeenCalledWith(null, "test-user-admin");
    });

    it("fails closed when event.communityId is empty string or whitespace", () => {
      const eventEmptyCommunity = buildEvent({ communityId: "   " });

      const { result } = renderHook(() => useEventManagement(eventEmptyCommunity));

      expect(result.current.isLeader).toBe(false);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(mocks.useCommunityMembers).toHaveBeenCalledWith(null, "test-user-admin");
    });

    it("handles null event argument safely with all false flags and null temporalState", () => {
      const { result } = renderHook(() => useEventManagement(null));

      expect(result.current.temporalState).toBeNull();
      expect(result.current.isOngoing).toBe(false);
      expect(result.current.isLeader).toBe(false);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canCancel).toBe(false);
      expect(result.current.canRepublish).toBe(false);
      expect(result.current.canDelete).toBe(false);
      expect(result.current.isMutating).toBe(false);
      expect(result.current.mutationError).toBeNull();
    });
  });

  describe("4. Temporal State & Permission Derivations", () => {
    it("derives correct permissions for upcoming published event", () => {
      const now = Date.now();
      const event = buildEvent({
        startAt: new Date(now + 100000),
        endAt: new Date(now + 200000),
      });

      const { result } = renderHook(() => useEventManagement(event));

      expect(result.current.temporalState).toBe("upcoming");
      expect(result.current.isOngoing).toBe(false);
      expect(result.current.canEdit).toBe(true);
      expect(result.current.canCancel).toBe(true);
      expect(result.current.canDelete).toBe(true);
      expect(result.current.canRepublish).toBe(false);
    });

    it("derives correct permissions for ongoing published event", () => {
      const now = Date.now();
      const event = buildEvent({
        startAt: new Date(now - 100000),
        endAt: new Date(now + 100000),
      });

      const { result } = renderHook(() => useEventManagement(event));

      expect(result.current.temporalState).toBe("ongoing");
      expect(result.current.isOngoing).toBe(true);
      expect(result.current.canEdit).toBe(true);
      expect(result.current.canCancel).toBe(true);
      expect(result.current.canDelete).toBe(false); // Ongoing events cannot be deleted
      expect(result.current.canRepublish).toBe(false);
    });

    it("derives correct permissions at exact ongoing boundary (now === endAt)", () => {
      const now = Date.now();
      const event = buildEvent({
        startAt: new Date(now - 100000),
        endAt: new Date(now), // exactly now
      });

      const { result } = renderHook(() => useEventManagement(event));

      expect(result.current.temporalState).toBe("ongoing");
      expect(result.current.isOngoing).toBe(true);
      expect(result.current.canEdit).toBe(true);
      expect(result.current.canCancel).toBe(true);
      expect(result.current.canDelete).toBe(false);
    });

    it("derives read-only freeze for completed event (now > endAt)", () => {
      const now = Date.now();
      const event = buildEvent({
        startAt: new Date(now - 200000),
        endAt: new Date(now - 10000),
      });

      const { result } = renderHook(() => useEventManagement(event));

      expect(result.current.temporalState).toBe("completed");
      expect(result.current.isOngoing).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canCancel).toBe(false);
      expect(result.current.canDelete).toBe(false);
      expect(result.current.canRepublish).toBe(false);
    });

    it("derives correct permissions for upcoming cancelled event", () => {
      const now = Date.now();
      const event = buildEvent({
        status: EVENT_STATUSES.CANCELLED,
        startAt: new Date(now + 100000),
        endAt: new Date(now + 200000),
      });

      const { result } = renderHook(() => useEventManagement(event));

      expect(result.current.temporalState).toBe("upcoming");
      expect(result.current.canEdit).toBe(false); // Must republish first
      expect(result.current.canCancel).toBe(false); // Already cancelled
      expect(result.current.canRepublish).toBe(true);
      expect(result.current.canDelete).toBe(true);
    });

    it("denies republishing and deletion for cancelled event once started (now >= startAt)", () => {
      const now = Date.now();
      const event = buildEvent({
        status: EVENT_STATUSES.CANCELLED,
        startAt: new Date(now - 50000),
        endAt: new Date(now + 50000),
      });

      const { result } = renderHook(() => useEventManagement(event));

      expect(result.current.canRepublish).toBe(false);
      expect(result.current.canDelete).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canCancel).toBe(false);
    });

    it("fails closed on inverted stored chronology (endAt < startAt)", () => {
      const now = Date.now();
      const event = buildEvent({
        startAt: new Date(now + 200000),
        endAt: new Date(now + 100000),
      });

      const { result } = renderHook(() => useEventManagement(event));

      expect(result.current.temporalState).toBeNull();
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canCancel).toBe(false);
      expect(result.current.canDelete).toBe(false);
      expect(result.current.canRepublish).toBe(false);
    });
  });

  describe("5. Reactive Boundary Timers & Finite-Number Chronology", () => {
    it("transitions from upcoming to ongoing when clock reaches startAt", () => {
      vi.useFakeTimers();
      const fixedRef = new Date("2026-10-15T12:00:00.000Z");
      vi.setSystemTime(fixedRef);

      try {
        const startAt = new Date(fixedRef.getTime() + 5000);
        const endAt = new Date(fixedRef.getTime() + 15000);
        const event = buildEvent({ startAt, endAt });

        const { result } = renderHook(() => useEventManagement(event));

        expect(result.current.temporalState).toBe("upcoming");
        expect(result.current.canDelete).toBe(true);
        expect(result.current.isOngoing).toBe(false);

        // Advance clock by 5000 ms to hit startAt
        vi.advanceTimersByTime(5000);

        expect(result.current.temporalState).toBe("ongoing");
        expect(result.current.canDelete).toBe(false);
        expect(result.current.isOngoing).toBe(true);
        expect(result.current.canEdit).toBe(true);
        expect(result.current.canCancel).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("transitions from ongoing to completed when clock reaches endAt + 1 ms", () => {
      vi.useFakeTimers();
      const fixedRef = new Date("2026-10-15T12:00:00.000Z");
      vi.setSystemTime(fixedRef);

      try {
        const startAt = new Date(fixedRef.getTime() - 5000);
        const endAt = new Date(fixedRef.getTime() + 5000);
        const event = buildEvent({ startAt, endAt });

        const { result } = renderHook(() => useEventManagement(event));

        expect(result.current.temporalState).toBe("ongoing");
        expect(result.current.canEdit).toBe(true);

        // Advance clock by 5000 ms to hit exact boundary endAt -> still ongoing
        vi.advanceTimersByTime(5000);

        expect(result.current.temporalState).toBe("ongoing");
        expect(result.current.canEdit).toBe(true);

        // Advance by 1 ms to reach endAt + 1 ms -> transitions to completed
        vi.advanceTimersByTime(1);

        expect(result.current.temporalState).toBe("completed");
        expect(result.current.isOngoing).toBe(false);
        expect(result.current.canEdit).toBe(false);
        expect(result.current.canCancel).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it("supports numeric zero timestamp (Unix epoch) without falsy rejection", () => {
      vi.useFakeTimers();
      const preEpoch = new Date(-10000); // 10s before epoch
      vi.setSystemTime(preEpoch);

      try {
        const event = buildEvent({
          startAt: 0, // numeric 0 (Unix epoch)
          endAt: 10000, // 10s after epoch
        });

        const { result } = renderHook(() => useEventManagement(event));

        expect(result.current.temporalState).toBe("upcoming");

        // Advance clock past epoch (10000 ms)
        vi.advanceTimersByTime(10000);

        expect(result.current.temporalState).toBe("ongoing");
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not schedule a timer if event is already completed on initial render", () => {
      const now = Date.now();
      const spyTimeout = vi.spyOn(globalThis, "setTimeout");

      const event = buildEvent({
        startAt: new Date(now - 20000),
        endAt: new Date(now - 10000),
      });

      renderHook(() => useEventManagement(event));

      expect(spyTimeout).not.toHaveBeenCalled();
      spyTimeout.mockRestore();
    });

    it("cleans up scheduled timer on unmount", () => {
      const now = Date.now();
      const spyClear = vi.spyOn(globalThis, "clearTimeout");

      const event = buildEvent({
        startAt: new Date(now + 10000),
        endAt: new Date(now + 20000),
      });

      const { unmount } = renderHook(() => useEventManagement(event));

      unmount();

      expect(spyClear).toHaveBeenCalled();
      spyClear.mockRestore();
    });
  });

  describe("6. Mutation State Machine & Service Integration", () => {
    it("calls updateEvent and manages isMutating lifecycle on editDetails", async () => {
      const event = buildEvent();
      const { result } = renderHook(() => useEventManagement(event));

      expect(result.current.isMutating).toBe(false);
      expect(result.current.mutationError).toBeNull();

      const updates = { location: "Auditorium C" };
      await act(async () => {
        await result.current.editDetails(updates);
      });

      expect(mocks.updateEvent).toHaveBeenCalledWith(event.id, updates, event);
      expect(result.current.isMutating).toBe(false);
      expect(result.current.mutationError).toBeNull();
    });

    it("captures mutation error and rethrows when updateEvent fails", async () => {
      mocks.updateEvent.mockRejectedValueOnce(
        new Error("Field 'unknown' is not allowed for upcoming event edits.")
      );

      const event = buildEvent();
      const { result } = renderHook(() => useEventManagement(event));

      let caughtErr = null;
      await act(async () => {
        try {
          await result.current.editDetails({ unknown: "value" });
        } catch (err) {
          caughtErr = err;
        }
      });

      expect(caughtErr).not.toBeNull();
      expect(caughtErr.message).toBe(
        "Field 'unknown' is not allowed for upcoming event edits."
      );
      expect(result.current.mutationError).toBe(
        "Field 'unknown' is not allowed for upcoming event edits."
      );
      expect(result.current.isMutating).toBe(false);
    });

    it("calls cancelEvent on cancelCurrentEvent", async () => {
      const event = buildEvent();
      const { result } = renderHook(() => useEventManagement(event));

      await act(async () => {
        await result.current.cancelCurrentEvent();
      });

      expect(mocks.cancelEvent).toHaveBeenCalledWith(event.id, event);
      expect(result.current.isMutating).toBe(false);
      expect(result.current.mutationError).toBeNull();
    });

    it("calls republishEvent on republishCurrentEvent", async () => {
      const event = buildEvent({ status: EVENT_STATUSES.CANCELLED });
      const { result } = renderHook(() => useEventManagement(event));

      await act(async () => {
        await result.current.republishCurrentEvent();
      });

      expect(mocks.republishEvent).toHaveBeenCalledWith(event.id, event);
      expect(result.current.isMutating).toBe(false);
      expect(result.current.mutationError).toBeNull();
    });

    it("calls deleteEvent on deleteCurrentEvent", async () => {
      const event = buildEvent();
      const { result } = renderHook(() => useEventManagement(event));

      await act(async () => {
        await result.current.deleteCurrentEvent();
      });

      expect(mocks.deleteEvent).toHaveBeenCalledWith(event.id, event);
      expect(result.current.isMutating).toBe(false);
      expect(result.current.mutationError).toBeNull();
    });

    it("throws descriptive error immediately when mutation called with null event", async () => {
      const { result } = renderHook(() => useEventManagement(null));

      await expect(result.current.editDetails({ location: "Lab" })).rejects.toThrow(
        "No active event to edit."
      );
      await expect(result.current.cancelCurrentEvent()).rejects.toThrow(
        "No active event to cancel."
      );
      await expect(result.current.republishCurrentEvent()).rejects.toThrow(
        "No active event to republish."
      );
      await expect(result.current.deleteCurrentEvent()).rejects.toThrow(
        "No active event to delete."
      );

      expect(mocks.updateEvent).not.toHaveBeenCalled();
      expect(mocks.cancelEvent).not.toHaveBeenCalled();
    });

    it("resets mutation error when clearError is called", async () => {
      mocks.cancelEvent.mockRejectedValueOnce(new Error("Permission denied."));

      const event = buildEvent();
      const { result } = renderHook(() => useEventManagement(event));

      await act(async () => {
        try {
          await result.current.cancelCurrentEvent();
        } catch {
          // ignore
        }
      });

      expect(result.current.mutationError).toBe("Permission denied.");

      act(() => {
        result.current.clearError();
      });

      expect(result.current.mutationError).toBeNull();
    });
  });

  describe("7. Concurrency Lock & Busy Error Rejection", () => {
    it("rejects duplicate concurrent mutation call with busy error and calls service only once", async () => {
      let resolveFirst;
      mocks.updateEvent.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      );

      const event = buildEvent();
      const { result } = renderHook(() => useEventManagement(event));

      let firstPromise;
      act(() => {
        firstPromise = result.current.editDetails({ location: "Hall A" });
      });

      expect(result.current.isMutating).toBe(true);

      // Attempt second mutation while first is pending
      let secondError = null;
      await act(async () => {
        try {
          await result.current.cancelCurrentEvent();
        } catch (err) {
          secondError = err;
        }
      });

      expect(secondError).not.toBeNull();
      expect(secondError.message).toBe("Another event mutation is currently in progress.");

      // Service updateEvent was called once; cancelEvent was never called
      expect(mocks.updateEvent).toHaveBeenCalledTimes(1);
      expect(mocks.cancelEvent).not.toHaveBeenCalled();

      // Resolve first mutation
      await act(async () => {
        resolveFirst();
        await firstPromise;
      });

      expect(result.current.isMutating).toBe(false);
      expect(result.current.mutationError).toBeNull();
    });

    it("resets isMutating cleanly when active mutation rejects", async () => {
      mocks.updateEvent.mockRejectedValueOnce(new Error("Network timeout"));

      const event = buildEvent();
      const { result } = renderHook(() => useEventManagement(event));

      await act(async () => {
        try {
          await result.current.editDetails({ location: "Hall B" });
        } catch {
          // expected
        }
      });

      expect(result.current.isMutating).toBe(false);
      expect(result.current.mutationError).toBe("Network timeout");
    });
  });

  describe("8. Lock Preservation across Event Identity Switching", () => {
    it("preserves concurrency lock when event changes while mutation is pending", async () => {
      let resolveEventA;
      mocks.updateEvent.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveEventA = resolve;
          })
      );

      const eventA = buildEvent({ id: "event-A", title: "Event A" });
      const eventB = buildEvent({ id: "event-B", title: "Event B" });

      const { result, rerender } = renderHook(
        ({ evt }) => useEventManagement(evt),
        { initialProps: { evt: eventA } }
      );

      // 1. Start mutation on Event A
      let promiseA;
      act(() => {
        promiseA = result.current.editDetails({ location: "Room A" });
      });

      expect(result.current.isMutating).toBe(true);

      // 2. Switch hook to Event B while mutation on A is still in flight
      rerender({ evt: eventB });

      // Local display state for Event B is reset
      expect(result.current.mutationError).toBeNull();

      // 3. Attempt mutation on Event B while Event A's mutation is still pending
      let errorB = null;
      await act(async () => {
        try {
          await result.current.editDetails({ location: "Room B" });
        } catch (err) {
          errorB = err;
        }
      });

      // Must reject with busy error because lock is still held by Event A's mutation!
      expect(errorB).not.toBeNull();
      expect(errorB.message).toBe("Another event mutation is currently in progress.");
      expect(mocks.updateEvent).toHaveBeenCalledTimes(1);
      expect(mocks.updateEvent).toHaveBeenCalledWith("event-A", expect.any(Object), eventA);

      // 4. Now settle Event A's mutation
      await act(async () => {
        resolveEventA();
        await promiseA;
      });

      // 5. Concurrency lock is now released; subsequent mutation on Event B succeeds!
      await act(async () => {
        await result.current.editDetails({ location: "Room B Confirmed" });
      });

      expect(mocks.updateEvent).toHaveBeenCalledTimes(2);
      expect(mocks.updateEvent).toHaveBeenLastCalledWith(
        "event-B",
        { location: "Room B Confirmed" },
        eventB
      );
      expect(result.current.isMutating).toBe(false);
    });

    it("does not overwrite Event B hook state with Event A stale mutation failure", async () => {
      let rejectEventA;
      mocks.updateEvent.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectEventA = reject;
          })
      );

      const eventA = buildEvent({ id: "event-A", title: "Event A" });
      const eventB = buildEvent({ id: "event-B", title: "Event B" });

      const { result, rerender } = renderHook(
        ({ evt }) => useEventManagement(evt),
        { initialProps: { evt: eventA } }
      );

      let promiseA;
      let errorA = null;
      act(() => {
        promiseA = result.current
          .editDetails({ location: "Room A" })
          .catch((err) => {
            errorA = err;
          });
      });

      // Switch to Event B
      rerender({ evt: eventB });

      // Now reject Event A mutation
      await act(async () => {
        rejectEventA(new Error("Event A database write failed"));
        await promiseA;
      });

      // Event A's original caller received the error
      expect(errorA).not.toBeNull();
      expect(errorA.message).toBe("Event A database write failed");

      // But Event B's hook state was NOT polluted with Event A's error!
      expect(result.current.mutationError).toBeNull();
      expect(result.current.isMutating).toBe(false);
    });
  });

  describe("9. Teardown Invariants & Unmount Safety", () => {
    it("does not trigger errors when mutation settles after hook unmount", async () => {
      let resolveFn;
      mocks.cancelEvent.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFn = resolve;
          })
      );

      const event = buildEvent();
      const { result, unmount } = renderHook(() => useEventManagement(event));

      let promise;
      act(() => {
        promise = result.current.cancelCurrentEvent();
      });

      // Unmount while mutation in flight
      unmount();

      // Settle mutation
      await act(async () => {
        resolveFn();
        await promise;
      });

      // Should complete cleanly without uncaught warnings
      expect(mocks.cancelEvent).toHaveBeenCalledTimes(1);
    });
  });
});
