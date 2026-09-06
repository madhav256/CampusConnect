import { useState } from "react";
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

export default function PostCard({ post, currentUserId, onDelete }) {
  const [showComments, setShowComments] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { isLiked, isPending, toggleLike } = usePostLike(post.id, currentUserId);
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
            <h3 className="font-semibold text-slate-900">{post.authorName}</h3>
            <p className="text-sm text-slate-500">
              {formatTimestamp(post.createdAt)}
            </p>
          </div>
        </div>
        
        {isAuthor && (
          isConfirmingDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium">Delete post?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isDeleting}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsConfirmingDelete(true)}
              className="text-slate-400 hover:bg-red-50 hover:text-red-600"
              title="Delete post"
            >
              Delete
            </Button>
          )
        )}
      </div>
      
      <div className="mt-4 whitespace-pre-wrap text-slate-800">
        {post.content}
      </div>

      <div className="mt-4 flex items-center gap-6 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={handleLikeClick}
          disabled={isPending || !currentUserId}
          aria-label={isLiked ? "Unlike post" : "Like post"}
          className={`group flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            isLiked
              ? "text-rose-600 hover:text-rose-700"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          } ${isPending ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <svg
            className={`h-5 w-5 transition-transform group-active:scale-125 ${
              isLiked
                ? "fill-rose-500 text-rose-500"
                : "fill-none text-slate-400 group-hover:text-slate-600"
            }`}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
          <span>{post.likesCount || 0}</span>
          <span className="sr-only sm:not-sr-only">
            {post.likesCount === 1 ? "Like" : "Likes"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <span>💬</span>
          <span>
            {post.commentsCount || 0} {post.commentsCount === 1 ? "Comment" : "Comments"}
          </span>
        </button>
      </div>

      {showComments && <CommentList postId={post.id} />}
    </Card>
  );
}
