import { usePosts } from "../../hooks/usePosts";
import { useAuth } from "../../hooks/useAuth";
import PostComposer from "./PostComposer";
import PostCard from "./PostCard";
import Card from "../ui/Card";

export default function Feed() {
  const { user } = useAuth();
  const { posts, isLoading, error, addPost, removePost } = usePosts();

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
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
                <div className="h-12 w-12 rounded-full bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-slate-200" />
                  <div className="h-3 w-24 rounded bg-slate-200" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-4 w-full rounded bg-slate-200" />
                <div className="h-4 w-5/6 rounded bg-slate-200" />
              </div>
            </Card>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
          <div className="mb-4 rounded-full bg-slate-100 p-4 text-4xl">📝</div>
          <h3 className="text-lg font-medium text-slate-900">No posts yet</h3>
          <p className="mt-1">Be the first to share something with the campus!</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={user?.uid}
              onDelete={removePost}
            />
          ))}
        </div>
      )}
    </div>
  );
}
