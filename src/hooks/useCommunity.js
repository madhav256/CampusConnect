/**
 * Milestone 19 — Unit 19.4: Community Client Services & Hook Layer
 *
 * Hook to retrieve and subscribe to an individual community document.
 */

import { useEffect, useState, useCallback } from "react";
import {
  getCommunityById,
  subscribeToCommunity,
} from "../services/communityService.js";

/**
 * Hook providing real-time access to a single community by ID.
 *
 * @param {string|null} communityId
 * @returns {{
 *   community: object|null,
 *   isLoading: boolean,
 *   error: string|null,
 *   refetch: () => Promise<void>,
 * }}
 */
export function useCommunity(communityId) {
  const [community, setCommunity] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(communityId));
  const [error, setError] = useState(null);

  const [prevCommunityId, setPrevCommunityId] = useState(communityId);
  if (communityId !== prevCommunityId) {
    setPrevCommunityId(communityId);
    setCommunity(null);
    setIsLoading(Boolean(communityId));
    setError(null);
  }

  const refetch = useCallback(async () => {
    if (!communityId) {
      setCommunity(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const data = await getCommunityById(communityId);
      setCommunity(data);
    } catch (err) {
      setError(err?.message || "Failed to load community.");
    } finally {
      setIsLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    if (!communityId) {
      return;
    }

    const unsubscribe = subscribeToCommunity(
      communityId,
      (data) => {
        setCommunity(data);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        setError(err?.message || "Failed to subscribe to community.");
        setIsLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [communityId]);

  return {
    community,
    isLoading,
    error,
    refetch,
  };
}
