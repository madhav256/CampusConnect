/**
 * Milestone 20 — Unit 20.5: Event Detail Experience & Community Integration
 *
 * Comprehensive unit tests for:
 * 1. EventDetail page (/events/:eventId)
 * 2. CommunityDetail Events tab integration
 * 3. EventComposerModal component
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import {
  APEX_CAMPUS_ID,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
} from "../../src/constants.js";
import { CAMPUS_A } from "../../src/data/campuses.js";
import { COMMUNITY_APEX_AI } from "../../src/data/communities.js";
import { COMMUNITY_MEMBER_APEX_AI_STUDENT1 } from "../../src/data/communityMembers.js";
import {
  EVENT_AI_HACKATHON,
  EVENT_DESIGN_SPRINT,
} from "../../src/data/events.js";
import { renderHook, act } from "./hookTestUtils";

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useNavigate: vi.fn(),
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  useNotifications: vi.fn(() => ({ unreadCount: 0 })),
  useConversations: vi.fn(() => ({ totalUnread: 0 })),
  useEvent: vi.fn(),
  useEvents: vi.fn(),
  useCommunity: vi.fn(),
  useCommunityMembers: vi.fn(),
  useEligibleCommunities: vi.fn(),
  createEvent: vi.fn(),
  usePosts: vi.fn(() => ({
    posts: [],
    isLoading: false,
    error: null,
    hasMorePosts: false,
    isFetchingOlder: false,
    initialize: vi.fn(),
    loadMore: vi.fn(),
    addPost: vi.fn(),
    removePost: vi.fn(),
    updatePost: vi.fn(),
  })),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => mocks.useParams(),
  useNavigate: () => mocks.useNavigate,
  Link: ({ to, children, ...props }) =>
    React.createElement("a", { href: to, to, ...props }, children),
  NavLink: ({ to, children, ...props }) =>
    React.createElement("a", { href: to, to, ...props }, children),
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

vi.mock("../../src/hooks/useEvent", () => ({
  useEvent: (id) => mocks.useEvent(id),
}));

vi.mock("../../src/hooks/useEvents", () => ({
  useEvents: (opts) => mocks.useEvents(opts),
}));

vi.mock("../../src/hooks/useCommunity", () => ({
  useCommunity: (id) => mocks.useCommunity(id),
}));

vi.mock("../../src/hooks/useCommunityMembers", () => ({
  useCommunityMembers: (id) => mocks.useCommunityMembers(id),
}));

vi.mock("../../src/hooks/useEligibleCommunities", () => ({
  useEligibleCommunities: (campusId) => mocks.useEligibleCommunities(campusId),
}));

vi.mock("../../src/services/eventService", () => ({
  createEvent: (...args) => mocks.createEvent(...args),
  getEventById: vi.fn(),
  resolveEvent: vi.fn(),
  getEventsByCampus: vi.fn(),
  getEventsByCommunity: vi.fn(),
  subscribeToEvent: vi.fn(() => vi.fn()),
  subscribeToEventResolution: vi.fn(() => vi.fn()),
  subscribeToCampusEvents: vi.fn(() => vi.fn()),
  subscribeToCommunityEvents: vi.fn(() => vi.fn()),
}));

vi.mock("../../src/hooks/usePosts", () => ({
  usePosts: (opts) => mocks.usePosts(opts),
}));

// Recursive search helpers for React element trees
function findInReactTree(element, predicate) {
  if (!element || typeof element !== "object") return null;
  if (predicate(element)) return element;
  if (element.props) {
    for (const key of Object.keys(element.props)) {
      const val = element.props[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          const found = findInReactTree(child, predicate);
          if (found) return found;
        }
      } else if (val && typeof val === "object" && React.isValidElement(val)) {
        const found = findInReactTree(val, predicate);
        if (found) return found;
      }
    }
  }
  return null;
}


function findByTestId(tree, testId) {
  return findInReactTree(tree, (el) => el.props?.["data-testid"] === testId);
}

function renderComponent(Component, props = {}) {
  const { result } = renderHook(() => Component(props));
  return { result };
}

// Components under test
import EventDetail from "../../src/pages/EventDetail.jsx";
import CommunityDetail from "../../src/pages/CommunityDetail.jsx";
import EventComposerModal from "../../src/components/events/EventComposerModal.jsx";
import Events from "../../src/pages/Events.jsx";

describe("Milestone 20 — Unit 20.5: Event Detail Experience & Community Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useParams.mockReturnValue({ eventId: "event-ai-hackathon", communityId: COMMUNITY_APEX_AI.id });
    mocks.useAuth.mockReturnValue({
      user: {
        uid: "user-moderator-1",
        email: "moderator@apex.edu",
        displayName: "Morgan Lee",
      },
      loading: false,
    });
    mocks.useOptionalCampus.mockReturnValue({
      campusId: APEX_CAMPUS_ID,
      campus: CAMPUS_A,
      loading: false,
    });
    mocks.useEligibleCommunities.mockReturnValue({
      eligibleCommunities: [COMMUNITY_APEX_AI],
      hasEligibleCommunities: true,
      isLoading: false,
      error: null,
    });
  });

  // =========================================================================
  // 1. EventDetail Page Tests
  // =========================================================================
  describe("EventDetail Page", () => {
    it("renders loading state with skeleton placeholder", () => {
      mocks.useEvent.mockReturnValue({
        event: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderComponent(EventDetail);
      expect(findByTestId(result.current, "event-detail-loading")).not.toBeNull();
    });

    it("renders error state with retry affordance", () => {
      const mockRefetch = vi.fn();
      mocks.useEvent.mockReturnValue({
        event: null,
        isLoading: false,
        error: "Network permission denied.",
        refetch: mockRefetch,
      });

      const { result } = renderComponent(EventDetail);
      expect(findByTestId(result.current, "event-detail-error")).not.toBeNull();

      const retryBtn = findInReactTree(result.current, (el) =>
        el.props?.children &&
        Array.isArray(el.props.children) &&
        el.props.children.some((c) => c?.props?.children === "Retry")
      );
      expect(retryBtn).not.toBeNull();
      retryBtn.props.onClick();
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it("renders not-found state when event does not exist", () => {
      mocks.useEvent.mockReturnValue({
        event: null,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderComponent(EventDetail);
      expect(findByTestId(result.current, "event-detail-not-found")).not.toBeNull();
      expect(findByTestId(result.current, "not-found-back-link")).not.toBeNull();
    });

    it("renders complete event details for a populated event", () => {
      mocks.useEvent.mockReturnValue({
        event: EVENT_AI_HACKATHON,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderComponent(EventDetail);

      // Hero banner and title
      expect(findByTestId(result.current, "event-hero-card")).not.toBeNull();
      const titleEl = findByTestId(result.current, "event-detail-title");
      expect(titleEl).not.toBeNull();
      expect(titleEl.props.children).toBe(EVENT_AI_HACKATHON.title);

      // Description
      const descEl = findByTestId(result.current, "event-detail-description");
      expect(descEl).not.toBeNull();
      expect(descEl.props.children).toBe(EVENT_AI_HACKATHON.description);

      // Date and Time
      const dateEl = findByTestId(result.current, "event-detail-date");
      expect(dateEl).not.toBeNull();
      expect(dateEl.props.children).toContain("2026");

      const timeEl = findByTestId(result.current, "event-detail-time");
      expect(timeEl).not.toBeNull();

      // Venue / Location
      const locationEl = findByTestId(result.current, "event-detail-location");
      expect(locationEl).not.toBeNull();
      expect(locationEl.props.children).toBe(EVENT_AI_HACKATHON.location);

      // Sponsoring community link
      const communityLink = findByTestId(result.current, "event-community-link");
      expect(communityLink).not.toBeNull();
      expect(communityLink.props.href || communityLink.props.to).toBe(
        `/communities/${EVENT_AI_HACKATHON.communityId}`
      );

      // Sponsoring community name
      const communityName = findByTestId(result.current, "event-detail-community-name");
      expect(communityName).not.toBeNull();
      expect(communityName.props.children).toBe(EVENT_AI_HACKATHON.organizerName);

      // Back navigation
      const backLink = findByTestId(result.current, "back-to-events");
      expect(backLink).not.toBeNull();
      expect(backLink.props.href || backLink.props.to).toBe("/events");

      // Verify NO RSVP or registration controls exist (Scope guard)
      expect(findByTestId(result.current, "rsvp-button")).toBeNull();
      expect(findByTestId(result.current, "register-button")).toBeNull();
    });

    it("renders prominent cancellation banner when event status is cancelled", () => {
      const cancelledEvent = {
        ...EVENT_DESIGN_SPRINT,
        status: EVENT_STATUSES.CANCELLED,
      };

      mocks.useEvent.mockReturnValue({
        event: cancelledEvent,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderComponent(EventDetail);

      const cancelBanner = findByTestId(result.current, "event-cancelled-banner");
      expect(cancelBanner).not.toBeNull();

      const titleEl = findByTestId(result.current, "event-detail-title");
      expect(titleEl.props.className).toContain("line-through");
    });
  });

  // =========================================================================
  // 2. CommunityDetail Events Tab Integration Tests
  // =========================================================================
  describe("CommunityDetail Events Tab Integration", () => {
    beforeEach(() => {
      mocks.useCommunity.mockReturnValue({
        community: COMMUNITY_APEX_AI,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      mocks.useCommunityMembers.mockReturnValue({
        members: [COMMUNITY_MEMBER_APEX_AI_STUDENT1],
        membership: COMMUNITY_MEMBER_APEX_AI_STUDENT1,
        isMember: true,
        isModerator: true,
        isAdmin: false,
        isLoading: false,
        error: null,
        join: vi.fn(),
        leave: vi.fn(),
        refetch: vi.fn(),
      });
      mocks.useEvents.mockReturnValue({
        events: [EVENT_AI_HACKATHON],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it("renders both Discussion and Events tabs", () => {
      const { result } = renderComponent(CommunityDetail);

      const discTab = findByTestId(result.current, "community-tab-discussion");
      expect(discTab).not.toBeNull();

      const eventsTab = findByTestId(result.current, "community-tab-events");
      expect(eventsTab).not.toBeNull();
    });

    it("passes membership-aware options to useEvents hook", () => {
      // 1. As active member
      renderComponent(CommunityDetail);
      expect(mocks.useEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          communityId: COMMUNITY_APEX_AI.id,
          campusId: COMMUNITY_APEX_AI.campusId,
          isMember: true,
        })
      );

      // 2. As non-member
      mocks.useCommunityMembers.mockReturnValue({
        members: [],
        membership: null,
        isMember: false,
        isModerator: false,
        isAdmin: false,
        isLoading: false,
        error: null,
        join: vi.fn(),
        leave: vi.fn(),
        refetch: vi.fn(),
      });

      renderComponent(CommunityDetail);
      expect(mocks.useEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          communityId: COMMUNITY_APEX_AI.id,
          campusId: COMMUNITY_APEX_AI.campusId,
          isMember: false,
        })
      );
    });

    it("switches to Events pane and displays events grid", () => {
      const { result } = renderComponent(CommunityDetail);

      const eventsTab = findByTestId(result.current, "community-tab-events");
      act(() => {
        eventsTab.props.onClick();
      });

      const eventsSection = findByTestId(result.current, "community-events-section");
      expect(eventsSection).not.toBeNull();
      expect(eventsSection.props.className).not.toContain("hidden");

      // Verify create event button is visible for moderator
      const createBtn = findByTestId(result.current, "community-create-event-btn");
      expect(createBtn).not.toBeNull();
    });

    it("shows empty state when community has no events", () => {
      mocks.useEvents.mockReturnValue({
        events: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderComponent(CommunityDetail);

      const eventsTab = findByTestId(result.current, "community-tab-events");
      act(() => {
        eventsTab.props.onClick();
      });

      const grid = findInReactTree(result.current, (el) =>
        el.props?.emptyTitle === "No events for this community yet."
      );
      expect(grid).not.toBeNull();
    });

    it("renders loading and error states for community events tab", () => {
      // 1. Loading state
      mocks.useEvents.mockReturnValue({
        events: [],
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });
      const { result: loadResult } = renderComponent(CommunityDetail);
      const loadGrid = findInReactTree(loadResult.current, (el) => el.props?.isLoading === true);
      expect(loadGrid).not.toBeNull();

      // 2. Error state
      mocks.useEvents.mockReturnValue({
        events: [],
        isLoading: false,
        error: "Failed to load community events",
        refetch: vi.fn(),
      });
      const { result: errorResult } = renderComponent(CommunityDetail);
      const errGrid = findInReactTree(errorResult.current, (el) => el.props?.error === "Failed to load community events");
      expect(errGrid).not.toBeNull();
    });
  });

  // =========================================================================
  // 3. EventComposerModal Component Tests
  // =========================================================================
  describe("EventComposerModal Component", () => {
    const defaultProps = {
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      initialCommunityId: COMMUNITY_APEX_AI.id,
      eligibleCommunities: [COMMUNITY_APEX_AI],
    };

    it("returns null when isOpen is false", () => {
      const { result } = renderComponent(EventComposerModal, {
        ...defaultProps,
        isOpen: false,
      });
      expect(result.current).toBeNull();
    });

    it("renders modal structure with required fields and category options", () => {
      const { result } = renderComponent(EventComposerModal, defaultProps);

      expect(findByTestId(result.current, "event-composer-modal")).not.toBeNull();
      expect(findByTestId(result.current, "composer-title-input")).not.toBeNull();
      expect(findByTestId(result.current, "composer-slug-input")).not.toBeNull();
      expect(findByTestId(result.current, "composer-category-select")).not.toBeNull();
      expect(findByTestId(result.current, "composer-location-input")).not.toBeNull();
      expect(findByTestId(result.current, "composer-start-at-input")).not.toBeNull();
      expect(findByTestId(result.current, "composer-end-at-input")).not.toBeNull();
      expect(findByTestId(result.current, "composer-visibility-public")).not.toBeNull();
      expect(findByTestId(result.current, "composer-visibility-community")).not.toBeNull();
      expect(findByTestId(result.current, "composer-description-input")).not.toBeNull();
      expect(findByTestId(result.current, "composer-submit-btn")).not.toBeNull();
    });

    it("calls onClose when close button or cancel button is clicked", () => {
      const onClose = vi.fn();
      const { result } = renderComponent(EventComposerModal, {
        ...defaultProps,
        onClose,
      });

      const closeBtn = findByTestId(result.current, "composer-close-btn");
      act(() => {
        closeBtn.props.onClick();
      });
      expect(onClose).toHaveBeenCalledTimes(1);

      const cancelBtn = findByTestId(result.current, "composer-cancel-btn");
      act(() => {
        cancelBtn.props.onClick();
      });
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("validates required fields on submission", async () => {
      const { result } = renderComponent(EventComposerModal, {
        ...defaultProps,
        initialCommunityId: "",
      });

      const form = findByTestId(result.current, "event-composer-form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: vi.fn() });
      });

      expect(mocks.createEvent).not.toHaveBeenCalled();
    });

    it("validates that endAt must be after or equal to startAt", async () => {
      const { result } = renderComponent(EventComposerModal, defaultProps);

      // Fill valid title and location
      const titleInput = findByTestId(result.current, "composer-title-input");
      act(() => {
        titleInput.props.onChange({ target: { value: "Test Event" } });
      });

      const locationInput = findByTestId(result.current, "composer-location-input");
      act(() => {
        locationInput.props.onChange({ target: { value: "Room 101" } });
      });

      // Set endAt earlier than startAt
      const startInput = findByTestId(result.current, "composer-start-at-input");
      act(() => {
        startInput.props.onChange({ target: { value: "2026-10-15T14:00" } });
      });

      const endInput = findByTestId(result.current, "composer-end-at-input");
      act(() => {
        endInput.props.onChange({ target: { value: "2026-10-15T12:00" } });
      });

      const form = findByTestId(result.current, "event-composer-form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: vi.fn() });
      });

      expect(mocks.createEvent).not.toHaveBeenCalled();

      const errorText = findInReactTree(result.current, (el) =>
        el.props?.children === "End time must be after or equal to start time."
      );
      expect(errorText).not.toBeNull();
    });

    it("submits valid event, invokes createEvent(), and fires onSuccess callback", async () => {
      const onSuccess = vi.fn();
      const onClose = vi.fn();
      mocks.createEvent.mockResolvedValue("event-newly-created-123");

      const { result } = renderComponent(EventComposerModal, {
        ...defaultProps,
        onSuccess,
        onClose,
      });

      // Fill title
      act(() => {
        findByTestId(result.current, "composer-title-input").props.onChange({
          target: { value: "Robotics Workshop" },
        });
      });

      // Fill location
      act(() => {
        findByTestId(result.current, "composer-location-input").props.onChange({
          target: { value: "Engineering Lab 3" },
        });
      });

      // Set valid dates
      act(() => {
        findByTestId(result.current, "composer-start-at-input").props.onChange({
          target: { value: "2026-10-20T10:00" },
        });
      });
      act(() => {
        findByTestId(result.current, "composer-end-at-input").props.onChange({
          target: { value: "2026-10-20T12:00" },
        });
      });

      // Fill description
      act(() => {
        findByTestId(result.current, "composer-description-input").props.onChange({
          target: { value: "Hands-on robotics prototyping session." },
        });
      });

      const form = findByTestId(result.current, "event-composer-form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: vi.fn() });
      });

      expect(mocks.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          communityId: COMMUNITY_APEX_AI.id,
          title: "Robotics Workshop",
          location: "Engineering Lab 3",
          category: "tech",
          organizerName: COMMUNITY_APEX_AI.name,
          visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
        }),
        expect.objectContaining({
          uid: "user-moderator-1",
          campusId: APEX_CAMPUS_ID,
        })
      );

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith("event-newly-created-123");
    });

    it("handles createEvent service rejection gracefully and displays error banner", async () => {
      mocks.createEvent.mockRejectedValue(new Error("Permission denied: insufficient community authority."));

      const { result } = renderComponent(EventComposerModal, defaultProps);

      // Fill valid fields
      act(() => {
        findByTestId(result.current, "composer-title-input").props.onChange({
          target: { value: "Unauthorized Event" },
        });
      });
      act(() => {
        findByTestId(result.current, "composer-location-input").props.onChange({
          target: { value: "Main Hall" },
        });
      });
      act(() => {
        findByTestId(result.current, "composer-start-at-input").props.onChange({
          target: { value: "2026-10-20T10:00" },
        });
      });
      act(() => {
        findByTestId(result.current, "composer-end-at-input").props.onChange({
          target: { value: "2026-10-20T12:00" },
        });
      });

      const form = findByTestId(result.current, "event-composer-form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: vi.fn() });
      });

      const errorAlert = findByTestId(result.current, "composer-error-alert");
      expect(errorAlert).not.toBeNull();
      expect(
        findInReactTree(result.current, (el) =>
          el.props?.children?.includes?.("Permission denied")
        )
      ).not.toBeNull();
    });

    it("handles community_only visibility selection and passes it to createEvent", async () => {
      mocks.createEvent.mockResolvedValue("event-comm-only-456");

      const { result } = renderComponent(EventComposerModal, defaultProps);

      // Fill required fields
      act(() => {
        findByTestId(result.current, "composer-title-input").props.onChange({
          target: { value: "Private Community Sync" },
        });
      });
      act(() => {
        findByTestId(result.current, "composer-location-input").props.onChange({
          target: { value: "Discord Room A" },
        });
      });
      act(() => {
        findByTestId(result.current, "composer-start-at-input").props.onChange({
          target: { value: "2026-10-25T18:00" },
        });
      });
      act(() => {
        findByTestId(result.current, "composer-end-at-input").props.onChange({
          target: { value: "2026-10-25T19:30" },
        });
      });

      // Select community_only
      const communityRadio = findInReactTree(result.current, (el) =>
        el.type === "input" && el.props?.value === EVENT_VISIBILITIES.COMMUNITY_ONLY
      );
      expect(communityRadio).not.toBeNull();
      act(() => {
        communityRadio.props.onChange();
      });

      // Change category to workshop
      const categorySelect = findByTestId(result.current, "composer-category-select");
      act(() => {
        categorySelect.props.onChange({ target: { value: EVENT_CATEGORIES.WORKSHOP } });
      });

      const form = findByTestId(result.current, "event-composer-form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: vi.fn() });
      });

      expect(mocks.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Private Community Sync",
          category: EVENT_CATEGORIES.WORKSHOP,
          visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY,
        }),
        expect.anything()
      );
    });
  });

  // =========================================================================
  // 4. Events Discovery Page Integration Tests
  // =========================================================================
  describe("Events Discovery Page Integration", () => {
    it("renders enabled Create Event button when user has eligible communities", () => {
      mocks.useEligibleCommunities.mockReturnValue({
        eligibleCommunities: [COMMUNITY_APEX_AI],
        hasEligibleCommunities: true,
        isLoading: false,
        error: null,
      });
      mocks.useEvents.mockReturnValue({
        events: [EVENT_AI_HACKATHON],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderComponent(Events);
      const createBtn = findByTestId(result.current, "create-event-btn");
      expect(createBtn).not.toBeNull();
      expect(createBtn.props.disabled).toBeFalsy();
    });

    it("renders disabled Create Event button when user has no eligible communities", () => {
      mocks.useEligibleCommunities.mockReturnValue({
        eligibleCommunities: [],
        hasEligibleCommunities: false,
        isLoading: false,
        error: null,
      });
      mocks.useEvents.mockReturnValue({
        events: [EVENT_AI_HACKATHON],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderComponent(Events);
      const placeholderBtn = findByTestId(result.current, "create-event-placeholder-btn");
      expect(placeholderBtn).not.toBeNull();
      expect(placeholderBtn.props.disabled).toBe(true);
    });
  });
});
