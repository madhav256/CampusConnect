/**
 * Milestone 24 — Unit 24.2: Capacity & Waitlist UI Component Tests
 *
 * Tests for CapacityIndicator, SeatClaimBanner, and WaitlistModal components.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act } from "./hookTestUtils";

// Hoisted Hook Mocks
const mocks = vi.hoisted(() => ({
  useEventCapacity: vi.fn(() => ({
    coordinator: null,
    metrics: {},
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
  useEventWaitlist: vi.fn(() => ({
    member: null,
    slot: null,
    coordinator: null,
    isOnWaitlist: false,
    isWaiting: false,
    isOffered: false,
    queuePosition: null,
    timeRemainingMs: 0,
    loading: false,
    error: null,
    join: vi.fn(),
    leave: vi.fn(),
    claim: vi.fn(),
    decline: vi.fn(),
  })),
}));

vi.mock("../../src/hooks/useEventCapacity.js", () => ({
  useEventCapacity: mocks.useEventCapacity,
}));

vi.mock("../../src/hooks/useEventWaitlist.js", () => ({
  useEventWaitlist: mocks.useEventWaitlist,
}));

// Tree search helpers
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

function getTextContent(element) {
  if (!element) return "";
  if (typeof element === "string" || typeof element === "number") return String(element);
  if (Array.isArray(element)) return element.map(getTextContent).join("");
  if (element.props?.children) return getTextContent(element.props.children);
  return "";
}

function renderComponent(Component, props = {}) {
  const { result } = renderHook(() => Component(props));
  return { result };
}

import CapacityIndicator from "../../src/components/events/CapacityIndicator.jsx";
import SeatClaimBanner from "../../src/components/events/SeatClaimBanner.jsx";
import WaitlistModal from "../../src/components/events/WaitlistModal.jsx";

describe("Milestone 24 — Unit 24.2: Capacity & Waitlist UI Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("CapacityIndicator Component", () => {
    it("renders uncapped state when event has no capacity limit", () => {
      const { result } = renderComponent(CapacityIndicator, {
        event: { id: "evt-uncapped", capacity: null, confirmedCount: 40 },
      });

      const indicatorEl = findByTestId(result.current, "capacity-indicator");
      expect(indicatorEl).not.toBeNull();
      const textEl = findByTestId(result.current, "capacity-uncapped-text");
      expect(textEl?.props?.children).toBe("Open Event (Uncapped)");
    });

    it("renders progress bar and counts for capped coordinated events", () => {
      const { result } = renderComponent(CapacityIndicator, {
        event: { id: "evt-capped", capacity: 100, confirmedCount: 45 },
        coordinator: {
          capacity: 100,
          confirmedCount: 45,
          offeredCount: 5,
          waitlistCount: 12,
        },
      });

      const indicator = findByTestId(result.current, "capacity-indicator");
      expect(indicator).not.toBeNull();

      const counts = findByTestId(result.current, "capacity-count-text");
      expect(counts).not.toBeNull();
      expect(getTextContent(counts)).toContain("50 / 100 seats filled"); // 45 confirmed + 5 offered = 50 allocated

      const offeredCount = findByTestId(result.current, "capacity-offered-count");
      expect(offeredCount).not.toBeNull();
      expect(getTextContent(offeredCount)).toContain("5 reserved");

      const waitlistBadge = findByTestId(result.current, "capacity-waitlist-badge");
      expect(waitlistBadge).not.toBeNull();
      expect(getTextContent(waitlistBadge)).toContain("12 on waitlist");

      const progressBar = findByTestId(result.current, "capacity-progress-bar");
      expect(progressBar?.props?.style?.width).toBe("50%");
    });

    it("renders full badge when allocated seats meet or exceed capacity", () => {
      const { result } = renderComponent(CapacityIndicator, {
        event: { id: "evt-full", capacity: 50, confirmedCount: 50 },
        coordinator: {
          capacity: 50,
          confirmedCount: 50,
          offeredCount: 0,
          waitlistCount: 0,
        },
      });

      const fullBadge = findByTestId(result.current, "capacity-full-badge");
      expect(fullBadge).not.toBeNull();
      expect(getTextContent(fullBadge)).toContain("Full");
    });
  });

  describe("SeatClaimBanner Component", () => {
    it("renders nothing when isOffered is false", () => {
      const { result } = renderComponent(SeatClaimBanner, {
        isOffered: false,
      });

      expect(result.current).toBeNull();
    });

    it("renders celebratory offer banner with live timer when isOffered is true", () => {
      const onClaim = vi.fn();
      const onDecline = vi.fn();

      const { result } = renderComponent(SeatClaimBanner, {
        isOffered: true,
        timeRemainingMs: 3661000, // 01:01:01
        onClaim,
        onDecline,
      });

      const banner = findByTestId(result.current, "seat-claim-banner");
      expect(banner).not.toBeNull();

      const timer = findByTestId(result.current, "seat-claim-countdown");
      expect(timer).not.toBeNull();
      expect(timer.props.children).toBe("01:01:01");

      const claimBtn = findByTestId(result.current, "claim-seat-button");
      expect(claimBtn).not.toBeNull();

      act(() => {
        claimBtn.props.onClick();
      });
      expect(onClaim).toHaveBeenCalled();
    });

    it("prompts for confirmation before declining seat", () => {
      const onDecline = vi.fn();

      const { result } = renderComponent(SeatClaimBanner, {
        isOffered: true,
        timeRemainingMs: 60000,
        onDecline,
      });

      const declineBtn = findByTestId(result.current, "decline-seat-button");
      expect(declineBtn).not.toBeNull();

      // Click decline -> shows confirmation modal
      act(() => {
        declineBtn.props.onClick();
      });

      const confirmBtn = findByTestId(result.current, "confirm-decline-button");
      expect(confirmBtn).not.toBeNull();

      act(() => {
        confirmBtn.props.onClick();
      });
      expect(onDecline).toHaveBeenCalled();
    });
  });

  describe("WaitlistModal Component", () => {
    it("renders nothing when isOpen is false", () => {
      const { result } = renderComponent(WaitlistModal, {
        isOpen: false,
      });

      expect(result.current).toBeNull();
    });

    it("renders join view with estimated position and 24h offer disclaimer", () => {
      const onJoin = vi.fn();
      const { result } = renderComponent(WaitlistModal, {
        isOpen: true,
        isOnWaitlist: false,
        coordinator: { headSequence: 1, nextSequence: 5 },
        onJoin,
      });

      const modal = findByTestId(result.current, "waitlist-modal");
      expect(modal).not.toBeNull();

      const title = findByTestId(result.current, "waitlist-modal-title");
      expect(title.props.children).toBe("Join Event Waitlist");

      const positionText = findByTestId(result.current, "estimated-queue-position");
      expect(getTextContent(positionText)).toBe("#5"); // nextSeq 5 - headSeq 1 + 1 = 5

      const joinBtn = findByTestId(result.current, "join-waitlist-button");
      expect(joinBtn).not.toBeNull();

      act(() => {
        joinBtn.props.onClick();
      });
      expect(onJoin).toHaveBeenCalled();
    });

    it("renders status view with relative queue position and leave option", () => {
      const onLeave = vi.fn();
      const { result } = renderComponent(WaitlistModal, {
        isOpen: true,
        isOnWaitlist: true,
        queuePosition: 2,
        onLeave,
      });

      const title = findByTestId(result.current, "waitlist-modal-title");
      expect(title.props.children).toBe("Your Waitlist Status");

      const positionText = findByTestId(result.current, "waitlist-queue-position");
      expect(getTextContent(positionText)).toBe("#2");

      const leaveBtn = findByTestId(result.current, "leave-waitlist-button");
      expect(leaveBtn).not.toBeNull();

      // Click leave -> triggers confirmation prompt
      act(() => {
        leaveBtn.props.onClick();
      });

      const confirmLeaveBtn = findByTestId(result.current, "confirm-leave-waitlist-button");
      expect(confirmLeaveBtn).not.toBeNull();

      act(() => {
        confirmLeaveBtn.props.onClick();
      });
      expect(onLeave).toHaveBeenCalled();
    });
  });
});
