import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((_db, ...segments) => ({
    path: segments.join("/"),
    id: segments[segments.length - 1],
  })),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _methodName: "serverTimestamp" })),
  mockDb: { id: "mock-db" },
}));

vi.mock("../../src/firebase/config", () => ({
  db: mocks.mockDb,
  isFirebaseConfigured: true,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  runTransaction: mocks.runTransaction,
  onSnapshot: mocks.onSnapshot,
  serverTimestamp: mocks.serverTimestamp,
}));

import {
  togglePostLike,
  subscribeToPostLike,
} from "../../src/services/likeService.js";

describe("likeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("togglePostLike", () => {
    it("throws if postId or userId is missing", async () => {
      await expect(togglePostLike("", "user-1")).rejects.toThrow(
        "Post ID and User ID are required to like or unlike a post."
      );
      await expect(togglePostLike("post-1", null)).rejects.toThrow(
        "Post ID and User ID are required to like or unlike a post."
      );
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it("throws if parent post does not exist", async () => {
      const mockTx = {
        get: vi.fn().mockImplementation((ref) => {
          if (ref.path === "posts/post-missing") {
            return { exists: () => false };
          }
          return { exists: () => false };
        }),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      await expect(togglePostLike("post-missing", "user-1")).rejects.toThrow(
        "Post does not exist."
      );
    });

    it("likes post when user has not yet liked (creates like doc and increments count)", async () => {
      const mockTx = {
        get: vi.fn().mockImplementation((ref) => {
          if (ref.path === "posts/post-1") {
            return { exists: () => true, data: () => ({ likesCount: 3 }) };
          }
          if (ref.path === "posts/post-1/likes/user-1") {
            return { exists: () => false };
          }
          return { exists: () => false };
        }),
        set: vi.fn(),
        update: vi.fn(),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      const result = await togglePostLike("post-1", "user-1");

      expect(mockTx.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: "posts/post-1/likes/user-1" }),
        expect.objectContaining({ userId: "user-1" })
      );

      expect(mockTx.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "posts/post-1" }),
        expect.objectContaining({ likesCount: 4 })
      );

      expect(result).toEqual({ isLiked: true, likesCount: 4 });
    });

    it("unlikes post when user already liked (deletes like doc and decrements count)", async () => {
      const mockTx = {
        get: vi.fn().mockImplementation((ref) => {
          if (ref.path === "posts/post-1") {
            return { exists: () => true, data: () => ({ likesCount: 4 }) };
          }
          if (ref.path === "posts/post-1/likes/user-1") {
            return { exists: () => true };
          }
          return { exists: () => false };
        }),
        delete: vi.fn(),
        update: vi.fn(),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      const result = await togglePostLike("post-1", "user-1");

      expect(mockTx.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: "posts/post-1/likes/user-1" })
      );

      expect(mockTx.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "posts/post-1" }),
        expect.objectContaining({ likesCount: 3 })
      );

      expect(result).toEqual({ isLiked: false, likesCount: 3 });
    });

    it("clamps likesCount to 0 if post currently has 0 likes during unlike", async () => {
      const mockTx = {
        get: vi.fn().mockImplementation((ref) => {
          if (ref.path === "posts/post-1") {
            return { exists: () => true, data: () => ({ likesCount: 0 }) };
          }
          if (ref.path === "posts/post-1/likes/user-1") {
            return { exists: () => true };
          }
          return { exists: () => false };
        }),
        delete: vi.fn(),
        update: vi.fn(),
      };
      mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

      const result = await togglePostLike("post-1", "user-1");

      expect(mockTx.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "posts/post-1" }),
        expect.objectContaining({ likesCount: 0 })
      );
      expect(result).toEqual({ isLiked: false, likesCount: 0 });
    });
  });

  describe("subscribeToPostLike", () => {
    it("calls callback(false) and returns noop unsubscribe when IDs are missing", () => {
      const cb = vi.fn();
      const unsub = subscribeToPostLike(null, "user-1", cb);

      expect(cb).toHaveBeenCalledWith(false);
      expect(typeof unsub).toBe("function");
      expect(mocks.onSnapshot).not.toHaveBeenCalled();
    });

    it("subscribes to like doc and emits boolean existence", () => {
      let snapCb;
      mocks.onSnapshot.mockImplementation((_ref, onNext) => {
        snapCb = onNext;
        return vi.fn();
      });

      const cb = vi.fn();
      subscribeToPostLike("post-1", "user-1", cb);

      expect(mocks.doc).toHaveBeenCalledWith(mocks.mockDb, "posts", "post-1", "likes", "user-1");

      snapCb({ exists: () => true });
      expect(cb).toHaveBeenCalledWith(true);

      snapCb({ exists: () => false });
      expect(cb).toHaveBeenCalledWith(false);
    });

    it("forwards listener error to onError callback", () => {
      let errCb;
      mocks.onSnapshot.mockImplementation((_ref, _onNext, onErr) => {
        errCb = onErr;
        return vi.fn();
      });

      const cb = vi.fn();
      const onErr = vi.fn();
      subscribeToPostLike("post-1", "user-1", cb, onErr);

      const error = new Error("Firestore listener failed");
      errCb(error);

      expect(onErr).toHaveBeenCalledWith(error);
    });
  });
});
