import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
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

export function subscribeToPosts(callback, onError) {
  const postsRef = collection(requireDb(), "posts");
  // Order posts by creation time descending (newest first)
  const q = query(postsRef, orderBy("createdAt", "desc"));
  
  return onSnapshot(
    q,
    (snapshot) => {
      const posts = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      callback(posts);
    },
    onError
  );
}

export async function deletePost(postId) {
  const postRef = doc(requireDb(), "posts", postId);
  await deleteDoc(postRef);
}
