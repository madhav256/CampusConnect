import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "./hookTestUtils.js";
import { APEX_CAMPUS_ID, ST_JUDE_CAMPUS_ID, EVENT_CATEGORIES } from "../../src/constants.js";
import { COMMUNITY_APEX_AI } from "../../src/data/communities.js";

const mocks = vi.hoisted(() => ({
  useOptionalCampus: vi.fn(),
  getEventsByCampus: vi.fn(),
  subscribeToCampusEvents: vi.fn(),
  getEventsByCommunity: vi.fn(),
  subscribeToCommunityEvents: vi.fn(),
  getEventById: vi.fn(),
  subscribeToEvent: vi.fn(),
}));

vi.mock("../../src/hooks/useCampus.js", () => ({
  useCampus: () => ({ campusId: APEX_CAMPUS_ID }),
  useOptionalCampus: () => mocks.useOptionalCampus(),
}));

vi.mock("../../src/services/eventService.js", () => ({
  getEventsByCampus: mocks.getEventsByCampus,
  subscribeToCampusEvents: mocks.subscribeToCampusEvents,
  getEventsByCommunity: mocks.getEventsByCommunity,
  subscribeToCommunityEvents: mocks.subscribeToCommunityEvents,
  getEventById: mocks.getEventById,
  subscribeToEvent: mocks.subscribeToEvent,
}));

import { useEvents } from "../../src/hooks/useEvents.js";
import { useEvent } from "../../src/hooks/useEvent.js";

describe("Milestone 20 — Unit 20.3: Event Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useOptionalCampus.mockReturnValue({
      campusId: APEX_CAMPUS_ID,
    });
    mocks.subscribeToCampusEvents.mockReturnValue(vi.fn());
    mocks.subscribeToCommunityEvents.mockReturnValue(vi.fn());
    mocks.subscribeToEvent.mockReturnValue(vi.fn());
  });

  describe("useEvents Hook", () => {
    it("subscribes to campus events by default using campus context", () => {
      let callback;
      mocks.subscribeToCampusEvents.mockImplementationOnce((_campusId, _opts, cb) => {
        callback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useEvents());
      expect(result.current.isLoading).toBe(true);
      expect(result.current.events).toEqual([]);
      expect(result.current.error).toBeNull();

      expect(mocks.subscribeToCampusEvents).toHaveBeenCalledWith(
        APEX_CAMPUS_ID,
        expect.any(Object),
        expect.any(Function),
        expect.any(Function)
      );

      const sampleEvents = [{ id: "e1", title: "Hackathon" }];
      act(() => {
        callback(sampleEvents);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.events).toEqual(sampleEvents);
      expect(result.current.error).toBeNull();
    });

    it("subscribes to community events as non-member by default (isMember: false)", () => {
      let callback;
      mocks.subscribeToCommunityEvents.mockImplementationOnce((_commId, _opts, cb) => {
        callback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() =>
        useEvents({ communityId: COMMUNITY_APEX_AI.id })
      );

      expect(mocks.subscribeToCommunityEvents).toHaveBeenCalledWith(
        COMMUNITY_APEX_AI.id,
        expect.objectContaining({
          communityId: COMMUNITY_APEX_AI.id,
          campusId: APEX_CAMPUS_ID,
          isMember: false,
        }),
        expect.any(Function),
        expect.any(Function)
      );

      act(() => {
        callback([{ id: "comm-event-public", title: "Public Meetup" }]);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.events).toEqual([
        { id: "comm-event-public", title: "Public Meetup" },
      ]);
    });

    it("subscribes to community events with active member access when isMember: true", () => {
      let callback;
      mocks.subscribeToCommunityEvents.mockImplementationOnce((_commId, _opts, cb) => {
        callback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() =>
        useEvents({ communityId: COMMUNITY_APEX_AI.id, isMember: true })
      );

      expect(mocks.subscribeToCommunityEvents).toHaveBeenCalledWith(
        COMMUNITY_APEX_AI.id,
        expect.objectContaining({
          communityId: COMMUNITY_APEX_AI.id,
          campusId: APEX_CAMPUS_ID,
          isMember: true,
        }),
        expect.any(Function),
        expect.any(Function)
      );

      act(() => {
        callback([
          { id: "comm-event-public", title: "Public Meetup" },
          { id: "comm-event-private", title: "Internal Workshop" },
        ]);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.events).toHaveLength(2);
    });

    it("re-subscribes when isMember flips from false to true", () => {
      const unsubFirst = vi.fn();
      const unsubSecond = vi.fn();
      mocks.subscribeToCommunityEvents
        .mockReturnValueOnce(unsubFirst)
        .mockReturnValueOnce(unsubSecond);

      const { rerender } = renderHook(
        (props) => useEvents(props),
        { initialProps: { communityId: COMMUNITY_APEX_AI.id, isMember: false } }
      );

      expect(mocks.subscribeToCommunityEvents).toHaveBeenCalledWith(
        COMMUNITY_APEX_AI.id,
        expect.objectContaining({ isMember: false }),
        expect.any(Function),
        expect.any(Function)
      );

      rerender({ communityId: COMMUNITY_APEX_AI.id, isMember: true });

      expect(unsubFirst).toHaveBeenCalledTimes(1);
      expect(mocks.subscribeToCommunityEvents).toHaveBeenLastCalledWith(
        COMMUNITY_APEX_AI.id,
        expect.objectContaining({ isMember: true }),
        expect.any(Function),
        expect.any(Function)
      );
    });

    it("initializes with isLoading = false when neither campus nor community is available", () => {
      mocks.useOptionalCampus.mockReturnValue(null);

      const { result } = renderHook(() => useEvents());
      expect(result.current.isLoading).toBe(false);
      expect(result.current.events).toEqual([]);
      expect(mocks.subscribeToCampusEvents).not.toHaveBeenCalled();
      expect(mocks.subscribeToCommunityEvents).not.toHaveBeenCalled();
    });

    it("handles subscription error properly and exposes error state", () => {
      let errHandler;
      mocks.subscribeToCampusEvents.mockImplementationOnce((_cId, _opts, _cb, onErr) => {
        errHandler = onErr;
        return vi.fn();
      });

      const { result } = renderHook(() => useEvents());

      act(() => {
        errHandler(new Error("Network failed"));
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe("Network failed");
    });

    it("cleans up active subscription on unmount", () => {
      const unsub = vi.fn();
      mocks.subscribeToCampusEvents.mockReturnValueOnce(unsub);

      const { unmount } = renderHook(() => useEvents());
      unmount();

      expect(unsub).toHaveBeenCalledTimes(1);
    });

    it("re-subscribes when query filters (e.g. category) change", () => {
      const unsubFirst = vi.fn();
      const unsubSecond = vi.fn();
      mocks.subscribeToCampusEvents
        .mockReturnValueOnce(unsubFirst)
        .mockReturnValueOnce(unsubSecond);

      const { rerender } = renderHook(
        (props) => useEvents(props),
        { initialProps: { category: EVENT_CATEGORIES.TECH } }
      );

      expect(mocks.subscribeToCampusEvents).toHaveBeenCalledTimes(1);
      expect(mocks.subscribeToCampusEvents).toHaveBeenCalledWith(
        APEX_CAMPUS_ID,
        expect.objectContaining({ category: EVENT_CATEGORIES.TECH }),
        expect.any(Function),
        expect.any(Function)
      );

      rerender({ category: EVENT_CATEGORIES.CULTURAL });

      expect(unsubFirst).toHaveBeenCalledTimes(1);
      expect(mocks.subscribeToCampusEvents).toHaveBeenCalledTimes(2);
      expect(mocks.subscribeToCampusEvents).toHaveBeenLastCalledWith(
        APEX_CAMPUS_ID,
        expect.objectContaining({ category: EVENT_CATEGORIES.CULTURAL }),
        expect.any(Function),
        expect.any(Function)
      );
    });

    it("re-subscribes when campus changes", () => {
      const unsubFirst = vi.fn();
      const unsubSecond = vi.fn();
      mocks.subscribeToCampusEvents
        .mockReturnValueOnce(unsubFirst)
        .mockReturnValueOnce(unsubSecond);

      const { rerender } = renderHook(
        (props) => useEvents(props),
        { initialProps: { campusId: APEX_CAMPUS_ID } }
      );

      expect(mocks.subscribeToCampusEvents).toHaveBeenCalledWith(
        APEX_CAMPUS_ID,
        expect.anything(),
        expect.anything(),
        expect.anything()
      );

      rerender({ campusId: ST_JUDE_CAMPUS_ID });

      expect(unsubFirst).toHaveBeenCalled();
      expect(mocks.subscribeToCampusEvents).toHaveBeenLastCalledWith(
        ST_JUDE_CAMPUS_ID,
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it("provides manual refetch capability for campus events", async () => {
      mocks.getEventsByCampus.mockResolvedValueOnce([{ id: "refetched-1", title: "Showcase" }]);

      const { result } = renderHook(() => useEvents());

      await act(async () => {
        await result.current.refetch();
      });

      expect(mocks.getEventsByCampus).toHaveBeenCalledWith(
        APEX_CAMPUS_ID,
        expect.anything()
      );
      expect(result.current.events).toEqual([{ id: "refetched-1", title: "Showcase" }]);
    });

    it("provides manual refetch capability for community events", async () => {
      mocks.getEventsByCommunity.mockResolvedValueOnce([{ id: "comm-refetch", title: "AI Workshop" }]);

      const { result } = renderHook(() => useEvents({ communityId: COMMUNITY_APEX_AI.id }));

      await act(async () => {
        await result.current.refetch();
      });

      expect(mocks.getEventsByCommunity).toHaveBeenCalledWith(
        COMMUNITY_APEX_AI.id,
        expect.objectContaining({
          campusId: APEX_CAMPUS_ID,
        })
      );
      expect(result.current.events).toEqual([{ id: "comm-refetch", title: "AI Workshop" }]);
    });

    it("passes current campusId into community service and subscription calls", async () => {
      mocks.getEventsByCommunity.mockResolvedValueOnce([]);
      const { result } = renderHook(() =>
        useEvents({ communityId: COMMUNITY_APEX_AI.id })
      );

      expect(mocks.subscribeToCommunityEvents).toHaveBeenCalledWith(
        COMMUNITY_APEX_AI.id,
        expect.objectContaining({
          campusId: APEX_CAMPUS_ID,
          communityId: COMMUNITY_APEX_AI.id,
        }),
        expect.any(Function),
        expect.any(Function)
      );

      await act(async () => {
        await result.current.refetch();
      });

      expect(mocks.getEventsByCommunity).toHaveBeenCalledWith(
        COMMUNITY_APEX_AI.id,
        expect.objectContaining({
          campusId: APEX_CAMPUS_ID,
        })
      );
    });

    it("does not issue community collection query or subscription when campus context is missing", async () => {
      mocks.useOptionalCampus.mockReturnValue(null);

      const { result } = renderHook(() =>
        useEvents({ communityId: COMMUNITY_APEX_AI.id })
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.events).toEqual([]);
      expect(mocks.subscribeToCommunityEvents).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.refetch();
      });

      expect(mocks.getEventsByCommunity).not.toHaveBeenCalled();
      expect(result.current.events).toEqual([]);
    });
  });

  describe("useEvent Hook", () => {
    it("subscribes to a single event and updates state upon emission", () => {
      let callback;
      mocks.subscribeToEvent.mockImplementationOnce((_id, cb) => {
        callback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useEvent("event-hackathon"));
      expect(result.current.isLoading).toBe(true);
      expect(result.current.event).toBeNull();

      expect(mocks.subscribeToEvent).toHaveBeenCalledWith(
        "event-hackathon",
        expect.any(Function),
        expect.any(Function)
      );

      const eventData = { id: "event-hackathon", title: "Annual Hackathon" };
      act(() => {
        callback(eventData);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.event).toEqual(eventData);
      expect(result.current.error).toBeNull();
    });

    it("handles not-found event when snapshot returns null", () => {
      let callback;
      mocks.subscribeToEvent.mockImplementationOnce((_id, cb) => {
        callback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useEvent("nonexistent-event"));

      act(() => {
        callback(null);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.event).toBeNull();
    });

    it("handles error during single event subscription", () => {
      let errHandler;
      mocks.subscribeToEvent.mockImplementationOnce((_id, _cb, onErr) => {
        errHandler = onErr;
        return vi.fn();
      });

      const { result } = renderHook(() => useEvent("event-error"));

      act(() => {
        errHandler(new Error("Document access denied"));
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe("Document access denied");
    });

    it("handles null or missing eventId by resetting to non-loading null state", () => {
      const { result } = renderHook(() => useEvent(null));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.event).toBeNull();
      expect(mocks.subscribeToEvent).not.toHaveBeenCalled();
    });

    it("cleans up previous subscription when eventId changes or on unmount", () => {
      const unsubFirst = vi.fn();
      const unsubSecond = vi.fn();
      mocks.subscribeToEvent
        .mockReturnValueOnce(unsubFirst)
        .mockReturnValueOnce(unsubSecond);

      const { rerender, unmount } = renderHook(
        (props) => useEvent(props.id),
        { initialProps: { id: "event-1" } }
      );

      expect(mocks.subscribeToEvent).toHaveBeenCalledWith(
        "event-1",
        expect.any(Function),
        expect.any(Function)
      );

      rerender({ id: "event-2" });

      expect(unsubFirst).toHaveBeenCalledTimes(1);
      expect(mocks.subscribeToEvent).toHaveBeenLastCalledWith(
        "event-2",
        expect.any(Function),
        expect.any(Function)
      );

      unmount();
      expect(unsubSecond).toHaveBeenCalledTimes(1);
    });

    it("supports manual refetch for individual event", async () => {
      mocks.getEventById.mockResolvedValueOnce({ id: "event-refetch", title: "Design Sprint" });

      const { result } = renderHook(() => useEvent("event-refetch"));

      await act(async () => {
        await result.current.refetch();
      });

      expect(mocks.getEventById).toHaveBeenCalledWith("event-refetch");
      expect(result.current.event).toEqual({ id: "event-refetch", title: "Design Sprint" });
    });
  });
});
