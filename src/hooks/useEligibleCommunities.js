/**
 * Milestone 20 — Unit 20.5: Event Detail Experience & Community Integration
 *
 * Hook to resolve communities where the authenticated user holds an active
 * administrator or moderator role, granting event creation authority.
 */

import { useState, useEffect } from "react";
import { useAuth } from "./useAuth.js";
import { useOptionalCampus } from "./useCampus.js";
import { useCommunities } from "./useCommunities.js";
import { getCommunityMembership } from "../services/communityMemberService.js";
import {
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../constants.js";
import { COMMUNITY_MEMBERS } from "../data/communityMembers.js";

export function useEligibleCommunities(explicitCampusId) {
  const { user } = useAuth();
  const campusCtx = useOptionalCampus();
  const campusId = explicitCampusId || campusCtx?.campusId || null;

  const { communities, isLoading: isCommLoading, error: commError } = useCommunities(campusId);
  const [eligibleCommunities, setEligibleCommunities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function checkMemberships() {
      if (!user?.uid || !campusId || isCommLoading) {
        if (!isCommLoading && !isCancelled) {
          setEligibleCommunities([]);
          setIsLoading(false);
        }
        return;
      }

      if (commError) {
        if (!isCancelled) {
          setError(commError);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const eligible = [];
        for (const community of communities) {
          let mem = null;
          try {
            mem = await getCommunityMembership(community.id, user.uid);
          } catch {
            // Fallback to static fixtures if offline/mocked
            const fixtureKey = `${community.id}_${user.uid}`;
            mem = COMMUNITY_MEMBERS[fixtureKey] || null;
          }

          if (
            mem &&
            mem.status === COMMUNITY_MEMBER_STATUSES.ACTIVE &&
            (mem.role === COMMUNITY_MEMBER_ROLES.ADMIN ||
              mem.role === COMMUNITY_MEMBER_ROLES.MODERATOR)
          ) {
            eligible.push(community);
          }
        }
        if (!isCancelled) {
          setEligibleCommunities(eligible);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err?.message || "Failed to check community leadership roles.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    checkMemberships();

    return () => {
      isCancelled = true;
    };
  }, [user?.uid, campusId, communities, isCommLoading, commError]);

  return {
    eligibleCommunities,
    hasEligibleCommunities: eligibleCommunities.length > 0,
    isLoading: isCommLoading || isLoading,
    error,
  };
}
