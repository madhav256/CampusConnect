import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  startAt,
  endBefore,
  endAt,
  updateDoc,
  getDocs
} from "firebase/firestore";

import { db, isFirebaseConfigured } from "../firebase/config";
import { POSTS_PER_PAGE } from "../constants";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

export async function createPost(authorId, authorName, authorAvatar, content) {
  const postsRef = collection(requireDb(), "posts");

  const newPost = {
    authorId,
    authorName,
    authorAvatar,
    content: content.trim(),
    likesCount: 0,
    commentsCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(postsRef, newPost);
  return docRef.id;
}

export function subscribeToNewerPosts(callback, onError, newestPostDoc = null) {
  const postsRef = collection(requireDb(), "posts");
  let q = query(postsRef, orderBy("createdAt", "desc"));

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

export async function fetchOlderPosts(pageSize, oldestPostDoc = null) {
  const postsRef = collection(requireDb(), "posts");
  let q = query(postsRef, orderBy("createdAt", "desc"), limit(pageSize));

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

export function subscribeToEmptyFeed(callback, onError) {
  const postsRef = collection(requireDb(), "posts");
  // Empty-feed realtime bootstrap: orderBy("createdAt", "desc") + limit(1)
  const q = query(
    postsRef,
    orderBy("createdAt", "desc"),
    limit(1)
  );

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

export function subscribeToBootstrapPosts(callback, onError) {
  const postsRef = collection(requireDb(), "posts");
  const BOOTSTRAP_LIMIT = POSTS_PER_PAGE * 3;
  const q = query(
    postsRef,
    orderBy("createdAt", "desc"),
    limit(BOOTSTRAP_LIMIT)
  );

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

export function subscribeToPostUpdatesInRange(newestDoc, oldestDoc, callback, onError) {
  if (!newestDoc || !oldestDoc) {
    return () => {};
  }

  const postsRef = collection(requireDb(), "posts");
  const q = query(
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
}

export async function updateCommentsCount(postId, amount) {
  const postRef = doc(requireDb(), "posts", postId);
  await updateDoc(postRef, {
    commentsCount: increment(amount),
    updatedAt: serverTimestamp(),
  });
}
