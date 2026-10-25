import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "./hookTestUtils.js";
import { APEX_CAMPUS_ID, ST_JUDE_CAMPUS_ID } from "../../src/constants.js";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  subscribeToMyEventRsvp: vi.fn(),
  createEventRsvp: vi.fn(),
  deleteEventRsvp: vi.fn(),
  subscribeToEventAttendees: vi.fn(),
  subscribeToMyRsvps: vi.fn(),
}));

vi.mock("../../src/hooks/useAuth.js", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("../../src/hooks/useCampus.js", () => ({
  useCampus: () => ({ campusId: APEX_CAMPUS_ID }),
  useOptionalCampus: () => mocks.useOptionalCampus(),
}));

vi.mock("../../src/services/eventRsvpService.js", () => ({
  subscribeToMyEventRsvp: mocks.subscribeToMyEventRsvp,
  createEventRsvp: mocks.createEventRsvp,
  deleteEventRsvp: mocks.deleteEventRsvp,
  subscribeToEventAttendees: mocks.subscribeToEventAttendees,
  subscribeToMyRsvps: mocks.subscribeToMyRsvps,
}));

import { useEventRsvp } from "../../src/hooks/useEventRsvp.js";
import { useEventAttendees } from "../../src/hooks/useEventAttendees.js";
import { useMyRsvps } from "../../src/hooks/useMyRsvps.js";

describe("Milestone 21 — Unit 21.3: Event RSVP Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { uid: "test-user-alice" },
    });
    mocks.useOptionalCampus.mockReturnValue({
      campusId: APEX_CAMPUS_ID,
    });
    mocks.subscribeToMyEventRsvp.mockReturnValue(vi.fn());
    mocks.subscribeToEventAttendees.mockReturnValue(vi.fn());
    mocks.subscribeToMyRsvps.mockReturnValue(vi.fn());
  });

  describe("useEventRsvp Hook", () => {
    it("transitions from loading to data when subscription emits normalized RSVP", () => {
      let callback;
      mocks.subscribeToMyEventRsvp.mockImplementation((_eId, _uId, cb) => {
        callback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useEventRsvp("event-101"));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.rsvp).toBeNull();
      expect(result.current.isGoing).toBe(false);
      expect(result.current.isMutating).toBe(false);
      expect(result.current.error).toBeNull();

      expect(mocks.subscribeToMyEventRsvp).toHaveBeenCalledWith(
        "event-101",
        "test-user-alice",
        expect.any(Function),
        expect.any(Function)
      );

      const sampleRsvp = {
        id: "event-101_test-user-alice",
        eventId: "event-101",
        campusId: APEX_CAMPUS_ID,
        userId: "test-user-alice",
        createdAt: new Date(),
      };

      act(() => {
        callback(sampleRsvp);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.rsvp).toEqual(sampleRsvp);
      expect(result.current.isGoing).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it("handles empty / not-going state when document does not exist", () => {
      let callback;
      mocks.subscribeToMyEventRsvp.mockImplementation((_eId, _uId, cb) => {
        callback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useEventRsvp("event-101"));

      act(() => {
        callback(null);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.rsvp).toBeNull();
      expect(result.current.isGoing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("handles unauthenticated or missing eventId state safely without subscription", () => {
      mocks.useAuth.mockReturnValueOnce({ user: null });

      const { result } = renderHook(() => useEventRsvp("event-101"));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.rsvp).toBeNull();
      expect(result.current.isGoing).toBe(false);
      expect(mocks.subscribeToMyEventRsvp).not.toHaveBeenCalled();

      const { result: resultNoEvent } = renderHook(() => useEventRsvp(null));
      expect(resultNoEvent.current.isLoading).toBe(false);
      expect(resultNoEvent.current.rsvp).toBeNull();
      expect(resultNoEvent.current.isGoing).toBe(false);
      expect(mocks.subscribeToMyEventRsvp).not.toHaveBeenCalled();
    });

    it("surfaces subscription errors", () => {
      let errorCallback;
      mocks.subscribeToMyEventRsvp.mockImplementation((_eId, _uId, _cb, errCb) => {
        errorCallback = errCb;
        return vi.fn();
      });

      const { result } = renderHook(() => useEventRsvp("event-101"));

      act(() => {
        errorCallback(new Error("Permission denied to read RSVP"));
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.rsvp).toBeNull();
      expect(result.current.isGoing).toBe(false);
      expect(result.current.error).toBe("Permission denied to read RSVP");
    });

    it("tracks mutation state during rsvpToEvent and cancelRsvp", async () => {
      mocks.createEventRsvp.mockResolvedValueOnce({
        id: "event-101_test-user-alice",
        eventId: "event-101",
        campusId: APEX_CAMPUS_ID,
        userId: "test-user-alice",
        createdAt: new Date(),
      });
      mocks.deleteEventRsvp.mockResolvedValueOnce();

      const { result } = renderHook(() => useEventRsvp("event-101"));

      expect(result.current.isMutating).toBe(false);

      let promise;
      act(() => {
        promise = result.current.rsvpToEvent();
      });

      expect(result.current.isMutating).toBe(true);

      await act(async () => {
        await promise;
      });

      expect(result.current.isMutating).toBe(false);
      expect(mocks.createEventRsvp).toHaveBeenCalledWith({
        eventId: "event-101",
        userId: "test-user-alice",
        campusId: APEX_CAMPUS_ID,
      });

      // Cancellation mutation
      let cancelPromise;
      act(() => {
        cancelPromise = result.current.cancelRsvp();
      });

      expect(result.current.isMutating).toBe(true);

      await act(async () => {
        await cancelPromise;
      });

      expect(result.current.isMutating).toBe(false);
      expect(mocks.deleteEventRsvp).toHaveBeenCalledWith(
        "event-101",
        "test-user-alice"
      );
    });

    it("CRITICAL: proves RSVP state is driven strictly by authoritative subscription data rather than optimistic local fabrication", async () => {
      let rsvpCallback;
      mocks.subscribeToMyEventRsvp.mockImplementation((_eId, _uId, cb) => {
        rsvpCallback = cb;
        return vi.fn();
      });

      mocks.createEventRsvp.mockResolvedValueOnce({
        id: "event-101_test-user-alice",
      });

      const { result } = renderHook(() => useEventRsvp("event-101"));

      // Initial state is not going
      act(() => {
        rsvpCallback(null);
      });
      expect(result.current.isGoing).toBe(false);
      expect(result.current.rsvp).toBeNull();

      // Perform rsvpToEvent
      await act(async () => {
        await result.current.rsvpToEvent();
      });

      // Crucial assertion: despite createEventRsvp resolving, local state MUST NOT have been optimistically set to going!
      expect(result.current.isGoing).toBe(false);
      expect(result.current.rsvp).toBeNull();

      // State only becomes going when the Firestore subscription authoritative snapshot arrives
      const authoritativeDoc = {
        id: "event-101_test-user-alice",
        eventId: "event-101",
        campusId: APEX_CAMPUS_ID,
        userId: "test-user-alice",
        createdAt: new Date(),
      };
      act(() => {
        rsvpCallback(authoritativeDoc);
      });

      expect(result.current.isGoing).toBe(true);
      expect(result.current.rsvp).toEqual(authoritativeDoc);
    });

    it("surfaces mutation errors and clears isMutating", async () => {
      mocks.createEventRsvp.mockRejectedValueOnce(
        new Error("Creation blocked by security rules: event has ended")
      );

      const { result } = renderHook(() => useEventRsvp("event-101"));

      await act(async () => {
        await expect(result.current.rsvpToEvent()).rejects.toThrow(
          "Creation blocked by security rules: event has ended"
        );
      });

      expect(result.current.isMutating).toBe(false);
      expect(result.current.error).toBe(
        "Creation blocked by security rules: event has ended"
      );
    });

    it("prevents duplicate concurrent mutations when rsvpToEvent is called while mutating", async () => {
      let resolveCreate;
      mocks.createEventRsvp.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreate = resolve;
          })
      );

      const { result } = renderHook(() => useEventRsvp("event-101"));

      let promise1;
      act(() => {
        promise1 = result.current.rsvpToEvent();
      });

      expect(result.current.isMutating).toBe(true);
      expect(mocks.createEventRsvp).toHaveBeenCalledTimes(1);

      // Concurrent second call while mutating
      let promise2;
      act(() => {
        promise2 = result.current.rsvpToEvent();
      });

      // Should be ignored: createEventRsvp still only called once
      expect(mocks.createEventRsvp).toHaveBeenCalledTimes(1);
      const res2 = await promise2;
      expect(res2).toBeUndefined();

      // Resolve the first mutation
      await act(async () => {
        resolveCreate({ id: "event-101_test-user-alice" });
        await promise1;
      });

      expect(result.current.isMutating).toBe(false);
    });

    it("prevents duplicate concurrent cancellations when cancelRsvp is called while mutating", async () => {
      let resolveDelete;
      mocks.deleteEventRsvp.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDelete = resolve;
          })
      );

      const { result } = renderHook(() => useEventRsvp("event-101"));

      let promise1;
      act(() => {
        promise1 = result.current.cancelRsvp();
      });

      expect(result.current.isMutating).toBe(true);
      expect(mocks.deleteEventRsvp).toHaveBeenCalledTimes(1);

      // Concurrent second call while mutating
      act(() => {
        result.current.cancelRsvp();
      });

      expect(mocks.deleteEventRsvp).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveDelete();
        await promise1;
      });

      expect(result.current.isMutating).toBe(false);
    });

    it("handles user identity change and user sign-out without stale data leakage", () => {
      let aliceCallback;
      let bobCallback;
      mocks.subscribeToMyEventRsvp
        .mockImplementationOnce((_eId, _uId, cb) => {
          aliceCallback = cb;
          return vi.fn();
        })
        .mockImplementationOnce((_eId, _uId, cb) => {
          bobCallback = cb;
          return vi.fn();
        });

      const { result, rerender } = renderHook(() => useEventRsvp("event-101"));

      act(() => {
        aliceCallback({
          id: "event-101_alice",
          eventId: "event-101",
          campusId: APEX_CAMPUS_ID,
          userId: "alice",
          createdAt: new Date(),
        });
      });

      expect(result.current.isGoing).toBe(true);
      expect(result.current.rsvp?.userId).toBe("alice");

      // Switch user to Bob
      mocks.useAuth.mockReturnValue({ user: { uid: "bob" } });
      rerender();

      // Synchronous render reset ensures Alice's data is immediately cleared
      expect(result.current.rsvp).toBeNull();
      expect(result.current.isGoing).toBe(false);

      act(() => {
        bobCallback({
          id: "event-101_bob",
          eventId: "event-101",
          campusId: APEX_CAMPUS_ID,
          userId: "bob",
          createdAt: new Date(),
        });
      });

      expect(result.current.isGoing).toBe(true);
      expect(result.current.rsvp?.userId).toBe("bob");

      // Sign out: user becomes null
      mocks.useAuth.mockReturnValue({ user: null });
      rerender();

      expect(result.current.rsvp).toBeNull();
      expect(result.current.isGoing).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    it("race condition: ignores late-arriving subscription callback after eventId changed or unmount", () => {
      let firstCallback;
      mocks.subscribeToMyEventRsvp.mockImplementationOnce((_eId, _uId, cb) => {
        firstCallback = cb;
        return vi.fn();
      });

      const { result, rerender, unmount } = renderHook(
        ({ eventId }) => useEventRsvp(eventId),
        { initialProps: { eventId: "event-first" } }
      );

      // Change eventId to event-second
      rerender({ eventId: "event-second" });

      // Late callback arrives from event-first subscription
      act(() => {
        firstCallback({
          id: "event-first_alice",
          eventId: "event-first",
          campusId: APEX_CAMPUS_ID,
          userId: "alice",
          createdAt: new Date(),
        });
      });

      // Crucial: event-second must NOT have accepted event-first's data
      expect(result.current.rsvp).toBeNull();
      expect(result.current.isGoing).toBe(false);

      unmount();
    });

    it("cleans up listener on unmount and when eventId changes without stale listeners", () => {
      const unsubFirst = vi.fn();
      const unsubSecond = vi.fn();
      mocks.subscribeToMyEventRsvp
        .mockReturnValueOnce(unsubFirst)
        .mockReturnValueOnce(unsubSecond);

      const { rerender, unmount } = renderHook(
        ({ eventId }) => useEventRsvp(eventId),
        {
          initialProps: { eventId: "event-first" },
        }
      );

      expect(mocks.subscribeToMyEventRsvp).toHaveBeenCalledWith(
        "event-first",
        "test-user-alice",
        expect.any(Function),
        expect.any(Function)
      );

      rerender({ eventId: "event-second" });

      expect(unsubFirst).toHaveBeenCalledTimes(1);
      expect(mocks.subscribeToMyEventRsvp).toHaveBeenCalledWith(
        "event-second",
        "test-user-alice",
        expect.any(Function),
        expect.any(Function)
      );

      unmount();
      expect(unsubSecond).toHaveBeenCalledTimes(1);
    });

    it("propagates event and coordinator to createEventRsvp (via rsvpToEvent and confirmRsvp) and deleteEventRsvp", async () => {
      const cappedEvent = { id: "event-capped-99", title: "Capped Event", capacity: 10 };
      const initialCoordinator = {
        id: "event-capped-99",
        capacity: 10,
        confirmedCount: 4,
        offeredCount: 0,
        waitlistCount: 0,
      };
      const updatedCoordinator = {
        ...initialCoordinator,
        confirmedCount: 5,
      };

      mocks.createEventRsvp.mockResolvedValue({ id: "event-capped-99_test-user-alice" });
      mocks.deleteEventRsvp.mockResolvedValue();

      const { result, rerender } = renderHook(
        ({ eventId, event, coordinator }) => useEventRsvp(eventId, event, coordinator),
        {
          initialProps: {
            eventId: "event-capped-99",
            event: cappedEvent,
            coordinator: initialCoordinator,
          },
        }
      );

      await act(async () => {
        await result.current.confirmRsvp();
      });

      expect(mocks.createEventRsvp).toHaveBeenCalledWith({
        eventId: "event-capped-99",
        userId: "test-user-alice",
        campusId: APEX_CAMPUS_ID,
        event: cappedEvent,
        coordinator: initialCoordinator,
      });

      // Rerender with updated coordinator and verify synchronous ref update
      rerender({
        eventId: "event-capped-99",
        event: cappedEvent,
        coordinator: updatedCoordinator,
      });

      await act(async () => {
        await result.current.rsvpToEvent();
      });

      expect(mocks.createEventRsvp).toHaveBeenLastCalledWith({
        eventId: "event-capped-99",
        userId: "test-user-alice",
        campusId: APEX_CAMPUS_ID,
        event: cappedEvent,
        coordinator: updatedCoordinator,
      });

      await act(async () => {
        await result.current.cancelRsvp();
      });

      expect(mocks.deleteEventRsvp).toHaveBeenCalledWith(
        "event-capped-99",
        "test-user-alice",
        {
          event: cappedEvent,
          coordinator: updatedCoordinator,
        }
      );
    });
  });

  describe("useEventAttendees Hook", () => {
    it("does not issue query or subscription when enabled === false", () => {
      const { result } = renderHook(() =>
        useEventAttendees("event-101", { enabled: false })
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.attendees).toEqual([]);
      expect(result.current.count).toBe(0);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.error).toBeNull();

      expect(mocks.subscribeToEventAttendees).not.toHaveBeenCalled();
    });

    it("transitions from loading to data with bounded attendee shape", () => {
      let callback;
      mocks.subscribeToEventAttendees.mockImplementation(
        (_eId, _cId, cb) => {
          callback = cb;
          return vi.fn();
        }
      );

      const { result } = renderHook(() => useEventAttendees("event-101"));

      expect(result.current.isLoading).toBe(true);
      expect(mocks.subscribeToEventAttendees).toHaveBeenCalledWith(
        "event-101",
        APEX_CAMPUS_ID,
        expect.any(Function),
        expect.any(Function),
        { limit: 51 }
      );

      const sampleAttendees = [
        { id: "e101_u1", userId: "u1" },
        { id: "e101_u2", userId: "u2" },
      ];

      act(() => {
        callback({
          attendees: sampleAttendees,
          count: 2,
          hasMore: false,
        });
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.attendees).toEqual(sampleAttendees);
      expect(result.current.count).toBe(2);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("preserves bounded attendee shape with hasMore === true at the 50+ cap", () => {
      let callback;
      mocks.subscribeToEventAttendees.mockImplementation((_eId, _cId, cb) => {
        callback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useEventAttendees("event-101"));

      const sample50 = Array.from({ length: 50 }, (_, i) => ({
        id: `e101_u${i}`,
        userId: `u${i}`,
      }));

      act(() => {
        callback({
          attendees: sample50,
          count: 50,
          hasMore: true,
        });
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.attendees).toHaveLength(50);
      expect(result.current.count).toBe(50);
      expect(result.current.hasMore).toBe(true);
    });

    it("surfaces attendee query errors", () => {
      let errorCallback;
      mocks.subscribeToEventAttendees.mockImplementation(
        (_eId, _cId, _cb, errCb) => {
          errorCallback = errCb;
          return vi.fn();
        }
      );

      const { result } = renderHook(() => useEventAttendees("event-101"));

      act(() => {
        errorCallback(new Error("Cross-campus query denied"));
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.attendees).toEqual([]);
      expect(result.current.count).toBe(0);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.error).toBe("Cross-campus query denied");
    });

    it("cleans up subscription on unmount and when enabled flips to false", () => {
      const unsub = vi.fn();
      mocks.subscribeToEventAttendees.mockReturnValueOnce(unsub);

      const { rerender, unmount } = renderHook(
        ({ enabled }) => useEventAttendees("event-101", { enabled }),
        { initialProps: { enabled: true } }
      );

      expect(mocks.subscribeToEventAttendees).toHaveBeenCalledTimes(1);

      rerender({ enabled: false });
      expect(unsub).toHaveBeenCalledTimes(1);

      unmount();
      expect(unsub).toHaveBeenCalledTimes(1); // Not called twice
    });

    it("race condition: ignores late-arriving attendee callback after eventId changed", () => {
      let firstCallback;
      mocks.subscribeToEventAttendees.mockImplementationOnce(
        (_eId, _cId, cb) => {
          firstCallback = cb;
          return vi.fn();
        }
      );

      const { result, rerender, unmount } = renderHook(
        ({ eventId }) => useEventAttendees(eventId),
        { initialProps: { eventId: "event-first" } }
      );

      rerender({ eventId: "event-second" });

      act(() => {
        firstCallback({
          attendees: [{ id: "first_u1", userId: "u1" }],
          count: 1,
          hasMore: false,
        });
      });

      expect(result.current.attendees).toEqual([]);
      expect(result.current.count).toBe(0);

      unmount();
    });
  });

  describe("useMyRsvps Hook", () => {
    it("subscribes to Q2 and correctly derives eventIds as a Set", () => {
      let callback;
      mocks.subscribeToMyRsvps.mockImplementation((_uId, _cId, cb) => {
        callback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useMyRsvps());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.rsvps).toEqual([]);
      expect(result.current.eventIds).toBeInstanceOf(Set);
      expect(result.current.eventIds.size).toBe(0);

      expect(mocks.subscribeToMyRsvps).toHaveBeenCalledWith(
        "test-user-alice",
        APEX_CAMPUS_ID,
        expect.any(Function),
        expect.any(Function),
        { limit: 50 }
      );

      const sampleRsvps = [
        { id: "e1_alice", eventId: "event-ai", userId: "test-user-alice" },
        { id: "e2_alice", eventId: "event-design", userId: "test-user-alice" },
        { id: "e3_alice", eventId: "event-ai", userId: "test-user-alice" }, // duplicate eventId to test Set uniqueness
      ];

      act(() => {
        callback(sampleRsvps);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.rsvps).toEqual(sampleRsvps);
      expect(result.current.eventIds).toBeInstanceOf(Set);
      expect(result.current.eventIds.size).toBe(2);
      expect(result.current.eventIds.has("event-ai")).toBe(true);
      expect(result.current.eventIds.has("event-design")).toBe(true);
      expect(result.current.eventIds.has("non-existent-event")).toBe(false);
    });

    it("handles missing auth user or campus safely without issuing query", () => {
      mocks.useAuth.mockReturnValue({ user: null });

      const { result } = renderHook(() => useMyRsvps());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.rsvps).toEqual([]);
      expect(result.current.eventIds.size).toBe(0);
      expect(mocks.subscribeToMyRsvps).not.toHaveBeenCalled();

      mocks.useAuth.mockReturnValue({ user: { uid: "test-user-alice" } });
      mocks.useOptionalCampus.mockReturnValue(null);
      const { result: resultNoCampus } = renderHook(() => useMyRsvps());
      expect(resultNoCampus.current.isLoading).toBe(false);
      expect(resultNoCampus.current.rsvps).toEqual([]);
      expect(mocks.subscribeToMyRsvps).not.toHaveBeenCalled();
    });

    it("surfaces Q2 query errors", () => {
      let errorCallback;
      mocks.subscribeToMyRsvps.mockImplementation(
        (_uId, _cId, _cb, errCb) => {
          errorCallback = errCb;
          return vi.fn();
        }
      );

      const { result } = renderHook(() => useMyRsvps());

      act(() => {
        errorCallback(new Error("Failed to load user RSVPs"));
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.rsvps).toEqual([]);
      expect(result.current.eventIds.size).toBe(0);
      expect(result.current.error).toBe("Failed to load user RSVPs");
    });

    it("cleans up listener on unmount and when campus changes without duplicate listeners", () => {
      const unsubFirst = vi.fn();
      const unsubSecond = vi.fn();
      mocks.subscribeToMyRsvps
        .mockReturnValueOnce(unsubFirst)
        .mockReturnValueOnce(unsubSecond);

      const { rerender, unmount } = renderHook(
        ({ campusId }) => useMyRsvps({ campusId }),
        { initialProps: { campusId: APEX_CAMPUS_ID } }
      );

      expect(mocks.subscribeToMyRsvps).toHaveBeenCalledWith(
        "test-user-alice",
        APEX_CAMPUS_ID,
        expect.any(Function),
        expect.any(Function),
        { limit: 50 }
      );

      rerender({ campusId: ST_JUDE_CAMPUS_ID });

      expect(unsubFirst).toHaveBeenCalledTimes(1);
      expect(mocks.subscribeToMyRsvps).toHaveBeenCalledWith(
        "test-user-alice",
        ST_JUDE_CAMPUS_ID,
        expect.any(Function),
        expect.any(Function),
        { limit: 50 }
      );

      unmount();
      expect(unsubSecond).toHaveBeenCalledTimes(1);
    });

    it("handles user identity change and user sign-out without stale eventIds leakage", () => {
      let aliceCallback;
      let bobCallback;
      mocks.subscribeToMyRsvps
        .mockImplementationOnce((_uId, _cId, cb) => {
          aliceCallback = cb;
          return vi.fn();
        })
        .mockImplementationOnce((_uId, _cId, cb) => {
          bobCallback = cb;
          return vi.fn();
        });

      const { result, rerender } = renderHook(() => useMyRsvps());

      act(() => {
        aliceCallback([
          { id: "e1_alice", eventId: "event-alice-hackathon", userId: "alice" },
        ]);
      });

      expect(result.current.rsvps).toHaveLength(1);
      expect(result.current.eventIds.has("event-alice-hackathon")).toBe(true);

      // Switch to Bob
      mocks.useAuth.mockReturnValue({ user: { uid: "bob" } });
      rerender();

      expect(result.current.rsvps).toEqual([]);
      expect(result.current.eventIds.size).toBe(0);

      act(() => {
        bobCallback([
          { id: "e2_bob", eventId: "event-bob-workshop", userId: "bob" },
        ]);
      });

      expect(result.current.rsvps).toHaveLength(1);
      expect(result.current.eventIds.has("event-bob-workshop")).toBe(true);
      expect(result.current.eventIds.has("event-alice-hackathon")).toBe(false);

      // User signs out
      mocks.useAuth.mockReturnValue({ user: null });
      rerender();

      expect(result.current.rsvps).toEqual([]);
      expect(result.current.eventIds.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });

    it("race condition: ignores late-arriving Q2 callback after campus changed", () => {
      let firstCallback;
      mocks.subscribeToMyRsvps.mockImplementationOnce((_uId, _cId, cb) => {
        firstCallback = cb;
        return vi.fn();
      });

      const { result, rerender, unmount } = renderHook(
        ({ campusId }) => useMyRsvps({ campusId }),
        { initialProps: { campusId: APEX_CAMPUS_ID } }
      );

      rerender({ campusId: ST_JUDE_CAMPUS_ID });

      act(() => {
        firstCallback([
          { id: "e1_alice", eventId: "event-stale", userId: "alice" },
        ]);
      });

      expect(result.current.rsvps).toEqual([]);
      expect(result.current.eventIds.size).toBe(0);

      unmount();
    });

    it("refetch resets error state, sets isLoading, and re-triggers subscription", () => {
      let errorCallback;
      let secondCallback;
      mocks.subscribeToMyRsvps
        .mockImplementationOnce((_uId, _cId, _cb, errCb) => {
          errorCallback = errCb;
          return vi.fn();
        })
        .mockImplementationOnce((_uId, _cId, cb) => {
          secondCallback = cb;
          return vi.fn();
        });

      const { result } = renderHook(() => useMyRsvps());

      act(() => {
        errorCallback(new Error("Connection interrupted"));
      });

      expect(result.current.error).toBe("Connection interrupted");
      expect(result.current.isLoading).toBe(false);
      expect(typeof result.current.refetch).toBe("function");

      act(() => {
        result.current.refetch();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(true);

      act(() => {
        secondCallback([
          { id: "e1_refetch", eventId: "event-refetch", userId: "test-user-alice" },
        ]);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.rsvps).toHaveLength(1);
      expect(result.current.eventIds.has("event-refetch")).toBe(true);
    });

    it("identity/context switch: immediately stops exposing User A data to User B before User B snapshot arrives, and drops late User A callbacks", () => {
      let userACallback;
      let userBCallback;

      mocks.subscribeToMyRsvps
        .mockImplementationOnce((uId, cId, cb) => {
          userACallback = cb;
          return vi.fn();
        })
        .mockImplementationOnce((uId, cId, cb) => {
          userBCallback = cb;
          return vi.fn();
        });

      // 1. Start with User A and Campus A; deliver an RSVP snapshot containing an event ID.
      mocks.useAuth.mockReturnValue({
        user: { uid: "user-a", email: "user.a@apex.edu" },
        loading: false,
      });
      mocks.useOptionalCampus.mockReturnValue({
        campusId: APEX_CAMPUS_ID,
        loading: false,
      });

      const { result, rerender } = renderHook(() => useMyRsvps());

      act(() => {
        userACallback([
          { id: "e1_user-a", eventId: "event-user-a-only", userId: "user-a" },
        ]);
      });

      expect(result.current.rsvps).toHaveLength(1);
      expect(result.current.eventIds.has("event-user-a-only")).toBe(true);

      // 2. Switch the hook to User B and Campus B.
      mocks.useAuth.mockReturnValue({
        user: { uid: "user-b", email: "user.b@stjude.edu" },
        loading: false,
      });
      mocks.useOptionalCampus.mockReturnValue({
        campusId: ST_JUDE_CAMPUS_ID,
        loading: false,
      });

      rerender();

      // 3. Before delivering User B's first subscription snapshot, assert that User A's RSVP records and event IDs are no longer exposed to User B.
      expect(result.current.rsvps).toEqual([]);
      expect(result.current.eventIds.size).toBe(0);
      expect(result.current.eventIds.has("event-user-a-only")).toBe(false);
      expect(result.current.isLoading).toBe(true);

      // 4. Deliver User B's snapshot and verify only User B's records are exposed.
      act(() => {
        userBCallback([
          { id: "e2_user-b", eventId: "event-user-b-only", userId: "user-b" },
        ]);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.rsvps).toHaveLength(1);
      expect(result.current.eventIds.has("event-user-b-only")).toBe(true);
      expect(result.current.eventIds.has("event-user-a-only")).toBe(false);

      // 5. Complete a late callback from User A and verify it cannot restore User A's data.
      act(() => {
        userACallback([
          { id: "e1_user-a-late", eventId: "event-user-a-late", userId: "user-a" },
        ]);
      });

      expect(result.current.rsvps).toHaveLength(1);
      expect(result.current.eventIds.has("event-user-b-only")).toBe(true);
      expect(result.current.eventIds.has("event-user-a-late")).toBe(false);
      expect(result.current.eventIds.has("event-user-a-only")).toBe(false);
    });
  });
});
