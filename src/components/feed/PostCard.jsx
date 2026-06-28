import Card from "../ui/Card";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";

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
  const isAuthor = currentUserId === post.authorId;

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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(post.id)}
            className="text-red-500 hover:bg-red-50 hover:text-red-600"
            title="Delete post"
          >
            Delete
          </Button>
        )}
      </div>
      
      <div className="mt-4 whitespace-pre-wrap text-slate-800">
        {post.content}
      </div>
    </Card>
  );
}
