import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  startAt,
  endBefore,
  endAt,
  getDocs,
  where,
} from "firebase/firestore";

import { db, isFirebaseConfigured } from "../firebase/config";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

function resolveCampusId(opt) {
  if (!opt) return null;
  if (typeof opt === "string") return opt;
  if (typeof opt === "object" && opt.campusId) return opt.campusId;
  return null;
}

export async function createPost(authorId, authorName, authorAvatar, content, campusIdOrOptions = null) {
  const postsRef = collection(requireDb(), "posts");
  const campusId = resolveCampusId(campusIdOrOptions);

  const newPost = {
    authorId,
    authorName,
    authorAvatar,
    content: content.trim(),
    likesCount: 0,
    commentsCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(campusId ? { campusId } : {}),
  };

  const docRef = await addDoc(postsRef, newPost);
  return docRef.id;
}

export function subscribeToNewerPosts(callback, onError, newestPostDoc = null, campusIdOrOptions = null) {
  const postsRef = collection(requireDb(), "posts");
  const campusId = resolveCampusId(campusIdOrOptions);

  let q = campusId
    ? query(postsRef, where("campusId", "==", campusId), orderBy("createdAt", "desc"))
    : query(postsRef, orderBy("createdAt", "desc"));

  if (newestPostDoc !== null) {
    // Get posts strictly newer than newestPostDoc (higher timestamp)
    q = query(q, endBefore(newestPostDoc));
  }

  // Returns DocumentSnapshots in the callback
  return onSnapshot(
    q,
    (snapshot) => {
      // snapshot.docs is an array of DocumentSnapshot, newest first due to desc sort
      callback(snapshot.docs);
    },
    onError
  );
}

export async function fetchOlderPosts(pageSize, oldestPostDoc = null, campusIdOrOptions = null) {
  const postsRef = collection(requireDb(), "posts");
  const campusId = resolveCampusId(campusIdOrOptions);

  let q = campusId
    ? query(postsRef, where("campusId", "==", campusId), orderBy("createdAt", "desc"), limit(pageSize))
    : query(postsRef, orderBy("createdAt", "desc"), limit(pageSize));

  if (oldestPostDoc !== null) {
    // Get posts strictly older than oldestPostDoc (lower timestamp)
    q = query(q, startAfter(oldestPostDoc));
  }

  const snapshot = await getDocs(q);
  // Return DocumentSnapshots (newest first due to desc sort)
  return snapshot.docs;
}

export async function deletePost(postId) {
  const postRef = doc(requireDb(), "posts", postId);
  await deleteDoc(postRef);
}

export function subscribeToEmptyFeed(callback, onError, campusIdOrOptions = null) {
  const postsRef = collection(requireDb(), "posts");
  const campusId = resolveCampusId(campusIdOrOptions);

  const q = campusId
    ? query(postsRef, where("campusId", "==", campusId), orderBy("createdAt", "desc"), limit(1))
    : query(postsRef, orderBy("createdAt", "desc"), limit(1));

  // Returns DocumentSnapshots in the callback
  return onSnapshot(
    q,
    (snapshot) => {
      // snapshot.docs is an array of DocumentSnapshot, newest first due to desc sort
      callback(snapshot.docs);
    },
    onError
  );
}

export function subscribeToPostUpdatesInRange(newestDoc, oldestDoc, callback, onError, campusIdOrOptions = null) {
  if (!newestDoc || !oldestDoc) {
    return () => {};
  }

  // A document with pending writes has an uncommitted server timestamp for createdAt,
  // which Firestore forbids using in startAt/endAt query cursors.
  if (newestDoc.metadata?.hasPendingWrites || oldestDoc.metadata?.hasPendingWrites) {
    return () => {};
  }

  try {
    const postsRef = collection(requireDb(), "posts");
    const campusId = resolveCampusId(campusIdOrOptions);

    const q = campusId
      ? query(
          postsRef,
          where("campusId", "==", campusId),
          orderBy("createdAt", "desc"),
          startAt(newestDoc),
          endAt(oldestDoc)
        )
      : query(
          postsRef,
          orderBy("createdAt", "desc"),
          startAt(newestDoc),
          endAt(oldestDoc)
        );

    return onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added" || change.type === "modified") {
            callback(change.doc);
          }
        });
      },
      onError
    );
  } catch (err) {
    if (onError) {
      onError(err);
    }
    return () => {};
  }
}
