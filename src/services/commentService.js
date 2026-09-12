import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  increment,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import { fetchUserById } from "./userService";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

export async function createComment(postId, authorId, authorName, authorAvatar, content) {
  const firestore = requireDb();
  const authorProfile = await fetchUserById(authorId);

  if (!authorProfile) {
    throw new Error("Your profile is not ready. Please try again.");
  }

  // Reference to the subcollection
  const commentsRef = collection(firestore, "posts", postId, "comments");
  const newCommentRef = doc(commentsRef);

  // Reference to the parent post
  const postRef = doc(firestore, "posts", postId);

  const newComment = {
    authorId,
    authorName: authorProfile.displayName,
    authorAvatar: authorProfile.photoURL,
    content: content.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(firestore);
  batch.set(newCommentRef, newComment);
  batch.update(postRef, {
    commentsCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return newCommentRef.id;
}

export function subscribeToComments(postId, callback, onError) {
  const firestore = requireDb();
  const commentsRef = collection(firestore, "posts", postId, "comments");
  const q = query(commentsRef, orderBy("createdAt", "asc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const comments = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      callback(comments);
    },
    onError
  );
}

export function deleteComment(postId, commentId) {
  const firestore = requireDb();

  const commentRef = doc(firestore, "posts", postId, "comments", commentId);
  const postRef = doc(firestore, "posts", postId);

  const batch = writeBatch(firestore);
  batch.delete(commentRef);
  batch.update(postRef, {
    commentsCount: increment(-1),
    updatedAt: serverTimestamp(),
  });

  return batch.commit();
}
