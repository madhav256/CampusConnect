import { useComments } from "../../hooks/useComments";
import { useAuth } from "../../hooks/useAuth";
import CommentItem from "./CommentItem";
import CommentComposer from "./CommentComposer";

export default function CommentList({ postId }) {
  const { user } = useAuth();
  const { comments, isLoading, error, addComment, removeComment } = useComments(postId);

  return (
    <div className="mt-4 border-t border-slate-100 pt-2">
      {/* Composer is always visible at the top */}
      <CommentComposer onComment={addComment} />
      
      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}
      
      <div className="mt-4 flex flex-col divide-y divide-slate-50">
        {isLoading ? (
          <div className="space-y-4 py-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-slate-200 flex-shrink-0" />
                <div className="space-y-2 flex-1 pt-1">
                  <div className="h-3 w-24 rounded bg-slate-200" />
                  <div className="h-3 w-full rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">
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
