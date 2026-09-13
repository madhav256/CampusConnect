import { useState, useEffect, useCallback, useRef } from "react";
import { subscribeToNewerPosts, fetchOlderPosts, createPost, deletePost, subscribeToEmptyFeed } from "../services/postService";
import { useAuth } from "./useAuth";
import { POSTS_PER_PAGE } from "../constants";
import { db, isFirebaseConfigured } from "../firebase/config";
import { collection, query, orderBy, endBefore, getDocs } from "firebase/firestore";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

export function usePosts() {
  const { user } = useAuth();
  const [postsDocs, setPostsDocs] = useState([]); // DocumentSnapshots, newest to oldest
  const [postUpdates, setPostUpdates] = useState(new Map()); // postId => {likesCount: number, commentsCount: number}
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const [error, setError] = useState(null);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [isInitialError, setIsInitialError] = useState(false);

  // Refs for listener unsubscribe functions
  const bootstrapListenerUnsubscribeRef = useRef(null);
  const normalListenerUnsubscribeRef = useRef(null);
  const emptyFeedListenerUnsubscribeRef = useRef(null);

  // Derive posts array from genuine DocumentSnapshots and local updates
  const posts = postsDocs.map(doc => {
    const docData = doc.data();
    const updates = postUpdates.get(doc.id) || {};
    return {
      id: doc.id,
      ...docData,
      ...updates,
    };
  });

  // Function to update a specific post's data (for like/comment count updates)
  const updatePost = useCallback((postId, updates) => {
    setPostUpdates(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(postId) || {};
      newMap.set(postId, { ...existing, ...updates });
      return newMap;
    });
  }, []);

  // Initialize: fetch first page deterministically, then set up listeners
  const initialize = useCallback(async () => {
    if (!user) return;

    try {
      // Reset state
      setPostsDocs([]);
      setPostUpdates(new Map());
      setHasMorePosts(true);
      setError(null);
      setIsInitialLoading(true);
      setIsInitialError(false);

      // Clean up any existing listeners
      if (bootstrapListenerUnsubscribeRef.current) {
        bootstrapListenerUnsubscribeRef.current();
        bootstrapListenerUnsubscribeRef.current = null;
      }
      if (normalListenerUnsubscribeRef.current) {
        normalListenerUnsubscribeRef.current();
        normalListenerUnsubscribeRef.current = null;
      }
      if (emptyFeedListenerUnsubscribeRef.current) {
        emptyFeedListenerUnsubscribeRef.current();
        emptyFeedListenerUnsubscribeRef.current = null;
      }

      // Fetch the first page deterministically
      const firstPageSnapshot = await fetchOlderPosts(POSTS_PER_PAGE, null);
      const firstPageDocs = firstPageSnapshot.docs;

      setPostsDocs(firstPageDocs);

      if (firstPageDocs.length > 0) {
        // We have at least one post: set up newer-post listener and catch-up query
        const newestDoc = firstPageDocs[0];

        // Set up listener for newer posts (posts with timestamp greater than newestDoc)
        const unsubscribeNormal = subscribeToNewerPosts(
          (newerDocsSnapshot) => {
            // Functional state update to handle multiple documents and deduplicate
            setPostsDocs(prev => {
              const existingPostIds = new Set(prev.map(doc => doc.id));
              const trulyNewerDocs = newerDocsSnapshot.filter(doc => !existingPostIds.has(doc.id));
              if (trulyNewerDocs.length > 0) {
                // Prepend genuinely new documents (they are newer than current newest)
                return [...trulyNewerDocs, ...prev];
              }
              return prev;
            });
          },
          (err) => {
            console.error("Error subscribing to newer posts:", err);
            setError(() => "Failed to load new posts.");
          },
          newestDoc // cursor for endBefore
        );
        normalListenerUnsubscribeRef.current = unsubscribeNormal;

        // Catch-up query: get any posts that may have been created between the fetch and listener setup
        // These are posts with timestamp > newestDoc (i.e., endBefore(newestDoc) with no limit)
        const catchUpQuery = query(
          collection(requireDb(), "posts"),
          orderBy("createdAt", "desc"),
          endBefore(newestDoc)
        );
        const catchUpSnapshot = await getDocs(catchUpQuery);
        const catchUpDocs = catchUpSnapshot.docs;

        if (catchUpDocs.length > 0) {
          // Prepend any catch-up docs that are not already in postsDocs (by id)
          setPostsDocs(prev => {
            const existingPostIds = new Set(prev.map(doc => doc.id));
            const trulyNewCatchUp = catchUpDocs.filter(doc => !existingPostIds.has(doc.id));
            if (trulyNewCatchUp.length > 0) {
              // Prepend the genuinely new catch-up docs
              return [...trulyNewCatchUp, ...prev];
            }
            return prev;
          });
          // After prepending, newestDoc is the first element of the updated postsDocs
          // (we could recompute, but the catch-up docs are newer than the previous newestDoc)
          // For simplicity, we can recompute newestDoc and oldestDoc from the updated postsDocs in the state update above,
          // but we don't have access to the updated state here. We'll instead update newestDoc via a state variable?
          // However, newestDoc and oldestDoc are not stored in state; they are derived from postsDocs when needed.
          // Since we are about to exit initialize, the next render will derive newestDoc/postsDocs[0] correctly.
          // No further action needed.
        }
      } else {
        // First page is empty: keep only the empty-feed bootstrap listener active
        // so we can detect when the first post arrives.
        const unsubscribeEmptyFeed = subscribeToEmptyFeed(
          (snapshot) => {
            // If we receive a snapshot with at least one post,
            // transition to populated state (listener is only active when empty).
            if (snapshot.docs.length > 0) {
              // Unsubscribe the empty-feed listener
              if (emptyFeedListenerUnsubscribeRef.current) {
                emptyFeedListenerUnsubscribeRef.current();
                emptyFeedListenerUnsubscribeRef.current = null;
              }
              // Now fetch the first page (there is at least one post)
              fetchOlderPosts(POSTS_PER_PAGE, null).then((snapshot) => {
                const docs = snapshot.docs;
                setPostsDocs(docs);
                if (docs.length > 0) {
                  const newestDoc = docs[0];
                  // Set up newer-post listener
                  const unsubscribeNormal = subscribeToNewerPosts(
                    (newerDocsSnapshot) => {
                      setPostsDocs(prev => {
                        const existingPostIds = new Set(prev.map(doc => doc.id));
                        const trulyNewerDocs = newerDocsSnapshot.filter(doc => !existingPostIds.has(doc.id));
                        if (trulyNewerDocs.length > 0) {
                          return [...trulyNewerDocs, ...prev];
                        }
                        return prev;
                      });
                    },
                    (err) => {
                      console.error("Error subscribing to newer posts:", err);
                      setError(() => "Failed to load new posts.");
                    },
                    newestDoc // cursor for endBefore
                  );
                  normalListenerUnsubscribeRef.current = unsubscribeNormal;
                  // Catch-up query for any posts that may have appeared between empty-feed detection and fetch
                  const catchUpQuery = query(
                    collection(requireDb(), "posts"),
                    orderBy("createdAt", "desc"),
                    endBefore(newestDoc)
                  );
                  getDocs(catchUpQuery).then((catchUpSnapshot) => {
                    const catchUpDocs = catchUpSnapshot.docs;
                    if (catchUpDocs.length > 0) {
                      setPostsDocs(prev => {
                        const existingPostIds = new Set(prev.map(doc => doc.id));
                        const trulyNewCatchUp = catchUpDocs.filter(doc => !existingPostIds.has(doc.id));
                        if (trulyNewCatchUp.length > 0) {
                          return [...trulyNewCatchUp, ...prev];
                        }
                        return prev;
                      });
                    }
                  }).catch((err) => {
                    console.error("Catch-up query failed:", err);
                  });
                }
              }).catch((err) => {
                console.error("Failed to load first page after empty-feed detection:", err);
                setError(() => "Failed to load posts.");
                setIsInitialLoading(false);
                setIsInitialError(true);
              });
            }
          },
          (err) => {
            console.error("Error in empty-feed listener:", err);
            setError(() => "Failed to load initial posts.");
            setIsInitialLoading(false);
            setIsInitialError(true);
          }
        );
        emptyFeedListenerUnsubscribeRef.current = unsubscribeEmptyFeed;
      }

      setIsInitialLoading(false);
    } catch (err) {
      console.error("Failed to initialize posts:", err);
      setError(() => "Failed to load posts.");
      setIsInitialLoading(false);
      setIsInitialError(true);
    }
  }, [user]);

  // Load more older posts
  const loadMore = useCallback(async () => {
    if (!user || isFetchingOlder || !hasMorePosts) return;

    setIsFetchingOlder(true);
    setError(null);

    try {
      const oldestDoc = postsDocs.length > 0 ? postsDocs[postsDocs.length - 1] : null;
      const olderDocs = await fetchOlderPosts(POSTS_PER_PAGE, oldestDoc);

      if (olderDocs.length > 0) {
        // Filter out any posts we already have (by ID) to avoid duplicates
        const existingPostIds = new Set(postsDocs.map(doc => doc.id));
        const trulyOlderDocs = olderDocs.filter(doc => !existingPostIds.has(doc.id));

        if (trulyOlderDocs.length > 0) {
          // Append older docs to the end (they are older than current oldest)
          setPostsDocs(prev => [...prev, ...trulyOlderDocs]);
          // hasMorePosts is true if we got a full page FROM FIRESTORE (before deduplication)
          setHasMorePosts(olderDocs.length === POSTS_PER_PAGE);
        } else {
          // All fetched posts were duplicates
          setHasMorePosts(false);
        }
      } else {
        setHasMorePosts(false);
      }
    } catch (err) {
      console.error("Failed to load more posts:", err);
      setError(() => "Failed to load more posts.");
      // Note: We do NOT setIsInitialError(true) here because this is not an initial loading error
    } finally {
      setIsFetchingOlder(false);
    }
  }, [user, hasMorePosts, postsDocs, isFetchingOlder]);

  // Add a new post
  const addPost = useCallback(async (content) => {
    if (!user) throw new Error("Must be logged in to post.");
    if (!content || !content.trim()) throw new Error("Post content cannot be empty.");

    try {
      const postId = await createPost(
        user.uid,
        user.name || "Student",
        user.avatar || null,
        content
      );

      // No optimistic update - rely on realtime listener
      return postId;
    } catch (err) {
      console.error("Failed to create post:", err);
      throw err;
    }
  }, [user]);

  // Remove a post
  const removePost = useCallback(async (postId) => {
    if (!user) throw new Error("Must be logged in to delete.");

    try {
      await deletePost(postId);

      // Remove from local state if present
      setPostsDocs(prev => {
        return prev.filter(doc => doc.id !== postId);
      });
    } catch (err) {
      console.error("Failed to delete post:", err);
      throw err;
    }
  }, [user]);

  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      if (bootstrapListenerUnsubscribeRef.current) {
        bootstrapListenerUnsubscribeRef.current();
        bootstrapListenerUnsubscribeRef.current = null;
      }
      if (normalListenerUnsubscribeRef.current) {
        normalListenerUnsubscribeRef.current();
        normalListenerUnsubscribeRef.current = null;
      }
    };
  }, []);

  // Return all state and functions
  return {
    posts,
    isLoading: isInitialLoading,
    isFetchingOlder,
    error,
    hasMorePosts,
    initialize,
    loadMore,
    addPost,
    removePost,
    isInitialError,
    updatePost  // This is the callback from usePosts that children will use to update post state
  };
}