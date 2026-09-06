import { useComments } from "../../hooks/useComments";
import { useAuth } from "../../hooks/useAuth";
import CommentItem from "./CommentItem";
import CommentComposer from "./CommentComposer";

export default function CommentList({ postId }) {
  const { user } = useAuth();
  const { comments, isLoading, error, addComment, removeComment } = useComments(postId);

  return (
    <div className="mt-4 border-t border-border-warm/70 pt-2">
      {/* Composer is always visible at the top */}
      <CommentComposer onComment={addComment} />
      
      {error && (
        <p className="mt-2 text-sm text-rose-600">{error}</p>
      )}
      
      <div className="mt-4 flex flex-col divide-y divide-border-warm/40">
        {isLoading ? (
          <div className="space-y-4 py-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-stone-200 flex-shrink-0" />
                <div className="space-y-2 flex-1 pt-1">
                  <div className="h-3 w-24 rounded bg-stone-200" />
                  <div className="h-3 w-full rounded bg-stone-200" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-muted">
            No comments yet. Be the first to share your thoughts!
          </div>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={user?.uid}
              onDelete={removeComment}
            />
          ))
        )}
      </div>
    </div>
  );
}
