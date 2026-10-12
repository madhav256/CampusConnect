/**
 * Milestone 21 — Unit 21.3: RSVP Client Services & Hook Layer
 *
 * Hook to retrieve and subscribe to all RSVPs of the current authenticated user (Q2).
 */

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "./useAuth.js";
import { useOptionalCampus } from "./useCampus.js";
import { subscribeToMyRsvps } from "../services/eventRsvpService.js";

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
 * }}
 */
export function useMyRsvps(options = {}) {
  const { user: authUser } = useAuth();
  const campusCtx = useOptionalCampus();

  const userId = authUser?.uid || null;
  const campusId = options?.campusId || campusCtx?.campusId || null;
  const limit = options?.limit || 50;

  const shouldFetch = Boolean(userId && campusId);

  const [rsvps, setRsvps] = useState([]);
  const [isLoading, setIsLoading] = useState(shouldFetch);
  const [error, setError] = useState(null);

  // Synchronously reset state during render when dependencies change
  const optionsKey = `${userId || ""}_${campusId || ""}_${limit}`;
  const [prevKey, setPrevKey] = useState(optionsKey);
  if (optionsKey !== prevKey) {
    setPrevKey(optionsKey);
    setRsvps([]);
    setIsLoading(shouldFetch);
    setError(null);
  }

  const eventIds = useMemo(() => {
    return new Set(rsvps.map((r) => r.eventId).filter(Boolean));
  }, [rsvps]);

  useEffect(() => {
    if (!userId || !campusId) {
      return;
    }

    let isSubscribed = true;

    const unsubscribe = subscribeToMyRsvps(
      userId,
      campusId,
      (nextRsvps) => {
        if (isSubscribed) {
          setRsvps(nextRsvps || []);
          setIsLoading(false);
        }
      },
      (err) => {
        if (isSubscribed) {
          setError(err?.message || "Failed to load RSVPs.");
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
  }, [userId, campusId, limit]);

  return {
    rsvps,
    eventIds,
    isLoading,
    error,
  };
}
