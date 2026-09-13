import { useState, useEffect } from "react";
import { subscribeToPostLike, togglePostLike } from "../services/likeService";

export function usePostLike(postId, currentUserId, updatePost) {
  const [isLiked, setIsLiked] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!postId || !currentUserId) {
      return;
    }

    const unsubscribe = subscribeToPostLike(
      postId,
      currentUserId,
      (liked) => {
        setIsLiked(liked);
      },
      (err) => {
        console.error("Error subscribing to post like:", err);
      }
    );

    return () => unsubscribe();
  }, [postId, currentUserId]);

  const toggleLike = async () => {
    if (!currentUserId) {
      throw new Error("You must be logged in to like a post.");
    }

    if (isPending) {
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const result = await togglePostLike(postId, currentUserId);

      // Use the updatePost function from usePosts to update the feed state
      if (updatePost) {
        updatePost(postId, {
          likesCount: result.likesCount
        });
      }
    } catch (err) {
      setError(err.message || "Failed to update like status.");
      throw err;
    } finally {
      setIsPending(false);
    }
  };

  const hasLiked = Boolean(currentUserId) && isLiked;

  return {
    isLiked: hasLiked,
    isPending,
    toggleLike,
    error,
  };
}