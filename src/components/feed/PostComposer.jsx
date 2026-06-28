import { useState } from "react";
import Card from "../ui/Card";
import Textarea from "../ui/Textarea";
import Button from "../ui/Button";
import Avatar from "../ui/Avatar";
import { useAuth } from "../../hooks/useAuth";

export default function PostComposer({ onPost }) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onPost(content);
      setContent("");
    } catch (err) {
      setError("Failed to create post. Please try again.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <Avatar name={user?.name} photoURL={user?.photoURL} size="md" />
          </div>
          <div className="flex-1 space-y-3">
            <Textarea
              id="post-content"
              placeholder="What's on your mind?"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSubmitting}
              className="min-h-[100px]"
            />
            
            {error && <p className="text-sm text-red-500">{error}</p>}
            
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!content.trim() || isSubmitting}
                loading={isSubmitting}
              >
                Post
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Card>
  );
}
