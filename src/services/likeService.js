import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
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

/**
 * Atomically toggles like status for a post.
 * Uses a Firestore transaction to guarantee that:
 * 1. The like document is either created or deleted.
 * 2. The post's likesCount is updated by exactly +1 or -1 in the same transaction.
 * 3. Race conditions and duplicate clicks are prevented.
 *
 * @param {string} postId - ID of the post
 * @param {string} userId - Auth UID of the user
 * @returns {Promise<{isLiked: boolean, likesCount: number}>} Resulting like state and updated likes count
 */
export async function togglePostLike(postId, userId) {
  if (!postId || !userId) {
    throw new Error("Post ID and User ID are required to like or unlike a post.");
  }

  const firestore = requireDb();
  const likeRef = doc(firestore, "posts", postId, "likes", userId);
  const postRef = doc(firestore, "posts", postId);

  return runTransaction(firestore, async (transaction) => {
    const likeDoc = await transaction.get(likeRef);
    const postDoc = await transaction.get(postRef);

    if (!postDoc.exists()) {
      throw new Error("Post does not exist.");
    }

    const currentLikes = postDoc.data()?.likesCount || 0;

    if (likeDoc.exists()) {
      // User already liked: unlike post
      transaction.delete(likeRef);
      transaction.update(postRef, {
        likesCount: Math.max(0, currentLikes - 1),
        updatedAt: serverTimestamp(),
      });
      return {
        isLiked: false,
        likesCount: Math.max(0, currentLikes - 1)
      };
    } else {
      // User has not liked: like post
      transaction.set(likeRef, {
        userId,
        createdAt: serverTimestamp(),
      });
      transaction.update(postRef, {
        likesCount: currentLikes + 1,
        updatedAt: serverTimestamp(),
      });
      return {
        isLiked: true,
        likesCount: currentLikes + 1
      };
    }
  });
}

/**
 * Subscribes in real-time to the current user's like document for a specific post.
 * Listens ONLY to posts/{postId}/likes/{userId} to avoid N+1 queries.
 *
 * @param {string} postId - ID of the post
 * @param {string} userId - Auth UID of the user
 * @param {function} callback - Callback invoked with boolean (true if liked, false if unliked)
 * @param {function} [onError] - Optional error callback
 * @returns {function} Unsubscribe function
 */
export function subscribeToPostLike(postId, userId, callback, onError) {
  if (!postId || !userId) {
    callback(false);
    return () => {};
  }

  const firestore = requireDb();
  const likeRef = doc(firestore, "posts", postId, "likes", userId);

  return onSnapshot(
    likeRef,
    (snapshot) => {
      callback(snapshot.exists());
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.error("Error subscribing to post like:", error);
      }
    }
  );
}