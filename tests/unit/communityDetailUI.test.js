/**
 * Milestone 19 — Unit 19.6: Community Detail & Profile Experience
 *
 * Unit tests for CommunityHero, CommunityMembersPreview, and CommunityDetail page.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { APEX_CAMPUS_ID } from "../../src/constants.js";
import { CAMPUS_A } from "../../src/data/campuses.js";
import { COMMUNITY_APEX_AI } from "../../src/data/communities.js";
import {
  COMMUNITY_MEMBER_APEX_AI_STUDENT1,
  COMMUNITY_MEMBER_APEX_AI_STUDENT2,
} from "../../src/data/communityMembers.js";
import { renderHook, act } from "./hookTestUtils";

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  useNotifications: vi.fn(() => ({ unreadCount: 0 })),
  useConversations: vi.fn(() => ({ totalUnread: 0 })),
  useCommunity: vi.fn(),
  useCommunityMembers: vi.fn(),
  usePosts: vi.fn(() => ({
    posts: [],
    isLoading: false,
    error: null,
    hasMorePosts: false,
    isFetchingOlder: false,
    initialize: vi.fn(),
    loadMore: vi.fn(),
    addPost: vi.fn(),
    removePost: vi.fn(),
    updatePost: vi.fn(),
  })),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => mocks.useParams(),
  Link: ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children),
  NavLink: ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children),
}));

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("../../src/hooks/useCampus", () => ({
  useOptionalCampus: () => mocks.useOptionalCampus(),
  useCampus: () => {
    const val = mocks.useOptionalCampus();
    if (!val) throw new Error("useCampus must be used within a CampusProvider.");
    return val;
  },
}));

vi.mock("../../src/hooks/useNotifications", () => ({
  useNotifications: () => mocks.useNotifications(),
}));

vi.mock("../../src/hooks/useConversations", () => ({
  useConversations: () => mocks.useConversations(),
}));

vi.mock("../../src/hooks/useCommunity", () => ({
  useCommunity: (id) => mocks.useCommunity(id),
}));

vi.mock("../../src/hooks/useCommunityMembers", () => ({
  useCommunityMembers: (id) => mocks.useCommunityMembers(id),
}));

vi.mock("../../src/hooks/usePosts", () => ({
  usePosts: (opts) => mocks.usePosts(opts),
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
  return result.current;
}

// Components under test
import CommunityHero from "../../src/components/community/CommunityHero";
import CommunityMembersPreview from "../../src/components/community/CommunityMembersPreview";
import CommunityDetail from "../../src/pages/CommunityDetail";

describe("Milestone 19 — Unit 19.6: Community Detail UI", () => {
  let mockJoin;
  let mockLeave;
  let mockRefetchCommunity;

  beforeEach(() => {
    vi.clearAllMocks();

    mockJoin = vi.fn().mockResolvedValue({});
    mockLeave = vi.fn().mockResolvedValue({});
    mockRefetchCommunity = vi.fn().mockResolvedValue({});

    mocks.useParams.mockReturnValue({ communityId: COMMUNITY_APEX_AI.id });
    mocks.useAuth.mockReturnValue({
      user: { uid: "user-test-1", email: "student@apex.edu" },
      loading: false,
    });
    mocks.useOptionalCampus.mockReturnValue({
      campus: CAMPUS_A,
      campusId: APEX_CAMPUS_ID,
      loading: false,
    });
    mocks.useCommunity.mockReturnValue({
      community: COMMUNITY_APEX_AI,
      isLoading: false,
      error: null,
      refetch: mockRefetchCommunity,
    });
    mocks.useCommunityMembers.mockReturnValue({
      members: [COMMUNITY_MEMBER_APEX_AI_STUDENT1, COMMUNITY_MEMBER_APEX_AI_STUDENT2],
      membership: null,
      isMember: false,
      isAdmin: false,
      isLoading: false,
      error: null,
      join: mockJoin,
      leave: mockLeave,
      refetch: vi.fn(),
    });
  });

  describe("CommunityHero", () => {
    it("returns null when community prop is null", () => {
      const el = renderComponent(CommunityHero, { community: null });
      expect(el).toBeNull();
    });

    it("renders community identity, category, campus, stats, and fallback avatar", () => {
      const el = renderComponent(CommunityHero, {
        community: COMMUNITY_APEX_AI,
        isMember: false,
        isAdmin: false,
      });

      const nameEl = findByTestId(el, "community-hero-name");
      expect(nameEl.props.children).toBe(COMMUNITY_APEX_AI.name);

      const campusBadge = findByTestId(el, "community-hero-campus");
      expect(campusBadge.props.children).toBe("Apex Tech");

      const membersStat = findByTestId(el, "community-hero-members");
      expect(membersStat).not.toBeNull();

      const postsStat = findByTestId(el, "community-hero-posts");
      expect(postsStat).not.toBeNull();
    });

    it("renders custom banner image when bannerURL is present", () => {
      const communityWithBanner = {
        ...COMMUNITY_APEX_AI,
        bannerURL: "https://example.com/custom-banner.jpg",
      };
      const el = renderComponent(CommunityHero, { community: communityWithBanner });
      const img = findInReactTree(el, (n) => n.type === "img" && n.props?.src === "https://example.com/custom-banner.jpg");
      expect(img).not.toBeNull();
    });

    it("renders custom avatar image when imageURL is present", () => {
      const communityWithImage = {
        ...COMMUNITY_APEX_AI,
        imageURL: "https://example.com/custom-avatar.jpg",
      };
      const el = renderComponent(CommunityHero, { community: communityWithImage });
      const img = findInReactTree(el, (n) => n.type === "img" && n.props?.src === "https://example.com/custom-avatar.jpg");
      expect(img).not.toBeNull();
    });

    it("renders Join button when user is not a member", () => {
      const onJoinMock = vi.fn();
      const el = renderComponent(CommunityHero, {
        community: COMMUNITY_APEX_AI,
        isMember: false,
        onJoin: onJoinMock,
      });

      const joinBtn = findByTestId(el, "join-community-button");
      expect(joinBtn).not.toBeNull();
      expect(findByTestId(el, "leave-community-button")).toBeNull();

      joinBtn.props.onClick();
      expect(onJoinMock).toHaveBeenCalledTimes(1);
    });

    it("renders Leave button and Joined badge when user is a member", () => {
      const onLeaveMock = vi.fn();
      const el = renderComponent(CommunityHero, {
        community: COMMUNITY_APEX_AI,
        isMember: true,
        isAdmin: false,
        onLeave: onLeaveMock,
      });

      const memberBadge = findByTestId(el, "community-member-badge");
      expect(memberBadge).not.toBeNull();

      const leaveBtn = findByTestId(el, "leave-community-button");
      expect(leaveBtn).not.toBeNull();
      expect(findByTestId(el, "join-community-button")).toBeNull();

      leaveBtn.props.onClick();
      expect(onLeaveMock).toHaveBeenCalledTimes(1);
    });

    it("renders Admin badge when user has admin role", () => {
      const el = renderComponent(CommunityHero, {
        community: COMMUNITY_APEX_AI,
        isMember: true,
        isAdmin: true,
      });

      const adminBadge = findByTestId(el, "community-admin-badge");
      expect(adminBadge).not.toBeNull();
    });
  });

  describe("CommunityMembersPreview", () => {
    it("renders empty state message when members list is empty", () => {
      const el = renderComponent(CommunityMembersPreview, { members: [] });
      const emptyMsg = findByTestId(el, "community-members-empty");
      expect(emptyMsg).not.toBeNull();
      expect(emptyMsg.props.children).toBe("No members yet. Be the first to join!");
    });

    it("renders members list with name and admin pill", () => {
      const el = renderComponent(CommunityMembersPreview, {
        members: [COMMUNITY_MEMBER_APEX_AI_STUDENT1, COMMUNITY_MEMBER_APEX_AI_STUDENT2],
      });

      const countBadge = findByTestId(el, "community-members-count-badge");
      expect(countBadge.props.children).toBe(2);

      const student1Row = findByTestId(el, `member-row-${COMMUNITY_MEMBER_APEX_AI_STUDENT1.userId}`);
      expect(student1Row).not.toBeNull();

      const adminPill = findByTestId(el, `member-admin-pill-${COMMUNITY_MEMBER_APEX_AI_STUDENT1.userId}`);
      expect(adminPill).not.toBeNull();

      const student2AdminPill = findByTestId(el, `member-admin-pill-${COMMUNITY_MEMBER_APEX_AI_STUDENT2.userId}`);
      expect(student2AdminPill).toBeNull();
    });

    it("displays remaining count indicator when members exceed maxPreview", () => {
      const manyMembers = Array.from({ length: 8 }, (_, idx) => ({
        id: `mem-${idx}`,
        userId: `user-${idx}`,
        displayName: `Student ${idx}`,
        role: "member",
      }));

      const el = renderComponent(CommunityMembersPreview, {
        members: manyMembers,
        maxPreview: 5,
      });

      const moreIndicator = findByTestId(el, "community-members-more-count");
      expect(moreIndicator).not.toBeNull();
      expect(moreIndicator.props.children.join("")).toContain("3 more members");
    });
  });

  describe("CommunityDetail Page", () => {
    it("renders loading state when community data is loading", () => {
      mocks.useCommunity.mockReturnValue({
        community: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => CommunityDetail());
      const loadingContainer = findByTestId(result.current, "community-detail-loading");
      expect(loadingContainer).not.toBeNull();
    });

    it("renders error state with retry button when hook returns an error", () => {
      mocks.useCommunity.mockReturnValue({
        community: null,
        isLoading: false,
        error: "Firestore network error",
        refetch: mockRefetchCommunity,
      });

      const { result } = renderHook(() => CommunityDetail());
      const errorContainer = findByTestId(result.current, "community-detail-error");
      expect(errorContainer).not.toBeNull();

      const retryBtn = findInReactTree(result.current, (n) => n.props?.onClick && n.type?.name === "Button");
      expect(retryBtn).not.toBeNull();
      retryBtn.props.onClick();
      expect(mockRefetchCommunity).toHaveBeenCalled();
    });

    it("renders not found state when community does not exist", () => {
      mocks.useCommunity.mockReturnValue({
        community: null,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => CommunityDetail());
      const notFoundContainer = findByTestId(result.current, "community-detail-not-found");
      expect(notFoundContainer).not.toBeNull();

      const emptyState = findInReactTree(result.current, (n) => n.props?.title === "Community Not Found");
      expect(emptyState).not.toBeNull();
      const backLink = emptyState.props.action;
      expect(backLink.props.to).toBe("/communities");
    });

    it("renders community details, hero, about card, and stats", () => {
      const { result } = renderHook(() => CommunityDetail());

      const backLink = findByTestId(result.current, "back-to-communities");
      expect(backLink).not.toBeNull();
      expect(backLink.props.to).toBe("/communities");

      const hero = findInReactTree(result.current, (n) => n.type === CommunityHero);
      expect(hero).not.toBeNull();

      const aboutCard = findByTestId(result.current, "community-about-card");
      expect(aboutCard).not.toBeNull();

      const descEl = findByTestId(result.current, "community-detail-description");
      expect(descEl.props.children).toBe(COMMUNITY_APEX_AI.description);

      const campusEl = findByTestId(result.current, "community-detail-campus");
      expect(campusEl.props.children).toBe(CAMPUS_A.name);

      const memberStat = findByTestId(result.current, "community-stat-members");
      expect(memberStat.props.children).toBe(COMMUNITY_APEX_AI.stats.memberCount);

      const postStat = findByTestId(result.current, "community-stat-posts");
      expect(postStat.props.children).toBe(COMMUNITY_APEX_AI.stats.postCount);
    });

    it("handles join action invocation", async () => {
      const { result } = renderHook(() => CommunityDetail());

      const hero = findInReactTree(result.current, (n) => n.type === CommunityHero);
      expect(hero).not.toBeNull();

      await act(async () => {
        await hero.props.onJoin();
      });

      expect(mockJoin).toHaveBeenCalledWith(COMMUNITY_APEX_AI.campusId);
    });

    it("handles leave action invocation", async () => {
      mocks.useCommunityMembers.mockReturnValue({
        members: [COMMUNITY_MEMBER_APEX_AI_STUDENT1],
        membership: COMMUNITY_MEMBER_APEX_AI_STUDENT1,
        isMember: true,
        isAdmin: false,
        isLoading: false,
        error: null,
        join: mockJoin,
        leave: mockLeave,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => CommunityDetail());

      const hero = findInReactTree(result.current, (n) => n.type === CommunityHero);
      expect(hero).not.toBeNull();

      await act(async () => {
        await hero.props.onLeave();
      });

      expect(mockLeave).toHaveBeenCalledTimes(1);
    });

    it("renders community activity section and gates composer based on membership", () => {
      // 1. Non-member state
      const { result: nonMemberResult } = renderHook(() => CommunityDetail());
      expect(findByTestId(nonMemberResult.current, "community-activity-section")).not.toBeNull();

      const nonMemberComposer = findInReactTree(
        nonMemberResult.current,
        (n) => n.props?.["data-testid"] === "community-post-composer"
      );
      expect(nonMemberComposer).toBeNull();

      // 2. Member state
      mocks.useCommunityMembers.mockReturnValue({
        members: [COMMUNITY_MEMBER_APEX_AI_STUDENT1],
        membership: COMMUNITY_MEMBER_APEX_AI_STUDENT1,
        isMember: true,
        isAdmin: true,
        isLoading: false,
        error: null,
        join: mockJoin,
        leave: mockLeave,
        refetch: vi.fn(),
      });

      const { result: memberResult } = renderHook(() => CommunityDetail());
      expect(findByTestId(memberResult.current, "community-activity-section")).not.toBeNull();
      const memberComposer = findInReactTree(
        memberResult.current,
        (n) => n.props?.isMember === true
      );
      expect(memberComposer).not.toBeNull();
    });
  });
});
