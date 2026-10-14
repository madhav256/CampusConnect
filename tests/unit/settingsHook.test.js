import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "./hookTestUtils.js";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  subscribeToUserProfile: vi.fn(),
  updateUserSettings: vi.fn(),
}));

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("../../src/services/userService", () => ({
  subscribeToUserProfile: (uid, cb, errCb) => mocks.subscribeToUserProfile(uid, cb, errCb),
  updateUserSettings: (uid, updates) => mocks.updateUserSettings(uid, updates),
}));

import { useSettings } from "../../src/hooks/useSettings.js";

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
});
