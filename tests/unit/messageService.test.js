import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((collOrDb, ...segments) => {
    if (typeof collOrDb === "object" && collOrDb?.path) {
      const subPath = segments.length > 0 ? segments.join("/") : "mock-msg-id";
      return { path: `${collOrDb.path}/${subPath}`, id: subPath };
    }
    return {
      path: segments.join("/"),
      id: segments[segments.length - 1],
    };
  }),
  collection: vi.fn((_db, ...segments) => ({ path: segments.join("/") })),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  limit: vi.fn((n) => ({ limit: n })),
  startAfter: vi.fn((doc) => ({ startAfter: doc })),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
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
  orderBy: mocks.orderBy,
  limit: mocks.limit,
  startAfter: mocks.startAfter,
  onSnapshot: mocks.onSnapshot,
  getDocs: mocks.getDocs,
  updateDoc: mocks.updateDoc,
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
}));

vi.mock("../../src/services/userService", () => ({
  fetchUserById: mocks.fetchUserById,
}));

import {
  getCanonicalConversationId,
  normalizeConversation,
  normalizeMessage,
  sendMessage,
  markConversationAsRead,
  subscribeToConversations,
  subscribeToConversationMessages,
  fetchOlderMessages,
  MAX_MESSAGE_LENGTH,
} from "../../src/services/messageService.js";

describe("messageService", () => {
  let mockTransaction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTransaction = {
      get: vi.fn().mockImplementation(async (ref) => {
        if (ref.path.startsWith("connections/")) {
          return {
            exists: () => true,
            data: () => ({ status: "accepted" }),
          };
        }
        if (ref.path.startsWith("conversations/")) {
          return {
            exists: () => false,
            data: () => ({}),
          };
        }
        return { exists: () => false, data: () => ({}) };
      }),
      set: vi.fn(),
      update: vi.fn(),
    };

    mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTransaction));

    mocks.fetchUserById.mockImplementation(async (uid) => ({
      uid,
      displayName: uid === "userA" ? "Alice" : "Bob",
      photoURL: null,
    }));
  });

  describe("getCanonicalConversationId", () => {
    it("returns deterministic min_max sorted ID regardless of argument order", () => {
      expect(getCanonicalConversationId("userA", "userB")).toBe("userA_userB");
      expect(getCanonicalConversationId("userB", "userA")).toBe("userA_userB");
      expect(getCanonicalConversationId("z_user", "a_user")).toBe("a_user_z_user");
    });

    it("throws when either UID is missing or empty", () => {
      expect(() => getCanonicalConversationId("", "userB")).toThrow("Invalid participant UIDs.");
      expect(() => getCanonicalConversationId("userA", "")).toThrow("Invalid participant UIDs.");
      expect(() => getCanonicalConversationId(null, "userB")).toThrow("Invalid participant UIDs.");
      expect(() => getCanonicalConversationId("userA", undefined)).toThrow("Invalid participant UIDs.");
    });

    it("throws when UIDs are identical", () => {
      expect(() => getCanonicalConversationId("userA", "userA")).toThrow("Invalid participant UIDs.");
    });
  });

  describe("normalizeConversation", () => {
    it("normalizes complete conversation data with toDate conversion", () => {
      const mockCreated = new Date("2026-09-29T10:00:00Z");
      const mockUpdated = new Date("2026-09-29T10:05:00Z");
      const mockMsgCreated = new Date("2026-09-29T10:04:30Z");

      const raw = {
        participants: ["userA", "userB"],
        participantProfiles: {
          userA: { displayName: "Alice Student", photoURL: "https://avatar.test/alice.jpg" },
          userB: { displayName: "Bob Peer", photoURL: null },
        },
        lastMessage: {
          id: "msg-123",
          content: "See you at the library!",
          senderId: "userA",
          createdAt: { toDate: () => mockMsgCreated },
        },
        unreadCount: {
          userA: 0,
          userB: 3,
        },
        createdAt: { toDate: () => mockCreated },
        updatedAt: { toDate: () => mockUpdated },
      };

      const result = normalizeConversation("userA_userB", raw);

      expect(result).toEqual({
        id: "userA_userB",
        participants: ["userA", "userB"],
        participantProfiles: {
          userA: { displayName: "Alice Student", photoURL: "https://avatar.test/alice.jpg" },
          userB: { displayName: "Bob Peer", photoURL: null },
        },
        lastMessage: {
          id: "msg-123",
          content: "See you at the library!",
          senderId: "userA",
          createdAt: mockMsgCreated,
        },
        unreadCount: {
          userA: 0,
          userB: 3,
        },
        createdAt: mockCreated,
        updatedAt: mockUpdated,
      });
    });

    it("applies safe fallbacks for missing/malformed optional fields", () => {
      const result = normalizeConversation("userA_userB", {
        participants: null,
        participantProfiles: null,
        lastMessage: null,
        unreadCount: { userA: -1, userB: "not-a-number" },
        createdAt: null,
        updatedAt: null,
      });

      expect(result).toEqual({
        id: "userA_userB",
        participants: [],
        participantProfiles: {},
        lastMessage: null,
        unreadCount: { userA: 0, userB: 0 },
        createdAt: null,
        updatedAt: null,
      });
    });

    it("falls back to default student name if participant profile displayName is missing", () => {
      const result = normalizeConversation("userA_userB", {
        participantProfiles: {
          userA: { photoURL: null },
        },
      });

      expect(result.participantProfiles.userA.displayName).toBe("CampusConnect Student");
    });

    it("safely normalizes lastMessage without id to an empty string fallback", () => {
      const result = normalizeConversation("userA_userB", {
        lastMessage: {
          content: "Legacy message without id",
          senderId: "userA",
        },
      });

      expect(result.lastMessage).toEqual({
        id: "",
        content: "Legacy message without id",
        senderId: "userA",
        createdAt: null,
      });
    });
  });

  describe("normalizeMessage", () => {
    it("normalizes complete message data with toDate conversion", () => {
      const mockDate = new Date("2026-09-29T12:00:00Z");
      const raw = {
        conversationId: "userA_userB",
        senderId: "userA",
        content: "Hey, do you have notes from class?",
        createdAt: { toDate: () => mockDate },
      };

      const result = normalizeMessage("msg-1", raw);

      expect(result).toEqual({
        id: "msg-1",
        conversationId: "userA_userB",
        senderId: "userA",
        content: "Hey, do you have notes from class?",
        createdAt: mockDate,
      });
    });

    it("applies safe fallbacks for missing message fields", () => {
      const result = normalizeMessage("msg-2", null);

      expect(result).toEqual({
        id: "msg-2",
        conversationId: "",
        senderId: "",
        content: "",
        createdAt: null,
      });
    });
  });

  describe("sendMessage", () => {
    it("throws when senderId or recipientId is missing", async () => {
      await expect(sendMessage(null, "userB", "hello")).rejects.toThrow(
        "Sender ID and Recipient ID are required."
      );
      await expect(sendMessage("userA", null, "hello")).rejects.toThrow(
        "Sender ID and Recipient ID are required."
      );
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it("throws when messaging oneself", async () => {
      await expect(sendMessage("userA", "userA", "hello")).rejects.toThrow(
        "Invalid participant UIDs: Cannot message yourself."
      );
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it("throws when content is empty or whitespace-only", async () => {
      await expect(sendMessage("userA", "userB", "")).rejects.toThrow(
        "Message content cannot be empty."
      );
      await expect(sendMessage("userA", "userB", "   ")).rejects.toThrow(
        "Message content cannot be empty."
      );
      await expect(sendMessage("userA", "userB", null)).rejects.toThrow(
        "Message content cannot be empty."
      );
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it("throws when content exceeds maximum length of 1000 characters", async () => {
      const longContent = "a".repeat(MAX_MESSAGE_LENGTH + 1);
      await expect(sendMessage("userA", "userB", longContent)).rejects.toThrow(
        `Message content exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters.`
      );
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it("throws when connection does not exist inside transaction", async () => {
      mockTransaction.get.mockImplementation(async (ref) => {
        if (ref.path.startsWith("connections/")) {
          return { exists: () => false };
        }
        return { exists: () => false };
      });

      await expect(sendMessage("userA", "userB", "hello")).rejects.toThrow(
        "Cannot send message: You can only message connected students."
      );
      expect(mockTransaction.set).not.toHaveBeenCalled();
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });

    it("throws when connection status is not accepted (e.g. pending)", async () => {
      mockTransaction.get.mockImplementation(async (ref) => {
        if (ref.path.startsWith("connections/")) {
          return {
            exists: () => true,
            data: () => ({ status: "pending" }),
          };
        }
        return { exists: () => false };
      });

      await expect(sendMessage("userA", "userB", "hello")).rejects.toThrow(
        "Cannot send message: You can only message connected students."
      );
      expect(mockTransaction.set).not.toHaveBeenCalled();
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });

    it("creates conversation and first message atomically using runTransaction when conversation does not exist", async () => {
      const result = await sendMessage("userA", "userB", "  Hello Bob!  ");

      expect(result.conversationId).toBe("userA_userB");
      expect(result.messageId).toBe("mock-msg-id");

      // Verify transaction reads were performed
      expect(mockTransaction.get).toHaveBeenCalledWith(
        expect.objectContaining({ path: "connections/userA_userB" })
      );
      expect(mockTransaction.get).toHaveBeenCalledWith(
        expect.objectContaining({ path: "conversations/userA_userB" })
      );

      // Verify transaction writes: conversation doc + first message doc
      expect(mockTransaction.set).toHaveBeenCalledTimes(2);
      expect(mockTransaction.update).not.toHaveBeenCalled();

      // Check conversation write payload (first set call)
      const convCall = mockTransaction.set.mock.calls[0];
      const convPayload = convCall[1];
      expect(convPayload.id).toBe("userA_userB");
      expect(convPayload.participants).toEqual(["userA", "userB"]);
      expect(convPayload.participantProfiles).toEqual({
        userA: { displayName: "Alice", photoURL: null },
        userB: { displayName: "Bob", photoURL: null },
      });
      expect(convPayload.lastMessage.id).toBe("mock-msg-id");
      expect(convPayload.lastMessage.content).toBe("Hello Bob!");
      expect(convPayload.lastMessage.senderId).toBe("userA");
      expect(convPayload.lastMessage.createdAt).toEqual({ _methodName: "serverTimestamp" });
      expect(Object.keys(convPayload.lastMessage)).toEqual(["id", "content", "senderId", "createdAt"]);
      expect(convPayload.unreadCount).toEqual({
        userA: 0,
        userB: 1,
      });

      // Check message write payload (second set call)
      const msgCall = mockTransaction.set.mock.calls[1];
      const msgPayload = msgCall[1];
      expect(msgPayload.id).toBe("mock-msg-id");
      expect(msgPayload.conversationId).toBe("userA_userB");
      expect(msgPayload.senderId).toBe("userA");
      expect(msgPayload.content).toBe("Hello Bob!");
      expect(convPayload.lastMessage.id).toBe(msgPayload.id);
    });

    it("supports object argument signature { senderId, recipientId, content }", async () => {
      const result = await sendMessage({
        senderId: "userA",
        recipientId: "userB",
        content: "Object signature test",
      });

      expect(result.conversationId).toBe("userA_userB");
      expect(mocks.runTransaction).toHaveBeenCalledTimes(1);
      expect(mockTransaction.set).toHaveBeenCalledTimes(2);
    });

    it("updates existing conversation and creates message atomically inside transaction on subsequent messages", async () => {
      mockTransaction.get.mockImplementation(async (ref) => {
        if (ref.path.startsWith("connections/")) {
          return {
            exists: () => true,
            data: () => ({ status: "accepted" }),
          };
        }
        if (ref.path.startsWith("conversations/")) {
          return {
            exists: () => true,
            data: () => ({
              id: "userA_userB",
              participants: ["userA", "userB"],
              unreadCount: { userA: 0, userB: 2 },
            }),
          };
        }
        return { exists: () => false };
      });

      const result = await sendMessage("userA", "userB", "Second message!");

      expect(result.conversationId).toBe("userA_userB");

      // Verify transaction writes: 1 set for message, 1 update for conversation
      expect(mockTransaction.set).toHaveBeenCalledTimes(1);
      expect(mockTransaction.update).toHaveBeenCalledTimes(1);

      const msgPayload = mockTransaction.set.mock.calls[0][1];
      expect(msgPayload.id).toBe("mock-msg-id");
      expect(msgPayload.content).toBe("Second message!");
      expect(msgPayload.senderId).toBe("userA");

      const updatePayload = mockTransaction.update.mock.calls[0][1];
      expect(updatePayload.lastMessage.id).toBe("mock-msg-id");
      expect(updatePayload.lastMessage.content).toBe("Second message!");
      expect(updatePayload.lastMessage.senderId).toBe("userA");
      expect(updatePayload.lastMessage.createdAt).toEqual({ _methodName: "serverTimestamp" });
      expect(Object.keys(updatePayload.lastMessage)).toEqual(["id", "content", "senderId", "createdAt"]);
      expect(updatePayload.lastMessage.id).toBe(msgPayload.id);
      expect(updatePayload["unreadCount.userA"]).toBe(0);
      expect(updatePayload["unreadCount.userB"]).toBe(3); // 2 + 1
    });

    it("handles existing conversation with missing or invalid unread counts gracefully", async () => {
      mockTransaction.get.mockImplementation(async (ref) => {
        if (ref.path.startsWith("connections/")) {
          return {
            exists: () => true,
            data: () => ({ status: "accepted" }),
          };
        }
        if (ref.path.startsWith("conversations/")) {
          return {
            exists: () => true,
            data: () => ({
              id: "userA_userB",
              participants: ["userA", "userB"],
              unreadCount: null, // missing unreadCount map
            }),
          };
        }
        return { exists: () => false };
      });

      await sendMessage("userA", "userB", "Message after corrupted count");

      const updatePayload = mockTransaction.update.mock.calls[0][1];
      expect(updatePayload["unreadCount.userA"]).toBe(0);
      expect(updatePayload["unreadCount.userB"]).toBe(1); // 0 + 1 fallback
    });

    it("propagates transaction failure when runTransaction throws", async () => {
      const txError = new Error("Transaction aborted due to network error.");
      mocks.runTransaction.mockRejectedValueOnce(txError);

      await expect(sendMessage("userA", "userB", "Will fail")).rejects.toThrow(
        "Transaction aborted due to network error."
      );
    });

    it("safely transitions to update branch without overwriting when conversation appears concurrently during retry", async () => {
      // In Firestore, if a concurrent peer creates conversations/userA_userB between the initial
      // get() and commit, Firestore transactions abort and retry the callback.
      // We simulate Firestore's retry behavior:
      // Attempt 1: conversation does not exist, callback prepares conversation set + message set.
      // Contention causes retry before commit.
      // Attempt 2 (retry): conversation now exists because peer created it.
      let attempt = 0;
      mocks.runTransaction.mockImplementation(async (_db, callback) => {
        // Attempt 1: convDoc is absent
        attempt++;
        const tx1 = {
          get: vi.fn().mockImplementation(async (ref) => {
            if (ref.path.startsWith("connections/")) {
              return { exists: () => true, data: () => ({ status: "accepted" }) };
            }
            if (ref.path.startsWith("conversations/")) {
              return { exists: () => false };
            }
            return { exists: () => false };
          }),
          set: vi.fn(),
          update: vi.fn(),
        };

        await callback(tx1);
        // Verify attempt 1 prepared creation of conversation document + message
        expect(tx1.set).toHaveBeenCalledTimes(2);

        // Firestore detects contention on commit and invokes callback again with fresh transaction:
        attempt++;
        const tx2 = {
          get: vi.fn().mockImplementation(async (ref) => {
            if (ref.path.startsWith("connections/")) {
              return { exists: () => true, data: () => ({ status: "accepted" }) };
            }
            if (ref.path.startsWith("conversations/")) {
              // Now conversation exists from concurrent peer
              return {
                exists: () => true,
                data: () => ({
                  id: "userA_userB",
                  participants: ["userA", "userB"],
                  unreadCount: { userA: 1, userB: 0 },
                  lastMessage: { content: "Peer message", senderId: "userB" },
                }),
              };
            }
            return { exists: () => false };
          }),
          set: vi.fn(),
          update: vi.fn(),
        };

        const result = await callback(tx2);

        // Verify attempt 2 took the update branch:
        // Appended 1 message via set, updated conversation via update (did NOT call set on conversation doc)
        expect(tx2.set).toHaveBeenCalledTimes(1);
        expect(tx2.update).toHaveBeenCalledTimes(1);

        const updatePayload = tx2.update.mock.calls[0][1];
        expect(updatePayload.lastMessage.id).toBe("mock-msg-id");
        expect(updatePayload.lastMessage.content).toBe("Hello after contention");
        expect(updatePayload.lastMessage.senderId).toBe("userA");
        // Sender unread is set to 0
        expect(updatePayload["unreadCount.userA"]).toBe(0);
        // Recipient unread incremented based on newly existing document (0 + 1 = 1)
        expect(updatePayload["unreadCount.userB"]).toBe(1);

        return result;
      });

      const res = await sendMessage("userA", "userB", "Hello after contention");
      expect(res.conversationId).toBe("userA_userB");
      expect(attempt).toBe(2);
    });

    it("maintains stable message document reference and ID across transaction retries", async () => {
      let callCount = 0;
      let firstMsgRefCaptured = null;
      let secondMsgRefCaptured = null;

      mocks.runTransaction.mockImplementation(async (_db, callback) => {
        callCount++;
        const tx = {
          get: vi.fn().mockImplementation(async (ref) => {
            if (ref.path.startsWith("connections/")) {
              return { exists: () => true, data: () => ({ status: "accepted" }) };
            }
            if (ref.path.startsWith("conversations/")) {
              return {
                exists: () => callCount > 1,
                data: () => ({
                  id: "userA_userB",
                  participants: ["userA", "userB"],
                  unreadCount: { userA: 0, userB: 1 },
                }),
              };
            }
            return { exists: () => false };
          }),
          set: vi.fn(),
          update: vi.fn(),
        };

        if (callCount === 1) {
          await callback(tx);
          firstMsgRefCaptured = tx.set.mock.calls[1][0]; // message ref from first attempt
          // Simulate transient conflict retry by recursing into callback
          return mocks.runTransaction(_db, callback);
        } else {
          const res = await callback(tx);
          secondMsgRefCaptured = tx.set.mock.calls[0][0]; // message ref from retry attempt
          return res;
        }
      });

      const res = await sendMessage("userA", "userB", "Stable ref check");
      expect(res.messageId).toBe("mock-msg-id");
      expect(firstMsgRefCaptured).toBe(secondMsgRefCaptured);
      expect(firstMsgRefCaptured.id).toBe(secondMsgRefCaptured.id);
    });
  });

  describe("markConversationAsRead", () => {
    it("resets only the current user unread count to 0", async () => {
      await markConversationAsRead("userA_userB", "userA");

      expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
      const call = mocks.updateDoc.mock.calls[0];
      expect(call[1]).toEqual({
        "unreadCount.userA": 0,
      });
      // Does not alter userB's unreadCount
      expect(call[1]["unreadCount.userB"]).toBeUndefined();
    });

    it("no-ops safely if conversationId or userId is missing", async () => {
      await markConversationAsRead("", "userA");
      await markConversationAsRead("userA_userB", "");
      expect(mocks.updateDoc).not.toHaveBeenCalled();
    });
  });

  describe("subscribeToConversations", () => {
    it("returns empty array and no-op unsubscribe function when userId is missing", () => {
      const callback = vi.fn();
      const unsub = subscribeToConversations(null, callback);

      expect(callback).toHaveBeenCalledWith([]);
      expect(typeof unsub).toBe("function");
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
    });

    it("subscribes to conversations where participants contains userId ordered by updatedAt desc", () => {
      mocks.onSnapshot.mockReturnValue(vi.fn());

      const callback = vi.fn();
      const onError = vi.fn();

      subscribeToConversations("userA", callback, onError, 20);

      expect(mocks.where).toHaveBeenCalledWith("participants", "array-contains", "userA");
      expect(mocks.orderBy).toHaveBeenCalledWith("updatedAt", "desc");
      expect(mocks.limit).toHaveBeenCalledWith(20);
      expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);
    });

    it("normalizes returned conversation snapshots", () => {
      let snapshotHandler;
      mocks.onSnapshot.mockImplementation((_query, onNext) => {
        snapshotHandler = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      subscribeToConversations("userA", callback);

      const mockSnapshot = {
        docs: [
          {
            id: "userA_userB",
            data: () => ({
              participants: ["userA", "userB"],
              lastMessage: { content: "Hi", senderId: "userB" },
              unreadCount: { userA: 1, userB: 0 },
            }),
          },
        ],
      };

      snapshotHandler(mockSnapshot);

      expect(callback).toHaveBeenCalledTimes(1);
      const convs = callback.mock.calls[0][0];
      expect(convs).toHaveLength(1);
      expect(convs[0].id).toBe("userA_userB");
      expect(convs[0].lastMessage.content).toBe("Hi");
    });

    it("forwards error to onError handler", () => {
      let errorHandler;
      mocks.onSnapshot.mockImplementation((_query, _onNext, onErr) => {
        errorHandler = onErr;
        return vi.fn();
      });

      const callback = vi.fn();
      const onError = vi.fn();
      subscribeToConversations("userA", callback, onError);

      const testError = new Error("permission denied");
      errorHandler(testError);

      expect(onError).toHaveBeenCalledWith(testError);
    });
  });

  describe("subscribeToConversationMessages", () => {
    it("returns empty array and no-op unsubscribe function when conversationId is missing", () => {
      const callback = vi.fn();
      const unsub = subscribeToConversationMessages("", callback);

      expect(callback).toHaveBeenCalledWith([]);
      expect(typeof unsub).toBe("function");
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
    });

    it("subscribes to messages subcollection ordered by createdAt desc", () => {
      mocks.onSnapshot.mockReturnValue(vi.fn());

      const callback = vi.fn();
      subscribeToConversationMessages("userA_userB", callback, null, 30);

      expect(mocks.orderBy).toHaveBeenCalledWith("createdAt", "desc");
      expect(mocks.limit).toHaveBeenCalledWith(30);
      expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);
    });

    it("normalizes returned message snapshots", () => {
      let snapshotHandler;
      mocks.onSnapshot.mockImplementation((_query, onNext) => {
        snapshotHandler = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      subscribeToConversationMessages("userA_userB", callback);

      const mockSnapshot = {
        docs: [
          {
            id: "msg-101",
            data: () => ({
              conversationId: "userA_userB",
              senderId: "userA",
              content: "Real-time message test",
            }),
          },
        ],
      };

      snapshotHandler(mockSnapshot);

      expect(callback).toHaveBeenCalledTimes(1);
      const msgs = callback.mock.calls[0][0];
      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe("msg-101");
      expect(msgs[0].content).toBe("Real-time message test");
    });
  });

  describe("fetchOlderMessages", () => {
    it("returns empty array if conversationId is missing", async () => {
      const result = await fetchOlderMessages("");
      expect(result).toEqual([]);
      expect(mocks.getDocs).not.toHaveBeenCalled();
    });

    it("queries messages collection with orderBy createdAt desc and limit without startAfter when oldestDoc is null", async () => {
      mocks.getDocs.mockResolvedValue({ docs: [{ id: "msg-1" }] });

      const result = await fetchOlderMessages("userA_userB", null, 25);

      expect(mocks.orderBy).toHaveBeenCalledWith("createdAt", "desc");
      expect(mocks.limit).toHaveBeenCalledWith(25);
      expect(mocks.startAfter).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it("adds startAfter when oldestMessageDoc is provided", async () => {
      mocks.getDocs.mockResolvedValue({ docs: [{ id: "msg-2" }] });

      const mockOldestDoc = { id: "msg-1" };
      const result = await fetchOlderMessages("userA_userB", mockOldestDoc, 15);

      expect(mocks.orderBy).toHaveBeenCalledWith("createdAt", "desc");
      expect(mocks.limit).toHaveBeenCalledWith(15);
      expect(mocks.startAfter).toHaveBeenCalledWith(mockOldestDoc);
      expect(result).toHaveLength(1);
    });
  });
});
