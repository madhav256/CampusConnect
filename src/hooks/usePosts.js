import { useState, useEffect, useCallback, useRef } from "react";
import { subscribeToNewerPosts, fetchOlderPosts, createPost, deletePost, subscribeToBootstrapPosts } from "../services/postService";
import { useAuth } from "./useAuth";
import { POSTS_PER_PAGE } from "../constants";

export function usePosts() {
  const { user } = useAuth();
  const [postsDocs, setPostsDocs] = useState([]); // DocumentSnapshots, newest to oldest
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const [error, setError] = useState(null);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [isInitialError, setIsInitialError] = useState(false);

  // Refs for listener unsubscribe functions
  const bootstrapListenerUnsubscribeRef = useRef(null);
  const normalListenerUnsubscribeRef = useRef(null);

  // Refs to store snapshots during bootstrap
  const bootstrapSnapshotRef = useRef(null);
  const fetchSnapshotRef = useRef(null);
  const hasBootstrapSnapshotRef = useRef(false);

  // Derive posts array
  const posts = postsDocs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));


  // Merge bootstrap and fetch snapshots, set initial postsDocs, and set up appropriate listeners
  const mergeAndSetPosts = useCallback(() => {
    // Safety check: ensure we have both snapshots
    if (!hasBootstrapSnapshotRef.current || !bootstrapSnapshotRef.current || !fetchSnapshotRef.current) {
      return;
    }

    const bootstrapDocs = bootstrapSnapshotRef.current.docs;
    const fetchDocs = fetchSnapshotRef.current.docs;

    // Merge and deduplicate by document ID
    const docMap = new Map();

    // Add bootstrap docs
    bootstrapDocs.forEach(doc => {
      docMap.set(doc.id, doc);
    });

    // Add fetch docs (overwrite if same ID - though they shouldn't overlap due to query constraints)
    fetchDocs.forEach(doc => {
      docMap.set(doc.id, doc);
    });

    // Convert to array and sort by createdAt descending (newest first)
    const mergedDocs = Array.from(docMap.values()).sort((a, b) => {
      return b.data().createdAt.toMillis() - a.data().createdAt.toMillis();
    });

    // Set the merged posts
    setPostsDocs(mergedDocs);

    // Determine newest and oldest documents
    const newestDoc = mergedDocs.length > 0 ? mergedDocs[0] : null;

    // Once bootstrap is complete, set up appropriate listener
    if (newestDoc !== null) {
      // We have posts: set up normal realtime listener first, then unsubscribe bootstrap listener
      // Set up normal realtime listener for newer posts
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

      // Unsubscribe bootstrap listener
      if (bootstrapListenerUnsubscribeRef.current) {
        bootstrapListenerUnsubscribeRef.current();
        bootstrapListenerUnsubscribeRef.current = null;
      }
    } else {
      // No posts yet: keep bootstrap listener active to detect first post
      // (bootstrap listener remains active via bootstrapListenerUnsubscribeRef)
    }

    // Mark as initialized and stop initial loading
    setIsInitialLoading(false);
  }, [bootstrapSnapshotRef, fetchSnapshotRef, hasBootstrapSnapshotRef]);

  // Initialize: fetch first page and set up bounded bootstrap listener
  const initialize = useCallback(async () => {
    if (!user) return;

    try {
      // Reset state
      setPostsDocs([]);
      setHasMorePosts(true);
      setError(null);
      setIsInitialLoading(true);
            setIsInitialError(false);

      // Reset refs
      bootstrapSnapshotRef.current = null;
      fetchSnapshotRef.current = null;
      hasBootstrapSnapshotRef.current = false;

      // Clean up any existing listeners
      if (bootstrapListenerUnsubscribeRef.current) {
        bootstrapListenerUnsubscribeRef.current();
        bootstrapListenerUnsubscribeRef.current = null;
      }
      if (normalListenerUnsubscribeRef.current) {
        normalListenerUnsubscribeRef.current();
        normalListenerUnsubscribeRef.current = null;
      }

      // Start bounded bootstrap listener
      const unsubscribeBootstrap = subscribeToBootstrapPosts(
        (snapshot) => {
          // Store the first snapshot from bootstrap listener
          bootstrapSnapshotRef.current = snapshot;
          hasBootstrapSnapshotRef.current = true;
          // If we already have the fetch snapshot, we can merge now
          if (fetchSnapshotRef.current !== null) {
            mergeAndSetPosts();
          }
        },
        (err) => {
          console.error("Error in bootstrap listener:", err);
          setError(() => "Failed to load initial posts.");
          setIsInitialLoading(false);
          setIsInitialError(true);
        }
      );
      bootstrapListenerUnsubscribeRef.current = unsubscribeBootstrap;

      // In parallel, fetch first page
      const firstPageSnapshot = await fetchOlderPosts(POSTS_PER_PAGE, null);
      fetchSnapshotRef.current = firstPageSnapshot;

      // If we already have the bootstrap snapshot, we can merge now
      if (hasBootstrapSnapshotRef.current && bootstrapSnapshotRef.current !== null) {
        mergeAndSetPosts();
      }
    } catch (err) {
      console.error("Failed to initialize posts:", err);
      setError(() => "Failed to load posts.");
      setIsInitialLoading(false);
      setIsInitialError(true);

      // Clean up bootstrap listener on error
      if (bootstrapListenerUnsubscribeRef.current) {
        bootstrapListenerUnsubscribeRef.current();
        bootstrapListenerUnsubscribeRef.current = null;
      }
    }
  }, [user, mergeAndSetPosts]);


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
  };
}
