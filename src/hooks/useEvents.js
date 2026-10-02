/**
 * Milestone 20 — Unit 20.3: Event Client Services & Hook Layer
 *
 * Hook to retrieve and subscribe to events within a campus tenant or sponsoring community.
 * Integrates reactive Firestore subscriptions, error states, and filter criteria.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOptionalCampus } from "./useCampus.js";
import {
  getEventsByCampus,
  getEventsByCommunity,
  subscribeToCampusEvents,
  subscribeToCommunityEvents,
} from "../services/eventService.js";

/**
 * Hook providing real-time access to filtered and ordered events.
 *
 * @param {object|string} [options] - Query options or explicit campusId string
 * @param {string} [options.campusId] - Optional explicit campus ID (defaults to campus context)
 * @param {string} [options.communityId] - Optional community ID (for community-scoped queries)
 * @param {string} [options.category] - Category filter
 * @param {"upcoming"|"past"|"all"} [options.timeRange] - Temporal filter
 * @param {string} [options.visibility] - "campus_public" | "community_only"
 * @param {string} [options.status] - "published" | "cancelled"
 * @param {"asc"|"desc"} [options.sortOrder] - Sort order by startAt
 * @returns {{
 *   events: Array<object>,
 *   isLoading: boolean,
 *   error: string|null,
 *   refetch: () => Promise<void>,
 * }}
 */
export function useEvents(options = {}) {
  const campusCtx = useOptionalCampus();
  const resolvedOptions = useMemo(() => {
    const raw = typeof options === "string" ? { campusId: options } : options || {};
    return {
      ...raw,
      isMember: Boolean(raw.isMember),
    };
  }, [options]);

  const campusId = resolvedOptions.campusId || campusCtx?.campusId || null;
  const communityId = resolvedOptions.communityId || null;
  const isMember = resolvedOptions.isMember;

  const optionsKey = useMemo(() => {
    return JSON.stringify({
      campusId,
      communityId,
      isMember,
      category: resolvedOptions.category || null,
      timeRange: resolvedOptions.timeRange || null,
      visibility: resolvedOptions.visibility || null,
      status: resolvedOptions.status || null,
      sortOrder: resolvedOptions.sortOrder || null,
    });
  }, [
    campusId,
    communityId,
    isMember,
    resolvedOptions.category,
    resolvedOptions.timeRange,
    resolvedOptions.visibility,
    resolvedOptions.status,
    resolvedOptions.sortOrder,
  ]);

  const hasValidTarget = Boolean(campusId);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(hasValidTarget);
  const [error, setError] = useState(null);

  const [prevKey, setPrevKey] = useState(optionsKey);
  if (optionsKey !== prevKey) {
    setPrevKey(optionsKey);
    setEvents([]);
    setIsLoading(hasValidTarget);
    setError(null);
  }

  const refetch = useCallback(async () => {
    if (!campusId) {
      setEvents([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const queryOptions = { ...resolvedOptions, campusId };
      const data = communityId
        ? await getEventsByCommunity(communityId, queryOptions)
        : await getEventsByCampus(campusId, queryOptions);
      setEvents(data || []);
    } catch (err) {
      setError(err?.message || "Failed to load events.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId, campusId, optionsKey]);

  useEffect(() => {
    if (!campusId) {
      return;
    }

    const queryOptions = { ...resolvedOptions, campusId };
    let unsubscribe;
    if (communityId) {
      unsubscribe = subscribeToCommunityEvents(
        communityId,
        queryOptions,
        (items) => {
          setEvents(items || []);
          setIsLoading(false);
          setError(null);
        },
        (err) => {
          setError(err?.message || "Failed to subscribe to community events.");
          setIsLoading(false);
        }
      );
    } else {
      unsubscribe = subscribeToCampusEvents(
        campusId,
        queryOptions,
        (items) => {
          setEvents(items || []);
          setIsLoading(false);
          setError(null);
        },
        (err) => {
          setError(err?.message || "Failed to subscribe to campus events.");
          setIsLoading(false);
        }
      );
    }

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  return {
    events,
    isLoading,
    error,
    refetch,
  };
}
