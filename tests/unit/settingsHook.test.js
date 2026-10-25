import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act } from "./hookTestUtils.js";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useNavigate: vi.fn(() => vi.fn()),
  subscribeToUserProfile: vi.fn(),
  updateUserSettings: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.useNavigate(),
  Link: (props) => React.createElement("a", props, props.children),
}));

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("../../src/services/userService", () => ({
  subscribeToUserProfile: (uid, cb, errCb) => mocks.subscribeToUserProfile(uid, cb, errCb),
  updateUserSettings: (uid, updates) => mocks.updateUserSettings(uid, updates),
}));

import { useSettings } from "../../src/hooks/useSettings.js";
import Settings from "../../src/pages/Settings.jsx";

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
      } else if (val && typeof val === "object") {
        const found = findInTree(val, predicate);
        if (found) return found;
      }
    }
  }
  return null;
}

describe("Milestone 23.4 — useSettings Hook Event Notification Preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { uid: "test-uid-1", email: "student@apex.test" },
    });
  });

  it("defaults eventRsvps and eventCancellations to true for legacy profiles missing new keys", () => {
    let subscriberCallback;
    mocks.subscribeToUserProfile.mockImplementation((uid, cb) => {
      subscriberCallback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useSettings());

    // Emit legacy profile with only connection preferences
    act(() => {
      subscriberCallback({
        email: "student@apex.test",
        isDiscoverable: true,
        notificationPreferences: {
          connectionRequests: true,
          connectionAccepted: false,
        },
      });
    });

    expect(result.current.settings.notificationPreferences).toEqual({
      connectionRequests: true,
      connectionAccepted: false,
      eventRsvps: true,
      eventCancellations: true,
    });
  });

  it("honors stored false preference for eventRsvps and eventCancellations", () => {
    let subscriberCallback;
    mocks.subscribeToUserProfile.mockImplementation((uid, cb) => {
      subscriberCallback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useSettings());

    act(() => {
      subscriberCallback({
        email: "student@apex.test",
        isDiscoverable: true,
        notificationPreferences: {
          connectionRequests: true,
          connectionAccepted: true,
          eventRsvps: false,
          eventCancellations: false,
        },
      });
    });

    expect(result.current.settings.notificationPreferences.eventRsvps).toBe(false);
    expect(result.current.settings.notificationPreferences.eventCancellations).toBe(false);
  });

  it("updates eventRsvps independently and preserves other preferences", async () => {
    let subscriberCallback;
    mocks.subscribeToUserProfile.mockImplementation((uid, cb) => {
      subscriberCallback = cb;
      return () => {};
    });
    mocks.updateUserSettings.mockResolvedValueOnce();

    const { result } = renderHook(() => useSettings());

    act(() => {
      subscriberCallback({
        email: "student@apex.test",
        isDiscoverable: true,
        notificationPreferences: {
          connectionRequests: false,
          connectionAccepted: true,
          eventRsvps: true,
          eventCancellations: true,
        },
      });
    });

    await act(async () => {
      await result.current.updateNotificationPreference("eventRsvps", false);
    });

    expect(mocks.updateUserSettings).toHaveBeenCalledWith("test-uid-1", {
      notificationPreferences: {
        connectionRequests: false,
        connectionAccepted: true,
        eventRsvps: false,
        eventCancellations: true,
      },
    });
    expect(result.current.feedback).toBe("Notification preferences updated.");
  });

  it("updates eventCancellations independently and preserves other preferences", async () => {
    let subscriberCallback;
    mocks.subscribeToUserProfile.mockImplementation((uid, cb) => {
      subscriberCallback = cb;
      return () => {};
    });
    mocks.updateUserSettings.mockResolvedValueOnce();

    const { result } = renderHook(() => useSettings());

    act(() => {
      subscriberCallback({
        email: "student@apex.test",
        isDiscoverable: true,
        notificationPreferences: {
          connectionRequests: true,
          connectionAccepted: true,
          eventRsvps: true,
          eventCancellations: true,
        },
      });
    });

    await act(async () => {
      await result.current.updateNotificationPreference("eventCancellations", false);
    });

    expect(mocks.updateUserSettings).toHaveBeenCalledWith("test-uid-1", {
      notificationPreferences: {
        connectionRequests: true,
        connectionAccepted: true,
        eventRsvps: true,
        eventCancellations: false,
      },
    });
  });

  describe("Milestone 24.4.1 — Event Waitlist Offers Preference & Settings UI Integration", () => {
    it("renders Event Waitlist Offers toggle in Settings reflecting current preference and legacy default", () => {
      let subscriberCallback;
      mocks.subscribeToUserProfile.mockImplementation((uid, cb) => {
        subscriberCallback = cb;
        return () => {};
      });

      const { result } = renderHook(() => Settings());

      // 1. Legacy profile without explicit eventWaitlistOffers defaults toggle to checked (true)
      act(() => {
        subscriberCallback({
          email: "student@apex.test",
          isDiscoverable: true,
          notificationPreferences: {
            connectionRequests: true,
            connectionAccepted: true,
            eventRsvps: true,
            eventCancellations: true,
          },
        });
      });

      const waitlistToggleDefault = findInTree(
        result.current,
        (el) => el?.props?.id === "toggle-notif-waitlist-offers"
      );
      expect(waitlistToggleDefault).not.toBeNull();
      expect(waitlistToggleDefault.props.role).toBe("switch");
      expect(waitlistToggleDefault.props["aria-checked"]).toBe(true);

      // 2. Stored false preference renders toggle unchecked (false)
      act(() => {
        subscriberCallback({
          email: "student@apex.test",
          isDiscoverable: true,
          notificationPreferences: {
            connectionRequests: true,
            connectionAccepted: true,
            eventRsvps: true,
            eventCancellations: true,
            eventWaitlistOffers: false,
          },
        });
      });

      const waitlistToggleDisabled = findInTree(
        result.current,
        (el) => el?.props?.id === "toggle-notif-waitlist-offers"
      );
      expect(waitlistToggleDisabled.props["aria-checked"]).toBe(false);
    });

    it("toggling Event Waitlist Offers in Settings invokes updateUserSettings with the new value and preserves other preferences", async () => {
      let subscriberCallback;
      mocks.subscribeToUserProfile.mockImplementation((uid, cb) => {
        subscriberCallback = cb;
        return () => {};
      });
      mocks.updateUserSettings.mockResolvedValue();

      const { result } = renderHook(() => Settings());

      act(() => {
        subscriberCallback({
          email: "student@apex.test",
          isDiscoverable: true,
          notificationPreferences: {
            connectionRequests: true,
            connectionAccepted: false,
            eventRsvps: true,
            eventCancellations: false,
            eventWaitlistOffers: true,
          },
        });
      });

      const waitlistToggle = findInTree(
        result.current,
        (el) => el?.props?.id === "toggle-notif-waitlist-offers"
      );
      expect(waitlistToggle.props["aria-checked"]).toBe(true);

      // Click toggle to disable eventWaitlistOffers
      await act(async () => {
        await waitlistToggle.props.onClick();
      });

      expect(mocks.updateUserSettings).toHaveBeenCalledWith("test-uid-1", {
        notificationPreferences: {
          connectionRequests: true,
          connectionAccepted: false,
          eventRsvps: true,
          eventCancellations: false,
          eventWaitlistOffers: false,
        },
      });
    });

    it("retains consistent eventWaitlistOffers state after settings data is reloaded and preserves all existing toggles", async () => {
      let subscriberCallback;
      mocks.subscribeToUserProfile.mockImplementation((uid, cb) => {
        subscriberCallback = cb;
        return () => {};
      });
      mocks.updateUserSettings.mockResolvedValue();

      // First mount: user disables eventWaitlistOffers
      const firstMount = renderHook(() => Settings());
      act(() => {
        subscriberCallback({
          email: "student@apex.test",
          isDiscoverable: true,
          notificationPreferences: {
            connectionRequests: true,
            connectionAccepted: true,
            eventRsvps: true,
            eventCancellations: true,
          },
        });
      });

      const toggleOnFirstMount = findInTree(
        firstMount.result.current,
        (el) => el?.props?.id === "toggle-notif-waitlist-offers"
      );
      await act(async () => {
        await toggleOnFirstMount.props.onClick();
      });

      expect(mocks.updateUserSettings).toHaveBeenCalledWith("test-uid-1", {
        notificationPreferences: {
          connectionRequests: true,
          connectionAccepted: true,
          eventRsvps: true,
          eventCancellations: true,
          eventWaitlistOffers: false,
        },
      });
      firstMount.unmount();

      // Simulate reload (second mount receiving persisted Firestore settings)
      const reloadedMount = renderHook(() => Settings());
      act(() => {
        subscriberCallback({
          email: "student@apex.test",
          isDiscoverable: true,
          notificationPreferences: {
            connectionRequests: true,
            connectionAccepted: true,
            eventRsvps: true,
            eventCancellations: true,
            eventWaitlistOffers: false,
          },
        });
      });

      const reloadedWaitlistToggle = findInTree(
        reloadedMount.result.current,
        (el) => el?.props?.id === "toggle-notif-waitlist-offers"
      );
      expect(reloadedWaitlistToggle.props["aria-checked"]).toBe(false);

      // Verify all existing preference switches remain intact
      for (const existingToggleId of [
        "toggle-notif-req",
        "toggle-notif-acc",
        "toggle-notif-rsvps",
        "toggle-notif-cancellations",
      ]) {
        const toggleEl = findInTree(
          reloadedMount.result.current,
          (el) => el?.props?.id === existingToggleId
        );
        expect(toggleEl).not.toBeNull();
        expect(toggleEl.props["aria-checked"]).toBe(true);
      }

      // Re-enabling from false -> true invokes updateUserSettings with true
      await act(async () => {
        await reloadedWaitlistToggle.props.onClick();
      });
      expect(mocks.updateUserSettings).toHaveBeenLastCalledWith("test-uid-1", {
        notificationPreferences: {
          connectionRequests: true,
          connectionAccepted: true,
          eventRsvps: true,
          eventCancellations: true,
          eventWaitlistOffers: true,
        },
      });
    });
  });
});
