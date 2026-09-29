import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((collOrDb, ...segments) => {
    if (typeof collOrDb === "object" && collOrDb?.path) {
      const subPath = segments.length > 0 ? segments.join("/") : "auto-id";
      return { path: `${collOrDb.path}/${subPath}`, id: subPath };
    }
    return {
      path: segments.join("/"),
      id: segments[segments.length - 1],
    };
  }),
  collection: vi.fn((_db, ...segments) => ({ path: segments.join("/") })),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  onSnapshot: vi.fn(),
  writeBatch: vi.fn(),
  increment: vi.fn((n) => ({ _increment: n })),
  getDoc: vi.fn(),
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
  orderBy: mocks.orderBy,
  onSnapshot: mocks.onSnapshot,
  writeBatch: mocks.writeBatch,
  increment: mocks.increment,
  getDoc: mocks.getDoc,
  serverTimestamp: mocks.serverTimestamp,
}));

vi.mock("../../src/services/userService", () => ({
  fetchUserById: mocks.fetchUserById,
}));

import {
  createComment,
  deleteComment,
  subscribeToComments,
} from "../../src/services/commentService.js";

describe("commentService", () => {
  let mockBatch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBatch = {
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    mocks.writeBatch.mockReturnValue(mockBatch);
  });

  describe("createComment", () => {
    it("throws if author public profile is missing", async () => {
      mocks.fetchUserById.mockResolvedValue(null);

      await expect(
        createComment("post-1", "user-1", "Name", null, "Hello")
      ).rejects.toThrow("Your profile is not ready. Please try again.");

      expect(mockBatch.commit).not.toHaveBeenCalled();
    });

    it("atomically creates comment in subcollection and increments post commentsCount", async () => {
      mocks.fetchUserById.mockResolvedValue({
        displayName: "Verified Author",
        photoURL: "https://avatar.test/photo.jpg",
      });

      mocks.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ commentsCount: 5 }),
      });

      const result = await createComment(
        "post-1",
        "user-1",
        "Unused Raw Name",
        null,
        "   Trimmed comment content.   "
      );

      expect(mockBatch.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining("posts/post-1/comments") }),
        expect.objectContaining({
          authorId: "user-1",
          authorName: "Verified Author",
          authorAvatar: "https://avatar.test/photo.jpg",
          content: "Trimmed comment content.",
        })
      );

      expect(mocks.increment).toHaveBeenCalledWith(1);
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "posts/post-1" }),
        expect.objectContaining({
          commentsCount: { _increment: 1 },
        })
      );

      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        commentId: expect.any(String),
        commentsCount: 5,
      });
    });

    it("falls back to commentsCount 0 if post document is missing after write", async () => {
      mocks.fetchUserById.mockResolvedValue({
        displayName: "Alice",
        photoURL: null,
      });

      mocks.getDoc.mockResolvedValue({
        exists: () => false,
      });

      const result = await createComment("post-1", "user-1", "Alice", null, "Hi");

      expect(result.commentsCount).toBe(0);
    });
  });

  describe("deleteComment", () => {
    it("atomically deletes comment and decrements post commentsCount", async () => {
      mocks.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ commentsCount: 4 }),
      });

      const result = await deleteComment("post-1", "comment-1");

      expect(mockBatch.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: "posts/post-1/comments/comment-1" })
      );

      expect(mocks.increment).toHaveBeenCalledWith(-1);
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "posts/post-1" }),
        expect.objectContaining({
          commentsCount: { _increment: -1 },
        })
      );

      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        success: true,
        commentsCount: 4,
      });
    });

    it("falls back to commentsCount 0 if post document is missing after delete", async () => {
      mocks.getDoc.mockResolvedValue({
        exists: () => false,
      });

      const result = await deleteComment("post-1", "comment-1");

      expect(result).toEqual({
        success: true,
        commentsCount: 0,
      });
    });
  });

  describe("subscribeToComments", () => {
    it("queries comments subcollection ordered by createdAt asc and emits mapped items", () => {
      let snapCb;
      mocks.onSnapshot.mockImplementation((_q, onNext) => {
        snapCb = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      const onError = vi.fn();

      subscribeToComments("post-1", callback, onError);

      expect(mocks.collection).toHaveBeenCalledWith(mocks.mockDb, "posts", "post-1", "comments");
      expect(mocks.orderBy).toHaveBeenCalledWith("createdAt", "asc");

      snapCb({
        docs: [
          { id: "c1", data: () => ({ content: "First comment" }) },
          { id: "c2", data: () => ({ content: "Second comment" }) },
        ],
      });

      expect(callback).toHaveBeenCalledWith([
        { id: "c1", content: "First comment" },
        { id: "c2", content: "Second comment" },
      ]);
    });
  });
});
