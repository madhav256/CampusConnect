import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "./hookTestUtils";

// Mock useAuth
const mockAuthUser = { uid: "user_alice", displayName: "Alice Student" };
let currentMockUser = mockAuthUser;

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ user: currentMockUser }),
}));

// Mock messageService
const mockService = {
  subscribeToConversationMessages: vi.fn(),
  fetchOlderMessages: vi.fn(),
  sendMessage: vi.fn(),
  markConversationAsRead: vi.fn(),
  normalizeMessage: vi.fn((id, data) => ({
    id,
    conversationId: data?.conversationId || "",
    senderId: data?.senderId || "",
    content: data?.content || "",
    createdAt: data?.createdAt || null,
  })),
};

vi.mock("../../src/services/messageService", () => ({
  subscribeToConversationMessages: (...args) =>
    mockService.subscribeToConversationMessages(...args),
  fetchOlderMessages: (...args) => mockService.fetchOlderMessages(...args),
  sendMessage: (...args) => mockService.sendMessage(...args),
  markConversationAsRead: (...args) =>
    mockService.markConversationAsRead(...args),
  normalizeMessage: (id, data) => mockService.normalizeMessage(id, data),
}));

// Import hook and helpers under test
import {
  deducePeerUid,
  sortMessagesChronologically,
  useConversationMessages,
} from "../../src/hooks/useConversationMessages";

describe("Milestone 16 — Unit 16.4: useConversationMessages Hook", () => {
  let unsubscribeSpy;
  let snapshotCallback;
  let errorCallback;

  beforeEach(() => {
    vi.clearAllMocks();
    currentMockUser = mockAuthUser;

    unsubscribeSpy = vi.fn();
    mockService.subscribeToConversationMessages.mockImplementation(
      (_convId, onNext, onError) => {
        snapshotCallback = onNext;
        errorCallback = onError;
        return unsubscribeSpy;
      }
    );

    mockService.sendMessage.mockResolvedValue({
      messageId: "msg-created-1",
      conversationId: "user_alice_user_bob",
    });

    mockService.markConversationAsRead.mockResolvedValue();
    mockService.fetchOlderMessages.mockResolvedValue([]);
  });

  describe("deducePeerUid helper", () => {
    it("extracts the peer UID from canonical pair", () => {
      expect(deducePeerUid("user_alice_user_bob", "user_alice")).toBe("user_bob");
      expect(deducePeerUid("user_alice_user_bob", "user_bob")).toBe("user_alice");
    });

    it("returns null if input is malformed or missing", () => {
      expect(deducePeerUid(null, "user_alice")).toBeNull();
      expect(deducePeerUid("user_alice_user_bob", null)).toBeNull();
      expect(deducePeerUid("not_a_valid_pair_three_parts", "user_alice")).toBeNull();
    });
  });

  describe("sortMessagesChronologically helper", () => {
    it("sorts messages from oldest to newest by createdAt", () => {
      const msgs = [
        { id: "m3", createdAt: new Date(3000) },
        { id: "m1", createdAt: new Date(1000) },
        { id: "m2", createdAt: new Date(2000) },
      ];
      const sorted = sortMessagesChronologically(msgs);
      expect(sorted.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    });

    it("breaks timestamp ties deterministically by ID", () => {
      const sameTime = new Date(1000);
      const msgs = [
        { id: "msg_z", createdAt: sameTime },
        { id: "msg_a", createdAt: sameTime },
      ];
      const sorted = sortMessagesChronologically(msgs);
      expect(sorted.map((m) => m.id)).toEqual(["msg_a", "msg_z"]);
    });
  });

  describe("Subscription setup & lifecycle", () => {
    it("subscribes to conversation messages when conversationId is present", () => {
      renderHook(() => useConversationMessages("user_alice_user_bob"));

      expect(mockService.subscribeToConversationMessages).toHaveBeenCalledTimes(1);
      expect(mockService.subscribeToConversationMessages).toHaveBeenCalledWith(
        "user_alice_user_bob",
        expect.any(Function),
        expect.any(Function)
      );
    });

    it("does not subscribe if conversationId is missing or falsy", () => {
      const { result } = renderHook(() => useConversationMessages(null));

      expect(mockService.subscribeToConversationMessages).not.toHaveBeenCalled();
      expect(result.current.messages).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasMore).toBe(false);
    });

    it("cleanly unsubscribes on unmount", () => {
      const { unmount } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      expect(unsubscribeSpy).not.toHaveBeenCalled();
      unmount();
      expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    });

    it("cleanly unsubscribes and resets state when conversationId changes", () => {
      let activeConv = "user_alice_user_bob";
      const { rerender, result } = renderHook(() =>
        useConversationMessages(activeConv)
      );

      snapshotCallback([
        { id: "m1", content: "Hi Bob", createdAt: new Date(100) },
      ]);
      expect(result.current.messages).toHaveLength(1);

      // Switch conversation
      activeConv = "user_alice_user_carol";
      rerender();

      expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
      expect(mockService.subscribeToConversationMessages).toHaveBeenCalledTimes(2);
      expect(mockService.subscribeToConversationMessages).toHaveBeenLastCalledWith(
        "user_alice_user_carol",
        expect.any(Function),
        expect.any(Function)
      );
      // Messages reset for the new conversation
      expect(result.current.messages).toEqual([]);
      expect(result.current.isLoading).toBe(true);
    });

    it("resets state and unsubscribes when currentUid changes", () => {
      const { rerender, result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      currentMockUser = { uid: "user_carol", displayName: "Carol" };
      rerender();

      expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
      expect(result.current.messages).toEqual([]);
    });
  });

  describe("Message rendering & chronological order", () => {
    it("exposes real-time messages in chronological ascending order", () => {
      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      // The service delivers newest-first (descending)
      const serviceItems = [
        { id: "m3", content: "Newest", createdAt: new Date(3000) },
        { id: "m2", content: "Middle", createdAt: new Date(2000) },
        { id: "m1", content: "Oldest", createdAt: new Date(1000) },
      ];

      snapshotCallback(serviceItems);

      expect(result.current.isLoading).toBe(false);
      expect(result.current.messages.map((m) => m.id)).toEqual([
        "m1",
        "m2",
        "m3",
      ]);
    });

    it("handles an empty conversation correctly", () => {
      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      snapshotCallback([]);

      expect(result.current.isLoading).toBe(false);
      expect(result.current.messages).toEqual([]);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("handles subscription error safely without crashing", () => {
      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      errorCallback(new Error("Network disconnect"));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe("Network disconnect");
      expect(result.current.messages).toEqual([]);
    });
  });

  describe("sendMessage action", () => {
    it("delegates to messageService.sendMessage with deduced recipientId", async () => {
      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      let sendResult;
      await act(async () => {
        sendResult = await result.current.sendMessage("Hello Bob!");
      });

      expect(mockService.sendMessage).toHaveBeenCalledWith({
        senderId: "user_alice",
        recipientId: "user_bob",
        content: "Hello Bob!",
      });
      expect(sendResult).toEqual({
        messageId: "msg-created-1",
        conversationId: "user_alice_user_bob",
      });
      expect(result.current.sendError).toBeNull();
    });

    it("supports explicit recipientId override in hook or call", async () => {
      const { result } = renderHook(() =>
        useConversationMessages("custom_conversation_id", "user_bob")
      );

      await act(async () => {
        await result.current.sendMessage("Custom thread message");
      });

      expect(mockService.sendMessage).toHaveBeenCalledWith({
        senderId: "user_alice",
        recipientId: "user_bob",
        content: "Custom thread message",
      });
    });

    it("preserves typed content on send failure by re-throwing and setting sendError", async () => {
      mockService.sendMessage.mockRejectedValue(
        new Error("Cannot send message: You can only message connected students.")
      );

      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      let caughtError = null;
      await act(async () => {
        try {
          await result.current.sendMessage("Failed text draft");
        } catch (err) {
          caughtError = err;
        }
      });

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toBe(
        "Cannot send message: You can only message connected students."
      );
      expect(result.current.sendError).toBe(
        "Cannot send message: You can only message connected students."
      );
      expect(result.current.isSending).toBe(false);
    });
  });

  describe("markAsRead action", () => {
    it("delegates to messageService.markConversationAsRead with conversationId and currentUid", async () => {
      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      await act(async () => {
        await result.current.markAsRead();
      });

      expect(mockService.markConversationAsRead).toHaveBeenCalledWith(
        "user_alice_user_bob",
        "user_alice"
      );
    });

    it("safely catches and logs errors without throwing", async () => {
      mockService.markConversationAsRead.mockRejectedValue(
        new Error("Permission denied")
      );

      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      // Should not throw
      await act(async () => {
        await result.current.markAsRead();
      });

      expect(mockService.markConversationAsRead).toHaveBeenCalledTimes(1);
    });
  });

  describe("Older-message pagination & duplicate prevention", () => {
    it("paginates older messages using cursor and prepends them chronologically", async () => {
      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      const rawDoc2 = { id: "m2", data: () => ({ content: "Msg 2" }) };
      const rawDoc1 = { id: "m1", data: () => ({ content: "Msg 1" }) };

      // Initial real-time page (2 messages)
      snapshotCallback(
        [
          { id: "m2", content: "Msg 2", createdAt: new Date(2000) },
          { id: "m1", content: "Msg 1", createdAt: new Date(1000) },
        ],
        [rawDoc2, rawDoc1]
      );

      expect(result.current.messages.map((m) => m.id)).toEqual(["m1", "m2"]);

      // Mock older page return
      const olderDocs = [
        { id: "m0", content: "Msg 0", createdAt: new Date(500) },
      ];
      mockService.fetchOlderMessages.mockResolvedValue(olderDocs);

      await act(async () => {
        await result.current.fetchOlderMessages();
      });

      expect(mockService.fetchOlderMessages).toHaveBeenCalledWith(
        "user_alice_user_bob",
        rawDoc1 // cursor initialized from oldest item of initial page
      );

      // Messages are chronologically merged: m0 (500) -> m1 (1000) -> m2 (2000)
      expect(result.current.messages.map((m) => m.id)).toEqual([
        "m0",
        "m1",
        "m2",
      ]);
    });

    it("prevents duplicates when real-time and paginated results overlap", async () => {
      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      snapshotCallback([
        { id: "m2", content: "Msg 2", createdAt: new Date(2000) },
        { id: "m1", content: "Msg 1", createdAt: new Date(1000) },
      ]);

      // Mock older page that includes an overlapping 'm1' and a truly older 'm0'
      mockService.fetchOlderMessages.mockResolvedValue([
        { id: "m1", content: "Msg 1 (overlapping)", createdAt: new Date(1000) },
        { id: "m0", content: "Msg 0", createdAt: new Date(500) },
      ]);

      await act(async () => {
        await result.current.fetchOlder();
      });

      expect(result.current.messages.map((m) => m.id)).toEqual([
        "m0",
        "m1",
        "m2",
      ]);
      expect(result.current.messages).toHaveLength(3);
    });

    it("merges newly arrived real-time messages while older messages are loaded", async () => {
      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      // 1. Initial snapshot: m2, m1
      snapshotCallback([
        { id: "m2", content: "Msg 2", createdAt: new Date(2000) },
        { id: "m1", content: "Msg 1", createdAt: new Date(1000) },
      ]);

      // 2. Fetch older message: m0
      mockService.fetchOlderMessages.mockResolvedValue([
        { id: "m0", content: "Msg 0", createdAt: new Date(500) },
      ]);

      await act(async () => {
        await result.current.fetchOlder();
      });

      expect(result.current.messages.map((m) => m.id)).toEqual([
        "m0",
        "m1",
        "m2",
      ]);

      // 3. New real-time message m3 arrives
      snapshotCallback([
        { id: "m3", content: "Msg 3 (New real-time)", createdAt: new Date(3000) },
        { id: "m2", content: "Msg 2", createdAt: new Date(2000) },
        { id: "m1", content: "Msg 1", createdAt: new Date(1000) },
      ]);

      // Combined should contain m0, m1, m2, m3
      expect(result.current.messages.map((m) => m.id)).toEqual([
        "m0",
        "m1",
        "m2",
        "m3",
      ]);
    });

    it("marks hasMore as false when fewer than page size messages are returned", async () => {
      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      snapshotCallback([
        { id: "m1", content: "Msg 1", createdAt: new Date(1000) },
      ]);

      // Returns 1 message (< 25 default page size)
      mockService.fetchOlderMessages.mockResolvedValue([
        { id: "m0", content: "Msg 0", createdAt: new Date(500) },
      ]);

      await act(async () => {
        await result.current.fetchOlder();
      });

      expect(result.current.hasMore).toBe(false);

      // Calling fetchOlder again should no-op
      mockService.fetchOlderMessages.mockClear();
      await act(async () => {
        await result.current.fetchOlder();
      });
      expect(mockService.fetchOlderMessages).not.toHaveBeenCalled();
    });

    it("handles load-older failure gracefully without mutating cursor so user can retry", async () => {
      const { result } = renderHook(() =>
        useConversationMessages("user_alice_user_bob")
      );

      snapshotCallback([
        { id: "m1", content: "Msg 1", createdAt: new Date(1000) },
      ]);

      mockService.fetchOlderMessages.mockRejectedValue(
        new Error("Quota exceeded")
      );

      await act(async () => {
        await result.current.fetchOlder();
      });

      expect(result.current.isFetchingOlder).toBe(false);
      expect(result.current.olderError).toBe("Quota exceeded");
      expect(result.current.hasMore).toBe(true);

      // Can retry successfully
      mockService.fetchOlderMessages.mockResolvedValue([
        { id: "m0", content: "Msg 0", createdAt: new Date(500) },
      ]);

      await act(async () => {
        await result.current.fetchOlder();
      });

      expect(result.current.olderError).toBeNull();
      expect(result.current.messages.map((m) => m.id)).toEqual(["m0", "m1"]);
    });
  });
});
