/**
 * Milestone 24 — Unit 24.2: useEventCapacity React Hook
 *
 * Real-time reactive subscription to an event's capacity coordinator (eventCapacities/{eventId})
 * with live derived metrics resolution (vacancies, full status, direct RSVP availability).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  subscribeToEventCapacity,
  getEventCapacity,
  getEventCapacityMetrics,
} from "../services/eventCapacityService.js";

/**
 * Hook to subscribe to and manage event capacity state.
 *
 * @param {string|object} eventOrId - Target event ID or event object
 * @returns {{
 *   coordinator: object|null,
 *   metrics: object,
 *   loading: boolean,
 *   error: Error|null,
 *   refresh: () => Promise<void>
 * }}
 */
export function useEventCapacity(eventOrId) {
  const eventId = typeof eventOrId === "string" ? eventOrId : eventOrId?.id || null;
  const eventObj = typeof eventOrId === "object" ? eventOrId : null;

  const [coordinator, setCoordinator] = useState(null);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [error, setError] = useState(null);

  // Synchronously adjust state during render when eventId changes
  const [prevEventId, setPrevEventId] = useState(eventId);
  if (eventId !== prevEventId) {
    setPrevEventId(eventId);
    setCoordinator(null);
    setLoading(Boolean(eventId));
    setError(null);
  }

  useEffect(() => {
    if (!eventId) {
      return;
    }

    const unsubscribe = subscribeToEventCapacity(
      eventId,
      (data) => {
        setCoordinator(data);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [eventId]);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    try {
      setLoading(true);
      const data = await getEventCapacity(eventId);
      setCoordinator(data);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const metrics = useMemo(() => {
    return getEventCapacityMetrics(eventObj, coordinator);
  }, [eventObj, coordinator]);

  return {
    coordinator,
    metrics,
    loading,
    error,
    refresh,
  };
}
