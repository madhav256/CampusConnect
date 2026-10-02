/**
 * Milestone 19 — Unit 19.5: Community UI & Discovery Foundation
 * Unit Tests for CommunityCategoryBadge, CommunityCard, CommunityGrid, and Communities Page.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { APEX_CAMPUS_ID, COMMUNITY_CATEGORIES } from "../../src/constants.js";
import { CAMPUS_A } from "../../src/data/campuses.js";
import {
  COMMUNITY_APEX_AI,
  COMMUNITY_APEX_DESIGN,
  COMMUNITY_ST_JUDE_MED,
} from "../../src/data/communities.js";
import { renderHook, act } from "./hookTestUtils";

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  useNotifications: vi.fn(() => ({ unreadCount: 0 })),
  useConversations: vi.fn(() => ({ totalUnread: 0 })),
  useCommunities: vi.fn(),
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

vi.mock("../../src/hooks/useCommunities", () => ({
  useCommunities: (...args) => mocks.useCommunities(...args),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children),
  NavLink: ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children),
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
  const { result } = renderHook(() => Component(props));
  return result.current;
}

// Components under test
import CommunityCategoryBadge from "../../src/components/community/CommunityCategoryBadge";
import CommunityCard from "../../src/components/community/CommunityCard";
import CommunityGrid from "../../src/components/community/CommunityGrid";
import Communities from "../../src/pages/Communities";

describe("Milestone 19 — Unit 19.5: Community UI Components & Discovery Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { uid: "user-1", email: "student@apex.edu" },
      loading: false,
    });
    mocks.useOptionalCampus.mockReturnValue({
      campus: CAMPUS_A,
      campusId: APEX_CAMPUS_ID,
      loading: false,
    });
    mocks.useCommunities.mockReturnValue({
      communities: [COMMUNITY_APEX_AI, COMMUNITY_APEX_DESIGN],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  describe("CommunityCategoryBadge", () => {
    it("renders tech category with appropriate styling and label", () => {
      const el = renderComponent(CommunityCategoryBadge, {
        category: COMMUNITY_CATEGORIES.TECH,
      });
      expect(el.props["data-testid"]).toBe("community-category-badge");
      expect(el.props.children).toBe("Tech & Robotics");
      expect(el.props.className).toContain("bg-sky-50");
      expect(el.props.className).toContain("text-sky-700");
    });

    it("renders academic category label and styling", () => {
      const el = renderComponent(CommunityCategoryBadge, {
        category: COMMUNITY_CATEGORIES.ACADEMIC,
      });
      expect(el.props.children).toBe("Academic");
      expect(el.props.className).toContain("bg-indigo-50");
    });

    it("renders cultural category label and styling", () => {
      const el = renderComponent(CommunityCategoryBadge, {
        category: COMMUNITY_CATEGORIES.CULTURAL,
      });
      expect(el.props.children).toBe("Cultural & Arts");
      expect(el.props.className).toContain("bg-amber-50");
    });

    it("handles unknown or missing category with default styling", () => {
      const el = renderComponent(CommunityCategoryBadge, { category: "custom-club" });
      expect(el.props.children).toBe("Custom-club");
      expect(el.props.className).toContain("bg-stone-100");

      const nullEl = renderComponent(CommunityCategoryBadge, { category: null });
      expect(nullEl.props.children).toBe("General");
    });
  });

  describe("CommunityCard", () => {
    it("returns null when community prop is null", () => {
      const el = renderComponent(CommunityCard, { community: null });
      expect(el).toBeNull();
    });

    it("renders community name, description, category badge, and stats", () => {
      const el = renderComponent(CommunityCard, { community: COMMUNITY_APEX_AI });

      const nameEl = findInReactTree(el, (n) => n.props?.children === COMMUNITY_APEX_AI.name);
      expect(nameEl).not.toBeNull();

      const descEl = findInReactTree(el, (n) =>
        typeof n.props?.children === "string" && n.props?.children.includes("autonomous systems")
      );
      expect(descEl).not.toBeNull();

      const memberStat = findByTestId(el, "community-card-members");
      expect(memberStat).not.toBeNull();
      const memberText = findInReactTree(memberStat, (n) =>
        typeof n.props?.children === "string" && n.props?.children.includes("42 members")
      );
      expect(memberText).not.toBeNull();

      const postStat = findByTestId(el, "community-card-posts");
      expect(postStat).not.toBeNull();
      const postText = findInReactTree(postStat, (n) =>
        typeof n.props?.children === "string" && n.props?.children.includes("15 posts")
      );
      expect(postText).not.toBeNull();
    });

    it("displays campus identifier badge", () => {
      const el = renderComponent(CommunityCard, { community: COMMUNITY_APEX_AI });
      const campusBadge = findByTestId(el, "community-card-campus");
      expect(campusBadge).not.toBeNull();
      expect(campusBadge.props.children).toBe("Apex Tech");
    });

    it("renders banner image when bannerURL is provided", () => {
      const communityWithBanner = {
        ...COMMUNITY_APEX_AI,
        bannerURL: "https://example.com/banner.png",
      };
      const el = renderComponent(CommunityCard, { community: communityWithBanner });
      const img = findInReactTree(el, (n) => n.type === "img" && n.props?.src === "https://example.com/banner.png");
      expect(img).not.toBeNull();
    });
  });

  describe("CommunityGrid", () => {
    it("renders loading skeletons when isLoading is true", () => {
      const el = renderComponent(CommunityGrid, { isLoading: true, communities: [] });
      const loadingContainer = findByTestId(el, "community-grid-loading");
      expect(loadingContainer).not.toBeNull();

      const skeletons = findInReactTree(el, (n) => n.props?.["data-testid"] === "community-skeleton-card");
      expect(skeletons).not.toBeNull();
    });

    it("renders empty state when communities is empty", () => {
      const el = renderComponent(CommunityGrid, {
        isLoading: false,
        communities: [],
        emptyTitle: "No clubs yet",
        emptyDescription: "Check back later",
      });
      const emptyContainer = findInReactTree(el, (n) => n.props?.title === "No clubs yet");
      expect(emptyContainer).not.toBeNull();
    });

    it("renders error state when error is provided", () => {
      const retryMock = vi.fn();
      const el = renderComponent(CommunityGrid, {
        error: "Firestore network error",
        onRetry: retryMock,
      });
      const errorContainer = findByTestId(el, "community-grid-error");
      expect(errorContainer).not.toBeNull();
      expect(findInReactTree(el, (n) => n.props?.children === "Firestore network error")).not.toBeNull();
    });

    it("renders grid of community cards when communities are provided", () => {
      const el = renderComponent(CommunityGrid, {
        isLoading: false,
        communities: [COMMUNITY_APEX_AI, COMMUNITY_ST_JUDE_MED],
      });
      const grid = findByTestId(el, "community-grid");
      expect(grid).not.toBeNull();

      const aiCard = findByTestId(el, `community-card-${COMMUNITY_APEX_AI.id}`);
      const medCard = findByTestId(el, `community-card-${COMMUNITY_ST_JUDE_MED.id}`);
      expect(aiCard).not.toBeNull();
      expect(medCard).not.toBeNull();
    });
  });

  describe("Communities Discovery Page", () => {
    it("renders page header with campus badge and communities count", () => {
      const { result } = renderHook(() => Communities());
      const page = result.current;

      const titleEl = findInReactTree(page, (n) => n.props?.children === "Campus Communities");
      expect(titleEl).not.toBeNull();

      const campusBadge = findByTestId(page, "communities-campus-badge");
      expect(campusBadge).not.toBeNull();

      const countLabel = findByTestId(page, "communities-count-label");
      expect(countLabel).not.toBeNull();
      expect(countLabel.props.children.join("")).toContain("2 communities");
    });

    it("filters communities by search input term", () => {
      const { result } = renderHook(() => Communities());

      const searchInput = findInReactTree(result.current, (n) => n.props?.["aria-label"] === "Search communities");
      expect(searchInput).not.toBeNull();

      // Trigger search for "robotics"
      act(() => {
        searchInput.props.onChange({ target: { value: "robotics" } });
      });

      // Filtered to AI club only
      const grid = findInReactTree(result.current, (n) => n.type === CommunityGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.communities.map((c) => c.id)).toEqual([COMMUNITY_APEX_AI.id]);
    });

    it("filters communities by category filter tab", () => {
      const { result } = renderHook(() => Communities());

      const culturalTab = findByTestId(result.current, `category-filter-${COMMUNITY_CATEGORIES.CULTURAL}`);
      expect(culturalTab).not.toBeNull();

      // Select cultural category
      act(() => {
        culturalTab.props.onClick();
      });

      // Filtered to Design collective only
      const grid = findInReactTree(result.current, (n) => n.type === CommunityGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.communities.map((c) => c.id)).toEqual([COMMUNITY_APEX_DESIGN.id]);
    });

    it("shows empty state when search finds no matches", () => {
      const { result } = renderHook(() => Communities());

      const searchInput = findInReactTree(result.current, (n) => n.props?.["aria-label"] === "Search communities");
      act(() => {
        searchInput.props.onChange({ target: { value: "nonexistent query 12345" } });
      });

      const grid = findInReactTree(result.current, (n) => n.type === CommunityGrid);
      expect(grid).not.toBeNull();
      expect(grid.props.communities).toHaveLength(0);
      expect(grid.props.emptyTitle).toBe("No matching communities");
    });
  });
});
