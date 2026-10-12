/**
 * Milestone 21 — Unit 21.4: RSVP Detail Interaction UI
 *
 * Comprehensive unit test suite for:
 * 1. RsvpStatusBadge (all five display states, icon/color styling, fallback behavior)
 * 2. EventRsvpButton (not going, going, mutating, cancelled, ended, started, unavailable, auth, error)
 * 3. EventAttendeePreview (loading skeleton, error states, empty state, 1 going, N going, 50+ overflow, avatars)
 * 4. EventDetail Integration (desktop sidebar card, mobile sticky bar, live RSVP integration)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act } from "./hookTestUtils";
import * as eventRsvpsModule from "../../src/data/eventRsvps.js";
import {
  RSVP_DISPLAY_STATES,
} from "../../src/data/eventRsvps.js";
import {
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
  APEX_CAMPUS_ID,
} from "../../src/constants.js";
import RsvpStatusBadge from "../../src/components/events/RsvpStatusBadge.jsx";
import EventAttendeePreview from "../../src/components/events/EventAttendeePreview.jsx";
import EventRsvpButton from "../../src/components/events/EventRsvpButton.jsx";
import EventDetail from "../../src/pages/EventDetail.jsx";

// Hoisted mocks for dependencies
const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useNavigate: vi.fn(),
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  useNotifications: vi.fn(() => ({ unreadCount: 0 })),
  useConversations: vi.fn(() => ({ totalUnread: 0 })),
  useEvent: vi.fn(),
  useEventRsvp: vi.fn(),
  useEventAttendees: vi.fn(),
  fetchUserById: vi.fn(),
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

vi.mock("../../src/hooks/useEventRsvp", () => ({
  useEventRsvp: (id) => mocks.useEventRsvp(id),
}));

vi.mock("../../src/hooks/useEventAttendees", () => ({
  useEventAttendees: (id, opts) => mocks.useEventAttendees(id, opts),
}));

vi.mock("../../src/services/userService", () => ({
  fetchUserById: (uid) => mocks.fetchUserById(uid),
}));

// Recursive search helper for React element trees
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

  // If element is a functional component, inspect its rendered subtree
  if (typeof element.type === "function") {
    try {
      const rendered = element.type(element.props);
      const found = findInReactTree(rendered, predicate);
      if (found) return found;
    } catch {
      // not a functional component or failed to render
    }
  }

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

function findAllByTestId(element, testId, results = []) {
  if (!element) return results;
  if (Array.isArray(element)) {
    for (const item of element) {
      findAllByTestId(item, testId, results);
    }
    return results;
  }
  if (typeof element !== "object") return results;
  if (element.props?.["data-testid"] === testId) {
    results.push(element);
  }

  // If element is a functional component, inspect its rendered subtree
  if (typeof element.type === "function") {
    try {
      const rendered = element.type(element.props);
      findAllByTestId(rendered, testId, results);
    } catch {
      // ignore
    }
  }

  if (element.props) {
    for (const key of Object.keys(element.props)) {
      const val = element.props[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          findAllByTestId(child, testId, results);
        }
      } else if (val && typeof val === "object" && React.isValidElement(val)) {
        findAllByTestId(val, testId, results);
      }
    }
  }
  return results;
}

function getTextContent(element) {
  if (element === null || element === undefined) return "";
  if (typeof element === "string" || typeof element === "number") return String(element);
  if (Array.isArray(element)) return element.map(getTextContent).join("");
  if (element.props && element.props.children) {
    return getTextContent(element.props.children);
  }
  return "";
}

function renderComponent(Component, props = {}) {
  const { result } = renderHook(() => Component(props));
  return { result };
}

describe("Milestone 21 — Unit 21.4: RSVP Detail Interaction UI", () => {
  const baseUser = { uid: "test-user-123", email: "student@apex.edu" };
  const baseCampus = { campusId: APEX_CAMPUS_ID, name: "Apex Tech" };

  const sampleEvent = {
    id: "evt-ai-summit",
    title: "Apex AI Summit",
    description: "Annual university summit exploring artificial intelligence.",
    campusId: APEX_CAMPUS_ID,
    communityId: "comm-ai",
    organizerName: "Apex AI Club",
    category: "tech",
    location: "Auditorium A",
    visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
    status: EVENT_STATUSES.PUBLISHED,
    startAt: new Date(Date.now() + 86400000).toISOString(),
    endAt: new Date(Date.now() + 172800000).toISOString(),
    createdBy: "usr-leader",
    createdAt: new Date().toISOString(),
  };

  const sampleRsvp = {
    id: "evt-ai-summit_test-user-123",
    eventId: "evt-ai-summit",
    campusId: APEX_CAMPUS_ID,
    userId: "test-user-123",
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useParams.mockReturnValue({ eventId: "evt-ai-summit" });
    mocks.useAuth.mockReturnValue({ user: baseUser });
    mocks.useOptionalCampus.mockReturnValue(baseCampus);
    mocks.useEvent.mockReturnValue({
      event: sampleEvent,
      availability: "available",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useEventRsvp.mockReturnValue({
      rsvp: null,
      isGoing: false,
      isLoading: false,
      isMutating: false,
      error: null,
      rsvpToEvent: vi.fn(),
      cancelRsvp: vi.fn(),
    });
    mocks.useEventAttendees.mockReturnValue({
      attendees: [],
      count: 0,
      hasMore: false,
      isLoading: false,
      error: null,
    });
    mocks.fetchUserById.mockResolvedValue({
      uid: "test-user-123",
      displayName: "Alex Chen",
      photoURL: null,
    });
  });

  // =========================================================================
  // 1. RsvpStatusBadge Component Tests
  // =========================================================================
  describe("RsvpStatusBadge Component", () => {
    it("renders 'Going' badge with emerald styling when state is 'going'", () => {
      const { result } = renderComponent(RsvpStatusBadge, {
        state: RSVP_DISPLAY_STATES.GOING,
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Going");
      expect(badge.props.className).toContain("bg-emerald-50");
      expect(badge.props.className).toContain("text-emerald-700");
    });

    it("renders 'Went' badge with stone styling when state is 'attended_window_passed'", () => {
      const { result } = renderComponent(RsvpStatusBadge, {
        state: RSVP_DISPLAY_STATES.ATTENDED_WINDOW_PASSED,
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Went");
      expect(badge.props.className).toContain("bg-stone-100");
      expect(badge.props.className).toContain("text-stone-600");
    });

    it("renders 'Cancelled' badge with rose styling when state is 'event_cancelled'", () => {
      const { result } = renderComponent(RsvpStatusBadge, {
        state: RSVP_DISPLAY_STATES.EVENT_CANCELLED,
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Cancelled");
      expect(badge.props.className).toContain("bg-rose-50");
      expect(badge.props.className).toContain("text-rose-700");
    });

    it("renders 'Unavailable' badge with amber styling when state is 'event_unavailable'", () => {
      const { result } = renderComponent(RsvpStatusBadge, {
        state: RSVP_DISPLAY_STATES.EVENT_UNAVAILABLE,
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Unavailable");
      expect(badge.props.className).toContain("bg-amber-50");
      expect(badge.props.className).toContain("text-amber-800");
    });

    it("renders 'Not Going' badge when state is 'not_going' and showNotGoing is true", () => {
      const { result } = renderComponent(RsvpStatusBadge, {
        state: RSVP_DISPLAY_STATES.NOT_GOING,
        showNotGoing: true,
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Not Going");
    });

    it("renders null when state is 'not_going' and showNotGoing is false", () => {
      const { result } = renderComponent(RsvpStatusBadge, {
        state: RSVP_DISPLAY_STATES.NOT_GOING,
        showNotGoing: false,
      });
      expect(result.current).toBeNull();
    });

    it("derives display state dynamically when passed resolution and rsvp objects", () => {
      const { result } = renderComponent(RsvpStatusBadge, {
        resolution: {
          status: "available",
          event: sampleEvent,
          error: null,
        },
        rsvp: sampleRsvp,
        referenceDate: new Date(),
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Going");
    });

    it("derives 'Cancelled' dynamically when event in resolution is cancelled", () => {
      const cancelledEvent = { ...sampleEvent, status: EVENT_STATUSES.CANCELLED };
      const { result } = renderComponent(RsvpStatusBadge, {
        resolution: {
          status: "available",
          event: cancelledEvent,
          error: null,
        },
        rsvp: sampleRsvp,
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Cancelled");
    });

    it("handles basic RSVP presence without calling getRsvpDisplayState when resolution is omitted or null", () => {
      const spy = vi.spyOn(eventRsvpsModule, "getRsvpDisplayState");
      try {
        const { result: goingResult } = renderComponent(RsvpStatusBadge, {
          rsvp: sampleRsvp,
        });
        const goingBadge = findByTestId(goingResult.current, "rsvp-status-badge");
        expect(goingBadge).toBeTruthy();
        expect(getTextContent(goingBadge)).toContain("Going");

        const { result: notGoingResult } = renderComponent(RsvpStatusBadge, {
          rsvp: null,
          showNotGoing: true,
        });
        const notGoingBadge = findByTestId(notGoingResult.current, "rsvp-status-badge");
        expect(notGoingBadge).toBeTruthy();
        expect(getTextContent(notGoingBadge)).toContain("Not Going");

        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it("does not call getRsvpDisplayState with raw event or null resolution", () => {
      const spy = vi.spyOn(eventRsvpsModule, "getRsvpDisplayState");
      try {
        renderComponent(RsvpStatusBadge, {
          resolution: null,
          rsvp: sampleRsvp,
        });
        renderComponent(RsvpStatusBadge, {
          event: sampleEvent,
          rsvp: sampleRsvp,
        });
        expect(spy).not.toHaveBeenCalled();

        renderComponent(RsvpStatusBadge, {
          resolution: { status: "available", event: sampleEvent, error: null },
          rsvp: sampleRsvp,
        });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({ status: "available", event: sampleEvent }),
          sampleRsvp,
          undefined
        );
      } finally {
        spy.mockRestore();
      }
    });

    it("derives display state dynamically when passed an EventResolution with status 'available'", () => {
      const resolution = {
        status: "available",
        event: sampleEvent,
        error: null,
      };
      const { result } = renderComponent(RsvpStatusBadge, {
        resolution,
        rsvp: sampleRsvp,
        referenceDate: new Date(),
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Going");
    });

    it("derives 'Went' when passed an EventResolution for a completed event", () => {
      const pastEvent = {
        ...sampleEvent,
        startAt: new Date(Date.now() - 7200000).toISOString(),
        endAt: new Date(Date.now() - 3600000).toISOString(),
      };
      const resolution = {
        status: "available",
        event: pastEvent,
        error: null,
      };
      const { result } = renderComponent(RsvpStatusBadge, {
        resolution,
        rsvp: sampleRsvp,
        referenceDate: new Date(),
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Went");
    });

    it("derives 'Cancelled' when passed an EventResolution for a cancelled event", () => {
      const cancelledEvent = { ...sampleEvent, status: EVENT_STATUSES.CANCELLED };
      const resolution = {
        status: "available",
        event: cancelledEvent,
        error: null,
      };
      const { result } = renderComponent(RsvpStatusBadge, {
        resolution,
        rsvp: sampleRsvp,
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Cancelled");
    });

    it("derives 'Unavailable' when passed an inaccessible EventResolution", () => {
      const resolution = {
        status: "inaccessible",
        event: null,
        error: null,
      };
      const { result } = renderComponent(RsvpStatusBadge, {
        resolution,
        rsvp: sampleRsvp,
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Unavailable");
    });

    it("derives 'Unavailable' when passed an error EventResolution", () => {
      const resolution = {
        status: "error",
        event: null,
        error: new Error("Network timeout"),
      };
      const { result } = renderComponent(RsvpStatusBadge, {
        resolution,
        rsvp: sampleRsvp,
      });
      const badge = findByTestId(result.current, "rsvp-status-badge");
      expect(badge).toBeTruthy();
      expect(getTextContent(badge)).toContain("Unavailable");
    });

    describe("malformed resolution handling", () => {
      it("does not call getRsvpDisplayState when passed malformed resolution objects and preserves basic RSVP fallback", () => {
        const spy = vi.spyOn(eventRsvpsModule, "getRsvpDisplayState");
        try {
          const malformedResolutions = [
            // Missing fields or recognized status alone
            { status: "available" },
            { status: "inaccessible" },
            { status: "error" },
            // available with null event
            { status: "available", event: null, error: null },
            // available with non-null error
            { status: "available", event: sampleEvent, error: "not-null-error" },
            // inaccessible with non-null event
            { status: "inaccessible", event: sampleEvent, error: null },
            // inaccessible with non-null error
            { status: "inaccessible", event: null, error: new Error("oops") },
            // error without an actual Error instance
            { status: "error", event: null, error: null },
            { status: "error", event: null, error: "string error" },
            // error with non-null event
            { status: "error", event: sampleEvent, error: new Error("oops") },
            // unrecognized status
            { status: "unrecognized", event: sampleEvent, error: null },
            // primitives, arrays, raw events
            "available",
            123,
            [],
            sampleEvent,
          ];

          for (const malformed of malformedResolutions) {
            // When user has an RSVP, renders Going via basic presence without calling getRsvpDisplayState
            const { result: goingResult } = renderComponent(RsvpStatusBadge, {
              resolution: malformed,
              rsvp: sampleRsvp,
            });
            const goingBadge = findByTestId(goingResult.current, "rsvp-status-badge");
            expect(goingBadge).toBeTruthy();
            expect(getTextContent(goingBadge)).toContain("Going");

            // When user does not have an RSVP, renders Not Going via basic presence without calling getRsvpDisplayState
            const { result: notGoingResult } = renderComponent(RsvpStatusBadge, {
              resolution: malformed,
              rsvp: null,
              showNotGoing: true,
            });
            const notGoingBadge = findByTestId(notGoingResult.current, "rsvp-status-badge");
            expect(notGoingBadge).toBeTruthy();
            expect(getTextContent(notGoingBadge)).toContain("Not Going");
          }

          // In all iterations, getRsvpDisplayState was NEVER called
          expect(spy).not.toHaveBeenCalled();
        } finally {
          spy.mockRestore();
        }
      });
    });
  });

  // =========================================================================
  // 2. EventRsvpButton Component Tests
  // =========================================================================
  describe("EventRsvpButton Component", () => {
    it("renders enabled 'RSVP' button when user is not going to upcoming published event", () => {
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: sampleEvent,
        isGoing: false,
        isLoading: false,
        isMutating: false,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button).toBeTruthy();
      expect(button.props.disabled).toBe(false);
      expect(button.props.variant).toBe("primary");
      expect(getTextContent(button)).toContain("RSVP");
    });

    it("renders enabled 'Cancel RSVP' button when user is already going", () => {
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: sampleEvent,
        isGoing: true,
        isLoading: false,
        isMutating: false,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button).toBeTruthy();
      expect(button.props.disabled).toBe(false);
      expect(button.props.variant).toBe("outline");
      expect(getTextContent(button)).toContain("Cancel RSVP");
    });

    it("executes onRsvp callback when 'RSVP' is clicked", async () => {
      const onRsvpMock = vi.fn().mockResolvedValue(undefined);
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: sampleEvent,
        isGoing: false,
        onRsvp: onRsvpMock,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      await act(async () => {
        await button.props.onClick();
      });
      expect(onRsvpMock).toHaveBeenCalledTimes(1);
    });

    it("executes onCancel callback when 'Cancel RSVP' is clicked", async () => {
      const onCancelMock = vi.fn().mockResolvedValue(undefined);
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: sampleEvent,
        isGoing: true,
        onCancel: onCancelMock,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      await act(async () => {
        await button.props.onClick();
      });
      expect(onCancelMock).toHaveBeenCalledTimes(1);
    });

    it("disables button and displays loading spinner when isMutating is true", () => {
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: sampleEvent,
        isGoing: false,
        isMutating: true,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button.props.disabled).toBe(true);
      expect(button.props.loading).toBe(true);
      expect(button.props.loadingText).toBe("Registering...");
    });

    it("shows 'Cancelling...' loadingText when isMutating is true while isGoing", () => {
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: sampleEvent,
        isGoing: true,
        isMutating: true,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button.props.loadingText).toBe("Cancelling...");
    });

    it("disables button with reason 'Sign in to RSVP' when user is unauthenticated", () => {
      mocks.useAuth.mockReturnValue({ user: null });
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: sampleEvent,
        isGoing: false,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button.props.disabled).toBe(true);

      const reason = findByTestId(result.current, "rsvp-disabled-reason");
      expect(reason).toBeTruthy();
      expect(getTextContent(reason)).toBe("Sign in to RSVP");
    });

    it("disables button with reason 'Registration closed — event has been cancelled' when cancelled and not going", () => {
      const cancelledEvent = { ...sampleEvent, status: EVENT_STATUSES.CANCELLED };
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: cancelledEvent,
        isGoing: false,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button.props.disabled).toBe(true);

      const reason = findByTestId(result.current, "rsvp-disabled-reason");
      expect(getTextContent(reason)).toBe("Registration closed — event has been cancelled");
    });

    it("allows cancellation when event has been cancelled and student is already going", () => {
      const cancelledEvent = { ...sampleEvent, status: EVENT_STATUSES.CANCELLED };
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: cancelledEvent,
        isGoing: true,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button.props.disabled).toBe(false);
      expect(getTextContent(button)).toContain("Cancel RSVP");
    });

    it("disables button with reason 'Event has ended' when event has ended and not going", () => {
      const pastEvent = {
        ...sampleEvent,
        startAt: new Date(Date.now() - 7200000).toISOString(),
        endAt: new Date(Date.now() - 3600000).toISOString(),
      };
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: pastEvent,
        isGoing: false,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button.props.disabled).toBe(true);

      const reason = findByTestId(result.current, "rsvp-disabled-reason");
      expect(getTextContent(reason)).toBe("Event has ended");
    });

    it("allows existing RSVP removal when event has ended and student is already going", () => {
      const pastEvent = {
        ...sampleEvent,
        startAt: new Date(Date.now() - 7200000).toISOString(),
        endAt: new Date(Date.now() - 3600000).toISOString(),
      };
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: pastEvent,
        isGoing: true,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button.props.disabled).toBe(false);
      expect(getTextContent(button)).toContain("Cancel RSVP");
    });

    it("executes onCancel callback when 'Cancel RSVP' is clicked on an ended event", async () => {
      const pastEvent = {
        ...sampleEvent,
        startAt: new Date(Date.now() - 7200000).toISOString(),
        endAt: new Date(Date.now() - 3600000).toISOString(),
      };
      const onCancelMock = vi.fn().mockResolvedValue(undefined);
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: pastEvent,
        isGoing: true,
        onCancel: onCancelMock,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      await act(async () => {
        await button.props.onClick();
      });
      expect(onCancelMock).toHaveBeenCalledTimes(1);
    });

    it("disables button with reason 'Registration closed — event has started' when ongoing and not going", () => {
      const ongoingEvent = {
        ...sampleEvent,
        startAt: new Date(Date.now() - 1800000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
      };
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: ongoingEvent,
        isGoing: false,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button.props.disabled).toBe(true);

      const reason = findByTestId(result.current, "rsvp-disabled-reason");
      expect(getTextContent(reason)).toBe("Registration closed — event has started");
    });

    it("disables button with reason 'Event is unavailable' when availability is inaccessible and not going", () => {
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: null,
        availability: "inaccessible",
        isGoing: false,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button.props.disabled).toBe(true);

      const reason = findByTestId(result.current, "rsvp-disabled-reason");
      expect(getTextContent(reason)).toBe("Event is unavailable");
    });

    it("allows existing RSVP removal when event is unavailable and student is going", () => {
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: null,
        availability: "inaccessible",
        isGoing: true,
      });
      const button = findByTestId(result.current, "event-rsvp-button");
      expect(button.props.disabled).toBe(false);
      expect(getTextContent(button)).toContain("Cancel RSVP");
    });

    it("renders mutation error message with data-testid='rsvp-error' when error occurs", () => {
      const { result } = renderComponent(EventRsvpButton, {
        eventId: "evt-ai-summit",
        event: sampleEvent,
        isGoing: false,
        error: "Network connection lost. Please retry.",
      });
      const errorMsg = findByTestId(result.current, "rsvp-error");
      expect(errorMsg).toBeTruthy();
      expect(getTextContent(errorMsg)).toBe("Network connection lost. Please retry.");
    });
  });

  // =========================================================================
  // 3. EventAttendeePreview Component Tests
  // =========================================================================
  describe("EventAttendeePreview Component", () => {
    it("renders loading skeleton when isLoading is true", () => {
      const { result } = renderComponent(EventAttendeePreview, {
        eventId: "evt-ai-summit",
        isLoading: true,
      });
      const loading = findByTestId(result.current, "event-attendees-loading");
      expect(loading).toBeTruthy();
    });

    it("renders empty state 'Be the first to RSVP' when count is 0", () => {
      const { result } = renderComponent(EventAttendeePreview, {
        eventId: "evt-ai-summit",
        attendees: [],
        count: 0,
        isLoading: false,
      });
      const empty = findByTestId(result.current, "event-attendees-empty");
      expect(empty).toBeTruthy();
      expect(getTextContent(empty)).toContain("Be the first to RSVP");
    });

    it("renders '1 going' when count is 1", () => {
      const { result } = renderComponent(EventAttendeePreview, {
        eventId: "evt-ai-summit",
        attendees: [{ id: "r1", userId: "u1" }],
        count: 1,
        hasMore: false,
        isLoading: false,
      });
      const countEl = findByTestId(result.current, "event-attendee-count");
      expect(countEl).toBeTruthy();
      expect(getTextContent(countEl)).toBe("1 going");
    });

    it("renders 'N going' and avatars when count is between 2 and 8", () => {
      const attendees = [
        { id: "r1", userId: "u1" },
        { id: "r2", userId: "u2" },
        { id: "r3", userId: "u3" },
      ];
      const { result } = renderComponent(EventAttendeePreview, {
        eventId: "evt-ai-summit",
        attendees,
        count: 3,
        hasMore: false,
        isLoading: false,
      });
      const countEl = findByTestId(result.current, "event-attendee-count");
      expect(getTextContent(countEl)).toBe("3 going");

      const avatars = findByTestId(result.current, "attendee-avatars");
      expect(avatars).toBeTruthy();
      expect(findByTestId(result.current, "attendee-avatar-u1")).toBeTruthy();
      expect(findByTestId(result.current, "attendee-avatar-u2")).toBeTruthy();
      expect(findByTestId(result.current, "attendee-avatar-u3")).toBeTruthy();
    });

    it("caps avatars at 8 and renders overflow indicator when count exceeds 8", () => {
      const attendees = Array.from({ length: 12 }, (_, i) => ({
        id: `r${i}`,
        userId: `u${i}`,
      }));
      const { result } = renderComponent(EventAttendeePreview, {
        eventId: "evt-ai-summit",
        attendees,
        count: 12,
        hasMore: false,
        isLoading: false,
      });
      const overflow = findByTestId(result.current, "attendee-overflow");
      expect(overflow).toBeTruthy();
      expect(getTextContent(overflow)).toBe("+4");
    });

    it("renders '50+ going' and overflow pill when hasMore is true", () => {
      const attendees = Array.from({ length: 50 }, (_, i) => ({
        id: `r${i}`,
        userId: `u${i}`,
      }));
      const { result } = renderComponent(EventAttendeePreview, {
        eventId: "evt-ai-summit",
        attendees,
        count: 50,
        hasMore: true,
        isLoading: false,
      });
      const countEl = findByTestId(result.current, "event-attendee-count");
      expect(getTextContent(countEl)).toBe("50+ going");

      const overflow = findByTestId(result.current, "attendee-overflow");
      expect(overflow).toBeTruthy();
      expect(getTextContent(overflow)).toBe("50+");
    });

    it("renders error state when an error occurs", () => {
      const { result } = renderComponent(EventAttendeePreview, {
        eventId: "evt-ai-summit",
        error: "Failed to load attendees",
        isLoading: false,
      });
      const errorEl = findByTestId(result.current, "event-attendees-error");
      expect(errorEl).toBeTruthy();
      expect(getTextContent(errorEl)).toContain("Failed to load attendees");
    });

    it("renders friendly message for permission-denied errors", () => {
      const { result } = renderComponent(EventAttendeePreview, {
        eventId: "evt-ai-summit",
        error: "Missing or insufficient permissions (permission-denied)",
        isLoading: false,
      });
      const errorEl = findByTestId(result.current, "event-attendees-error");
      expect(errorEl).toBeTruthy();
      expect(getTextContent(errorEl)).toContain("Attendee list is not available to you.");
    });
  });

  // =========================================================================
  // 4. EventDetail Integration Tests
  // =========================================================================
  describe("EventDetail Integration", () => {
    it("renders RSVP registration card in the desktop sidebar", () => {
      const { result } = renderComponent(EventDetail);
      const rsvpCard = findByTestId(result.current, "event-rsvp-card");
      expect(rsvpCard).toBeTruthy();
      expect(getTextContent(rsvpCard)).toContain("Registration");
    });

    it("renders sticky bottom mobile RSVP action bar", () => {
      const { result } = renderComponent(EventDetail);
      const mobileBar = findByTestId(result.current, "event-rsvp-mobile-bar");
      expect(mobileBar).toBeTruthy();
      expect(mobileBar.props.className).toContain("lg:hidden");
    });

    it("renders EventRsvpButton and EventAttendeePreview inside the sidebar card", () => {
      const { result } = renderComponent(EventDetail);
      const rsvpCard = findByTestId(result.current, "event-rsvp-card");
      expect(rsvpCard).toBeTruthy();

      const button = findByTestId(rsvpCard, "event-rsvp-button");
      expect(button).toBeTruthy();

      const attendeePreview = findByTestId(rsvpCard, "event-attendees-empty");
      expect(attendeePreview).toBeTruthy();
    });

    it("shows 'Going' status badge when user is attending", () => {
      mocks.useEventRsvp.mockReturnValue({
        rsvp: sampleRsvp,
        isGoing: true,
        isLoading: false,
        isMutating: false,
        error: null,
        rsvpToEvent: vi.fn(),
        cancelRsvp: vi.fn(),
      });
      const { result } = renderComponent(EventDetail);
      const badges = findAllByTestId(result.current, "rsvp-status-badge");
      expect(badges.length).toBeGreaterThanOrEqual(1);
      expect(getTextContent(badges[0])).toContain("Going");
    });

    it("preserves core event detail metadata cards and sponsoring community card", () => {
      const { result } = renderComponent(EventDetail);
      expect(findByTestId(result.current, "event-detail-title")).toBeTruthy();
      expect(findByTestId(result.current, "event-detail-description")).toBeTruthy();
      expect(findByTestId(result.current, "event-sponsoring-community-card")).toBeTruthy();
      expect(findByTestId(result.current, "event-meta-card")).toBeTruthy();
    });

    it("passes strict EventResolution to RsvpStatusBadge in EventDetail", () => {
      mocks.useEvent.mockReturnValue({
        event: sampleEvent,
        availability: "available",
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      mocks.useEventRsvp.mockReturnValue({
        rsvp: sampleRsvp,
        isGoing: true,
        isLoading: false,
        isMutating: false,
        error: null,
        rsvpToEvent: vi.fn(),
        cancelRsvp: vi.fn(),
      });
      const { result } = renderComponent(EventDetail);
      const badges = findAllByTestId(result.current, "rsvp-status-badge");
      expect(badges.length).toBeGreaterThanOrEqual(1);
      expect(getTextContent(badges[0])).toContain("Going");
    });

    it("does not synthesize available EventResolution when availability is unrecognized or null even if event is present", () => {
      const spy = vi.spyOn(eventRsvpsModule, "getRsvpDisplayState");
      try {
        mocks.useEvent.mockReturnValue({
          event: sampleEvent,
          availability: null,
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        });
        mocks.useEventRsvp.mockReturnValue({
          rsvp: sampleRsvp,
          isGoing: true,
          isLoading: false,
          isMutating: false,
          error: null,
          rsvpToEvent: vi.fn(),
          cancelRsvp: vi.fn(),
        });
        const { result } = renderComponent(EventDetail);
        const badges = findAllByTestId(result.current, "rsvp-status-badge");
        expect(badges.length).toBeGreaterThanOrEqual(1);
        expect(getTextContent(badges[0])).toContain("Going");
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });
});
