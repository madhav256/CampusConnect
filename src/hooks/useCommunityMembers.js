/**
 * Milestone 19 — Unit 19.4: Community Client Services & Hook Layer
 *
 * Hook to retrieve community member roster and user membership state.
 */

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "./useAuth.js";
import {
  getCommunityMembers,
  subscribeToCommunityMembers,
  subscribeToCommunityMembership,
  joinCommunity,
  leaveCommunity,
} from "../services/communityMemberService.js";
import {
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../constants.js";

/**
 * Hook providing real-time access to a community's members and a user's membership.
 *
 * @param {string|null} communityId
 * @param {string} [explicitUserId] - Optional user ID; defaults to authenticated user's UID
 * @returns {{
 *   members: Array<object>,
 *   membership: object|null,
 *   isMember: boolean,
 *   isAdmin: boolean,
 *   isLoading: boolean,
 *   error: string|null,
 *   join: (campusId: string) => Promise<object>,
 *   leave: () => Promise<void>,
 *   refetch: () => Promise<void>,
 * }}
 */
export function useCommunityMembers(communityId, explicitUserId) {
  const { user: authUser } = useAuth();
  const currentUid = explicitUserId || authUser?.uid || null;

  const [members, setMembers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(communityId));
  const [error, setError] = useState(null);

  const [prevCommunityId, setPrevCommunityId] = useState(communityId);
  const [prevUserId, setPrevUserId] = useState(currentUid);
  if (communityId !== prevCommunityId || currentUid !== prevUserId) {
    setPrevCommunityId(communityId);
    setPrevUserId(currentUid);
    setMembers([]);
    setMembership(null);
    setIsLoading(Boolean(communityId));
    setError(null);
  }

  const isMember =
    membership?.status === COMMUNITY_MEMBER_STATUSES.ACTIVE;
  const isAdmin =
    isMember && membership?.role === COMMUNITY_MEMBER_ROLES.ADMIN;

  const refetch = useCallback(async () => {
    if (!communityId) {
      setMembers([]);
      setMembership(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const memberList = await getCommunityMembers(communityId);
      setMembers(memberList || []);
    } catch (err) {
      setError(err?.message || "Failed to load community members.");
    } finally {
      setIsLoading(false);
    }
  }, [communityId]);

  const handleJoin = useCallback(
    async (campusId) => {
      if (!communityId || !currentUid || !campusId) {
        throw new Error("Missing parameters for joining community.");
      }
      try {
        setError(null);
        const newDoc = await joinCommunity(communityId, currentUid, campusId);
        setMembership(newDoc);
        return newDoc;
      } catch (err) {
        setError(err?.message || "Failed to join community.");
        throw err;
      }
    },
    [communityId, currentUid]
  );

  const handleLeave = useCallback(async () => {
    if (!communityId || !currentUid) {
      throw new Error("Missing parameters for leaving community.");
    }
    try {
      setError(null);
      await leaveCommunity(communityId, currentUid);
      setMembership(null);
    } catch (err) {
      setError(err?.message || "Failed to leave community.");
      throw err;
    }
  }, [communityId, currentUid]);

  useEffect(() => {
    if (!communityId) {
      return;
    }

    const unsubMembers = subscribeToCommunityMembers(
      communityId,
      (items) => {
        setMembers(items || []);
        setIsLoading(false);
      },
      (err) => {
        setError(err?.message || "Failed to subscribe to members.");
        setIsLoading(false);
      }
    );

    let unsubMembership = () => {};
    if (currentUid) {
      unsubMembership = subscribeToCommunityMembership(
        communityId,
        currentUid,
        (mem) => {
          setMembership(mem);
        },
        (err) => {
          setError(err?.message || "Failed to subscribe to membership.");
        }
      );
    }

    return () => {
      if (typeof unsubMembers === "function") unsubMembers();
      if (typeof unsubMembership === "function") unsubMembership();
    };
  }, [communityId, currentUid]);

  return {
    members,
    membership,
    isMember,
    isAdmin,
    isLoading,
    error,
    join: handleJoin,
    leave: handleLeave,
    refetch,
  };
}
