import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "./hookTestUtils";

// Mock useAuth
const mockAuthUser = { uid: "user_alice", displayName: "Alice Student" };
let currentMockUser = mockAuthUser;

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ user: currentMockUser }),
}));

// Mock messageService
const mockService = {
  subscribeToConversations: vi.fn(),
};

vi.mock("../../src/services/messageService", () => ({
  subscribeToConversations: (...args) => mockService.subscribeToConversations(...args),
}));

// Import hook under test after mocks
import { useConversations } from "../../src/hooks/useConversations";

describe("Milestone 16 — Unit 16.4: useConversations Hook", () => {
  let unsubscribeSpy;
  let snapshotCallback;
  let errorCallback;

  beforeEach(() => {
    vi.clearAllMocks();
    currentMockUser = mockAuthUser;

    unsubscribeSpy = vi.fn();
    mockService.subscribeToConversations.mockImplementation(
      (_uid, onNext, onError) => {
        snapshotCallback = onNext;
        errorCallback = onError;
        return unsubscribeSpy;
      }
    );
  });

  it("subscribes through messageService.subscribeToConversations with currentUid", () => {
    renderHook(() => useConversations());

    expect(mockService.subscribeToConversations).toHaveBeenCalledTimes(1);
    expect(mockService.subscribeToConversations).toHaveBeenCalledWith(
      "user_alice",
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("initializes with loading state and empty conversations", () => {
    const { result } = renderHook(() => useConversations());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.conversations).toEqual([]);
    expect(result.current.totalUnread).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it("updates conversations and finishes loading when subscription emits data", () => {
    const { result } = renderHook(() => useConversations());

    const sampleConversations = [
      {
        id: "user_alice_user_bob",
        participants: ["user_alice", "user_bob"],
        lastMessage: { content: "Hello from Bob", senderId: "user_bob" },
        unreadCount: { user_alice: 2, user_bob: 0 },
        updatedAt: new Date(2026, 8, 29, 12, 0, 0),
      },
      {
        id: "user_alice_user_carol",
        participants: ["user_alice", "user_carol"],
        lastMessage: { content: "Hey Alice!", senderId: "user_carol" },
        unreadCount: { user_alice: 1, user_carol: 0 },
        updatedAt: new Date(2026, 8, 29, 11, 0, 0),
      },
    ];

    snapshotCallback(sampleConversations);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.conversations).toEqual(sampleConversations);
    expect(result.current.error).toBeNull();
  });

  it("preserves conversation ordering supplied by the service", () => {
    const { result } = renderHook(() => useConversations());

    const orderedList = [
      { id: "conv_3", updatedAt: new Date(300) },
      { id: "conv_1", updatedAt: new Date(200) },
      { id: "conv_2", updatedAt: new Date(100) },
    ];

    snapshotCallback(orderedList);

    expect(result.current.conversations.map((c) => c.id)).toEqual([
      "conv_3",
      "conv_1",
      "conv_2",
    ]);
  });

  it("derives current user's total unread message count accurately", () => {
    const { result } = renderHook(() => useConversations());

    snapshotCallback([
      { id: "c1", unreadCount: { user_alice: 3, user_bob: 0 } },
      { id: "c2", unreadCount: { user_alice: 2, user_carol: 1 } },
      { id: "c3", unreadCount: { user_alice: 0, user_dave: 5 } },
    ]);

    expect(result.current.totalUnread).toBe(5);
    expect(result.current.unreadCount).toBe(5);
  });

  it("handles missing, negative, or corrupted unread counts safely without crashing", () => {
    const { result } = renderHook(() => useConversations());

    snapshotCallback([
      { id: "c1", unreadCount: null },
      { id: "c2", unreadCount: { user_alice: -3 } },
      { id: "c3", unreadCount: { user_alice: "corrupted" } },
      { id: "c4", unreadCount: { user_alice: 4 } },
      { id: "c5" },
    ]);

    expect(result.current.totalUnread).toBe(4);
  });

  it("cleanly unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useConversations());

    expect(unsubscribeSpy).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it("cleanly unsubscribes and re-subscribes when user changes", () => {
    const { rerender } = renderHook(() => useConversations());

    expect(mockService.subscribeToConversations).toHaveBeenCalledWith(
      "user_alice",
      expect.any(Function),
      expect.any(Function)
    );

    // Switch user
    currentMockUser = { uid: "user_bob", displayName: "Bob Student" };
    rerender();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    expect(mockService.subscribeToConversations).toHaveBeenCalledTimes(2);
    expect(mockService.subscribeToConversations).toHaveBeenLastCalledWith(
      "user_bob",
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("safely handles unauthenticated state (missing currentUid)", () => {
    currentMockUser = null;
    const { result } = renderHook(() => useConversations());

    expect(mockService.subscribeToConversations).not.toHaveBeenCalled();
    expect(result.current.conversations).toEqual([]);
    expect(result.current.totalUnread).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("handles subscription error without crashing and surfaces error message", () => {
    const { result } = renderHook(() => useConversations());

    errorCallback(new Error("Permission denied to read conversations."));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe("Permission denied to read conversations.");
    expect(result.current.conversations).toEqual([]);
    expect(result.current.totalUnread).toBe(0);
  });
});
