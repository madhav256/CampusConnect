/**
 * Milestone 20 — Unit 20.3: Event Client Services & Hook Layer
 *
 * Hook to retrieve and subscribe to an individual event document.
 */

import { useEffect, useState, useCallback } from "react";
import {
  getEventById,
  subscribeToEvent,
} from "../services/eventService.js";

/**
 * Hook providing real-time access to a single event document by ID.
 *
 * @param {string|null} eventId
 * @returns {{
 *   event: object|null,
 *   isLoading: boolean,
 *   error: string|null,
 *   refetch: () => Promise<void>,
 * }}
 */
export function useEvent(eventId) {
  const [event, setEvent] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(eventId));
  const [error, setError] = useState(null);

  const [prevEventId, setPrevEventId] = useState(eventId);
  if (eventId !== prevEventId) {
    setPrevEventId(eventId);
    setEvent(null);
    setIsLoading(Boolean(eventId));
    setError(null);
  }

  const refetch = useCallback(async () => {
    if (!eventId) {
      setEvent(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const data = await getEventById(eventId);
      setEvent(data);
    } catch (err) {
      setError(err?.message || "Failed to load event.");
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) {
      return;
    }

    const unsubscribe = subscribeToEvent(
      eventId,
      (data) => {
        setEvent(data);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        setError(err?.message || "Failed to subscribe to event.");
        setIsLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [eventId]);

  return {
    event,
    isLoading,
    error,
    refetch,
  };
}
