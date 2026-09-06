import Avatar from "../ui/Avatar";
import Button from "../ui/Button";

function formatTimestamp(timestamp) {
  if (!timestamp) return "Just now";
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function CommentItem({ comment, currentUserId, onDelete }) {
  const isAuthor = currentUserId === comment.authorId;

  return (
    <div className="flex gap-3 py-3">
      <div className="flex-shrink-0 mt-1">
        <Avatar name={comment.authorName} photoURL={comment.authorAvatar} size="sm" />
      </div>
      
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-ink text-sm">{comment.authorName}</h4>
            <span className="text-xs text-ink-muted">
              {formatTimestamp(comment.createdAt)}
            </span>
          </div>
          
          {isAuthor && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(comment.id)}
              className="h-auto p-1 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              title="Delete comment"
            >
              Delete
            </Button>
          )}
        </div>
        
        <div className="mt-1 text-sm text-ink leading-relaxed whitespace-pre-wrap">
          {comment.content}
        </div>
      </div>
    </div>
  );
}
