import { useState } from "react";
import { Heart, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Card from "../ui/Card";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import CommentList from "./CommentList";
import { usePostLike } from "../../hooks/usePostLike";

function formatTimestamp(timestamp) {
  if (!timestamp) return "Just now";

  // Handle Firestore Timestamp
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function PostCard({ post, currentUserId, onDelete, updatePost }) {
  const [showComments, setShowComments] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { isLiked, isPending, toggleLike } = usePostLike(post.id, currentUserId, updatePost);
  const isAuthor = currentUserId === post.authorId;

  const handleLikeClick = async () => {
    try {
      await toggleLike();
    } catch (err) {
      console.error("Failed to toggle like:", err);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(post.id);
    } catch (err) {
      console.error("Failed to delete post:", err);
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  return (
    <Card className="mb-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={post.authorName} photoURL={post.authorAvatar} size="md" />
          <div>
            <h3 className="font-semibold text-ink">{post.authorName}</h3>
            <p className="text-xs text-ink-muted">
              {formatTimestamp(post.createdAt)}
            </p>
          </div>
        </div>

        {isAuthor && (
          isConfirmingDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-ink-muted font-medium">Delete post?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isDeleting}
                className="rounded-lg border border-border-warm bg-surface px-2 py-1 text-xs font-medium text-stone-600 transition hover:bg-stone-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsConfirmingDelete(true)}
              className="text-stone-400 hover:bg-rose-50 hover:text-rose-600"
              title="Delete post"
            >
              Delete
            </Button>
          )
        )}
      </div>

      <div className="mt-4 whitespace-pre-wrap text-ink leading-relaxed">
        {post.content}
      </div>

      <div className="mt-4 flex items-center gap-6 border-t border-border-warm/70 pt-4">
        <button
          type="button"
          onClick={handleLikeClick}
          disabled={isPending || !currentUserId}
          aria-label={isLiked ? "Unlike post" : "Like post"}
          className={`group flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 ${
            isLiked
              ? "text-terracotta-600 hover:text-terracotta-700"
              : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"
          } ${isPending ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <motion.span
            animate={{ scale: isLiked ? [1, 1.25, 1] : 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex items-center"
          >
            <Heart
              className={`h-5 w-5 transition-colors ${
                isLiked
                  ? "fill-terracotta-600 text-terracotta-600"
                  : "text-stone-400 group-hover:text-stone-600"
              }`}
              aria-hidden="true"
            />
          </motion.span>
          <span>{post.likesCount || 0}</span>
          <span className="sr-only sm:not-sr-only">
            {post.likesCount === 1 ? "Like" : "Likes"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShowComments(!showComments)}
          className="group flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-stone-500 transition hover:bg-stone-50 hover:text-terracotta-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
        >
          <MessageSquare className="h-4 w-4 text-stone-400 group-hover:text-terracotta-600 transition-colors" aria-hidden="true" />
          <span>
            {post.commentsCount || 0} {post.commentsCount === 1 ? "Comment" : "Comments"}
          </span>
        </button>
      </div>

      <AnimatePresence>
        {showComments && (
          <motion.div
            key="comments"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <CommentList postId={post.id} updatePost={updatePost} />
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}