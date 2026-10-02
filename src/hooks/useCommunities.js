/**
 * Milestone 19 — Unit 19.4: Community Client Services & Hook Layer
 *
 * Hook to retrieve and subscribe to communities within a campus tenant.
 */

import { useEffect, useState, useCallback } from "react";
import { useOptionalCampus } from "./useCampus.js";
import {
  getCommunitiesByCampus,
  subscribeToCommunitiesByCampus,
} from "../services/communityService.js";

/**
 * Hook providing real-time access to communities for a campus.
 *
 * @param {string} [explicitCampusId] - Optional explicit campus ID; falls back to current campus context
 * @returns {{
 *   communities: Array<object>,
 *   isLoading: boolean,
 *   error: string|null,
 *   refetch: () => Promise<void>,
 * }}
 */
export function useCommunities(explicitCampusId) {
  const campusCtx = useOptionalCampus();
  const campusId = explicitCampusId || campusCtx?.campusId || null;

  const [communities, setCommunities] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(campusId));
  const [error, setError] = useState(null);

  const [prevCampusId, setPrevCampusId] = useState(campusId);
  if (campusId !== prevCampusId) {
    setPrevCampusId(campusId);
    setCommunities([]);
    setIsLoading(Boolean(campusId));
    setError(null);
  }

  const refetch = useCallback(async () => {
    if (!campusId) {
      setCommunities([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const data = await getCommunitiesByCampus(campusId);
      setCommunities(data || []);
    } catch (err) {
      setError(err?.message || "Failed to load communities.");
    } finally {
      setIsLoading(false);
    }
  }, [campusId]);

  useEffect(() => {
    if (!campusId) {
      return;
    }

    const unsubscribe = subscribeToCommunitiesByCampus(
      campusId,
      (items) => {
        setCommunities(items || []);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        setError(err?.message || "Failed to subscribe to communities.");
        setIsLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [campusId]);

  return {
    communities,
    isLoading,
    error,
    refetch,
  };
}
