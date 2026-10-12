/**
 * Milestone 21 — Unit 21.5: Participation Discovery Surfaces
 *
 * Comprehensive unit and UI test suite covering:
 * 1. Going tab on /events (selection, switching, loading, empty, error, successful resolutions)
 * 2. Event card Going badge (rendering, hiding, presence from useMyRsvps().eventIds)
 * 3. Community detail Events tab (badge inheritance, zero extra controls)
 * 4. Inaccessible event state (No longer available, Remove RSVP action)
 * 5. Retryable resolution error (Unable to Load, Retry action)
 * 6. Deterministic RSVP fixture matching across seeded E2E users
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
} from "../../src/constants.js";
import { CAMPUS_A } from "../../src/data/campuses.js";
import {
  EVENT_AI_HACKATHON,
  EVENT_DESIGN_SPRINT,
  EVENT_CAMPUS_FEST,
} from "../../src/data/events.js";
import {
  EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF,
  EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B_DEF,
  EVENT_RSVP_DESIGN_SPRINT_STUDENT_A_DEF,
  EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE_DEF,
} from "../../src/data/eventRsvps.js";
import { renderHook, act } from "./hookTestUtils";

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  useEvents: vi.fn(),
  useMyRsvps: vi.fn(),
  resolveEvent: vi.fn(),
  deleteEventRsvp: vi.fn(),
  useEligibleCommunities: vi.fn(() => ({
    eligibleCommunities: [],
    hasEligibleCommunities: false,
  })),
  useCommunity: vi.fn(),
  useCommunityMembers: vi.fn(),
}));

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("../../src/hooks/useCampus", () => ({
  useOptionalCampus: () => mocks.useOptionalCampus(),
  useCampus: () => {
    const val = mocks.useOptionalCampus();
    if (!val) throw new Error("useCampus must be used within a CampusProvider.");
    return val;
  },
}));

vi.mock("../../src/hooks/useEvents", () => ({
  useEvents: (...args) => mocks.useEvents(...args),
}));

vi.mock("../../src/hooks/useMyRsvps", () => ({
  useMyRsvps: (...args) => mocks.useMyRsvps(...args),
}));

vi.mock("../../src/services/eventService", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveEvent: (...args) => mocks.resolveEvent(...args),
  };
});

vi.mock("../../src/services/eventRsvpService", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    deleteEventRsvp: (...args) => mocks.deleteEventRsvp(...args),
  };
});

vi.mock("../../src/hooks/useEligibleCommunities", () => ({
  useEligibleCommunities: (...args) => mocks.useEligibleCommunities(...args),
}));

vi.mock("../../src/hooks/useCommunity", () => ({
  useCommunity: (...args) => mocks.useCommunity(...args),
}));

vi.mock("../../src/hooks/useCommunityMembers", () => ({
  useCommunityMembers: (...args) => mocks.useCommunityMembers(...args),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ communityId: "apex-ai-club" }),
  Link: ({ to, children, ...props }) =>
    React.createElement("a", { href: to, to, ...props }, children),
  NavLink: ({ to, children, ...props }) =>
    React.createElement("a", { href: to, to, ...props }, children),
}));

// React element tree search helpers
function findInReactTree(element, predicate) {
  if (!element) return null;
  if (Array.isArray(element)) {
    for (const item of element) {
      const found = findInReactTree(item, predicate);
      if (found) return found;
    }
    return null;
  }
  if (typeof element !== "object") return null;
  if (predicate(element)) return element;
  const children = element.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findInReactTree(child, predicate);
      if (found) return found;
    }
  } else if (children && typeof children === "object") {
    return findInReactTree(children, predicate);
  }
  return null;
}

function findByTestId(tree, testId) {
  return findInReactTree(tree, (el) => el.props?.["data-testid"] === testId);
}

function renderComponent(Component, props = {}) {
  const { result } = renderHook(() => Component(props));
  return result.current;
}

// Components under test
import EventFilterBar from "../../src/components/events/EventFilterBar";
import EventCard from "../../src/components/events/EventCard";
import RsvpStatusBadge from "../../src/components/events/RsvpStatusBadge";
import EventGrid, {
  InaccessibleEventCard,
  ResolutionErrorCard,
} from "../../src/components/events/EventGrid";
import Events from "../../src/pages/Events";
import CommunityDetail from "../../src/pages/CommunityDetail";

describe("Milestone 21 — Unit 21.5: Participation Discovery Surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { uid: "e2e-student-a", email: "student-a@apex.edu" },
      loading: false,
    });
    mocks.useOptionalCampus.mockReturnValue({
      campus: CAMPUS_A,
      campusId: APEX_CAMPUS_ID,
      loading: false,
    });
    mocks.useEvents.mockReturnValue({
      events: [EVENT_AI_HACKATHON, EVENT_DESIGN_SPRINT],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useMyRsvps.mockReturnValue({
      rsvps: [],
      eventIds: new Set(),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  // =========================================================================
  // Surface 1: Going Tab Navigation & Filter Bar
  // =========================================================================
  describe("Surface 1 — Going Tab on EventFilterBar", () => {
    it("renders Going tab alongside Upcoming and Past Events tabs", () => {
      const onTimeRangeChange = vi.fn();
      const el = renderComponent(EventFilterBar, {
        timeRange: "upcoming",
        onTimeRangeChange,
      });

      const upcomingTab = findByTestId(el, "time-tab-upcoming");
      const pastTab = findByTestId(el, "time-tab-past");
      const goingTab = findByTestId(el, "time-tab-going");

      expect(upcomingTab).not.toBeNull();
      expect(pastTab).not.toBeNull();
      expect(goingTab).not.toBeNull();

      expect(upcomingTab.props["aria-selected"]).toBe(true);
      expect(pastTab.props["aria-selected"]).toBe(false);
      expect(goingTab.props["aria-selected"]).toBe(false);
    });

    it("marks Going tab as selected when timeRange is 'going'", () => {
      const el = renderComponent(EventFilterBar, {
        timeRange: "going",
      });

      const goingTab = findByTestId(el, "time-tab-going");
      expect(goingTab.props["aria-selected"]).toBe(true);

      const upcomingTab = findByTestId(el, "time-tab-upcoming");
      expect(upcomingTab.props["aria-selected"]).toBe(false);
    });

    it("triggers onTimeRangeChange('going') when Going tab is clicked", () => {
      const onTimeRangeChange = vi.fn();
      const el = renderComponent(EventFilterBar, {
        timeRange: "upcoming",
        onTimeRangeChange,
      });

      const goingTab = findByTestId(el, "time-tab-going");
      goingTab.props.onClick();
      expect(onTimeRangeChange).toHaveBeenCalledWith("going");
    });
  });

  // =========================================================================
  // Surface 2: EventCard Going Badge
  // =========================================================================
  describe("Surface 2 — EventCard Going Badge", () => {
    it("renders Going badge when isGoing is true", () => {
      const el = renderComponent(EventCard, {
        event: EVENT_AI_HACKATHON,
        isGoing: true,
      });

      const goingWrapper = findByTestId(el, "event-card-going-badge");
      expect(goingWrapper).not.toBeNull();

      const rsvpBadgeEl = findInReactTree(goingWrapper, (n) => n.type === RsvpStatusBadge);
      expect(rsvpBadgeEl).not.toBeNull();
      expect(rsvpBadgeEl.props.state).toBe("going");

      // Verify the rendered badge output directly
      const renderedBadge = renderComponent(RsvpStatusBadge, { state: "going" });
      expect(renderedBadge.props["data-testid"]).toBe("rsvp-status-badge");
      expect(renderedBadge.props.className).toContain("bg-emerald-50");
    });

    it("does not render Going badge when isGoing is false", () => {
      const el = renderComponent(EventCard, {
        event: EVENT_AI_HACKATHON,
        isGoing: false,
      });

      const goingBadge = findByTestId(el, "event-card-going-badge");
      expect(goingBadge).toBeNull();
    });

    it("does not render Going badge by default when isGoing is omitted", () => {
      const el = renderComponent(EventCard, {
        event: EVENT_AI_HACKATHON,
      });

      const goingBadge = findByTestId(el, "event-card-going-badge");
      expect(goingBadge).toBeNull();
    });
  });

  // =========================================================================
  // Surface 2 & 3: EventGrid List-Level RSVP Propagation
  // =========================================================================
  describe("EventGrid — Shared List-Level RSVP State", () => {
    it("derives isGoing=true for events present in rsvpEventIds Set", () => {
      const rsvpSet = new Set([EVENT_AI_HACKATHON.id]);
      const el = renderComponent(EventGrid, {
        events: [EVENT_AI_HACKATHON, EVENT_DESIGN_SPRINT],
        rsvpEventIds: rsvpSet,
      });

      const cardHackathon = findByTestId(el, `event-card-${EVENT_AI_HACKATHON.id}`);
      const cardDesign = findByTestId(el, `event-card-${EVENT_DESIGN_SPRINT.id}`);

      expect(cardHackathon.props.isGoing).toBe(true);
      expect(cardDesign.props.isGoing).toBe(false);
    });

    it("supports rsvpEventIds as Array gracefully", () => {
      const rsvpArray = [EVENT_DESIGN_SPRINT.id];
      const el = renderComponent(EventGrid, {
        events: [EVENT_AI_HACKATHON, EVENT_DESIGN_SPRINT],
        rsvpEventIds: rsvpArray,
      });

      const cardHackathon = findByTestId(el, `event-card-${EVENT_AI_HACKATHON.id}`);
      const cardDesign = findByTestId(el, `event-card-${EVENT_DESIGN_SPRINT.id}`);

      expect(cardHackathon.props.isGoing).toBe(false);
      expect(cardDesign.props.isGoing).toBe(true);
    });

    it("renders InaccessibleEventCard with Remove RSVP action", () => {
      const onRemove = vi.fn();
      const inaccessibleRsvp = {
        id: "deleted-event_user-1",
        eventId: "deleted-event",
        campusId: APEX_CAMPUS_ID,
        userId: "user-1",
      };

      const card = renderComponent(InaccessibleEventCard, {
        rsvp: inaccessibleRsvp,
        onRemove: () => onRemove("deleted-event"),
      });

      expect(card.props["data-testid"]).toBe("event-inaccessible-card-deleted-event");

      const inaccBadge = findByTestId(card, "rsvp-inaccessible-badge");
      expect(inaccBadge).not.toBeNull();

      const removeBtn = findByTestId(card, "remove-rsvp-btn-deleted-event");
      expect(removeBtn).not.toBeNull();
      expect(removeBtn.props.disabled).toBe(false);

      removeBtn.props.onClick();
      expect(onRemove).toHaveBeenCalledWith("deleted-event");
    });

    it("renders ResolutionErrorCard with Retry action", () => {
      const onRetry = vi.fn();
      const card = renderComponent(ResolutionErrorCard, {
        eventId: "network-error-event",
        error: new Error("Network timeout loading event"),
        onRetry: () => onRetry("network-error-event"),
      });

      expect(card.props["data-testid"]).toBe("event-error-card-network-error-event");

      const retryBtn = findByTestId(card, "retry-resolve-btn-network-error-event");
      expect(retryBtn).not.toBeNull();

      retryBtn.props.onClick();
      expect(onRetry).toHaveBeenCalledWith("network-error-event");
    });

    it("renders empty state when events, inaccessibleRsvps, and resolutionErrors are all empty", () => {
      const el = renderComponent(EventGrid, {
        events: [],
        inaccessibleRsvps: [],
        resolutionErrors: [],
        emptyTitle: "No RSVPs yet",
        emptyDescription: "You haven't RSVP'd to any events yet.",
      });

      const empty = findByTestId(el, "event-grid-empty");
      expect(empty).not.toBeNull();
      expect(empty.props.title).toBe("No RSVPs yet");
      expect(empty.props.description).toBe("You haven't RSVP'd to any events yet.");
    });

    it("renders attention section for problem cards even when hasActiveFilters is true", () => {
      const inaccessibleRsvp = {
        id: "deleted-event_user-1",
        eventId: "deleted-event",
        campusId: APEX_CAMPUS_ID,
        userId: "user-1",
      };
      const errorItem = {
        eventId: "error-event",
        error: new Error("Network error"),
      };

      const el = renderComponent(EventGrid, {
        events: [],
        inaccessibleRsvps: [inaccessibleRsvp],
        resolutionErrors: [errorItem],
        hasActiveFilters: true,
        emptyTitle: "No matching events found",
        emptyDescription: "Try adjusting filters",
      });

      const section = findByTestId(el, "event-grid-attention-section");
      expect(section).not.toBeNull();

      const inaccCard = findByTestId(section, "event-inaccessible-card-deleted-event");
      const errCard = findByTestId(section, "event-error-card-error-event");
      expect(inaccCard).not.toBeNull();
      expect(errCard).not.toBeNull();

      const empty = findByTestId(el, "event-grid-empty");
      expect(empty).not.toBeNull();
      expect(empty.props.title).toBe("No matching events found");
    });
  });

  // =========================================================================
  // Surface 1: Events Page Going Tab State & Resolution Flow
  // =========================================================================
  describe("Surface 1 — Events Page Going Tab End-to-End Integration", () => {
    it("renders empty state when current user has zero RSVPs (e.g. Student C)", () => {
      mocks.useMyRsvps.mockReturnValue({
        rsvps: [],
        eventIds: new Set(),
        isLoading: false,
        error: null,
      });

      const { result } = renderHook(() => Events());
      const filterBar = findInReactTree(result.current, (n) => n.type === EventFilterBar);
      expect(filterBar).not.toBeNull();

      act(() => {
        filterBar.props.onTimeRangeChange("going");
      });

      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.events).toHaveLength(0);
      expect(grid.props.emptyTitle).toBe("No events RSVP'd yet");
      expect(grid.props.emptyDescription).toContain("You haven't RSVP'd to any events yet");
    });

    it("renders skeleton loading state when RSVP query or initial resolution is loading", () => {
      mocks.useMyRsvps.mockReturnValue({
        rsvps: [{ eventId: "event-1", campusId: APEX_CAMPUS_ID, userId: "user-1" }],
        eventIds: new Set(["event-1"]),
        isLoading: true,
        error: null,
      });

      const { result } = renderHook(() => Events());
      const filterBar = findInReactTree(result.current, (n) => n.type === EventFilterBar);

      act(() => {
        filterBar.props.onTimeRangeChange("going");
      });

      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.isLoading).toBe(true);
    });

    it("surfaces error state when RSVP query fails and onRetry invokes refetchMyRsvps rather than general events refetch", () => {
      const mockRefetchMyRsvps = vi.fn();
      const mockGeneralEventsRefetch = vi.fn();

      mocks.useEvents.mockReturnValue({
        events: [],
        isLoading: false,
        error: null,
        refetch: mockGeneralEventsRefetch,
      });

      mocks.useMyRsvps.mockReturnValue({
        rsvps: [],
        eventIds: new Set(),
        isLoading: false,
        error: "Firestore permission denied for RSVP query",
        refetch: mockRefetchMyRsvps,
      });

      const { result } = renderHook(() => Events());
      const filterBar = findInReactTree(result.current, (n) => n.type === EventFilterBar);

      act(() => {
        filterBar.props.onTimeRangeChange("going");
      });

      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.error).toBe("Firestore permission denied for RSVP query");
      expect(grid.props.onRetry).toBe(mockRefetchMyRsvps);

      act(() => {
        grid.props.onRetry();
      });

      expect(mockRefetchMyRsvps).toHaveBeenCalledTimes(1);
      expect(mockGeneralEventsRefetch).not.toHaveBeenCalled();
    });

    it("resolves available event and passes to EventGrid with Going badge", async () => {
      mocks.useMyRsvps.mockReturnValue({
        rsvps: [{ eventId: EVENT_AI_HACKATHON.id, campusId: APEX_CAMPUS_ID, userId: "e2e-student-b" }],
        eventIds: new Set([EVENT_AI_HACKATHON.id]),
        isLoading: false,
        error: null,
      });

      mocks.resolveEvent.mockResolvedValue({
        status: "available",
        event: EVENT_AI_HACKATHON,
        error: null,
      });

      const { result } = renderHook(() => Events());
      const filterBar = findInReactTree(result.current, (n) => n.type === EventFilterBar);

      await act(async () => {
        filterBar.props.onTimeRangeChange("going");
      });

      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.events).toHaveLength(1);
      expect(grid.props.events[0].id).toBe(EVENT_AI_HACKATHON.id);
      expect(grid.props.rsvpEventIds.has(EVENT_AI_HACKATHON.id)).toBe(true);
    });

    it("resolves inaccessible event and provides Remove RSVP action", async () => {
      const inaccessibleRsvp = {
        id: "deleted-event_e2e-student-a",
        eventId: "deleted-event",
        campusId: APEX_CAMPUS_ID,
        userId: "e2e-student-a",
      };

      mocks.useMyRsvps.mockReturnValue({
        rsvps: [inaccessibleRsvp],
        eventIds: new Set(["deleted-event"]),
        isLoading: false,
        error: null,
      });

      mocks.resolveEvent.mockResolvedValue({
        status: "inaccessible",
        event: null,
        error: null,
      });

      mocks.deleteEventRsvp.mockResolvedValue();

      const { result } = renderHook(() => Events());
      const filterBar = findInReactTree(result.current, (n) => n.type === EventFilterBar);

      await act(async () => {
        filterBar.props.onTimeRangeChange("going");
      });

      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.inaccessibleRsvps).toHaveLength(1);
      expect(grid.props.inaccessibleRsvps[0].eventId).toBe("deleted-event");

      await act(async () => {
        await grid.props.onRemoveRsvp("deleted-event");
      });

      expect(mocks.deleteEventRsvp).toHaveBeenCalledWith("deleted-event", "e2e-student-a");
    });

    it("resolves retryable error and provides onRetryResolve action", async () => {
      const rsvp = {
        id: "flaky-event_e2e-student-a",
        eventId: "flaky-event",
        campusId: APEX_CAMPUS_ID,
        userId: "e2e-student-a",
      };

      mocks.useMyRsvps.mockReturnValue({
        rsvps: [rsvp],
        eventIds: new Set(["flaky-event"]),
        isLoading: false,
        error: null,
      });

      mocks.resolveEvent
        .mockResolvedValueOnce({
          status: "error",
          event: null,
          error: new Error("Temporary connection failure"),
        })
        .mockResolvedValueOnce({
          status: "available",
          event: EVENT_DESIGN_SPRINT,
          error: null,
        });

      const { result } = renderHook(() => Events());
      const filterBar = findInReactTree(result.current, (n) => n.type === EventFilterBar);

      await act(async () => {
        filterBar.props.onTimeRangeChange("going");
      });

      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.resolutionErrors).toHaveLength(1);
      expect(grid.props.resolutionErrors[0].eventId).toBe("flaky-event");

      // Invoke retry action
      await act(async () => {
        await grid.props.onRetryResolve("flaky-event");
      });

      expect(mocks.resolveEvent).toHaveBeenCalledTimes(2);
      expect(mocks.resolveEvent).toHaveBeenLastCalledWith("flaky-event");

      // Should now be resolved to available
      const updatedGrid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(updatedGrid.props.events).toHaveLength(1);
      expect(updatedGrid.props.events[0].id).toBe(EVENT_DESIGN_SPRINT.id);
    });

    it("keeps inaccessible RSVP and error cards reachable and actionable when category, community, and search filters are active", async () => {
      const inaccessibleRsvp = {
        id: "deleted-event_e2e-student-a",
        eventId: "deleted-event",
        campusId: APEX_CAMPUS_ID,
        userId: "e2e-student-a",
      };
      const errorRsvp = {
        id: "flaky-event_e2e-student-a",
        eventId: "flaky-event",
        campusId: APEX_CAMPUS_ID,
        userId: "e2e-student-a",
      };
      const matchingRsvp = {
        id: `${EVENT_AI_HACKATHON.id}_e2e-student-a`,
        eventId: EVENT_AI_HACKATHON.id,
        campusId: APEX_CAMPUS_ID,
        userId: "e2e-student-a",
      };
      const nonMatchingRsvp = {
        id: `${EVENT_DESIGN_SPRINT.id}_e2e-student-a`,
        eventId: EVENT_DESIGN_SPRINT.id,
        campusId: APEX_CAMPUS_ID,
        userId: "e2e-student-a",
      };

      mocks.useMyRsvps.mockReturnValue({
        rsvps: [matchingRsvp, nonMatchingRsvp, inaccessibleRsvp, errorRsvp],
        eventIds: new Set([
          EVENT_AI_HACKATHON.id,
          EVENT_DESIGN_SPRINT.id,
          "deleted-event",
          "flaky-event",
        ]),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      mocks.resolveEvent.mockImplementation((id) => {
        if (id === "deleted-event") {
          return Promise.resolve({
            status: "inaccessible",
            event: null,
            error: null,
          });
        }
        if (id === "flaky-event") {
          return Promise.resolve({
            status: "error",
            event: null,
            error: new Error("Server error loading event"),
          });
        }
        if (id === EVENT_AI_HACKATHON.id) {
          return Promise.resolve({
            status: "available",
            event: EVENT_AI_HACKATHON,
            error: null,
          });
        }
        if (id === EVENT_DESIGN_SPRINT.id) {
          return Promise.resolve({
            status: "available",
            event: EVENT_DESIGN_SPRINT,
            error: null,
          });
        }
        return Promise.resolve({
          status: "available",
          event: { id, title: "Resolved Event", category: "tech", communityId: "apex-ai-club" },
          error: null,
        });
      });

      mocks.deleteEventRsvp.mockResolvedValue();

      const { result } = renderHook(() => Events());
      let filterBar = findInReactTree(result.current, (n) => n.type === EventFilterBar);

      await act(async () => {
        filterBar.props.onTimeRangeChange("going");
      });

      // Initially 2 available events and both problem cards
      let grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid.props.events).toHaveLength(2);
      expect(grid.props.inaccessibleRsvps).toHaveLength(1);
      expect(grid.props.resolutionErrors).toHaveLength(1);

      // Explicitly activate ALL THREE filters: Search, Category, and Community
      const searchInput = findInReactTree(result.current, (n) => n.props?.["aria-label"] === "Search events");
      expect(searchInput).not.toBeNull();
      filterBar = findInReactTree(result.current, (n) => n.type === EventFilterBar);
      await act(async () => {
        searchInput.props.onChange({ target: { value: "Hackathon" } });
        filterBar.props.onCategoryChange("tech");
        filterBar.props.onCommunityChange("apex-ai-club");
      });

      grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid.props.hasActiveFilters).toBe(true);

      // Verify the available event list remains properly filtered (Hackathon matches; Design Sprint filtered out)
      expect(grid.props.events).toHaveLength(1);
      expect(grid.props.events[0].id).toBe(EVENT_AI_HACKATHON.id);

      // Verify inaccessible RSVP card remains visible under active filters
      expect(grid.props.inaccessibleRsvps).toHaveLength(1);
      expect(grid.props.inaccessibleRsvps[0].eventId).toBe("deleted-event");

      // Verify resolution-error card remains visible under active filters
      expect(grid.props.resolutionErrors).toHaveLength(1);
      expect(grid.props.resolutionErrors[0].eventId).toBe("flaky-event");

      // Verify Remove RSVP action works while filters are active
      await act(async () => {
        await grid.props.onRemoveRsvp("deleted-event");
      });
      expect(mocks.deleteEventRsvp).toHaveBeenCalledWith("deleted-event", "e2e-student-a");

      grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid.props.inaccessibleRsvps).toHaveLength(0);

      // Configure retry to succeed
      mocks.resolveEvent.mockImplementationOnce((id) => {
        return Promise.resolve({
          status: "available",
          event: {
            id,
            title: "Flaky Hackathon Fixed",
            category: "tech",
            communityId: "apex-ai-club",
          },
          error: null,
        });
      });

      // Verify Retry action actually invokes onRetryResolve and executes resolution
      await act(async () => {
        await grid.props.onRetryResolve("flaky-event");
      });
      expect(mocks.resolveEvent).toHaveBeenCalledWith("flaky-event");

      grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid.props.resolutionErrors).toHaveLength(0);
      // Fixed event matches "Hackathon", "tech", "apex-ai-club", so it now appears in filtered events
      expect(grid.props.events).toHaveLength(2);
    });

    it("invalidates resolution cache when user or campus switches, ensuring shared eventId is not reused", async () => {
      let resolveDeferred;
      mocks.resolveEvent.mockImplementation(() =>
        new Promise((resolve) => {
          resolveDeferred = resolve;
        })
      );

      // User Alice at Apex has RSVP for shared event
      mocks.useAuth.mockReturnValue({
        user: { uid: "user-alice", email: "alice@apex.edu" },
        loading: false,
      });
      mocks.useOptionalCampus.mockReturnValue({
        campus: CAMPUS_A,
        campusId: APEX_CAMPUS_ID,
        loading: false,
      });
      mocks.useMyRsvps.mockReturnValue({
        rsvps: [{ eventId: "shared-event-id", campusId: APEX_CAMPUS_ID, userId: "user-alice" }],
        eventIds: new Set(["shared-event-id"]),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result, rerender } = renderHook(() => Events());
      const filterBar = findInReactTree(result.current, (n) => n.type === EventFilterBar);

      await act(async () => {
        filterBar.props.onTimeRangeChange("going");
      });

      // Complete Alice's resolution
      await act(async () => {
        resolveDeferred({
          status: "available",
          event: { id: "shared-event-id", title: "Shared Event", category: "tech" },
          error: null,
        });
      });

      let grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid.props.events).toHaveLength(1);
      expect(grid.props.events[0].id).toBe("shared-event-id");

      // Switch context to Bob at St. Jude
      mocks.useAuth.mockReturnValue({
        user: { uid: "user-bob", email: "bob@stjude.edu" },
        loading: false,
      });
      mocks.useOptionalCampus.mockReturnValue({
        campus: { id: ST_JUDE_CAMPUS_ID, name: "St. Jude" },
        campusId: ST_JUDE_CAMPUS_ID,
        loading: false,
      });
      // Bob has the same event ID in his RSVPs
      mocks.useMyRsvps.mockReturnValue({
        rsvps: [{ eventId: "shared-event-id", campusId: ST_JUDE_CAMPUS_ID, userId: "user-bob" }],
        eventIds: new Set(["shared-event-id"]),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      let bobResolveDeferred;
      mocks.resolveEvent.mockImplementation(() =>
        new Promise((resolve) => {
          bobResolveDeferred = resolve;
        })
      );

      await act(async () => {
        rerender();
      });

      // Immediately after context switch, Alice's cached resolution must NOT be reused
      grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid.props.events).toHaveLength(0);

      // Complete Bob's resolution as inaccessible
      await act(async () => {
        bobResolveDeferred({
          status: "inaccessible",
          event: null,
          error: null,
        });
      });

      grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid.props.events).toHaveLength(0);
      expect(grid.props.inaccessibleRsvps).toHaveLength(1);
      expect(grid.props.inaccessibleRsvps[0].eventId).toBe("shared-event-id");
    });

    it("stale async callback from previous user does not populate cleared cache of switched user", async () => {
      let aliceResolvePromise;
      mocks.resolveEvent.mockImplementation(
        () =>
          new Promise((resolve) => {
            aliceResolvePromise = resolve;
          })
      );

      mocks.useAuth.mockReturnValue({
        user: { uid: "user-alice", email: "alice@apex.edu" },
        loading: false,
      });
      mocks.useOptionalCampus.mockReturnValue({
        campus: CAMPUS_A,
        campusId: APEX_CAMPUS_ID,
        loading: false,
      });
      mocks.useMyRsvps.mockReturnValue({
        rsvps: [{ eventId: "event-stale-test", campusId: APEX_CAMPUS_ID, userId: "user-alice" }],
        eventIds: new Set(["event-stale-test"]),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result, rerender } = renderHook(() => Events());
      const filterBar = findInReactTree(result.current, (n) => n.type === EventFilterBar);

      await act(async () => {
        filterBar.props.onTimeRangeChange("going");
      });

      // Before Alice's promise resolves, switch to Bob with empty RSVPs
      mocks.useAuth.mockReturnValue({
        user: { uid: "user-bob", email: "bob@apex.edu" },
        loading: false,
      });
      mocks.useMyRsvps.mockReturnValue({
        rsvps: [],
        eventIds: new Set(),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      await act(async () => {
        rerender();
      });

      // Now late-arriving Alice's resolution completes
      await act(async () => {
        aliceResolvePromise({
          status: "available",
          event: { id: "event-stale-test", title: "Stale Event", category: "tech" },
          error: null,
        });
      });

      // Bob's Going tab must remain empty with 0 events
      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid.props.events).toHaveLength(0);
      expect(grid.props.emptyTitle).toBe("No events RSVP'd yet");
    });
  });

  // =========================================================================
  // Seeded User Deterministic Fixtures Matching
  // =========================================================================
  describe("Seeded User Deterministic Fixtures Matching", () => {
    it("Student A fixture matches design sprint RSVP only", () => {
      expect(EVENT_RSVP_DESIGN_SPRINT_STUDENT_A_DEF.userId).toBe("e2e-student-a");
      expect(EVENT_RSVP_DESIGN_SPRINT_STUDENT_A_DEF.eventId).toBe("e2e-event-design-sprint");
      expect(EVENT_RSVP_DESIGN_SPRINT_STUDENT_A_DEF.campusId).toBe(APEX_CAMPUS_ID);
    });

    it("Student B fixtures match AI Hackathon and Members-Only Lab Sync RSVPs", () => {
      expect(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF.userId).toBe("e2e-student-b");
      expect(EVENT_RSVP_AI_HACKATHON_STUDENT_B_DEF.eventId).toBe("e2e-event-ai-hackathon");

      expect(EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B_DEF.userId).toBe("e2e-student-b");
      expect(EVENT_RSVP_AI_MEMBERS_ONLY_STUDENT_B_DEF.eventId).toBe("e2e-event-ai-members-only");
    });

    it("Student St. Jude fixture matches Medical Ethics Symposium RSVP", () => {
      expect(EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE_DEF.userId).toBe("e2e-student-st-jude");
      expect(EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE_DEF.eventId).toBe("e2e-event-st-jude-symposium");
      expect(EVENT_RSVP_ST_JUDE_SYMPOSIUM_STUDENT_ST_JUDE_DEF.campusId).toBe(ST_JUDE_CAMPUS_ID);
    });
  });

  // =========================================================================
  // Surface 3: Community Detail Events Tab Badge Inheritance
  // =========================================================================
  describe("Surface 3 — Community Detail Events Tab", () => {
    beforeEach(() => {
      mocks.useCommunity.mockReturnValue({
        community: { id: "apex-ai-club", name: "Apex AI Society", campusId: APEX_CAMPUS_ID },
        isLoading: false,
        error: null,
      });
      mocks.useCommunityMembers.mockReturnValue({
        members: [],
        isMember: true,
        isModerator: false,
        isAdmin: false,
      });
    });

    it("passes rsvpEventIds from useMyRsvps to EventGrid on CommunityDetail", () => {
      mocks.useMyRsvps.mockReturnValue({
        rsvps: [{ eventId: EVENT_AI_HACKATHON.id }],
        eventIds: new Set([EVENT_AI_HACKATHON.id]),
        isLoading: false,
        error: null,
      });

      mocks.useEvents.mockReturnValue({
        events: [EVENT_AI_HACKATHON, EVENT_CAMPUS_FEST],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => CommunityDetail());
      const el = result.current;

      const grid = findInReactTree(el, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.rsvpEventIds).toBeInstanceOf(Set);
      expect(grid.props.rsvpEventIds.has(EVENT_AI_HACKATHON.id)).toBe(true);
      expect(grid.props.rsvpEventIds.has(EVENT_CAMPUS_FEST.id)).toBe(false);
    });

    it("does not add any RSVP or cancellation buttons to CommunityDetail", () => {
      const { result } = renderHook(() => CommunityDetail());
      const el = result.current;

      const eventsSection = findByTestId(el, "community-events-section");
      expect(eventsSection).not.toBeNull();

      // Ensure no RSVP action buttons were introduced in CommunityDetail
      const rsvpBtn = findByTestId(eventsSection, "event-rsvp-button");
      const cancelBtn = findByTestId(eventsSection, "remove-rsvp-btn");
      expect(rsvpBtn).toBeNull();
      expect(cancelBtn).toBeNull();
    });
  });
});
