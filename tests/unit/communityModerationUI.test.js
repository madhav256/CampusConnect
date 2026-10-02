/**
 * Milestone 19 — Unit 19.8: Community Moderation & Management UI Tests
 *
 * Unit tests for CommunityModerationPanel and post moderation affordances in PostCard.
 */

import { describe, expect, it, vi } from "vitest";
import { COMMUNITY_APEX_AI } from "../../src/data/communities.js";
import {
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../../src/constants.js";
import { renderHook, act } from "./hookTestUtils";

vi.mock("../../src/hooks/usePostLike", () => ({
  usePostLike: vi.fn(() => ({
    isLiked: false,
    isPending: false,
    toggleLike: vi.fn(),
  })),
}));

// Recursive search helper for React element trees
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
  const Fn = Component?.type || Component;
  const { result } = renderHook(() => Fn(props));
  return { result };
}

// Components under test
import CommunityModerationPanel from "../../src/components/community/CommunityModerationPanel";
import PostCard from "../../src/components/feed/PostCard";

describe("Milestone 19 — Unit 19.8: Community Moderation UI", () => {
  const mockMembers = [
    {
      id: "apex-ai-club_user-admin",
      userId: "user-admin",
      communityId: "apex-ai-club",
      campusId: "apex-university",
      role: COMMUNITY_MEMBER_ROLES.ADMIN,
      status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
    },
    {
      id: "apex-ai-club_user-mod",
      userId: "user-mod",
      communityId: "apex-ai-club",
      campusId: "apex-university",
      role: COMMUNITY_MEMBER_ROLES.MODERATOR,
      status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
    },
    {
      id: "apex-ai-club_user-regular",
      userId: "user-regular",
      communityId: "apex-ai-club",
      campusId: "apex-university",
      role: COMMUNITY_MEMBER_ROLES.MEMBER,
      status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
    },
    {
      id: "apex-ai-club_user-removed",
      userId: "user-removed",
      communityId: "apex-ai-club",
      campusId: "apex-university",
      role: COMMUNITY_MEMBER_ROLES.MEMBER,
      status: COMMUNITY_MEMBER_STATUSES.REMOVED,
    },
  ];

  describe("CommunityModerationPanel", () => {
    it("returns null when user is not a moderator or admin", () => {
      const { result } = renderComponent(CommunityModerationPanel, {
        community: COMMUNITY_APEX_AI,
        members: mockMembers,
        isModerator: false,
        isAdmin: false,
      });

      expect(result.current).toBeNull();
    });

    it("renders moderation panel when user is a moderator", () => {
      const { result } = renderComponent(CommunityModerationPanel, {
        community: COMMUNITY_APEX_AI,
        members: mockMembers,
        isModerator: true,
        isAdmin: false,
      });

      const panel = findByTestId(result.current, "community-moderation-panel");
      expect(panel).not.toBeNull();

      const roleBadge = findByTestId(result.current, "moderation-role-badge");
      expect(roleBadge.props.children).toBe("Moderator");
    });

    it("renders admin badge and admin controls when user is an admin", () => {
      const { result } = renderComponent(CommunityModerationPanel, {
        community: COMMUNITY_APEX_AI,
        members: mockMembers,
        isModerator: true,
        isAdmin: true,
      });

      const roleBadge = findByTestId(result.current, "moderation-role-badge");
      expect(roleBadge.props.children).toBe("Admin");

      // Admin can promote regular member to moderator
      const promoteBtn = findByTestId(
        result.current,
        "promote-moderator-user-regular"
      );
      expect(promoteBtn).not.toBeNull();

      // Admin can demote moderator to member
      const demoteBtn = findByTestId(
        result.current,
        "demote-member-user-mod"
      );
      expect(demoteBtn).not.toBeNull();
    });

    it("moderator cannot see promote or demote role actions", () => {
      const { result } = renderComponent(CommunityModerationPanel, {
        community: COMMUNITY_APEX_AI,
        members: mockMembers,
        isModerator: true,
        isAdmin: false,
      });

      const promoteBtn = findByTestId(
        result.current,
        "promote-moderator-user-regular"
      );
      expect(promoteBtn).toBeNull();

      const demoteBtn = findByTestId(
        result.current,
        "demote-member-user-mod"
      );
      expect(demoteBtn).toBeNull();
    });

    it("moderator can remove and restore regular members, but cannot touch admin", () => {
      const { result } = renderComponent(CommunityModerationPanel, {
        community: COMMUNITY_APEX_AI,
        members: mockMembers,
        isModerator: true,
        isAdmin: false,
      });

      // Can remove active regular member
      const removeBtn = findByTestId(
        result.current,
        "remove-member-user-regular"
      );
      expect(removeBtn).not.toBeNull();

      // Can restore removed regular member
      const restoreBtn = findByTestId(
        result.current,
        "restore-member-user-removed"
      );
      expect(restoreBtn).not.toBeNull();

      // Cannot remove admin
      const removeAdminBtn = findByTestId(
        result.current,
        "remove-member-user-admin"
      );
      expect(removeAdminBtn).toBeNull();
    });

    it("triggers role update and displays success feedback", async () => {
      const mockUpdateRole = vi.fn().mockResolvedValueOnce();

      const { result } = renderComponent(CommunityModerationPanel, {
        community: COMMUNITY_APEX_AI,
        members: mockMembers,
        isModerator: true,
        isAdmin: true,
        onUpdateRole: mockUpdateRole,
      });

      const promoteBtn = findByTestId(
        result.current,
        "promote-moderator-user-regular"
      );

      await act(async () => {
        await promoteBtn.props.onClick();
      });

      expect(mockUpdateRole).toHaveBeenCalledWith(
        "user-regular",
        COMMUNITY_MEMBER_ROLES.MODERATOR
      );

      const successBanner = findByTestId(result.current, "moderation-success");
      expect(successBanner).not.toBeNull();
    });

    it("surfaces error banner on mutation failure", async () => {
      const mockUpdateStatus = vi
        .fn()
        .mockRejectedValueOnce(new Error("Permission denied: cannot remove member"));

      const { result } = renderComponent(CommunityModerationPanel, {
        community: COMMUNITY_APEX_AI,
        members: mockMembers,
        isModerator: true,
        isAdmin: false,
        onUpdateStatus: mockUpdateStatus,
      });

      const removeBtn = findByTestId(
        result.current,
        "remove-member-user-regular"
      );

      await act(async () => {
        await removeBtn.props.onClick();
      });

      const errorBanner = findByTestId(result.current, "moderation-error");
      expect(errorBanner).not.toBeNull();
      expect(errorBanner.props.children).toEqual(
        expect.arrayContaining([
          expect.anything(),
          expect.objectContaining({
            props: { children: "Permission denied: cannot remove member" },
          }),
        ])
      );
    });

    it("displays empty state when members list is empty", () => {
      const { result } = renderComponent(CommunityModerationPanel, {
        community: COMMUNITY_APEX_AI,
        members: [],
        isModerator: true,
        isAdmin: true,
      });

      const emptyEl = findByTestId(result.current, "moderation-empty");
      expect(emptyEl).not.toBeNull();
    });
  });

  describe("Post Moderation in PostCard", () => {
    const samplePost = {
      id: "post-123",
      authorId: "author-user",
      authorName: "Author User",
      authorAvatar: null,
      content: "Community post content for moderation test",
      createdAt: new Date(),
    };

    it("does not show delete or moderate button for non-author when canModerate is false", () => {
      const { result } = renderComponent(PostCard, {
        post: samplePost,
        currentUserId: "other-user",
        canModerate: false,
      });

      const deleteBtn = findByTestId(result.current, "delete-post-button");
      const modBtn = findByTestId(result.current, "moderate-post-button");
      expect(deleteBtn).toBeNull();
      expect(modBtn).toBeNull();
    });

    it("shows moderate button for non-author when canModerate is true", () => {
      const { result } = renderComponent(PostCard, {
        post: samplePost,
        currentUserId: "moderator-user",
        canModerate: true,
      });

      const modBtn = findByTestId(result.current, "moderate-post-button");
      expect(modBtn).not.toBeNull();
      expect(modBtn.props.title).toBe("Moderate post");
    });

    it("shows delete button for post author even if canModerate is false", () => {
      const { result } = renderComponent(PostCard, {
        post: samplePost,
        currentUserId: "author-user",
        canModerate: false,
      });

      const deleteBtn = findByTestId(result.current, "delete-post-button");
      expect(deleteBtn).not.toBeNull();
      expect(deleteBtn.props.title).toBe("Delete post");
    });

    it("clicking moderate button opens confirmation and confirms deletion", async () => {
      const mockDelete = vi.fn().mockResolvedValueOnce();

      const { result } = renderComponent(PostCard, {
        post: samplePost,
        currentUserId: "moderator-user",
        canModerate: true,
        onDelete: mockDelete,
      });

      const modBtn = findByTestId(result.current, "moderate-post-button");

      await act(async () => {
        modBtn.props.onClick();
      });

      const confirmBtn = findByTestId(result.current, "confirm-moderate-button");
      expect(confirmBtn).not.toBeNull();

      await act(async () => {
        await confirmBtn.props.onClick();
      });

      expect(mockDelete).toHaveBeenCalledWith("post-123");
    });
  });
});
