/**
 * Milestone 21 — Unit 21.3: RSVP Client Services & Hook Layer
 *
 * Hook to retrieve and subscribe to event attendees (Q3).
 */

import { useEffect, useState } from "react";
import { useOptionalCampus } from "./useCampus.js";
import { subscribeToEventAttendees } from "../services/eventRsvpService.js";

/**
 * Hook providing real-time access to attendees of an event.
 *
 * @param {string|null} eventId
 * @param {object} [options]
 * @param {boolean} [options.enabled=true]
 * @param {number} [options.limit=51]
 * @returns {{
 *   attendees: Array<object>,
 *   count: number,
 *   hasMore: boolean,
 *   isLoading: boolean,
 *   error: string|null,
 * }}
 */
export function useEventAttendees(eventId, options = {}) {
  const campusCtx = useOptionalCampus();
  const campusId = options?.campusId || campusCtx?.campusId || null;
  const enabled = options?.enabled !== false;
  const limit = options?.limit || 51;

  const shouldFetch = Boolean(enabled && eventId && campusId);

  const [attendees, setAttendees] = useState([]);
  const [count, setCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(shouldFetch);
  const [error, setError] = useState(null);

  // Synchronously reset state during render when dependencies change
  const optionsKey = `${eventId || ""}_${campusId || ""}_${enabled}_${limit}`;
  const [prevKey, setPrevKey] = useState(optionsKey);
  if (optionsKey !== prevKey) {
    setPrevKey(optionsKey);
    setAttendees([]);
    setCount(0);
    setHasMore(false);
    setIsLoading(shouldFetch);
    setError(null);
  }

  useEffect(() => {
    if (!enabled || !eventId || !campusId) {
      return;
    }

    let isSubscribed = true;

    const unsubscribe = subscribeToEventAttendees(
      eventId,
      campusId,
      ({ attendees: nextAttendees, count: nextCount, hasMore: nextHasMore }) => {
        if (isSubscribed) {
          setAttendees(nextAttendees || []);
          setCount(nextCount ?? 0);
          setHasMore(Boolean(nextHasMore));
          setIsLoading(false);
        }
      },
      (err) => {
        if (isSubscribed) {
          setError(err?.message || "Failed to load event attendees.");
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
  }, [eventId, campusId, enabled, limit]);

  return {
    attendees,
    count,
    hasMore,
    isLoading,
    error,
  };
}
