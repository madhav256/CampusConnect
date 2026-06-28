import { useState, useEffect } from "react";
import { subscribeToPosts, createPost, deletePost } from "../services/postService";
import { useAuth } from "./useAuth";

export function usePosts() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToPosts(
      (newPosts) => {
        setPosts(newPosts);
        setIsLoading(false);
      },
      (err) => {
        console.error("Error subscribing to posts:", err);
        setError("Failed to load posts.");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const addPost = async (content) => {
    if (!user) throw new Error("Must be logged in to post.");
    if (!content || !content.trim()) throw new Error("Post content cannot be empty.");

    await createPost(user.uid, user.name || "Student", user.avatar || null, content);
  };

  const removePost = async (postId) => {
    if (!user) throw new Error("Must be logged in to delete.");
    
    // Safety check: The UI shouldn't allow deleting others' posts, but we should verify the author in Security Rules ideally. 
    // Here we just call deletePost.
    await deletePost(postId);
  };

  return {
    posts,
    isLoading,
    error,
    addPost,
    removePost,
  };
}
