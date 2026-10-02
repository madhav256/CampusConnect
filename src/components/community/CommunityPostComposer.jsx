/**
 * Milestone 19 — Unit 19.7: Community Feed & Content UI
 *
 * Membership-gated post composer for creating community-scoped posts.
 * Only rendered for active community members.
 */

import { useState } from "react";
import Card from "../ui/Card";
import Textarea from "../ui/Textarea";
import Button from "../ui/Button";
import Avatar from "../ui/Avatar";
import { useAuth } from "../../hooks/useAuth";
import { createPost } from "../../services/postService";

export default function CommunityPostComposer({
  community,
  onPost,
  isMember = false,
}) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Membership gate: Non-members cannot see or use the community composer
  if (!isMember) {
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (onPost) {
        await onPost(content.trim());
      } else {
        await createPost(
          user?.uid,
          user?.name || "Student",
          user?.photoURL || user?.avatar || null,
          content.trim(),
          {
            campusId: community?.campusId,
            communityId: community?.id,
          }
        );
      }
      setContent("");
    } catch (err) {
      console.error("Failed to create community post:", err);
      setError(err?.message || "Failed to create post. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card
      data-testid="community-post-composer"
      className="mb-6 border border-border-warm bg-surface shadow-xs"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex gap-4">
          <div className="shrink-0">
            <Avatar
              name={user?.name || "Student"}
              photoURL={user?.photoURL || user?.avatar}
              size="md"
            />
          </div>

          <div className="flex-1 space-y-3">
            <Textarea
              id="community-post-content"
              data-testid="community-post-content"
              placeholder={`Share an update or question in ${community?.name || "this community"}...`}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSubmitting}
              className="min-h-[90px]"
            />

            {error && (
              <p
                data-testid="community-post-error"
                className="text-xs font-medium text-rose-600"
              >
                {error}
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-ink-muted">
                Posting to <span className="font-semibold text-ink">{community?.name}</span>
              </span>

              <Button
                type="submit"
                variant="primary"
                data-testid="community-post-submit"
                disabled={!content.trim() || isSubmitting}
                loading={isSubmitting}
                loadingText="Posting..."
              >
                Post to Community
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Card>
  );
}
