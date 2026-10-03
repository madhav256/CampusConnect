/**
 * Milestone 20 — Unit 20.4: Event Discovery UI & Navigation
 * Unit tests for EventCategoryBadge, EventStatusBadge, EventCard, EventFilterBar, EventGrid, and Events Page.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import {
  APEX_CAMPUS_ID,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
} from "../../src/constants.js";
import { CAMPUS_A } from "../../src/data/campuses.js";
import {
  EVENT_AI_HACKATHON,
  EVENT_DESIGN_SPRINT,
  EVENT_CAMPUS_FEST,
} from "../../src/data/events.js";
import { renderHook, act } from "./hookTestUtils";

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  useNotifications: vi.fn(() => ({ unreadCount: 0 })),
  useConversations: vi.fn(() => ({ totalUnread: 0 })),
  useEvents: vi.fn(),
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

vi.mock("../../src/hooks/useNotifications", () => ({
  useNotifications: () => mocks.useNotifications(),
}));

vi.mock("../../src/hooks/useConversations", () => ({
  useConversations: () => mocks.useConversations(),
}));

vi.mock("../../src/hooks/useEvents", () => ({
  useEvents: (...args) => mocks.useEvents(...args),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }) =>
    React.createElement("a", { href: to, to, ...props }, children),
  NavLink: ({ to, children, ...props }) =>
    React.createElement("a", { href: to, to, ...props }, children),
}));

// Recursive search helpers for React element trees
function findInReactTree(element, predicate) {
  if (!element || typeof element !== "object") return null;
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

function findAllInReactTree(element, predicate, results = []) {
  if (!element || typeof element !== "object") return results;
  if (predicate(element)) results.push(element);
  const children = element.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      findAllInReactTree(child, predicate, results);
    }
  } else if (children && typeof children === "object") {
    findAllInReactTree(children, predicate, results);
  }
  return results;
}

function findByTestId(tree, testId) {
  return findInReactTree(tree, (el) => el.props?.["data-testid"] === testId);
}

function renderComponent(Component, props = {}) {
  const { result } = renderHook(() => Component(props));
  return result.current;
}

// Components under test
import EventCategoryBadge from "../../src/components/events/EventCategoryBadge";
import EventStatusBadge from "../../src/components/events/EventStatusBadge";
import EventCard from "../../src/components/events/EventCard";
import EventFilterBar from "../../src/components/events/EventFilterBar";
import EventGrid from "../../src/components/events/EventGrid";
import Events from "../../src/pages/Events";

describe("Milestone 20 — Unit 20.4: Event Discovery UI & Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { uid: "user-1", email: "student@apex.edu" },
      loading: false,
    });
    mocks.useOptionalCampus.mockReturnValue({
      campus: CAMPUS_A,
      campusId: APEX_CAMPUS_ID,
      loading: false,
    });
    mocks.useEvents.mockReturnValue({
      events: [EVENT_AI_HACKATHON, EVENT_DESIGN_SPRINT, EVENT_CAMPUS_FEST],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  describe("EventCategoryBadge", () => {
    it("renders all 8 supported event categories with appropriate styling and labels", () => {
      const categories = [
        { id: EVENT_CATEGORIES.ACADEMIC, label: "Academic", classSnippet: "bg-indigo-50" },
        { id: EVENT_CATEGORIES.TECH, label: "Tech", classSnippet: "bg-sky-50" },
        { id: EVENT_CATEGORIES.CULTURAL, label: "Cultural", classSnippet: "bg-amber-50" },
        { id: EVENT_CATEGORIES.SPORTS, label: "Sports", classSnippet: "bg-emerald-50" },
        { id: EVENT_CATEGORIES.CAREER, label: "Career", classSnippet: "bg-purple-50" },
        { id: EVENT_CATEGORIES.WORKSHOP, label: "Workshop", classSnippet: "bg-orange-50" },
        { id: EVENT_CATEGORIES.SOCIAL, label: "Social", classSnippet: "bg-rose-50" },
        { id: EVENT_CATEGORIES.COMPETITION, label: "Competition", classSnippet: "bg-teal-50" },
      ];

      for (const cat of categories) {
        const el = renderComponent(EventCategoryBadge, { category: cat.id });
        expect(el.props["data-testid"]).toBe("event-category-badge");
        expect(el.props.children).toBe(cat.label);
        expect(el.props.className).toContain(cat.classSnippet);
      }
    });

    it("handles invalid or missing category with default fallback", () => {
      const elUnknown = renderComponent(EventCategoryBadge, { category: "unknown-category" });
      expect(elUnknown.props.children).toBe("Unknown-category");
      expect(elUnknown.props.className).toContain("bg-stone-100");

      const elNull = renderComponent(EventCategoryBadge, { category: null });
      expect(elNull.props.children).toBe("General");
      expect(elNull.props.className).toContain("bg-stone-100");
    });
  });

  describe("EventStatusBadge", () => {
    it("renders upcoming badge with emerald styling", () => {
      const el = renderComponent(EventStatusBadge, { temporalState: "upcoming" });
      expect(el.props["data-testid"]).toBe("event-status-badge");
      expect(el.props.className).toContain("bg-emerald-50");
      const text = findInReactTree(el, (n) => n.props?.children === "Upcoming");
      expect(text).not.toBeNull();
    });

    it("renders ongoing badge with amber styling and pulsing indicator", () => {
      const el = renderComponent(EventStatusBadge, { temporalState: "ongoing" });
      expect(el.props["data-testid"]).toBe("event-status-badge");
      expect(el.props.className).toContain("bg-amber-50");
      const text = findInReactTree(el, (n) => n.props?.children === "Ongoing");
      expect(text).not.toBeNull();
    });

    it("renders completed badge with neutral stone styling", () => {
      const el = renderComponent(EventStatusBadge, { temporalState: "completed" });
      expect(el.props["data-testid"]).toBe("event-status-badge");
      expect(el.props.className).toContain("bg-stone-100");
      const text = findInReactTree(el, (n) => n.props?.children === "Completed");
      expect(text).not.toBeNull();
    });

    it("renders cancelled badge with distinct rose styling when status is cancelled", () => {
      const el = renderComponent(EventStatusBadge, { status: "cancelled" });
      expect(el.props["data-testid"]).toBe("event-status-badge");
      expect(el.props.className).toContain("bg-rose-50");
      const text = findInReactTree(el, (n) => n.props?.children === "Cancelled");
      expect(text).not.toBeNull();
    });

    it("derives temporal state from an event object", () => {
      const upcomingEvent = {
        status: "published",
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 172800000),
      };
      const el = renderComponent(EventStatusBadge, { event: upcomingEvent });
      const text = findInReactTree(el, (n) => n.props?.children === "Upcoming");
      expect(text).not.toBeNull();
    });
  });

  describe("EventCard", () => {
    it("returns null when event prop is null", () => {
      const el = renderComponent(EventCard, { event: null });
      expect(el).toBeNull();
    });

    it("renders title, organizer, category, status, date, location, and links to /events/:eventId", () => {
      const el = renderComponent(EventCard, { event: EVENT_AI_HACKATHON });

      // Link href/to
      const link = findInReactTree(el, (n) => n.props?.to === `/events/${EVENT_AI_HACKATHON.id}`);
      expect(link).not.toBeNull();

      // Title
      const titleEl = findByTestId(el, "event-card-title");
      expect(titleEl).not.toBeNull();
      expect(titleEl.props.children).toBe(EVENT_AI_HACKATHON.title);

      // Organizer
      const orgEl = findByTestId(el, "event-card-organizer");
      expect(orgEl).not.toBeNull();
      const orgName = findInReactTree(orgEl, (n) => n.props?.children === EVENT_AI_HACKATHON.organizerName);
      expect(orgName).not.toBeNull();

      // Category badge
      const catBadge = findInReactTree(el, (n) => n.type === EventCategoryBadge);
      expect(catBadge).not.toBeNull();
      expect(catBadge.props.category).toBe(EVENT_AI_HACKATHON.category);

      // Status badge
      const statusBadge = findInReactTree(el, (n) => n.type === EventStatusBadge);
      expect(statusBadge).not.toBeNull();

      // Date
      const dateEl = findByTestId(el, "event-card-date");
      expect(dateEl).not.toBeNull();

      // Location
      const locEl = findByTestId(el, "event-card-location");
      expect(locEl).not.toBeNull();
      const locText = findInReactTree(locEl, (n) => n.props?.children === EVENT_AI_HACKATHON.location);
      expect(locText).not.toBeNull();
    });

    it("renders fallback decorative header when imageURL is null", () => {
      const el = renderComponent(EventCard, { event: EVENT_AI_HACKATHON });
      const img = findInReactTree(el, (n) => n.type === "img");
      expect(img).toBeNull();
    });

    it("renders banner image when imageURL is provided", () => {
      const eventWithImg = {
        ...EVENT_AI_HACKATHON,
        imageURL: "https://example.com/banner.jpg",
      };
      const el = renderComponent(EventCard, { event: eventWithImg });
      const img = findInReactTree(el, (n) => n.type === "img" && n.props?.src === "https://example.com/banner.jpg");
      expect(img).not.toBeNull();
    });

    it("visibly indicates cancelled state with strikethrough styling and badge", () => {
      const cancelledEvent = {
        ...EVENT_AI_HACKATHON,
        status: EVENT_STATUSES.CANCELLED,
      };
      const el = renderComponent(EventCard, { event: cancelledEvent });

      const titleEl = findByTestId(el, "event-card-title");
      expect(titleEl.props.className).toContain("line-through");

      const statusBadge = findInReactTree(el, (n) => n.type === EventStatusBadge);
      expect(statusBadge).not.toBeNull();
      expect(statusBadge.props.event.status).toBe(EVENT_STATUSES.CANCELLED);
    });
  });

  describe("EventFilterBar", () => {
    it("renders default selected values and triggers time range change", () => {
      const onTimeRangeChange = vi.fn();
      const el = renderComponent(EventFilterBar, {
        timeRange: "upcoming",
        onTimeRangeChange,
        selectedCategory: "all",
      });

      const upcomingTab = findByTestId(el, "time-tab-upcoming");
      expect(upcomingTab.props["aria-selected"]).toBe(true);

      const pastTab = findByTestId(el, "time-tab-past");
      expect(pastTab.props["aria-selected"]).toBe(false);

      // Trigger click on Past Events tab
      pastTab.props.onClick();
      expect(onTimeRangeChange).toHaveBeenCalledWith("past");
    });

    it("renders category pills and calls onCategoryChange when clicked", () => {
      const onCategoryChange = vi.fn();
      const el = renderComponent(EventFilterBar, {
        selectedCategory: "all",
        onCategoryChange,
      });

      const techPill = findByTestId(el, "category-pill-tech");
      expect(techPill).not.toBeNull();
      techPill.props.onClick();
      expect(onCategoryChange).toHaveBeenCalledWith("tech");
    });

    it("renders community dropdown and triggers onCommunityChange", () => {
      const onCommunityChange = vi.fn();
      const communityOptions = [
        { id: "apex-ai-club", label: "Apex AI Society" },
        { id: "apex-design-collective", label: "Apex Design Collective" },
      ];
      const el = renderComponent(EventFilterBar, {
        selectedCommunity: "all",
        onCommunityChange,
        communityOptions,
      });

      const selectEl = findByTestId(el, "community-filter-select");
      expect(selectEl).not.toBeNull();
      expect(selectEl.props.value).toBe("all");

      selectEl.props.onChange({ target: { value: "apex-ai-club" } });
      expect(onCommunityChange).toHaveBeenCalledWith("apex-ai-club");
    });

    it("renders reset button when hasActiveFilters is true and calls onReset", () => {
      const onReset = vi.fn();
      const el = renderComponent(EventFilterBar, {
        hasActiveFilters: true,
        onReset,
      });

      const resetBtn = findByTestId(el, "reset-filters-btn");
      expect(resetBtn).not.toBeNull();
      resetBtn.props.onClick();
      expect(onReset).toHaveBeenCalled();
    });
  });

  describe("EventGrid", () => {
    it("renders loading skeletons when isLoading is true", () => {
      const el = renderComponent(EventGrid, { isLoading: true });
      const loadingContainer = findByTestId(el, "event-grid-loading");
      expect(loadingContainer).not.toBeNull();
      const skeletons = findAllInReactTree(el, (n) => n.props?.["data-testid"] === "event-skeleton-card");
      expect(skeletons.length).toBe(6);
    });

    it("renders error state with retry button when error is present", () => {
      const onRetry = vi.fn();
      const el = renderComponent(EventGrid, { error: "Failed to fetch events", onRetry });
      const errorContainer = findByTestId(el, "event-grid-error");
      expect(errorContainer).not.toBeNull();

      const retryBtn = findInReactTree(errorContainer, (n) => n.type === "button");
      expect(retryBtn).not.toBeNull();
      retryBtn.props.onClick();
      expect(onRetry).toHaveBeenCalled();
    });

    it("renders empty state when events list is empty", () => {
      const el = renderComponent(EventGrid, {
        events: [],
        emptyTitle: "No upcoming events found",
        emptyDescription: "Check back later",
      });
      const emptyContainer = findByTestId(el, "event-grid-empty");
      expect(emptyContainer).not.toBeNull();
      expect(emptyContainer.props.title).toBe("No upcoming events found");
      expect(emptyContainer.props.description).toBe("Check back later");
    });

    it("renders multiple event cards with responsive grid classes", () => {
      const el = renderComponent(EventGrid, {
        events: [EVENT_AI_HACKATHON, EVENT_DESIGN_SPRINT],
      });
      const grid = findByTestId(el, "event-grid");
      expect(grid).not.toBeNull();
      expect(grid.props.className).toContain("grid-cols-1");
      expect(grid.props.className).toContain("sm:grid-cols-2");
      expect(grid.props.className).toContain("lg:grid-cols-3");

      const card1 = findByTestId(grid, `event-card-${EVENT_AI_HACKATHON.id}`);
      const card2 = findByTestId(grid, `event-card-${EVENT_DESIGN_SPRINT.id}`);
      expect(card1).not.toBeNull();
      expect(card2).not.toBeNull();
    });
  });

  describe("Events Page", () => {
    it("renders discovery header, campus indicator, search, filter bar, and event cards", () => {
      const { result } = renderHook(() => Events());
      const el = result.current;

      // Campus badge
      const campusBadge = findByTestId(el, "events-campus-badge");
      expect(campusBadge).not.toBeNull();

      // Create event placeholder button (disabled in M20.4)
      const placeholderBtn = findByTestId(el, "create-event-placeholder-btn");
      expect(placeholderBtn).not.toBeNull();
      expect(placeholderBtn.props.disabled).toBe(true);

      // Search input
      const searchInput = findInReactTree(el, (n) => n.props?.["aria-label"] === "Search events");
      expect(searchInput).not.toBeNull();

      // Filter bar
      const filterBar = findInReactTree(el, (n) => n.type === EventFilterBar);
      expect(filterBar).not.toBeNull();

      // Results count
      const countLabel = findByTestId(el, "events-count-label");
      expect(countLabel).not.toBeNull();
      expect(countLabel.props.children.join("")).toContain("3 events");

      // Grid
      const grid = findInReactTree(el, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.events).toHaveLength(3);
    });

    it("passes default query options { timeRange: 'upcoming' } to useEvents", () => {
      renderHook(() => Events());
      expect(mocks.useEvents).toHaveBeenCalledWith({
        timeRange: "upcoming",
      });
    });

    it("filters events client-side by search query", () => {
      const { result } = renderHook(() => Events());

      const searchInput = findInReactTree(result.current, (n) => n.props?.["aria-label"] === "Search events");
      expect(searchInput).not.toBeNull();

      act(() => {
        searchInput.props.onChange({ target: { value: "Hackathon" } });
      });

      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.events.map((e) => e.id)).toEqual([EVENT_AI_HACKATHON.id]);
    });

    it("filters events client-side by sponsoring community", () => {
      const { result } = renderHook(() => Events());

      const filterBar = findInReactTree(result.current, (n) => n.type === EventFilterBar);
      expect(filterBar).not.toBeNull();

      act(() => {
        filterBar.props.onCommunityChange("apex-design-collective");
      });

      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.events.map((e) => e.id)).toEqual([EVENT_DESIGN_SPRINT.id]);
    });

    it("renders loading state when useEvents reports isLoading: true", () => {
      mocks.useEvents.mockReturnValue({
        events: [],
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });
      const { result } = renderHook(() => Events());
      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.isLoading).toBe(true);
    });

    it("renders error state when useEvents reports error", () => {
      mocks.useEvents.mockReturnValue({
        events: [],
        isLoading: false,
        error: "Firestore network error",
        refetch: vi.fn(),
      });
      const { result } = renderHook(() => Events());
      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.error).toBe("Firestore network error");
    });

    it("renders empty state when no events exist", () => {
      mocks.useEvents.mockReturnValue({
        events: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const { result } = renderHook(() => Events());
      const grid = findInReactTree(result.current, (n) => n.type === EventGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.events).toHaveLength(0);
      expect(grid.props.emptyTitle).toBe("No upcoming events found");
    });
  });
});
