import { describe, expect, it } from "vitest";
import { getConnectionDocId } from "../../src/services/connectionService.js";
import { normalizeNotification } from "../../src/services/notificationService.js";

const timestamp = {
  toDate: () => new Date("2026-01-02T03:04:05.000Z"),
};

describe("getConnectionDocId", () => {
  it("returns the same sorted-pair ID regardless of argument order", () => {
    expect(getConnectionDocId("bob", "alice")).toBe("alice_bob");
    expect(getConnectionDocId("alice", "bob")).toBe("alice_bob");
  });

  it("rejects missing and equal participant IDs", () => {
    expect(() => getConnectionDocId("", "bob")).toThrow("Invalid participant UIDs.");
    expect(() => getConnectionDocId("alice", "alice")).toThrow("Invalid participant UIDs.");
  });
});

describe("normalizeNotification", () => {
  it("normalizes timestamps, read state, and optional actor fields", () => {
    expect(
      normalizeNotification("req_alice_bob", {
        recipientId: "bob",
        actorId: "alice",
        actorName: "Alice",
        actorAvatar: "",
        type: "connection_request",
        referenceId: "alice_bob",
        isRead: 0,
        createdAt: timestamp,
      })
    ).toEqual({
      id: "req_alice_bob",
      recipientId: "bob",
      actorId: "alice",
      actorName: "Alice",
      actorAvatar: null,
      type: "connection_request",
      referenceId: "alice_bob",
      isRead: false,
      createdAt: timestamp.toDate(),
    });
  });

  it("uses a fallback actor name and null timestamp when fields are absent", () => {
    expect(normalizeNotification("notification", {})).toMatchObject({
      id: "notification",
      actorName: "CampusConnect Student",
      actorAvatar: null,
      isRead: false,
      createdAt: null,
    });
  });
});
