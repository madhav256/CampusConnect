import { FileText } from "lucide-react";
import { usePosts } from "../../hooks/usePosts";
import { useAuth } from "../../hooks/useAuth";
import PostComposer from "./PostComposer";
import PostCard from "./PostCard";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import Button from "../ui/Button";
import { useEffect } from "react";

export default function Feed() {
  const { user } = useAuth();
  const {
    posts,
    isLoading,
    isFetchingOlder,
    error,
    hasMorePosts,
    initialize,
    loadMore,
    addPost,
    removePost,
    isInitialError,
    updatePost  // Function to update post state from children
  } = usePosts();

  // Initialize feed on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  if (error && isInitialError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
        <h3 className="font-semibold">Error Loading Feed</h3>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl w-full">
      <PostComposer onPost={addPost} />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-stone-200" />
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-stone-200" />
                  <div className="h-3 w-24 rounded bg-stone-200" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-4 w-full rounded bg-stone-200" />
                <div className="h-4 w-5/6 rounded bg-stone-200" />
              </div>
            </Card>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No posts yet"
          description="Be the first to share an update, question, or opportunity with the campus community!"
        />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={user?.uid}
                onDelete={removePost}
                updatePost={updatePost}  // Pass the update function down
              />
            ))}
          </div>

          {hasMorePosts && (
            <Button
              onClick={loadMore}
              disabled={isFetchingOlder}
              className="w-full px-4 py-2 text-sm font-medium transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 disabled:opacity-50"
            >
              {isFetchingOlder ? "Loading..." : "Load more"}
            </Button>
          )}

          {!hasMorePosts && !isFetchingOlder && (
            <p className="text-center text-stone-500 text-sm">
              You&apos;re all caught up!
            </p>
          )}
        </>
      )}
    </div>
  );
}