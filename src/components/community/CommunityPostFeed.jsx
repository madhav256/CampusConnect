/**
 * Milestone 19 — Unit 19.7: Community Feed & Content UI
 *
 * Feed component rendering community-scoped posts, pagination,
 * loading skeletons, empty state, and error handling.
 * Reuses existing PostCard for unified interactions (likes, comments, author deletion).
 */

import { useEffect, useMemo } from "react";
import { MessageSquare, RefreshCw, AlertCircle } from "lucide-react";
import { usePosts } from "../../hooks/usePosts";
import { useAuth } from "../../hooks/useAuth";
import PostCard from "../feed/PostCard";
import Card from "../ui/Card";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";

export default function CommunityPostFeed({
  community,
  isMember = false,
  canModerate = false,
  // Optional controlled props for direct injection / testability
  posts: controlledPosts,
  isLoading: controlledIsLoading,
  error: controlledError,
  hasMorePosts: controlledHasMore,
  isFetchingOlder: controlledIsFetchingOlder,
  onRetry: controlledRetry,
  onLoadMore: controlledLoadMore,
  onDelete: controlledDelete,
  updatePost: controlledUpdatePost,
}) {
  const { user } = useAuth();

  const communityId = community?.id || null;
  const campusId = community?.campusId || null;

  const feedOptions = useMemo(() => {
    if (!communityId) return null;
    return {
      campusId,
      communityId,
    };
  }, [campusId, communityId]);

  const internalFeed = usePosts(feedOptions || {});

  const posts = controlledPosts !== undefined ? controlledPosts : internalFeed.posts;
  const isLoading = controlledIsLoading !== undefined ? controlledIsLoading : internalFeed.isLoading;
  const error = controlledError !== undefined ? controlledError : internalFeed.error;
  const hasMorePosts = controlledHasMore !== undefined ? controlledHasMore : internalFeed.hasMorePosts;
  const isFetchingOlder = controlledIsFetchingOlder !== undefined ? controlledIsFetchingOlder : internalFeed.isFetchingOlder;
  const onRetry = controlledRetry || internalFeed.initialize;
  const onLoadMore = controlledLoadMore || internalFeed.loadMore;
  const onDelete = controlledDelete || internalFeed.removePost;
  const updatePost = controlledUpdatePost || internalFeed.updatePost;

  const internalInitialize = internalFeed.initialize;

  // Initialize internal feed on mount if not controlled
  useEffect(() => {
    if (controlledPosts === undefined && typeof internalInitialize === "function") {
      internalInitialize();
    }
  }, [community?.id, controlledPosts, internalInitialize]);

  // Loading Skeleton State
  if (isLoading) {
    return (
      <div data-testid="community-feed-loading" className="flex flex-col gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-stone-200" />
              <div className="space-y-1.5">
                <div className="h-4 w-32 rounded bg-stone-200" />
                <div className="h-3 w-20 rounded bg-stone-200" />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-4 w-full rounded bg-stone-200" />
              <div className="h-4 w-4/5 rounded bg-stone-200" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div
        data-testid="community-feed-error"
        className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800"
      >
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 mb-3">
          <AlertCircle className="h-5 w-5" aria-hidden="true" />
        </div>
        <h3 className="font-serif text-base font-bold">Failed to Load Community Posts</h3>
        <p className="mt-1 text-sm text-rose-600">{error}</p>
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-2 bg-white"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Retry Feed</span>
          </Button>
        </div>
      </div>
    );
  }

  // Empty State
  if (!posts || posts.length === 0) {
    return (
      <div data-testid="community-feed-empty">
        <EmptyState
          icon={MessageSquare}
          title="No community posts yet"
          description={
            isMember
              ? "Be the first to start the conversation in this community!"
              : "Join this community to participate in the conversation."
          }
        />
      </div>
    );
  }

  // Loaded Posts List
  return (
    <div data-testid="community-feed" className="space-y-4">
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={user?.uid}
            onDelete={onDelete}
            updatePost={updatePost}
            canModerate={canModerate}
          />
        ))}
      </div>

      {/* Pagination / Load More */}
      {hasMorePosts && (
        <div className="pt-2">
          <Button
            variant="outline"
            data-testid="community-feed-load-more"
            onClick={onLoadMore}
            disabled={isFetchingOlder}
            loading={isFetchingOlder}
            loadingText="Loading more posts..."
            className="w-full"
          >
            Load older posts
          </Button>
        </div>
      )}

      {!hasMorePosts && posts.length > 0 && (
        <p
          data-testid="community-feed-end"
          className="py-4 text-center text-xs font-medium text-ink-muted"
        >
          You&apos;ve reached the beginning of this community&apos;s posts.
        </p>
      )}
    </div>
  );
}
