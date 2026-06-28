import { useState, useEffect } from "react";
import { subscribeToComments, createComment, deleteComment } from "../services/commentService";
import { useAuth } from "./useAuth";

export function useComments(postId) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!postId) return;

    const unsubscribe = subscribeToComments(
      postId,
      (newComments) => {
        setComments(newComments);
        setIsLoading(false);
      },
      (err) => {
        console.error("Error subscribing to comments:", err);
        setError("Failed to load comments.");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [postId]);

  const addComment = async (content) => {
    if (!user) throw new Error("Must be logged in to comment.");
    if (!content || !content.trim()) throw new Error("Comment cannot be empty.");

    await createComment(postId, user.uid, user.name || "Student", user.avatar || null, content);
  };

  const removeComment = async (commentId) => {
    if (!user) throw new Error("Must be logged in to delete.");
    
    await deleteComment(postId, commentId);
  };

  return {
    comments,
    isLoading,
    error,
    addComment,
    removeComment,
  };
}
