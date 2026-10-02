import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "./hookTestUtils.js";
import { APEX_CAMPUS_ID } from "../../src/constants.js";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOptionalCampus: vi.fn(),
  getCommunitiesByCampus: vi.fn(),
  subscribeToCommunitiesByCampus: vi.fn(),
  getCommunityById: vi.fn(),
  subscribeToCommunity: vi.fn(),
  getCommunityMembers: vi.fn(),
  subscribeToCommunityMembers: vi.fn(),
  subscribeToCommunityMembership: vi.fn(),
  joinCommunity: vi.fn(),
  leaveCommunity: vi.fn(),
}));

vi.mock("../../src/hooks/useAuth.js", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("../../src/hooks/useCampus.js", () => ({
  useCampus: () => ({ campusId: APEX_CAMPUS_ID }),
  useOptionalCampus: () => mocks.useOptionalCampus(),
}));

vi.mock("../../src/services/communityService.js", () => ({
  getCommunitiesByCampus: mocks.getCommunitiesByCampus,
  subscribeToCommunitiesByCampus: mocks.subscribeToCommunitiesByCampus,
  getCommunityById: mocks.getCommunityById,
  subscribeToCommunity: mocks.subscribeToCommunity,
}));

vi.mock("../../src/services/communityMemberService.js", () => ({
  getCommunityMembers: mocks.getCommunityMembers,
  subscribeToCommunityMembers: mocks.subscribeToCommunityMembers,
  subscribeToCommunityMembership: mocks.subscribeToCommunityMembership,
  joinCommunity: mocks.joinCommunity,
  leaveCommunity: mocks.leaveCommunity,
}));

import { useCommunities } from "../../src/hooks/useCommunities.js";
import { useCommunity } from "../../src/hooks/useCommunity.js";
import { useCommunityMembers } from "../../src/hooks/useCommunityMembers.js";

describe("Milestone 19 — Unit 19.4: Community Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { uid: "test-user-1" },
    });
    mocks.useOptionalCampus.mockReturnValue({
      campusId: APEX_CAMPUS_ID,
    });
    mocks.subscribeToCommunitiesByCampus.mockReturnValue(vi.fn());
    mocks.subscribeToCommunity.mockReturnValue(vi.fn());
    mocks.subscribeToCommunityMembers.mockReturnValue(vi.fn());
    mocks.subscribeToCommunityMembership.mockReturnValue(vi.fn());
  });

  describe("useCommunities", () => {
    it("subscribes to campus communities and initializes loading state", () => {
      let callback;
      mocks.subscribeToCommunitiesByCampus.mockImplementationOnce((_id, cb) => {
        callback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useCommunities(APEX_CAMPUS_ID));
      expect(result.current.isLoading).toBe(true);
      expect(result.current.communities).toEqual([]);
      expect(result.current.error).toBeNull();

      const sample = [{ id: "c1", name: "AI Club" }];
      act(() => {
        callback(sample);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.communities).toEqual(sample);
    });

    it("falls back to useOptionalCampus when explicitCampusId is not provided", () => {
      renderHook(() => useCommunities());
      expect(mocks.subscribeToCommunitiesByCampus).toHaveBeenCalledWith(
        APEX_CAMPUS_ID,
        expect.any(Function),
        expect.any(Function)
      );
    });

    it("handles subscription error properly", () => {
      let errorHandler;
      mocks.subscribeToCommunitiesByCampus.mockImplementationOnce((_id, _cb, errCb) => {
        errorHandler = errCb;
        return vi.fn();
      });

      const { result } = renderHook(() => useCommunities(APEX_CAMPUS_ID));
      act(() => {
        errorHandler(new Error("Permission denied"));
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe("Permission denied");
    });

    it("cleans up subscription on unmount", () => {
      const unsub = vi.fn();
      mocks.subscribeToCommunitiesByCampus.mockReturnValueOnce(unsub);

      const { unmount } = renderHook(() => useCommunities(APEX_CAMPUS_ID));
      unmount();
      expect(unsub).toHaveBeenCalled();
    });

    it("provides manual refetch capability", async () => {
      mocks.getCommunitiesByCampus.mockResolvedValueOnce([{ id: "c2", name: "Design" }]);
      const { result } = renderHook(() => useCommunities(APEX_CAMPUS_ID));

      await act(async () => {
        await result.current.refetch();
      });

      expect(mocks.getCommunitiesByCampus).toHaveBeenCalledWith(APEX_CAMPUS_ID);
      expect(result.current.communities).toEqual([{ id: "c2", name: "Design" }]);
    });
  });

  describe("useCommunity", () => {
    it("subscribes to a single community document and updates data state", () => {
      let callback;
      mocks.subscribeToCommunity.mockImplementationOnce((_id, cb) => {
        callback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useCommunity("apex-ai-club"));
      expect(result.current.isLoading).toBe(true);

      const communityDoc = { id: "apex-ai-club", name: "Apex AI & Robotics" };
      act(() => {
        callback(communityDoc);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.community).toEqual(communityDoc);
      expect(result.current.error).toBeNull();
    });

    it("handles error during community subscription", () => {
      let errHandler;
      mocks.subscribeToCommunity.mockImplementationOnce((_id, _cb, onErr) => {
        errHandler = onErr;
        return vi.fn();
      });

      const { result } = renderHook(() => useCommunity("apex-ai-club"));
      act(() => {
        errHandler(new Error("Not found"));
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe("Not found");
    });

    it("cleans up subscription when communityId changes or unmounts", () => {
      const unsub1 = vi.fn();
      mocks.subscribeToCommunity.mockReturnValueOnce(unsub1);

      const { unmount } = renderHook(() => useCommunity("apex-ai-club"));
      unmount();
      expect(unsub1).toHaveBeenCalled();
    });

    it("supports manual refetch for individual community", async () => {
      mocks.getCommunityById.mockResolvedValueOnce({ id: "c3", name: "Fetched Club" });
      const { result } = renderHook(() => useCommunity("c3"));

      await act(async () => {
        await result.current.refetch();
      });

      expect(mocks.getCommunityById).toHaveBeenCalledWith("c3");
      expect(result.current.community).toEqual({ id: "c3", name: "Fetched Club" });
    });
  });

  describe("useCommunityMembers", () => {
    it("subscribes to member list and user membership", () => {
      let membersCb;
      let membershipCb;

      mocks.subscribeToCommunityMembers.mockImplementationOnce((_id, cb) => {
        membersCb = cb;
        return vi.fn();
      });
      mocks.subscribeToCommunityMembership.mockImplementationOnce((_cId, _uId, cb) => {
        membershipCb = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useCommunityMembers("apex-ai-club", "test-user-1"));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isMember).toBe(false);
      expect(result.current.isAdmin).toBe(false);

      act(() => {
        membersCb([{ id: "m1", userId: "test-user-1", role: "member" }]);
        membershipCb({ id: "apex-ai-club_test-user-1", role: "member", status: "active" });
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.members).toHaveLength(1);
      expect(result.current.membership).toEqual(
        expect.objectContaining({ role: "member", status: "active" })
      );
      expect(result.current.isMember).toBe(true);
      expect(result.current.isAdmin).toBe(false);
    });

    it("correctly identifies admin status when membership has role admin and active status", () => {
      let membershipCb;
      mocks.subscribeToCommunityMembership.mockImplementationOnce((_cId, _uId, cb) => {
        membershipCb = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useCommunityMembers("apex-ai-club", "test-user-1"));

      act(() => {
        membershipCb({ id: "apex-ai-club_test-user-1", role: "admin", status: "active" });
      });

      expect(result.current.isMember).toBe(true);
      expect(result.current.isAdmin).toBe(true);
    });

    it("executes join action successfully", async () => {
      const mockMembership = {
        id: "apex-ai-club_test-user-1",
        communityId: "apex-ai-club",
        userId: "test-user-1",
        campusId: APEX_CAMPUS_ID,
        role: "member",
        status: "active",
      };
      mocks.joinCommunity.mockResolvedValueOnce(mockMembership);

      const { result } = renderHook(() => useCommunityMembers("apex-ai-club", "test-user-1"));

      await act(async () => {
        const res = await result.current.join(APEX_CAMPUS_ID);
        expect(res).toEqual(mockMembership);
      });

      expect(mocks.joinCommunity).toHaveBeenCalledWith(
        "apex-ai-club",
        "test-user-1",
        APEX_CAMPUS_ID
      );
      expect(result.current.membership).toEqual(mockMembership);
      expect(result.current.isMember).toBe(true);
    });

    it("executes leave action successfully and clears membership", async () => {
      mocks.leaveCommunity.mockResolvedValueOnce();

      const { result } = renderHook(() => useCommunityMembers("apex-ai-club", "test-user-1"));

      await act(async () => {
        await result.current.leave();
      });

      expect(mocks.leaveCommunity).toHaveBeenCalledWith("apex-ai-club", "test-user-1");
      expect(result.current.membership).toBeNull();
      expect(result.current.isMember).toBe(false);
    });

    it("unsubscribes both members and membership on unmount", () => {
      const unsubMembers = vi.fn();
      const unsubMembership = vi.fn();

      mocks.subscribeToCommunityMembers.mockReturnValueOnce(unsubMembers);
      mocks.subscribeToCommunityMembership.mockReturnValueOnce(unsubMembership);

      const { unmount } = renderHook(() => useCommunityMembers("apex-ai-club", "test-user-1"));
      unmount();

      expect(unsubMembers).toHaveBeenCalled();
      expect(unsubMembership).toHaveBeenCalled();
    });
  });
});
