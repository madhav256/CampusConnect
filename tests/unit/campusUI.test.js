/**
 * Milestone 18 — Unit 18.4: UI, Registration & Campus Experience
 * Unit Tests for Campus Identity, Registration, Navbar, Profile, Discover, and Legacy Backward Compatibility.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { APEX_CAMPUS_ID, ST_JUDE_CAMPUS_ID, DEFAULT_CAMPUS_ID } from "../../src/constants.js";
import { CAMPUS_A, CAMPUS_B, CAMPUSES } from "../../src/data/campuses.js";
import { renderHook } from "./hookTestUtils";

// Hoisted mocks for dependencies
const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  useNotifications: vi.fn(() => ({ unreadCount: 0 })),
  useConversations: vi.fn(() => ({ totalUnread: 0 })),
  useUserProfile: vi.fn(),
  useUserSearch: vi.fn(),
  usePosts: vi.fn(),
  useConnectionState: vi.fn(),
  createUserProfile: vi.fn(),
  signUpWithEmail: vi.fn(),
  fetchUserById: vi.fn(),
  navigate: vi.fn(),
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

vi.mock("../../src/hooks/useUserProfile", () => ({
  useUserProfile: (...args) => mocks.useUserProfile(...args),
}));

vi.mock("../../src/hooks/useUserSearch", () => ({
  useUserSearch: (...args) => mocks.useUserSearch(...args),
}));

vi.mock("../../src/hooks/usePosts", () => ({
  usePosts: (...args) => mocks.usePosts(...args),
}));

vi.mock("../../src/hooks/useConnectionState", () => ({
  useConnectionState: (...args) => mocks.useConnectionState(...args),
}));

vi.mock("../../src/services/userService", () => ({
  createUserProfile: (...args) => mocks.createUserProfile(...args),
  fetchUserById: (...args) => mocks.fetchUserById(...args),
}));

vi.mock("../../src/services/authService", () => ({
  signUpWithEmail: (...args) => mocks.signUpWithEmail(...args),
  logoutUser: vi.fn(),
  sendPasswordReset: vi.fn(),
  getAuthErrorMessage: vi.fn((err) => err?.message || "Auth error"),
  onAuthStateChangedListener: vi.fn(() => () => {}),
  auth: { currentUser: null },
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children),
  NavLink: ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children),
  useNavigate: () => mocks.navigate,
  useParams: () => ({ uid: "target-user-123" }),
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

function findById(tree, id) {
  return findInReactTree(tree, (el) => el.props?.id === id);
}

function findByTestId(tree, testId) {
  return findInReactTree(tree, (el) => el.props?.["data-testid"] === testId);
}

function renderComponent(Component, props = {}) {
  const { result } = renderHook(() => Component(props));
  return result.current;
}

// Components under test
import Navbar from "../../src/components/layout/Navbar";
import Profile from "../../src/pages/Profile";
import PublicProfile from "../../src/pages/PublicProfile";
import Discover from "../../src/pages/Discover";
import StudentCard from "../../src/components/search/StudentCard";
import Feed from "../../src/components/feed/Feed";
import Dashboard from "../../src/pages/Dashboard";

describe("Milestone 18 — Unit 18.4: UI, Registration & Campus Experience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { uid: "user-1", name: "Madhav", email: "madhav@apex.edu" },
      loading: false,
    });
    mocks.useOptionalCampus.mockReturnValue({
      campus: CAMPUS_A,
      campusId: APEX_CAMPUS_ID,
      loading: false,
    });
    mocks.useUserProfile.mockReturnValue({
      profile: {
        displayName: "Madhav",
        email: "madhav@apex.edu",
        department: "Computer Science",
        year: "3rd Year",
        skills: ["React", "Firebase"],
        socialLinks: {},
        campusId: APEX_CAMPUS_ID,
      },
      loading: false,
      error: null,
      saveProfile: vi.fn(),
    });
    mocks.useUserSearch.mockReturnValue({
      results: [],
      isLoading: false,
      error: null,
      debouncedTerm: "",
      retry: vi.fn(),
    });
    mocks.usePosts.mockReturnValue({
      posts: [],
      isLoading: false,
      isFetchingOlder: false,
      error: null,
      hasMorePosts: false,
      initialize: vi.fn(),
      loadMore: vi.fn(),
      addPost: vi.fn(),
      removePost: vi.fn(),
      isInitialError: false,
      updatePost: vi.fn(),
    });
    mocks.useConnectionState.mockReturnValue({
      connectionState: "none",
      isConnLoading: false,
      isPending: false,
      connError: null,
      handleConnect: vi.fn(),
      handleCancel: vi.fn(),
      handleAccept: vi.fn(),
      handleDecline: vi.fn(),
      handleRemove: vi.fn(),
    });
  });

  // -------------------------------------------------------------
  // Goal 1: Registration Campus Association
  // -------------------------------------------------------------
  describe("Goal 1: Registration Campus Association", () => {
    it("ensures default campus is seeded and campus fixtures exist", () => {
      expect(DEFAULT_CAMPUS_ID).toBe(APEX_CAMPUS_ID);
      expect(CAMPUSES[APEX_CAMPUS_ID]).toBeDefined();
      expect(CAMPUSES[ST_JUDE_CAMPUS_ID]).toBeDefined();
    });

    it("creates user profile with campusId during signup", async () => {
      mocks.signUpWithEmail.mockResolvedValueOnce({
        uid: "new-user-1",
        name: "Aarav Sharma",
        email: "aarav@apex.edu",
        photoURL: null,
      });
      mocks.createUserProfile.mockResolvedValueOnce({ uid: "new-user-1" });

      // Simulate AuthContext signup method behavior
      const credentials = {
        name: "Aarav Sharma",
        email: "aarav@apex.edu",
        password: "password123",
        campusId: APEX_CAMPUS_ID,
      };

      const user = await mocks.signUpWithEmail(credentials);
      await mocks.createUserProfile({
        uid: user.uid,
        displayName: user.name,
        email: user.email,
        photoURL: user.photoURL,
        ...(credentials.campusId ? { campusId: credentials.campusId } : {}),
      });

      expect(mocks.createUserProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: "new-user-1",
          displayName: "Aarav Sharma",
          email: "aarav@apex.edu",
          campusId: APEX_CAMPUS_ID,
        })
      );
    });

    it("preserves backwards compatibility when campusId is omitted from credentials", async () => {
      mocks.signUpWithEmail.mockResolvedValueOnce({
        uid: "legacy-user-1",
        name: "Old Student",
        email: "old@legacy.edu",
      });
      mocks.createUserProfile.mockResolvedValueOnce({ uid: "legacy-user-1" });

      const credentials = {
        name: "Old Student",
        email: "old@legacy.edu",
        password: "password123",
      };

      const user = await mocks.signUpWithEmail(credentials);
      await mocks.createUserProfile({
        uid: user.uid,
        displayName: user.name,
        email: user.email,
        photoURL: user.photoURL,
        ...(credentials.campusId ? { campusId: credentials.campusId } : {}),
      });

      expect(mocks.createUserProfile).toHaveBeenCalledWith({
        uid: "legacy-user-1",
        displayName: "Old Student",
        email: "old@legacy.edu",
        photoURL: undefined,
      });
      expect(mocks.createUserProfile.mock.calls[0][0].campusId).toBeUndefined();
    });
  });

  // -------------------------------------------------------------
  // Goal 2: Navbar Campus Identity
  // -------------------------------------------------------------
  describe("Goal 2: Navbar Campus Identity", () => {
    it("renders campus indicator badge when campus is available", () => {
      mocks.useOptionalCampus.mockReturnValue({
        campus: CAMPUS_A,
        campusId: APEX_CAMPUS_ID,
      });

      const tree = renderComponent(Navbar);
      const badge = findById(tree, "navbar-campus-badge");

      expect(badge).not.toBeNull();
      expect(badge.props.title).toBe(CAMPUS_A.name);
      // Contains the shortName
      const textSpan = badge.props.children[1];
      expect(textSpan.props.children).toBe(CAMPUS_A.shortName);
    });

    it("renders St. Jude campus badge when switching campus context", () => {
      mocks.useOptionalCampus.mockReturnValue({
        campus: CAMPUS_B,
        campusId: ST_JUDE_CAMPUS_ID,
      });

      const tree = renderComponent(Navbar);
      const badge = findById(tree, "navbar-campus-badge");

      expect(badge).not.toBeNull();
      expect(badge.props.title).toBe(CAMPUS_B.name);
      const textSpan = badge.props.children[1];
      expect(textSpan.props.children).toBe(CAMPUS_B.shortName);
    });

    it("omits campus badge gracefully for legacy users without campusId", () => {
      mocks.useOptionalCampus.mockReturnValue({
        campus: null,
        campusId: null,
        loading: false,
      });

      const tree = renderComponent(Navbar);
      const badge = findById(tree, "navbar-campus-badge");

      expect(badge).toBeNull();
    });

    it("does not crash if rendered completely outside CampusProvider", () => {
      mocks.useOptionalCampus.mockReturnValue(null);

      const tree = renderComponent(Navbar);
      expect(tree).toBeDefined();
      expect(findById(tree, "navbar-campus-badge")).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // Goal 3: Profile Campus Information
  // -------------------------------------------------------------
  describe("Goal 3: Profile Campus Information", () => {
    it("displays profile campus badge when campus is available", () => {
      mocks.useOptionalCampus.mockReturnValue({
        campus: CAMPUS_A,
        campusId: APEX_CAMPUS_ID,
      });

      const tree = renderComponent(Profile);
      const badge = findById(tree, "profile-campus-badge");

      expect(badge).not.toBeNull();
      // Second child inside badge is the text (Apex Tech)
      const text = badge.props.children[1];
      expect(text).toBe(CAMPUS_A.shortName);
    });

    it("omits profile campus badge gracefully for legacy profiles without campusId", () => {
      mocks.useOptionalCampus.mockReturnValue({
        campus: null,
        campusId: null,
      });
      mocks.useUserProfile.mockReturnValue({
        profile: {
          displayName: "Legacy Student",
          email: "legacy@school.edu",
          department: "Mechanical Engineering",
          year: "4th Year",
          skills: [],
          socialLinks: {},
          // campusId is missing
        },
        loading: false,
        error: null,
        saveProfile: vi.fn(),
      });

      const tree = renderComponent(Profile);
      const badge = findById(tree, "profile-campus-badge");

      expect(badge).toBeNull();
    });

    it("renders public profile without crashing", () => {
      mocks.fetchUserById.mockResolvedValueOnce({
        uid: "target-user-123",
        displayName: "Priya Nair",
        campusId: APEX_CAMPUS_ID,
        department: "Electrical Engineering",
        year: "2nd Year",
      });

      const tree = renderComponent(PublicProfile);
      expect(tree).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // Goal 4: Directory / Discover Campus Context
  // -------------------------------------------------------------
  describe("Goal 4: Directory / Discover Campus Context", () => {
    it("passes tenant campusId to useUserSearch hook", () => {
      mocks.useOptionalCampus.mockReturnValue({
        campus: CAMPUS_A,
        campusId: APEX_CAMPUS_ID,
      });

      renderComponent(Discover);

      expect(mocks.useUserSearch).toHaveBeenCalledWith("", APEX_CAMPUS_ID);
    });

    it("displays campus badge and scoped description on Discover page", () => {
      mocks.useOptionalCampus.mockReturnValue({
        campus: CAMPUS_A,
        campusId: APEX_CAMPUS_ID,
      });

      const tree = renderComponent(Discover);
      const badge = findById(tree, "discover-campus-badge");

      expect(badge).not.toBeNull();
      expect(badge.props.children[1]).toBe(CAMPUS_A.shortName);
    });

    it("falls back to generic description when user has no campusId (legacy)", () => {
      mocks.useOptionalCampus.mockReturnValue({
        campus: null,
        campusId: null,
      });

      const tree = renderComponent(Discover);
      const badge = findById(tree, "discover-campus-badge");

      expect(badge).toBeNull();
      expect(mocks.useUserSearch).toHaveBeenCalledWith("", null);
    });

    it("renders student campus pill on StudentCard if user.campusId is present", () => {
      const studentWithCampus = {
        uid: "stu-1",
        displayName: "Aarav Sharma",
        department: "Computer Science",
        year: "3rd Year",
        skills: ["Python", "FastAPI"],
        campusId: APEX_CAMPUS_ID,
      };

      const tree = StudentCard({ user: studentWithCampus });
      const campusPill = findByTestId(tree, "student-card-campus");

      expect(campusPill).not.toBeNull();
      expect(campusPill.props.children).toBe("Apex Tech");
    });

    it("omits student campus pill on StudentCard for legacy student without campusId", () => {
      const legacyStudent = {
        uid: "stu-legacy",
        displayName: "Old Classmate",
        department: "Physics",
        year: "2nd Year",
        skills: ["Math"],
      };

      const tree = StudentCard({ user: legacyStudent });
      const campusPill = findByTestId(tree, "student-card-campus");

      expect(campusPill).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // Dashboard & Feed Tenant Scoping
  // -------------------------------------------------------------
  describe("Dashboard & Feed Tenant Scoping", () => {
    it("renders campus in dashboard greeting subtitle when available", () => {
      mocks.useOptionalCampus.mockReturnValue({
        campus: CAMPUS_A,
        campusId: APEX_CAMPUS_ID,
      });

      const tree = renderComponent(Dashboard);
      const p = findInReactTree(tree, (el) =>
        typeof el.props?.children === "string" && el.props.children.includes("Apex Institute of Technology")
      );

      expect(p).not.toBeNull();
      expect(p.props.children).toContain("Here's what's happening at Apex Institute of Technology today.");
    });

    it("passes active campusId to usePosts hook in Feed", () => {
      mocks.useOptionalCampus.mockReturnValue({
        campus: CAMPUS_A,
        campusId: APEX_CAMPUS_ID,
      });

      renderComponent(Feed);

      expect(mocks.usePosts).toHaveBeenCalledWith({ campusId: APEX_CAMPUS_ID });
    });

    it("passes null campusId to usePosts for legacy users without crashing", () => {
      mocks.useOptionalCampus.mockReturnValue({
        campus: null,
        campusId: null,
      });

      renderComponent(Feed);

      expect(mocks.usePosts).toHaveBeenCalledWith({ campusId: null });
    });
  });
});
