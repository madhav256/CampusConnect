import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  collection: vi.fn((_db, name) => ({ path: name })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  startAt: vi.fn((doc) => ({ startAt: doc })),
  endAt: vi.fn((doc) => ({ endAt: doc })),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  increment: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: vi.fn(),
  startAfter: vi.fn(),
  endBefore: vi.fn(),
  updateDoc: vi.fn(),
  getDocs: vi.fn(),
  mockDb: { id: "mock-db" },
}));

vi.mock("../../src/firebase/config", () => ({
  db: mocks.mockDb,
  isFirebaseConfigured: true,
}));

vi.mock("firebase/firestore", () => ({
  collection: mocks.collection,
  addDoc: mocks.addDoc,
  deleteDoc: mocks.deleteDoc,
  doc: mocks.doc,
  increment: mocks.increment,
  limit: mocks.limit,
  onSnapshot: mocks.onSnapshot,
  orderBy: mocks.orderBy,
  query: mocks.query,
  serverTimestamp: mocks.serverTimestamp,
  startAfter: mocks.startAfter,
  startAt: mocks.startAt,
  endBefore: mocks.endBefore,
  endAt: mocks.endAt,
  updateDoc: mocks.updateDoc,
  getDocs: mocks.getDocs,
}));

import { subscribeToPostUpdatesInRange } from "../../src/services/postService.js";

describe("subscribeToPostUpdatesInRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("constructs the query with orderBy desc and startAt/endAt boundaries", () => {
    mocks.onSnapshot.mockReturnValue(vi.fn());

    const newestDoc = { id: "doc-newest" };
    const oldestDoc = { id: "doc-oldest" };
    const callback = vi.fn();
    const onError = vi.fn();

    subscribeToPostUpdatesInRange(newestDoc, oldestDoc, callback, onError);

    expect(mocks.collection).toHaveBeenCalledWith(mocks.mockDb, "posts");
    expect(mocks.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(mocks.startAt).toHaveBeenCalledWith(newestDoc);
    expect(mocks.endAt).toHaveBeenCalledWith(oldestDoc);

    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({ path: "posts" }),
      expect.objectContaining({ field: "createdAt", dir: "desc" }),
      expect.objectContaining({ startAt: newestDoc }),
      expect.objectContaining({ endAt: oldestDoc })
    );

    expect(mocks.onSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      onError
    );
  });

  it("processes initial snapshot containing an added document", () => {
    const docData = { content: "Initial post", likesCount: 0, commentsCount: 0 };
    const mockDoc = { id: "post-1", data: () => docData };
    const mockSnapshot = {
      docs: [mockDoc],
      docChanges: () => [{ type: "added", doc: mockDoc }],
    };

    mocks.onSnapshot.mockImplementation((_queryObj, onNext) => {
      onNext(mockSnapshot);
      return vi.fn();
    });

    const callback = vi.fn();
    const newestDoc = { id: "newest-cursor" };
    const oldestDoc = { id: "oldest-cursor" };

    subscribeToPostUpdatesInRange(newestDoc, oldestDoc, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(mockDoc);
  });

  it("captures snapshot listener and processes subsequent modified document updates", () => {
    let capturedOnNext;
    mocks.onSnapshot.mockImplementation((_queryObj, onNext) => {
      capturedOnNext = onNext;
      return vi.fn();
    });

    const callback = vi.fn();
    const newestDoc = { id: "newest-cursor" };
    const oldestDoc = { id: "oldest-cursor" };

    subscribeToPostUpdatesInRange(newestDoc, oldestDoc, callback);

    expect(typeof capturedOnNext).toBe("function");

    const modifiedDoc = {
      id: "post-1",
      data: () => ({ content: "Initial post", likesCount: 3, commentsCount: 1 }),
    };
    const modifiedSnapshot = {
      docs: [modifiedDoc],
      docChanges: () => [{ type: "modified", doc: modifiedDoc }],
    };

    capturedOnNext(modifiedSnapshot);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(modifiedDoc);
  });

  it("does not invoke the consumer callback when a document is removed", () => {
    let capturedOnNext;
    mocks.onSnapshot.mockImplementation((_queryObj, onNext) => {
      capturedOnNext = onNext;
      return vi.fn();
    });

    const callback = vi.fn();
    const newestDoc = { id: "newest-cursor" };
    const oldestDoc = { id: "oldest-cursor" };

    subscribeToPostUpdatesInRange(newestDoc, oldestDoc, callback);

    const removedDoc = {
      id: "post-deleted",
      data: () => ({ content: "Deleted post" }),
    };
    // When a document is removed from the query range, it is not present in snapshot.docs
    const removedSnapshot = {
      docs: [],
      docChanges: () => [{ type: "removed", doc: removedDoc }],
    };

    capturedOnNext(removedSnapshot);

    expect(callback).not.toHaveBeenCalled();
  });

  it("forwards Firestore snapshot errors to the supplied onError callback", () => {
    let capturedOnError;
    mocks.onSnapshot.mockImplementation((_queryObj, _onNext, onError) => {
      capturedOnError = onError;
      return vi.fn();
    });

    const callback = vi.fn();
    const onError = vi.fn();
    const newestDoc = { id: "newest-cursor" };
    const oldestDoc = { id: "oldest-cursor" };

    subscribeToPostUpdatesInRange(newestDoc, oldestDoc, callback, onError);

    expect(typeof capturedOnError).toBe("function");

    const firestoreError = new Error("Firestore listener permission denied");
    capturedOnError(firestoreError);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(firestoreError);
    expect(callback).not.toHaveBeenCalled();
  });

  it("calls the underlying unsubscribe function and suppresses later snapshots after unsubscribe", () => {
    let isSubscribed = true;
    let capturedOnNext;
    const underlyingUnsubscribe = vi.fn(() => {
      isSubscribed = false;
    });

    mocks.onSnapshot.mockImplementation((_queryObj, onNext) => {
      capturedOnNext = (snapshot) => {
        if (isSubscribed) {
          onNext(snapshot);
        }
      };
      return underlyingUnsubscribe;
    });

    const callback = vi.fn();
    const newestDoc = { id: "newest-cursor" };
    const oldestDoc = { id: "oldest-cursor" };

    const unsubscribe = subscribeToPostUpdatesInRange(newestDoc, oldestDoc, callback);

    expect(underlyingUnsubscribe).not.toHaveBeenCalled();

    unsubscribe();
    expect(underlyingUnsubscribe).toHaveBeenCalledTimes(1);

    const subsequentDoc = { id: "post-late", data: () => ({ likesCount: 99 }) };
    const subsequentSnapshot = {
      docs: [subsequentDoc],
      docChanges: () => [{ type: "modified", doc: subsequentDoc }],
    };
    capturedOnNext(subsequentSnapshot);

    expect(callback).not.toHaveBeenCalled();
  });

  it("returns a no-op unsubscribe function when boundaries are missing", () => {
    const callback = vi.fn();

    const unsubNull = subscribeToPostUpdatesInRange(null, null, callback);
    expect(typeof unsubNull).toBe("function");
    expect(() => unsubNull()).not.toThrow();

    const unsubMissingOldest = subscribeToPostUpdatesInRange({ id: "doc-1" }, null, callback);
    expect(typeof unsubMissingOldest).toBe("function");
    expect(() => unsubMissingOldest()).not.toThrow();

    const unsubMissingNewest = subscribeToPostUpdatesInRange(null, { id: "doc-2" }, callback);
    expect(typeof unsubMissingNewest).toBe("function");
    expect(() => unsubMissingNewest()).not.toThrow();

    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.onSnapshot).not.toHaveBeenCalled();
  });
});