import { useState, useEffect } from "react";
import { subscribeToComments, createComment, deleteComment } from "../services/commentService";
import { useAuth } from "./useAuth";

export function useComments(postId, updatePost) {
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

    const result = await createComment(postId, user.uid, user.name || "Student", user.avatar || null, content);

    // Use the updatePost function to update the feed state with the new comments count
    if (updatePost && result.commentsCount !== undefined) {
      updatePost(postId, {
        commentsCount: result.commentsCount
      });
    }
  };

  const removeComment = async (commentId) => {
    if (!user) throw new Error("Must be logged in to delete.");

    const result = await deleteComment(postId, commentId);

    // Use the updatePost function to update the feed state with the new comments count
    if (updatePost && result.commentsCount !== undefined) {
      updatePost(postId, {
        commentsCount: result.commentsCount
      });
    }
  };

  return {
    comments,
    isLoading,
    error,
    addComment,
    removeComment,
  };
}