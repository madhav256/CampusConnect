/**
 * Milestone 19 — Unit 19.7: Community Feed & Content UI
 *
 * Unit tests for CommunityPostComposer and CommunityPostFeed components.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { APEX_CAMPUS_ID } from "../../src/constants.js";
import { COMMUNITY_APEX_AI } from "../../src/data/communities.js";
import { renderHook, act } from "./hookTestUtils";

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  usePostLike: vi.fn(() => ({
    isLiked: false,
    isPending: false,
    toggleLike: vi.fn(),
  })),
  createPost: vi.fn(),
}));

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("../../src/hooks/useCampus", () => ({
  useOptionalCampus: () => mocks.useOptionalCampus(),
}));

vi.mock("../../src/hooks/usePostLike", () => ({
  usePostLike: (...args) => mocks.usePostLike(...args),
}));

vi.mock("../../src/services/postService", () => ({
  createPost: (...args) => mocks.createPost(...args),
  deletePost: vi.fn(),
  subscribeToNewerPosts: vi.fn(() => vi.fn()),
  fetchOlderPosts: vi.fn().mockResolvedValue([]),
  subscribeToEmptyFeed: vi.fn(() => vi.fn()),
  subscribeToPostUpdatesInRange: vi.fn(() => vi.fn()),
}));

// Recursive search helpers for React element trees
function findInReactTree(element, predicate) {
  if (!element || typeof element !== "object") return null;
  if (predicate(element)) return element;
  const children = element.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findInReactTree(child, predicate);
      if (found) return found;
    }
  } else if (children && typeof children === "object") {
    return findInReactTree(children, predicate);
  }
  return null;
}

function findByTestId(tree, testId) {
  return findInReactTree(tree, (el) => el.props?.["data-testid"] === testId);
}

function renderComponent(Component, props = {}) {
  const { result } = renderHook(() => Component(props));
  return { result };
}

// Components under test
import CommunityPostComposer from "../../src/components/community/CommunityPostComposer";
import CommunityPostFeed from "../../src/components/community/CommunityPostFeed";

describe("Milestone 19 — Unit 19.7: Community Feed & Content UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { uid: "user-1", name: "Alex Chen", avatar: null, email: "student@apex.edu" },
      loading: false,
    });
    mocks.useOptionalCampus.mockReturnValue({
      campusId: APEX_CAMPUS_ID,
      loading: false,
    });
    mocks.createPost.mockResolvedValue("post-new-id");
  });

  describe("CommunityPostComposer", () => {
    it("returns null when user is not an active member", () => {
      const { result } = renderComponent(CommunityPostComposer, {
        community: COMMUNITY_APEX_AI,
        isMember: false,
      });

      expect(result.current).toBeNull();
    });

    it("renders composer form when user is an active member", () => {
      const { result } = renderComponent(CommunityPostComposer, {
        community: COMMUNITY_APEX_AI,
        isMember: true,
      });

      const composer = findByTestId(result.current, "community-post-composer");
      expect(composer).not.toBeNull();

      const textarea = findByTestId(result.current, "community-post-content");
      expect(textarea).not.toBeNull();

      const submitBtn = findByTestId(result.current, "community-post-submit");
      expect(submitBtn).not.toBeNull();
      expect(submitBtn.props.disabled).toBe(true);
    });

    it("calls onPost prop with content when submitted", async () => {
      const onPostMock = vi.fn().mockResolvedValue("post-123");
      const { result } = renderComponent(CommunityPostComposer, {
        community: COMMUNITY_APEX_AI,
        isMember: true,
        onPost: onPostMock,
      });

      const textarea = findByTestId(result.current, "community-post-content");
      act(() => {
        textarea.props.onChange({ target: { value: "Hello Robotics Team!" } });
      });

      const submitBtn = findByTestId(result.current, "community-post-submit");
      expect(submitBtn.props.disabled).toBe(false);

      const form = findInReactTree(result.current, (n) => n.type === "form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });

      expect(onPostMock).toHaveBeenCalledWith("Hello Robotics Team!");

      // Verify content reset after submit
      const resetTextarea = findByTestId(result.current, "community-post-content");
      expect(resetTextarea.props.value).toBe("");
    });

    it("falls back to createPost service with community and campus IDs when onPost prop is not provided", async () => {
      const { result } = renderComponent(CommunityPostComposer, {
        community: COMMUNITY_APEX_AI,
        isMember: true,
      });

      const textarea = findByTestId(result.current, "community-post-content");
      act(() => {
        textarea.props.onChange({ target: { value: "Direct createPost call" } });
      });

      const form = findInReactTree(result.current, (n) => n.type === "form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });

      expect(mocks.createPost).toHaveBeenCalledWith(
        "user-1",
        "Alex Chen",
        null,
        "Direct createPost call",
        {
          campusId: COMMUNITY_APEX_AI.campusId,
          communityId: COMMUNITY_APEX_AI.id,
        }
      );
    });

    it("displays error message if post submission fails", async () => {
      const onPostMock = vi.fn().mockRejectedValue(new Error("Permission denied: not a member"));
      const { result } = renderComponent(CommunityPostComposer, {
        community: COMMUNITY_APEX_AI,
        isMember: true,
        onPost: onPostMock,
      });

      const textarea = findByTestId(result.current, "community-post-content");
      act(() => {
        textarea.props.onChange({ target: { value: "Failed submission post" } });
      });

      const form = findInReactTree(result.current, (n) => n.type === "form");
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });

      const errorMsg = findByTestId(result.current, "community-post-error");
      expect(errorMsg).not.toBeNull();
      expect(errorMsg.props.children).toBe("Permission denied: not a member");
    });
  });

  describe("CommunityPostFeed", () => {
    it("renders loading skeletons when isLoading is true", () => {
      const { result } = renderComponent(CommunityPostFeed, {
        community: COMMUNITY_APEX_AI,
        isMember: true,
        isLoading: true,
        posts: [],
      });

      const loadingContainer = findByTestId(result.current, "community-feed-loading");
      expect(loadingContainer).not.toBeNull();
    });

    it("renders empty state with member call-to-action when user is a member", () => {
      const { result } = renderComponent(CommunityPostFeed, {
        community: COMMUNITY_APEX_AI,
        isMember: true,
        isLoading: false,
        posts: [],
      });

      const emptyContainer = findByTestId(result.current, "community-feed-empty");
      expect(emptyContainer).not.toBeNull();

      const emptyState = findInReactTree(result.current, (n) => n.props?.title === "No community posts yet");
      expect(emptyState).not.toBeNull();
      expect(emptyState.props.description).toContain("Be the first to start the conversation");
    });

    it("renders empty state with join guidance when user is not a member", () => {
      const { result } = renderComponent(CommunityPostFeed, {
        community: COMMUNITY_APEX_AI,
        isMember: false,
        isLoading: false,
        posts: [],
      });

      const emptyState = findInReactTree(result.current, (n) => n.props?.title === "No community posts yet");
      expect(emptyState).not.toBeNull();
      expect(emptyState.props.description).toContain("Join this community to participate");
    });

    it("renders error state with retry button when error is present", () => {
      const retryMock = vi.fn();
      const { result } = renderComponent(CommunityPostFeed, {
        community: COMMUNITY_APEX_AI,
        isMember: true,
        isLoading: false,
        error: "Firestore network timeout",
        onRetry: retryMock,
      });

      const errorContainer = findByTestId(result.current, "community-feed-error");
      expect(errorContainer).not.toBeNull();

      const retryBtn = findInReactTree(result.current, (n) => n.props?.onClick === retryMock);
      expect(retryBtn).not.toBeNull();

      retryBtn.props.onClick();
      expect(retryMock).toHaveBeenCalledTimes(1);
    });

    it("renders community posts with author and content", () => {
      const mockPosts = [
        {
          id: "post-1",
          authorId: "user-1",
          authorName: "Alex Chen",
          authorAvatar: null,
          content: "Welcome to the Apex AI society feed!",
          createdAt: { toDate: () => new Date("2026-10-01T10:00:00Z") },
          likesCount: 5,
          commentsCount: 2,
        },
        {
          id: "post-2",
          authorId: "user-2",
          authorName: "Jordan Taylor",
          authorAvatar: null,
          content: "Next autonomous rover demo is this Friday.",
          createdAt: { toDate: () => new Date("2026-10-02T11:00:00Z") },
          likesCount: 8,
          commentsCount: 4,
        },
      ];

      const { result } = renderComponent(CommunityPostFeed, {
        community: COMMUNITY_APEX_AI,
        isMember: true,
        isLoading: false,
        posts: mockPosts,
        hasMorePosts: false,
      });

      const feedContainer = findByTestId(result.current, "community-feed");
      expect(feedContainer).not.toBeNull();

      const post1 = findInReactTree(result.current, (n) => n.props?.post?.id === "post-1");
      expect(post1).not.toBeNull();
      expect(post1.props.post.content).toBe("Welcome to the Apex AI society feed!");

      const post2 = findInReactTree(result.current, (n) => n.props?.post?.id === "post-2");
      expect(post2).not.toBeNull();
      expect(post2.props.post.content).toBe("Next autonomous rover demo is this Friday.");

      const endMsg = findByTestId(result.current, "community-feed-end");
      expect(endMsg).not.toBeNull();
    });

    it("renders Load More button when hasMorePosts is true", () => {
      const loadMoreMock = vi.fn();
      const mockPosts = [
        {
          id: "post-1",
          authorId: "user-1",
          authorName: "Alex Chen",
          content: "First post",
          likesCount: 0,
          commentsCount: 0,
        },
      ];

      const { result } = renderComponent(CommunityPostFeed, {
        community: COMMUNITY_APEX_AI,
        isMember: true,
        isLoading: false,
        posts: mockPosts,
        hasMorePosts: true,
        onLoadMore: loadMoreMock,
      });

      const loadMoreBtn = findByTestId(result.current, "community-feed-load-more");
      expect(loadMoreBtn).not.toBeNull();

      loadMoreBtn.props.onClick();
      expect(loadMoreMock).toHaveBeenCalledTimes(1);
    });
  });
});
