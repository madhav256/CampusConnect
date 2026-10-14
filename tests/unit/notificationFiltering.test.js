import { describe, expect, it } from "vitest";

/**
 * Pure helper mirroring the recipient-side filtering algorithm in useNotifications.
 *
 * @param {object[]} rawNotifications
 * @param {object|null|undefined} preferences
 * @returns {object[]}
 */
export function filterNotificationsByPreferences(rawNotifications, preferences) {
  return rawNotifications.filter((n) => {
    if (n.type === "connection_request" && preferences?.connectionRequests === false) {
      return false;
    }
    if (n.type === "connection_accepted" && preferences?.connectionAccepted === false) {
      return false;
    }
    if (n.type === "event_rsvp" && preferences?.eventRsvps === false) {
      return false;
    }
    if (n.type === "event_cancelled" && preferences?.eventCancellations === false) {
      return false;
    }
    return true;
  });
}

describe("Milestone 14B — Recipient Client Notification Filtering", () => {
  const sampleNotifications = [
    {
      id: "req_alice_bob",
      recipientId: "bob",
      actorId: "alice",
      actorName: "Alice Test",
      type: "connection_request",
      isRead: false,
    },
    {
      id: "acc_carol_bob",
      recipientId: "bob",
      actorId: "carol",
      actorName: "Carol Test",
      type: "connection_accepted",
      isRead: false,
    },
    {
      id: "req_dave_bob",
      recipientId: "bob",
      actorId: "dave",
      actorName: "Dave Test",
      type: "connection_request",
      isRead: true,
    },
  ];

  it("surfaces all notifications when preferences are enabled (true)", () => {
    const prefs = { connectionRequests: true, connectionAccepted: true };
    const filtered = filterNotificationsByPreferences(sampleNotifications, prefs);

    expect(filtered).toHaveLength(3);
    expect(filtered.map((n) => n.id)).toEqual([
      "req_alice_bob",
      "acc_carol_bob",
      "req_dave_bob",
    ]);
  });

  it("surfaces all notifications by default when preferences are not yet set or undefined", () => {
    const filtered = filterNotificationsByPreferences(sampleNotifications, null);
    expect(filtered).toHaveLength(3);

    const filteredEmpty = filterNotificationsByPreferences(sampleNotifications, {});
    expect(filteredEmpty).toHaveLength(3);
  });

  it("filters out connection_request notifications when connectionRequests is false", () => {
    const prefs = { connectionRequests: false, connectionAccepted: true };
    const filtered = filterNotificationsByPreferences(sampleNotifications, prefs);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("acc_carol_bob");
    expect(filtered[0].type).toBe("connection_accepted");
  });

  it("filters out connection_accepted notifications when connectionAccepted is false", () => {
    const prefs = { connectionRequests: true, connectionAccepted: false };
    const filtered = filterNotificationsByPreferences(sampleNotifications, prefs);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((n) => n.id)).toEqual(["req_alice_bob", "req_dave_bob"]);
    expect(filtered.every((n) => n.type === "connection_request")).toBe(true);
  });

  it("filters out both notification types when both preferences are false", () => {
    const prefs = { connectionRequests: false, connectionAccepted: false };
    const filtered = filterNotificationsByPreferences(sampleNotifications, prefs);

    expect(filtered).toHaveLength(0);
  });

  it("accurately computes unread count exclusively from surfaced notifications", () => {
    // When connectionRequests is false, only acc_carol_bob (unread: true) is visible
    const prefs1 = { connectionRequests: false, connectionAccepted: true };
    const filtered1 = filterNotificationsByPreferences(sampleNotifications, prefs1);
    const unreadCount1 = filtered1.filter((n) => !n.isRead).length;
    expect(unreadCount1).toBe(1);

    // When connectionAccepted is false, req_alice_bob (unread) and req_dave_bob (read) are visible
    const prefs2 = { connectionRequests: true, connectionAccepted: false };
    const filtered2 = filterNotificationsByPreferences(sampleNotifications, prefs2);
    const unreadCount2 = filtered2.filter((n) => !n.isRead).length;
    expect(unreadCount2).toBe(1);
  });

  describe("Milestone 23.3 — Event Notification Filtering & Preference Normalization", () => {
    const eventNotifications = [
      {
        id: "rsvp_event1_alice",
        recipientId: "organizer1",
        actorId: "alice",
        type: "event_rsvp",
        isRead: false,
      },
      {
        id: "cancel_event1_cycle123",
        recipientId: "attendee1",
        actorId: "organizer1",
        type: "event_cancelled",
        isRead: false,
      },
      {
        id: "cancel_event2_cycle456",
        recipientId: "attendee1",
        actorId: "organizer2",
        type: "event_cancelled",
        isRead: true,
      },
    ];

    it("surfaces event notifications when preferences are enabled or unset", () => {
      const filteredUnset = filterNotificationsByPreferences(eventNotifications, {});
      expect(filteredUnset).toHaveLength(3);

      const filteredEnabled = filterNotificationsByPreferences(eventNotifications, {
        eventRsvps: true,
        eventCancellations: true,
      });
      expect(filteredEnabled).toHaveLength(3);
    });

    it("filters out event_rsvp notifications when eventRsvps is false", () => {
      const filtered = filterNotificationsByPreferences(eventNotifications, {
        eventRsvps: false,
        eventCancellations: true,
      });
      expect(filtered).toHaveLength(2);
      expect(filtered.every((n) => n.type === "event_cancelled")).toBe(true);
    });

    it("filters out event_cancelled notifications when eventCancellations is false", () => {
      const filtered = filterNotificationsByPreferences(eventNotifications, {
        eventRsvps: true,
        eventCancellations: false,
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("rsvp_event1_alice");
    });

    it("filters out all event notifications when both are false", () => {
      const filtered = filterNotificationsByPreferences(eventNotifications, {
        eventRsvps: false,
        eventCancellations: false,
      });
      expect(filtered).toHaveLength(0);
    });
  });
});
