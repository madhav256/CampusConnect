/**
 * Milestone 22 — Unit 22.4: Event Management UI Component Tests
 *
 * Comprehensive unit tests for:
 * 1. EventManagementToolbar (role badges, ongoing indicators, permission-gated buttons, concurrency locks, errors)
 * 2. EventEditModal (adaptive locks, sparse patch construction, omission of unchanged dates, validation)
 * 3. EventCancelModal (cancellation disclaimers, confirmation trigger, zero notification claims)
 * 4. EventRepublishModal (republication confirmation, feed restoration)
 * 5. EventDeleteModal (destruction warnings, orphan RSVP guidance, confirmation trigger)
 * 6. EventDetail Integration (permission integration, modal lifecycles, and post-deletion navigation)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import {
  APEX_CAMPUS_ID,
} from "../../src/constants.js";
import {
  EVENT_AI_HACKATHON,
  EVENT_DESIGN_SPRINT,
  UPCOMING_MUTABLE_FIELDS,
  ONGOING_MUTABLE_FIELDS,
} from "../../src/data/events.js";
import { renderHook, act } from "./hookTestUtils";

// Hoisted Mocks
const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useNavigate: vi.fn(),
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  useNotifications: vi.fn(() => ({ unreadCount: 0 })),
  useConversations: vi.fn(() => ({ totalUnread: 0 })),
  useEvent: vi.fn(),
  useEventRsvp: vi.fn(() => ({ rsvp: null })),
  useEventManagement: vi.fn(),
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

vi.mock("../../src/hooks/useEventManagement", () => ({
  useEventManagement: (event, explicitUser, explicitCampusId) =>
    mocks.useEventManagement(event, explicitUser, explicitCampusId),
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
import EventManagementToolbar from "../../src/components/events/EventManagementToolbar.jsx";
import EventEditModal from "../../src/components/events/EventEditModal.jsx";
import EventCancelModal from "../../src/components/events/EventCancelModal.jsx";
import EventRepublishModal from "../../src/components/events/EventRepublishModal.jsx";
import EventDeleteModal from "../../src/components/events/EventDeleteModal.jsx";
import EventDetail from "../../src/pages/EventDetail.jsx";

describe("Milestone 22 — Unit 22.4: Event Management UI", () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    mocks.useNavigate.mockReturnValue(mockNavigate);
    mocks.useParams.mockReturnValue({ eventId: "event-ai-hackathon" });
    mocks.useAuth.mockReturnValue({
      user: { uid: "user-admin-1", campusId: APEX_CAMPUS_ID },
      loading: false,
    });
    mocks.useOptionalCampus.mockReturnValue({ campusId: APEX_CAMPUS_ID });
  });

  // =========================================================================
  // 1. EventManagementToolbar Tests
  // =========================================================================
  describe("EventManagementToolbar Component", () => {
    const defaultToolbarProps = {
      event: EVENT_AI_HACKATHON,
      isLeader: true,
      isAdmin: true,
      temporalState: "upcoming",
      isOngoing: false,
      canEdit: true,
      canCancel: true,
      canRepublish: false,
      canDelete: true,
      isMutating: false,
      mutationError: null,
      onClearError: vi.fn(),
      onOpenEdit: vi.fn(),
      onOpenCancel: vi.fn(),
      onOpenRepublish: vi.fn(),
      onOpenDelete: vi.fn(),
    };

    it("renders null when unauthorized (all permission flags false)", () => {
      const { result } = renderComponent(EventManagementToolbar, {
        ...defaultToolbarProps,
        canEdit: false,
        canCancel: false,
        canRepublish: false,
        canDelete: false,
      });
      expect(result.current).toBeNull();
    });

    it("renders null when event has missing or empty communityId", () => {
      const { result } = renderComponent(EventManagementToolbar, {
        ...defaultToolbarProps,
        event: { ...EVENT_AI_HACKATHON, communityId: "" },
      });
      expect(result.current).toBeNull();

      const { result: nullResult } = renderComponent(EventManagementToolbar, {
        ...defaultToolbarProps,
        event: { ...EVENT_AI_HACKATHON, communityId: null },
      });
      expect(nullResult.current).toBeNull();
    });

    it("renders Admin badge, Edit, Cancel, and Delete buttons for upcoming published event", () => {
      const { result } = renderComponent(EventManagementToolbar, defaultToolbarProps);

      expect(findByTestId(result.current, "event-management-toolbar")).not.toBeNull();

      const roleBadge = findByTestId(result.current, "management-role-badge");
      expect(roleBadge).not.toBeNull();
      expect(
        findInReactTree(roleBadge, (el) => el.props?.children === "Community Admin")
      ).not.toBeNull();

      expect(findByTestId(result.current, "manage-edit-btn")).not.toBeNull();
      expect(findByTestId(result.current, "manage-cancel-btn")).not.toBeNull();
      expect(findByTestId(result.current, "manage-delete-btn")).not.toBeNull();
      expect(findByTestId(result.current, "manage-republish-btn")).toBeNull();
    });

    it("renders Moderator badge and omits Delete button for community moderator", () => {
      const { result } = renderComponent(EventManagementToolbar, {
        ...defaultToolbarProps,
        isAdmin: false,
        isLeader: true,
        canDelete: false,
      });

      const roleBadge = findByTestId(result.current, "management-role-badge");
      expect(
        findInReactTree(roleBadge, (el) => el.props?.children === "Community Moderator")
      ).not.toBeNull();

      expect(findByTestId(result.current, "manage-edit-btn")).not.toBeNull();
      expect(findByTestId(result.current, "manage-cancel-btn")).not.toBeNull();
      expect(findByTestId(result.current, "manage-delete-btn")).toBeNull();
    });

    it("renders Ongoing badge and omits Delete button on ongoing events", () => {
      const { result } = renderComponent(EventManagementToolbar, {
        ...defaultToolbarProps,
        temporalState: "ongoing",
        isOngoing: true,
        canDelete: false,
      });

      expect(findByTestId(result.current, "management-ongoing-badge")).not.toBeNull();
      expect(findByTestId(result.current, "manage-edit-btn")).not.toBeNull();
      expect(findByTestId(result.current, "manage-cancel-btn")).not.toBeNull();
      expect(findByTestId(result.current, "manage-delete-btn")).toBeNull();
    });

    it("renders Republish and Delete buttons for cancelled upcoming events", () => {
      const { result } = renderComponent(EventManagementToolbar, {
        ...defaultToolbarProps,
        canEdit: false,
        canCancel: false,
        canRepublish: true,
        canDelete: true,
      });

      expect(findByTestId(result.current, "manage-republish-btn")).not.toBeNull();
      expect(findByTestId(result.current, "manage-delete-btn")).not.toBeNull();
      expect(findByTestId(result.current, "manage-edit-btn")).toBeNull();
      expect(findByTestId(result.current, "manage-cancel-btn")).toBeNull();
    });

    it("disables all action buttons and shows mutating indicator when isMutating is true", () => {
      const { result } = renderComponent(EventManagementToolbar, {
        ...defaultToolbarProps,
        isMutating: true,
      });

      expect(findByTestId(result.current, "management-mutating-indicator")).not.toBeNull();

      const editBtn = findByTestId(result.current, "manage-edit-btn");
      expect(editBtn.props.disabled).toBe(true);

      const cancelBtn = findByTestId(result.current, "manage-cancel-btn");
      expect(cancelBtn.props.disabled).toBe(true);

      const deleteBtn = findByTestId(result.current, "manage-delete-btn");
      expect(deleteBtn.props.disabled).toBe(true);
    });

    it("renders mutation error alert and calls onClearError on dismiss", () => {
      const onClearError = vi.fn();
      const { result } = renderComponent(EventManagementToolbar, {
        ...defaultToolbarProps,
        mutationError: "Firestore write permission denied.",
        onClearError,
      });

      const errorAlert = findByTestId(result.current, "management-error-alert");
      expect(errorAlert).not.toBeNull();
      expect(
        findInReactTree(errorAlert, (el) =>
          el.props?.children?.includes?.("Firestore write permission denied.")
        )
      ).not.toBeNull();

      const clearBtn = findByTestId(result.current, "management-clear-error-btn");
      expect(clearBtn).not.toBeNull();
      act(() => {
        clearBtn.props.onClick();
      });
      expect(onClearError).toHaveBeenCalledTimes(1);
    });

    it("fires callbacks when management buttons are clicked", () => {
      const onOpenEdit = vi.fn();
      const onOpenCancel = vi.fn();
      const onOpenDelete = vi.fn();

      const { result } = renderComponent(EventManagementToolbar, {
        ...defaultToolbarProps,
        onOpenEdit,
        onOpenCancel,
        onOpenDelete,
      });

      act(() => {
        findByTestId(result.current, "manage-edit-btn").props.onClick();
      });
      expect(onOpenEdit).toHaveBeenCalledTimes(1);

      act(() => {
        findByTestId(result.current, "manage-cancel-btn").props.onClick();
      });
      expect(onOpenCancel).toHaveBeenCalledTimes(1);

      act(() => {
        findByTestId(result.current, "manage-delete-btn").props.onClick();
      });
      expect(onOpenDelete).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 2. EventEditModal Component Tests
  // =========================================================================
  describe("EventEditModal Component", () => {
    const defaultEditProps = {
      isOpen: true,
      onClose: vi.fn(),
      event: EVENT_AI_HACKATHON,
      isOngoing: false,
      isMutating: false,
      onSave: vi.fn(),
    };

    it("returns null when isOpen is false", () => {
      const { result } = renderComponent(EventEditModal, {
        ...defaultEditProps,
        isOpen: false,
      });
      expect(result.current).toBeNull();
    });

    it("populates all 9 mutable fields for upcoming event", () => {
      const { result } = renderComponent(EventEditModal, defaultEditProps);

      expect(findByTestId(result.current, "event-edit-modal")).not.toBeNull();
      expect(findByTestId(result.current, "edit-ongoing-banner")).toBeNull();

      expect(findByTestId(result.current, "edit-title-input").props.value).toBe(EVENT_AI_HACKATHON.title);
      expect(findByTestId(result.current, "edit-slug-input").props.value).toBe(EVENT_AI_HACKATHON.slug);
      expect(findByTestId(result.current, "edit-category-select").props.value).toBe(EVENT_AI_HACKATHON.category);
      expect(findByTestId(result.current, "edit-organizer-input").props.value).toBe(EVENT_AI_HACKATHON.organizerName);
      expect(findByTestId(result.current, "edit-location-input").props.value).toBe(EVENT_AI_HACKATHON.location);
      expect(findByTestId(result.current, "edit-start-at-input").props.value).toBeTruthy();
      expect(findByTestId(result.current, "edit-end-at-input").props.value).toBeTruthy();
      expect(findByTestId(result.current, "edit-image-input").props.value).toBe(EVENT_AI_HACKATHON.imageURL || "");
      expect(findByTestId(result.current, "edit-description-input").props.value).toBe(EVENT_AI_HACKATHON.description);
    });

    it("does not offer unsupported fields like capacity or tags in the form", () => {
      const { result } = renderComponent(EventEditModal, defaultEditProps);

      // Verify no inputs or labels for capacity or tags exist in the modal UI
      expect(findByTestId(result.current, "edit-capacity-input")).toBeNull();
      expect(findByTestId(result.current, "edit-tags-input")).toBeNull();

      const capacityElement = findInReactTree(result.current, (el) =>
        el.props?.name === "capacity" ||
        el.props?.id?.includes?.("capacity") ||
        (typeof el.props?.label === "string" && el.props.label.toLowerCase().includes("capacity"))
      );
      expect(capacityElement).toBeNull();

      const tagsElement = findInReactTree(result.current, (el) =>
        el.props?.name === "tags" ||
        el.props?.id?.includes?.("tags") ||
        (typeof el.props?.label === "string" && el.props.label.toLowerCase().includes("tag"))
      );
      expect(tagsElement).toBeNull();
    });

    it("ensures unsupported fields like capacity or tags never enter update payload even if present on event", async () => {
      const onSave = vi.fn().mockResolvedValue();
      const eventWithExtraFields = {
        ...EVENT_AI_HACKATHON,
        capacity: 200,
        tags: ["ai", "machine-learning"],
        customField: "unauthorized",
      };

      const { result } = renderComponent(EventEditModal, {
        ...defaultEditProps,
        event: eventWithExtraFields,
        onSave,
      });

      // Modify title
      act(() => {
        findByTestId(result.current, "edit-title-input").props.onChange({
          target: { value: "Updated AI Event Title" },
        });
      });

      const form = findByTestId(result.current, "event-edit-form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: vi.fn() });
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      const patch = onSave.mock.calls[0][0];

      // Verifies only genuine changes are in the sparse patch and unsupported fields are excluded
      expect(patch).toEqual({
        title: "Updated AI Event Title",
      });
      expect(patch.capacity).toBeUndefined();
      expect(patch.tags).toBeUndefined();
      expect(patch.customField).toBeUndefined();

      // Confirms all patch keys are strictly a subset of UPCOMING_MUTABLE_FIELDS
      for (const key of Object.keys(patch)) {
        expect(UPCOMING_MUTABLE_FIELDS).toContain(key);
      }
    });

    it("locks title, slug, category, host, and startAt on ongoing events with warning banner", () => {
      const { result } = renderComponent(EventEditModal, {
        ...defaultEditProps,
        isOngoing: true,
      });

      expect(findByTestId(result.current, "edit-ongoing-banner")).not.toBeNull();

      expect(findByTestId(result.current, "edit-title-input").props.disabled).toBe(true);
      expect(findByTestId(result.current, "edit-slug-input").props.disabled).toBe(true);
      expect(findByTestId(result.current, "edit-category-select").props.disabled).toBe(true);
      expect(findByTestId(result.current, "edit-organizer-input").props.disabled).toBe(true);
      expect(findByTestId(result.current, "edit-start-at-input").props.disabled).toBe(true);

      // Permitted fields remain editable
      expect(findByTestId(result.current, "edit-location-input").props.disabled).toBeFalsy();
      expect(findByTestId(result.current, "edit-end-at-input").props.disabled).toBeFalsy();
      expect(findByTestId(result.current, "edit-image-input").props.disabled).toBeFalsy();
      expect(findByTestId(result.current, "edit-description-input").props.disabled).toBeFalsy();
    });

    it("constructs sparse patch omitting untouched fields and dates (Title-only edit)", async () => {
      const onSave = vi.fn().mockResolvedValue();
      const { result } = renderComponent(EventEditModal, {
        ...defaultEditProps,
        onSave,
      });

      // Modify only title
      act(() => {
        findByTestId(result.current, "edit-title-input").props.onChange({
          target: { value: "Updated Hackathon Title" },
        });
      });

      const form = findByTestId(result.current, "event-edit-form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: vi.fn() });
      });

      expect(onSave).toHaveBeenCalledWith({
        title: "Updated Hackathon Title",
      });
      // Verifies dates and other untouched fields are NOT in the sparse patch
      const patch = onSave.mock.calls[0][0];
      expect(patch.startAt).toBeUndefined();
      expect(patch.endAt).toBeUndefined();
      expect(patch.location).toBeUndefined();
      expect(patch.category).toBeUndefined();
    });

    it("constructs sparse patch for ongoing location and endAt extension", async () => {
      const onSave = vi.fn().mockResolvedValue();
      const { result } = renderComponent(EventEditModal, {
        ...defaultEditProps,
        isOngoing: true,
        onSave,
      });

      // Modify location
      act(() => {
        findByTestId(result.current, "edit-location-input").props.onChange({
          target: { value: "Auditorium Wing B" },
        });
      });

      // Extend endAt to a future date beyond current endAt
      const futureExtendedEndAt = new Date(new Date(EVENT_AI_HACKATHON.endAt).getTime() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 16);
      act(() => {
        findByTestId(result.current, "edit-end-at-input").props.onChange({
          target: { value: futureExtendedEndAt },
        });
      });

      const form = findByTestId(result.current, "event-edit-form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: vi.fn() });
      });

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          location: "Auditorium Wing B",
          endAt: expect.any(Date),
        })
      );
      const patch = onSave.mock.calls[0][0];
      expect(patch.title).toBeUndefined();
      expect(patch.startAt).toBeUndefined();
      for (const key of Object.keys(patch)) {
        expect(ONGOING_MUTABLE_FIELDS).toContain(key);
      }
    });

    it("disables save button when no modifications exist", () => {
      const { result } = renderComponent(EventEditModal, defaultEditProps);

      const submitBtn = findByTestId(result.current, "edit-submit-btn");
      expect(submitBtn.props.disabled).toBe(true);
    });

    it("validates that endAt cannot be earlier than startAt on upcoming event", async () => {
      const onSave = vi.fn();
      const { result } = renderComponent(EventEditModal, {
        ...defaultEditProps,
        onSave,
      });

      act(() => {
        findByTestId(result.current, "edit-start-at-input").props.onChange({
          target: { value: "2026-10-15T15:00" },
        });
      });
      act(() => {
        findByTestId(result.current, "edit-end-at-input").props.onChange({
          target: { value: "2026-10-15T12:00" },
        });
      });

      const form = findByTestId(result.current, "event-edit-form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: vi.fn() });
      });

      expect(onSave).not.toHaveBeenCalled();
      const errorMsg = findInReactTree(result.current, (el) =>
        el.props?.children === "End date/time must be at or after start date/time."
      );
      expect(errorMsg).not.toBeNull();
    });

    it("validates that ongoing event end time cannot be shortened", async () => {
      const onSave = vi.fn();
      const { result } = renderComponent(EventEditModal, {
        ...defaultEditProps,
        isOngoing: true,
        onSave,
      });

      // Attempt to set end time earlier than current event endAt
      act(() => {
        findByTestId(result.current, "edit-end-at-input").props.onChange({
          target: { value: "2026-10-10T10:00" },
        });
      });

      const form = findByTestId(result.current, "event-edit-form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: vi.fn() });
      });

      expect(onSave).not.toHaveBeenCalled();
      const errorMsg = findInReactTree(result.current, (el) =>
        el.props?.children === "Ongoing event end time cannot be shortened."
      );
      expect(errorMsg).not.toBeNull();
    });

    it("displays error banner inside modal when onSave rejects", async () => {
      const onSave = vi.fn().mockRejectedValue(new Error("Permission denied by security rule."));
      const { result } = renderComponent(EventEditModal, {
        ...defaultEditProps,
        onSave,
      });

      act(() => {
        findByTestId(result.current, "edit-title-input").props.onChange({
          target: { value: "Renamed Title" },
        });
      });

      const form = findByTestId(result.current, "event-edit-form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: vi.fn() });
      });

      const alertEl = findByTestId(result.current, "edit-error-alert");
      expect(alertEl).not.toBeNull();
      expect(
        findInReactTree(alertEl, (el) =>
          el.props?.children?.includes?.("Permission denied")
        )
      ).not.toBeNull();
    });

    it("calls onClose when cancel button is clicked", () => {
      const onClose = vi.fn();
      const { result } = renderComponent(EventEditModal, {
        ...defaultEditProps,
        onClose,
      });

      act(() => {
        findByTestId(result.current, "edit-cancel-btn").props.onClick();
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 3. EventCancelModal Component Tests
  // =========================================================================
  describe("EventCancelModal Component", () => {
    it("renders cancellation disclaimers with zero notification claims", () => {
      const { result } = renderComponent(EventCancelModal, {
        isOpen: true,
        onClose: vi.fn(),
        event: EVENT_AI_HACKATHON,
        isMutating: false,
        onConfirm: vi.fn(),
      });

      expect(findByTestId(result.current, "event-cancel-modal")).not.toBeNull();
      expect(findByTestId(result.current, "cancel-modal-title")).not.toBeNull();

      // Verify disclaimers present
      const modal = result.current;
      expect(
        findInReactTree(modal, (el) =>
          el.props?.children?.includes?.("Registration closes immediately")
        )
      ).not.toBeNull();
      expect(
        findInReactTree(modal, (el) =>
          el.props?.children?.includes?.("republish this event at any time")
        )
      ).not.toBeNull();

      // Verify ZERO email or push notification claims
      expect(
        findInReactTree(modal, (el) =>
          el.props?.children?.includes?.("email") ||
          el.props?.children?.includes?.("push notification")
        )
      ).toBeNull();
    });

    it("calls onConfirm when confirm button is clicked", async () => {
      const onConfirm = vi.fn().mockResolvedValue();
      const onClose = vi.fn();
      const { result } = renderComponent(EventCancelModal, {
        isOpen: true,
        onClose,
        event: EVENT_AI_HACKATHON,
        isMutating: false,
        onConfirm,
      });

      await act(async () => {
        await findByTestId(result.current, "cancel-confirm-btn").props.onClick();
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 4. EventRepublishModal Component Tests
  // =========================================================================
  describe("EventRepublishModal Component", () => {
    it("renders republication notice and calls onConfirm on click", async () => {
      const onConfirm = vi.fn().mockResolvedValue();
      const onClose = vi.fn();
      const { result } = renderComponent(EventRepublishModal, {
        isOpen: true,
        onClose,
        event: EVENT_DESIGN_SPRINT,
        isMutating: false,
        onConfirm,
      });

      expect(findByTestId(result.current, "event-republish-modal")).not.toBeNull();
      expect(
        findInReactTree(result.current, (el) =>
          el.props?.children?.includes?.("RSVP registration will reopen")
        )
      ).not.toBeNull();

      await act(async () => {
        await findByTestId(result.current, "republish-confirm-btn").props.onClick();
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 5. EventDeleteModal Component Tests
  // =========================================================================
  describe("EventDeleteModal Component", () => {
    it("renders destruction warning and orphan RSVP retention guidance", () => {
      const { result } = renderComponent(EventDeleteModal, {
        isOpen: true,
        onClose: vi.fn(),
        event: EVENT_AI_HACKATHON,
        isMutating: false,
        onConfirm: vi.fn(),
      });

      expect(findByTestId(result.current, "event-delete-modal")).not.toBeNull();
      expect(
        findInReactTree(result.current, (el) =>
          el.props?.children?.includes?.("Orphan RSVP retention")
        )
      ).not.toBeNull();
      expect(
        findInReactTree(result.current, (el) =>
          typeof el.props?.children === "string" && el.props.children.includes("Attention Required")
        ) ||
        findInReactTree(result.current, (el) =>
          Array.isArray(el.props?.children) &&
          el.props.children.some((c) => typeof c === "string" && c.includes("Attention Required"))
        )
      ).not.toBeNull();
    });

    it("calls onConfirm when delete confirmation button is clicked", async () => {
      const onConfirm = vi.fn().mockResolvedValue();
      const onClose = vi.fn();
      const { result } = renderComponent(EventDeleteModal, {
        isOpen: true,
        onClose,
        event: EVENT_AI_HACKATHON,
        isMutating: false,
        onConfirm,
      });

      await act(async () => {
        await findByTestId(result.current, "delete-confirm-btn").props.onClick();
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 6. EventDetail Page Integration Tests
  // =========================================================================
  describe("EventDetail Page Integration", () => {
    it("renders EventManagementToolbar when user has leadership permissions", () => {
      mocks.useEvent.mockReturnValue({
        event: EVENT_AI_HACKATHON,
        availability: "available",
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      mocks.useEventManagement.mockReturnValue({
        isLeader: true,
        isAdmin: true,
        temporalState: "upcoming",
        isOngoing: false,
        canEdit: true,
        canCancel: true,
        canRepublish: false,
        canDelete: true,
        isMutating: false,
        mutationError: null,
        clearError: vi.fn(),
        editDetails: vi.fn(),
        cancelCurrentEvent: vi.fn(),
        republishCurrentEvent: vi.fn(),
        deleteCurrentEvent: vi.fn(),
      });

      const { result } = renderComponent(EventDetail);

      const toolbar = findByTestId(result.current, "event-management-toolbar");
      expect(toolbar).not.toBeNull();
      expect(toolbar.props.canEdit).toBe(true);
      expect(toolbar.props.canCancel).toBe(true);
      expect(toolbar.props.canDelete).toBe(true);
    });

    it("keeps event read-only and hides toolbar when user is unauthorized", () => {
      mocks.useEvent.mockReturnValue({
        event: EVENT_AI_HACKATHON,
        availability: "available",
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      mocks.useEventManagement.mockReturnValue({
        isLeader: false,
        isAdmin: false,
        temporalState: "upcoming",
        isOngoing: false,
        canEdit: false,
        canCancel: false,
        canRepublish: false,
        canDelete: false,
        isMutating: false,
        mutationError: null,
        clearError: vi.fn(),
        editDetails: vi.fn(),
        cancelCurrentEvent: vi.fn(),
        republishCurrentEvent: vi.fn(),
        deleteCurrentEvent: vi.fn(),
      });

      const { result } = renderComponent(EventDetail);

      expect(findByTestId(result.current, "event-management-toolbar")).toBeNull();
    });

    it("navigates to /events on successful event deletion", async () => {
      const deleteCurrentEvent = vi.fn().mockResolvedValue();
      mocks.useEvent.mockReturnValue({
        event: EVENT_AI_HACKATHON,
        availability: "available",
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      mocks.useEventManagement.mockReturnValue({
        isLeader: true,
        isAdmin: true,
        temporalState: "upcoming",
        isOngoing: false,
        canEdit: true,
        canCancel: true,
        canRepublish: false,
        canDelete: true,
        isMutating: false,
        mutationError: null,
        clearError: vi.fn(),
        editDetails: vi.fn(),
        cancelCurrentEvent: vi.fn(),
        republishCurrentEvent: vi.fn(),
        deleteCurrentEvent,
      });

      const { result } = renderComponent(EventDetail);

      const toolbar = findByTestId(result.current, "event-management-toolbar");
      expect(toolbar).not.toBeNull();

      // 1. Open Delete Modal from Toolbar
      act(() => {
        toolbar.props.onOpenDelete();
      });

      // 2. Confirm Delete in Modal
      const deleteModal = findByTestId(result.current, "event-delete-modal");
      expect(deleteModal).not.toBeNull();

      await act(async () => {
        await deleteModal.props.onConfirm();
      });

      expect(deleteCurrentEvent).toHaveBeenCalledTimes(1);
      expect(mocks.useNavigate).toHaveBeenCalledWith("/events", { replace: true });
    });
  });
});
