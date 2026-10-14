import { describe, expect, it, vi } from "vitest";
import React from "react";
import NotificationItem from "../../src/components/notifications/NotificationItem.jsx";
import { renderHook } from "./hookTestUtils.js";

// Recursive search helpers for React element trees
function findInTree(element, predicate) {
  if (!element || typeof element !== "object") return null;
  if (predicate(element)) return element;
  if (element.props) {
    for (const key of Object.keys(element.props)) {
      const val = element.props[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          const found = findInTree(child, predicate);
          if (found) return found;
        }
      } else if (val && typeof val === "object" && React.isValidElement(val)) {
        const found = findInTree(val, predicate);
        if (found) return found;
      }
    }
  }
  return null;
}

function getTextContent(element) {
  if (element == null) return "";
  if (typeof element === "string" || typeof element === "number") return String(element);
  if (Array.isArray(element)) return element.map(getTextContent).join("");
  if (element.props && element.props.children) return getTextContent(element.props.children);
  return "";
}

function renderNotificationItem(props) {
  const { result } = renderHook(() => NotificationItem(props));
  return result.current;
}

describe("Milestone 23.4 — Notification UX & Presentation Tests", () => {
  const baseActor = {
    actorId: "actor-123",
    actorName: "Jane Doe",
    actorAvatar: "https://example.com/avatar.jpg",
    createdAt: new Date(),
    isRead: false,
  };

  describe("NotificationItem Component", () => {
    it("renders event_rsvp notification with actor name, durable title, and View Event link", () => {
      const notification = {
        ...baseActor,
        id: "rsvp_evt-1_actor-123",
        type: "event_rsvp",
        referenceId: "evt-1",
        referenceTitle: "Autonomous Systems Hackathon",
      };

      const tree = renderNotificationItem({
        notification,
        currentUid: "recipient-456",
        onMarkAsRead: vi.fn(),
        onDelete: vi.fn(),
      });

      const text = getTextContent(tree);
      expect(text).toContain("Jane Doe");
      expect(text).toContain("RSVP'd to your event");
      expect(text).toContain("Autonomous Systems Hackathon");

      // Verify View Event link points to /events/evt-1
      const viewEventLink = findInTree(
        tree,
        (el) => el?.props?.["data-testid"] === `notif-view-event-${notification.id}`
      );
      expect(viewEventLink).not.toBeNull();
      expect(viewEventLink.props.to).toBe("/events/evt-1");
    });

    it("renders event_rsvp fallback cleanly when referenceTitle is missing or null", () => {
      const notification = {
        ...baseActor,
        id: "rsvp_evt-2_actor-123",
        type: "event_rsvp",
        referenceId: "evt-2",
        referenceTitle: null,
      };

      const tree = renderNotificationItem({
        notification,
        currentUid: "recipient-456",
        onMarkAsRead: vi.fn(),
        onDelete: vi.fn(),
      });

      const text = getTextContent(tree);
      expect(text).toContain("Jane Doe");
      expect(text).toContain("RSVP'd to your event session.");

      const viewEventLink = findInTree(
        tree,
        (el) => el?.props?.["data-testid"] === `notif-view-event-${notification.id}`
      );
      expect(viewEventLink).not.toBeNull();
      expect(viewEventLink.props.to).toBe("/events/evt-2");
    });

    it("renders event_cancelled notification with actor name, durable title, and View Event link", () => {
      const notification = {
        ...baseActor,
        id: "cancel_evt-3_cycle-abc",
        type: "event_cancelled",
        referenceId: "evt-3",
        referenceTitle: "Spring Robotics Showcase",
      };

      const tree = renderNotificationItem({
        notification,
        currentUid: "recipient-456",
        onMarkAsRead: vi.fn(),
        onDelete: vi.fn(),
      });

      const text = getTextContent(tree);
      expect(text).toContain("Jane Doe");
      expect(text).toContain("was cancelled by");
      expect(text).toContain("Spring Robotics Showcase");

      const viewEventLink = findInTree(
        tree,
        (el) => el?.props?.["data-testid"] === `notif-view-event-${notification.id}`
      );
      expect(viewEventLink).not.toBeNull();
      expect(viewEventLink.props.to).toBe("/events/evt-3");
    });

    it("renders event_cancelled fallback cleanly when referenceTitle is missing", () => {
      const notification = {
        ...baseActor,
        id: "cancel_evt-4_cycle-def",
        type: "event_cancelled",
        referenceId: "evt-4",
      };

      const tree = renderNotificationItem({
        notification,
        currentUid: "recipient-456",
        onMarkAsRead: vi.fn(),
        onDelete: vi.fn(),
      });

      const text = getTextContent(tree);
      expect(text).toContain("Jane Doe");
      expect(text).toContain("The event session was cancelled by Jane Doe.");
    });

    it("renders event_cancelled fallback gracefully when actorName is missing or empty", () => {
      const notification = {
        ...baseActor,
        actorName: "   ",
        id: "cancel_evt-fallback_cycle-xyz",
        type: "event_cancelled",
        referenceId: "evt-fallback",
        referenceTitle: "Design Critique",
      };

      const tree = renderNotificationItem({
        notification,
        currentUid: "recipient-456",
        onMarkAsRead: vi.fn(),
        onDelete: vi.fn(),
      });

      const text = getTextContent(tree);
      expect(text).toContain("The event “Design Critique” was cancelled by an organizer.");
    });

    it("renders event_cancelled fallback gracefully when actorName and actorId are null", () => {
      const notification = {
        ...baseActor,
        actorId: null,
        actorName: null,
        id: "cancel_evt-null-actor_cycle-xyz",
        type: "event_cancelled",
        referenceId: "evt-null-actor",
        referenceTitle: "Global AI Summit",
      };

      const tree = renderNotificationItem({
        notification,
        currentUid: "recipient-456",
        onMarkAsRead: vi.fn(),
        onDelete: vi.fn(),
      });

      const text = getTextContent(tree);
      expect(text).toContain("The event “Global AI Summit” was cancelled by an organizer.");
    });

    it("preserves unread indicator dot and triggers onMarkAsRead handler", () => {
      const onMarkAsRead = vi.fn();
      const notification = {
        ...baseActor,
        id: "cancel_evt-5_cycle-ghi",
        type: "event_cancelled",
        referenceId: "evt-5",
        isRead: false,
      };

      const tree = renderNotificationItem({
        notification,
        currentUid: "recipient-456",
        onMarkAsRead,
        onDelete: vi.fn(),
      });

      // Find unread dot
      const unreadDot = findInTree(
        tree,
        (el) => el?.props?.title === "Unread notification"
      );
      expect(unreadDot).not.toBeNull();

      // Find mark as read button
      const markAsReadBtn = findInTree(
        tree,
        (el) => el?.type === "button" && el?.props?.title === "Mark as read"
      );
      expect(markAsReadBtn).not.toBeNull();
      markAsReadBtn.props.onClick();
      expect(onMarkAsRead).toHaveBeenCalledWith("cancel_evt-5_cycle-ghi");
    });

    it("omits mark as read button when notification is already read", () => {
      const notification = {
        ...baseActor,
        id: "cancel_evt-6_cycle-jkl",
        type: "event_cancelled",
        referenceId: "evt-6",
        isRead: true,
      };

      const tree = renderNotificationItem({
        notification,
        currentUid: "recipient-456",
        onMarkAsRead: vi.fn(),
        onDelete: vi.fn(),
      });

      const unreadDot = findInTree(
        tree,
        (el) => el?.props?.title === "Unread notification"
      );
      expect(unreadDot).toBeNull();

      const markAsReadBtn = findInTree(
        tree,
        (el) => el?.type === "button" && el?.props?.title === "Mark as read"
      );
      expect(markAsReadBtn).toBeNull();
    });

    it("triggers onDelete dismissal handler when dismiss button is clicked", () => {
      const onDelete = vi.fn();
      const notification = {
        ...baseActor,
        id: "rsvp_evt-7_actor-123",
        type: "event_rsvp",
        referenceId: "evt-7",
      };

      const tree = renderNotificationItem({
        notification,
        currentUid: "recipient-456",
        onMarkAsRead: vi.fn(),
        onDelete,
      });

      const dismissBtn = findInTree(
        tree,
        (el) => el?.type === "button" && el?.props?.title === "Dismiss notification"
      );
      expect(dismissBtn).not.toBeNull();
      dismissBtn.props.onClick();
      expect(onDelete).toHaveBeenCalledWith("rsvp_evt-7_actor-123");
    });

    it("keeps existing connection notification behaviors intact", () => {
      const reqNotif = {
        ...baseActor,
        id: "req_conn-123",
        type: "connection_request",
      };
      const reqTree = renderNotificationItem({
        notification: reqNotif,
        currentUid: "recipient-456",
        onMarkAsRead: vi.fn(),
        onDelete: vi.fn(),
      });
      expect(getTextContent(reqTree)).toContain("sent you a connection request.");

      const accNotif = {
        ...baseActor,
        id: "acc_conn-123",
        type: "connection_accepted",
      };
      const accTree = renderNotificationItem({
        notification: accNotif,
        currentUid: "recipient-456",
        onMarkAsRead: vi.fn(),
        onDelete: vi.fn(),
      });
      expect(getTextContent(accTree)).toContain("accepted your connection request.");
    });
  });
});
