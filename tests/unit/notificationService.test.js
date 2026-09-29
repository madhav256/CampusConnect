import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((_db, ...segments) => ({
    path: segments.join("/"),
    id: segments[segments.length - 1],
  })),
  collection: vi.fn((_db, ...segments) => ({ path: segments.join("/") })),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  limit: vi.fn((n) => ({ limit: n })),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  mockDb: { id: "mock-db" },
}));

vi.mock("../../src/firebase/config", () => ({
  db: mocks.mockDb,
  isFirebaseConfigured: true,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  collection: mocks.collection,
  query: mocks.query,
  orderBy: mocks.orderBy,
  limit: mocks.limit,
  onSnapshot: mocks.onSnapshot,
  updateDoc: mocks.updateDoc,
  deleteDoc: mocks.deleteDoc,
  writeBatch: mocks.writeBatch,
}));

import {
  normalizeNotification,
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from "../../src/services/notificationService.js";

describe("notificationService", () => {
  let mockBatch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBatch = {
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    mocks.writeBatch.mockReturnValue(mockBatch);
  });

  describe("normalizeNotification", () => {
    it("normalizes complete notification data with toDate conversion", () => {
      const mockDate = new Date("2026-09-29T10:00:00Z");
      const raw = {
        recipientId: "alice",
        actorId: "bob",
        actorName: "Bob Smith",
        actorAvatar: "https://avatar.test/bob.jpg",
        type: "connection_request",
        referenceId: "alice_bob",
        isRead: 1, // truthy value
        createdAt: { toDate: () => mockDate },
      };

      const result = normalizeNotification("notif-1", raw);

      expect(result).toEqual({
        id: "notif-1",
        recipientId: "alice",
        actorId: "bob",
        actorName: "Bob Smith",
        actorAvatar: "https://avatar.test/bob.jpg",
        type: "connection_request",
        referenceId: "alice_bob",
        isRead: true,
        createdAt: mockDate,
      });
    });

    it("applies safe fallbacks for missing optional fields", () => {
      const raw = {
        recipientId: "alice",
        actorId: "bob",
        type: "connection_accepted",
        referenceId: "alice_bob",
        isRead: false,
        createdAt: null,
      };

      const result = normalizeNotification("notif-2", raw);

      expect(result).toEqual({
        id: "notif-2",
        recipientId: "alice",
        actorId: "bob",
        actorName: "CampusConnect Student",
        actorAvatar: null,
        type: "connection_accepted",
        referenceId: "alice_bob",
        isRead: false,
        createdAt: null,
      });
    });
  });

  describe("subscribeToNotifications", () => {
    it("immediately emits empty array and returns noop if userId is missing", () => {
      const cb = vi.fn();
      const unsub = subscribeToNotifications(null, cb);

      expect(cb).toHaveBeenCalledWith([]);
      expect(typeof unsub).toBe("function");
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
    });

    it("subscribes to notifications ordered by createdAt desc with limit 30", () => {
      let snapCb;
      mocks.onSnapshot.mockImplementation((_q, onNext) => {
        snapCb = onNext;
        return vi.fn();
      });

      const cb = vi.fn();
      const onErr = vi.fn();

      subscribeToNotifications("user-1", cb, onErr);

      expect(mocks.collection).toHaveBeenCalledWith(mocks.mockDb, "users", "user-1", "notifications");
      expect(mocks.orderBy).toHaveBeenCalledWith("createdAt", "desc");
      expect(mocks.limit).toHaveBeenCalledWith(30);

      snapCb({
        docs: [
          {
            id: "n1",
            data: () => ({
              recipientId: "user-1",
              actorId: "user-2",
              type: "connection_request",
              isRead: false,
            }),
          },
        ],
      });

      expect(cb).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "n1",
          recipientId: "user-1",
          actorId: "user-2",
          actorName: "CampusConnect Student",
          isRead: false,
        }),
      ]);
    });

    it("forwards listener errors to onError handler", () => {
      let errCb;
      mocks.onSnapshot.mockImplementation((_q, _onNext, onErr) => {
        errCb = onErr;
        return vi.fn();
      });

      const cb = vi.fn();
      const onErr = vi.fn();

      subscribeToNotifications("user-1", cb, onErr);

      const error = new Error("Subscription failed");
      errCb(error);

      expect(onErr).toHaveBeenCalledWith(error);
    });
  });

  describe("markNotificationAsRead", () => {
    it("does nothing when userId or notificationId is missing", async () => {
      await markNotificationAsRead(null, "n1");
      await markNotificationAsRead("user-1", "");

      expect(mocks.updateDoc).not.toHaveBeenCalled();
    });

    it("updates the notification document with isRead: true", async () => {
      mocks.updateDoc.mockResolvedValue();

      await markNotificationAsRead("user-1", "n1");

      expect(mocks.doc).toHaveBeenCalledWith(
        mocks.mockDb,
        "users",
        "user-1",
        "notifications",
        "n1"
      );
      expect(mocks.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/user-1/notifications/n1" }),
        { isRead: true }
      );
    });
  });

  describe("markAllNotificationsAsRead", () => {
    it("does nothing when userId is missing or notificationIds is empty or not an array", async () => {
      await markAllNotificationsAsRead(null, ["n1", "n2"]);
      await markAllNotificationsAsRead("user-1", []);
      await markAllNotificationsAsRead("user-1", null);

      expect(mockBatch.commit).not.toHaveBeenCalled();
    });

    it("batches updates for all given notification IDs", async () => {
      await markAllNotificationsAsRead("user-1", ["n1", "n2", "n3"]);

      expect(mockBatch.update).toHaveBeenCalledTimes(3);
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/user-1/notifications/n1" }),
        { isRead: true }
      );
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/user-1/notifications/n2" }),
        { isRead: true }
      );
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/user-1/notifications/n3" }),
        { isRead: true }
      );
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteNotification", () => {
    it("does nothing when userId or notificationId is missing", async () => {
      await deleteNotification("", "n1");
      await deleteNotification("user-1", null);

      expect(mocks.deleteDoc).not.toHaveBeenCalled();
    });

    it("deletes the specified notification document", async () => {
      mocks.deleteDoc.mockResolvedValue();

      await deleteNotification("user-1", "n1");

      expect(mocks.deleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/user-1/notifications/n1" })
      );
    });
  });
});
