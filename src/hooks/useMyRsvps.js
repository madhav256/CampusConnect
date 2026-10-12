/**
 * Milestone 21 — Unit 21.3: RSVP Client Services & Hook Layer
 *
 * Hook to retrieve and subscribe to all RSVPs of the current authenticated user (Q2).
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "./useAuth.js";
import { useOptionalCampus } from "./useCampus.js";
import { subscribeToMyRsvps } from "../services/eventRsvpService.js";

const EMPTY_RSVPS = [];

/**
 * Hook providing real-time access to the current authenticated user's RSVPs.
 *
 * @param {object} [options]
 * @param {number} [options.limit=50]
 * @returns {{
 *   rsvps: Array<object>,
 *   eventIds: Set<string>,
 *   isLoading: boolean,
 *   error: string|null,
 *   refetch: () => void,
 * }}
 */
export function useMyRsvps(options = {}) {
  const { user: authUser } = useAuth();
  const campusCtx = useOptionalCampus();

  const userId = authUser?.uid || null;
  const campusId = options?.campusId || campusCtx?.campusId || null;
  const limit = options?.limit || 50;

  const shouldFetch = Boolean(userId && campusId);
  const activeContextKey = `${userId || ""}_${campusId || ""}_${limit}`;

  const [dataState, setDataState] = useState({
    contextKey: activeContextKey,
    rsvps: [],
    error: null,
  });

  const isCurrentContext = dataState.contextKey === activeContextKey;
  const rsvps = useMemo(() => {
    return dataState.contextKey === activeContextKey
      ? dataState.rsvps
      : EMPTY_RSVPS;
  }, [dataState.contextKey, dataState.rsvps, activeContextKey]);
  const error = isCurrentContext ? dataState.error : null;

  const [isLoading, setIsLoading] = useState(shouldFetch);
  const [reloadCount, setReloadCount] = useState(0);

  // Synchronously reset loading state when context changes
  const [prevKey, setPrevKey] = useState(activeContextKey);
  if (activeContextKey !== prevKey) {
    setPrevKey(activeContextKey);
    setIsLoading(shouldFetch);
  }

  const effectiveLoading = !isCurrentContext && shouldFetch ? true : isLoading;

  const eventIds = useMemo(() => {
    return new Set(rsvps.map((r) => r.eventId).filter(Boolean));
  }, [rsvps]);

  const refetch = useCallback(() => {
    setDataState((prev) => ({ ...prev, error: null }));
    setIsLoading(shouldFetch);
    setReloadCount((c) => c + 1);
  }, [shouldFetch]);

  useEffect(() => {
    if (!userId || !campusId) {
      return;
    }

    const currentContext = activeContextKey;
    let isSubscribed = true;

    const unsubscribe = subscribeToMyRsvps(
      userId,
      campusId,
      (nextRsvps) => {
        if (isSubscribed) {
          setDataState({
            contextKey: currentContext,
            rsvps: nextRsvps || [],
            error: null,
          });
          setIsLoading(false);
        }
      },
      (err) => {
        if (isSubscribed) {
          setDataState({
            contextKey: currentContext,
            rsvps: [],
            error: err?.message || "Failed to load RSVPs.",
          });
          setIsLoading(false);
        }
      },
      { limit }
    );

    return () => {
      isSubscribed = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [userId, campusId, limit, reloadCount, activeContextKey]);

  return {
    rsvps,
    eventIds,
    isLoading: effectiveLoading,
    error,
    refetch,
  };
}
