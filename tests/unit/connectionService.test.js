import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((_db, coll, ...segments) => ({
    path: [coll, ...segments].join("/"),
    id: segments[segments.length - 1] || coll,
  })),
  collection: vi.fn((_db, name) => ({ path: name, name })),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _methodName: "serverTimestamp" })),
  mockDb: { id: "mock-db" },
  fetchUserById: vi.fn(),
}));

vi.mock("../../src/firebase/config", () => ({
  db: mocks.mockDb,
  isFirebaseConfigured: true,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  collection: mocks.collection,
  query: mocks.query,
  where: mocks.where,
  onSnapshot: mocks.onSnapshot,
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
}));

vi.mock("../../src/services/userService", () => ({
  fetchUserById: mocks.fetchUserById,
}));

import {
  getConnectionDocId,
  sendConnectionRequest,
  cancelConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  removeConnection,
  subscribeToConnectionState,
  subscribeToUserRelationships,
} from "../../src/services/connectionService.js";

describe("connectionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getConnectionDocId — Canonical sorted-pair IDs", () => {
    it("produces deterministic sorted-pair ID regardless of argument order", () => {
      expect(getConnectionDocId("alice", "bob")).toBe("alice_bob");
      expect(getConnectionDocId("bob", "alice")).toBe("alice_bob");
      expect(getConnectionDocId("user_z", "user_a")).toBe("user_a_user_z");
    });

    it("throws when either UID is missing, empty, or both are identical", () => {
      expect(() => getConnectionDocId(null, "bob")).toThrow("Invalid participant UIDs.");
      expect(() => getConnectionDocId("alice", "")).toThrow("Invalid participant UIDs.");
      expect(() => getConnectionDocId("alice", "alice")).toThrow("Invalid participant UIDs.");
    });
  });

  describe("sendConnectionRequest", () => {
    it("rejects invalid participants", async () => {
      await expect(sendConnectionRequest("alice", "")).rejects.toThrow("Invalid participant UIDs.");
      await expect(sendConnectionRequest("alice", "alice")).rejects.toThrow("Invalid participant UIDs.");
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it("atomically creates pending connection and incoming notification when no relationship exists", async () => {
      mocks.fetchUserById.mockResolvedValue({
        displayName: "Alice Sender",
        photoURL: "https://avatar.test/alice.jpg",
      });

      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: () => false }),
        set: vi.fn(),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await sendConnectionRequest("alice", "bob");

      expect(mockTx.get).toHaveBeenCalledWith(
        expect.objectContaining({ path: "connections/alice_bob" })
      );
      expect(mockTx.set).toHaveBeenCalledTimes(2);

      // Connection doc created with canonical sorted users
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: "connections/alice_bob" }),
        expect.objectContaining({
          users: ["alice", "bob"],
          senderId: "alice",
          receiverId: "bob",
          status: "pending",
        })
      );

      // Recipient notification doc created
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/bob/notifications/req_alice_bob" }),
        expect.objectContaining({
          id: "req_alice_bob",
          recipientId: "bob",
          actorId: "alice",
          actorName: "Alice Sender",
          actorAvatar: "https://avatar.test/alice.jpg",
          type: "connection_request",
          referenceId: "alice_bob",
          isRead: false,
        })
      );
    });

    it("rejects when already connected", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "accepted" }),
        }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(sendConnectionRequest("alice", "bob")).rejects.toThrow(
        "You are already connected with this student."
      );
    });

    it("rejects when sender already has an outgoing pending request", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "pending", senderId: "alice" }),
        }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(sendConnectionRequest("alice", "bob")).rejects.toThrow(
        "You already have a pending request to this student."
      );
    });

    it("rejects when an incoming pending request from recipient already exists", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "pending", senderId: "bob", receiverId: "alice" }),
        }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(sendConnectionRequest("alice", "bob")).rejects.toThrow(
        "You already have an incoming connection request from this student."
      );
    });
  });

  describe("cancelConnectionRequest", () => {
    it("rejects invalid participants", async () => {
      await expect(cancelConnectionRequest(null, "bob")).rejects.toThrow("Invalid participant UIDs.");
    });

    it("throws if connection request no longer exists", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: () => false }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(cancelConnectionRequest("alice", "bob")).rejects.toThrow(
        "Connection request no longer exists."
      );
    });

    it("throws if connection status is not pending", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "accepted", senderId: "alice" }),
        }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(cancelConnectionRequest("alice", "bob")).rejects.toThrow(
        "Cannot cancel an already accepted connection. Use removeConnection instead."
      );
    });

    it("throws if caller is not the sender", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "pending", senderId: "bob" }),
        }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(cancelConnectionRequest("alice", "bob")).rejects.toThrow(
        "Only the sender can cancel this request."
      );
    });

    it("atomically deletes connection document and notification document", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "pending", senderId: "alice" }),
        }),
        delete: vi.fn(),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await cancelConnectionRequest("alice", "bob");

      expect(mockTx.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: "connections/alice_bob" })
      );
      expect(mockTx.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/bob/notifications/req_alice_bob" })
      );
    });
  });

  describe("acceptConnectionRequest", () => {
    it("rejects invalid participants", async () => {
      await expect(acceptConnectionRequest("", "bob")).rejects.toThrow("Invalid participant UIDs.");
    });

    it("throws if request does not exist", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: () => false }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(acceptConnectionRequest("bob", "alice")).rejects.toThrow(
        "Connection request no longer exists."
      );
    });

    it("throws if request is not pending", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "accepted", receiverId: "bob" }),
        }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(acceptConnectionRequest("bob", "alice")).rejects.toThrow(
        "This connection request has already been processed."
      );
    });

    it("throws if caller is not the recipient", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "pending", receiverId: "charlie" }),
        }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(acceptConnectionRequest("bob", "alice")).rejects.toThrow(
        "Only the recipient of this request can accept it."
      );
    });

    it("atomically updates connection to accepted, cleans incoming notif, and creates acceptance notif", async () => {
      mocks.fetchUserById.mockResolvedValue({
        displayName: "Bob Acceptor",
        photoURL: "https://avatar.test/bob.jpg",
      });

      const mockTx = {
        get: vi.fn().mockImplementation((ref) => {
          if (ref.path === "connections/alice_bob") {
            return {
              exists: () => true,
              data: () => ({ status: "pending", receiverId: "bob", senderId: "alice" }),
            };
          }
          if (ref.path === "users/bob/notifications/req_alice_bob") {
            return { exists: () => true };
          }
          return { exists: () => false };
        }),
        update: vi.fn(),
        delete: vi.fn(),
        set: vi.fn(),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await acceptConnectionRequest("bob", "alice");

      expect(mockTx.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "connections/alice_bob" }),
        expect.objectContaining({ status: "accepted" })
      );
      expect(mockTx.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/bob/notifications/req_alice_bob" })
      );
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/alice/notifications/acc_alice_bob" }),
        expect.objectContaining({
          id: "acc_alice_bob",
          recipientId: "alice",
          actorId: "bob",
          actorName: "Bob Acceptor",
          type: "connection_accepted",
        })
      );
    });
  });

  describe("rejectConnectionRequest", () => {
    it("throws if caller is not the recipient", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "pending", receiverId: "charlie" }),
        }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(rejectConnectionRequest("bob", "alice")).rejects.toThrow(
        "Only the recipient of this request can decline it."
      );
    });

    it("atomically deletes connection document and cleans up notification if it exists", async () => {
      const mockTx = {
        get: vi.fn().mockImplementation((ref) => {
          if (ref.path === "connections/alice_bob") {
            return {
              exists: () => true,
              data: () => ({ status: "pending", receiverId: "bob" }),
            };
          }
          return { exists: () => true };
        }),
        delete: vi.fn(),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await rejectConnectionRequest("bob", "alice");

      expect(mockTx.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: "connections/alice_bob" })
      );
      expect(mockTx.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/bob/notifications/req_alice_bob" })
      );
    });
  });

  describe("removeConnection", () => {
    it("throws if connection does not exist", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({ exists: () => false }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(removeConnection("alice", "bob")).rejects.toThrow("Connection does not exist.");
    });

    it("throws if connection is not accepted", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "pending", users: ["alice", "bob"] }),
        }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(removeConnection("alice", "bob")).rejects.toThrow(
        "Cannot remove a connection that is not accepted."
      );
    });

    it("throws if caller is not a participant", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "accepted", users: ["bob", "charlie"] }),
        }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(removeConnection("alice", "bob")).rejects.toThrow(
        "Only participants can remove this connection."
      );
    });

    it("deletes the connection when valid participant initiates removal", async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ status: "accepted", users: ["alice", "bob"] }),
        }),
        delete: vi.fn(),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await removeConnection("alice", "bob");

      expect(mockTx.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: "connections/alice_bob" })
      );
    });
  });

  describe("subscribeToConnectionState", () => {
    it("immediately calls callback with null if participants are invalid or identical", () => {
      const cb = vi.fn();
      const unsub = subscribeToConnectionState("alice", "alice", cb);
      expect(cb).toHaveBeenCalledWith(null);
      expect(typeof unsub).toBe("function");
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
    });

    it("emits document data when snapshot exists", () => {
      let snapCb;
      mocks.onSnapshot.mockImplementation((_ref, onNext) => {
        snapCb = onNext;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToConnectionState("alice", "bob", cb);

      snapCb({
        exists: () => true,
        id: "alice_bob",
        data: () => ({ status: "accepted" }),
      });

      expect(cb).toHaveBeenCalledWith({ id: "alice_bob", status: "accepted" });
    });

    it("emits null when snapshot does not exist", () => {
      let snapCb;
      mocks.onSnapshot.mockImplementation((_ref, onNext) => {
        snapCb = onNext;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToConnectionState("alice", "bob", cb);

      snapCb({ exists: () => false });

      expect(cb).toHaveBeenCalledWith(null);
    });

    it("gracefully catches permission-denied and emits null for non-members", () => {
      let errCb;
      mocks.onSnapshot.mockImplementation((_ref, _onNext, onErr) => {
        errCb = onErr;
        return vi.fn();
      });

      const cb = vi.fn();
      const onErr = vi.fn();
      subscribeToConnectionState("alice", "bob", cb, onErr);

      errCb({ code: "permission-denied" });

      expect(cb).toHaveBeenCalledWith(null);
      expect(onErr).not.toHaveBeenCalled();
    });
  });

  describe("subscribeToUserRelationships", () => {
    it("immediately returns empty array when currentUid is missing", () => {
      const cb = vi.fn();
      const unsub = subscribeToUserRelationships(null, cb);
      expect(cb).toHaveBeenCalledWith([]);
      expect(typeof unsub).toBe("function");
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
    });

    it("constructs array-contains query and emits mapped documents", () => {
      let snapCb;
      mocks.onSnapshot.mockImplementation((_q, onNext) => {
        snapCb = onNext;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToUserRelationships("alice", cb);

      expect(mocks.where).toHaveBeenCalledWith("users", "array-contains", "alice");

      snapCb({
        docs: [
          { id: "alice_bob", data: () => ({ status: "accepted", users: ["alice", "bob"] }) },
          { id: "alice_carol", data: () => ({ status: "pending", users: ["alice", "carol"] }) },
        ],
      });

      expect(cb).toHaveBeenCalledWith([
        { id: "alice_bob", status: "accepted", users: ["alice", "bob"] },
        { id: "alice_carol", status: "pending", users: ["alice", "carol"] },
      ]);
    });
  });
});
