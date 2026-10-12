/**
 * Milestone 20 — Unit 20.3: Event Client Services & Hook Layer
 *
 * Hook to retrieve and subscribe to an individual event document.
 */

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from "react";
import {
  resolveEvent,
  subscribeToEventResolution,
} from "../services/eventService.js";

/**
 * Hook providing real-time access to a single event document by ID (§12.4).
 * Consumes strict Firestore event resolution with no local fixture fallback.
 *
 * @param {string|null} eventId
 * @returns {{
 *   event: object|null,
 *   availability: "available"|"inaccessible"|"error"|null,
 *   isLoading: boolean,
 *   loading: boolean,
 *   error: string|null,
 *   refetch: () => Promise<void>,
 * }}
 */
export function useEvent(eventId) {
  const [event, setEvent] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(eventId));
  const [error, setError] = useState(null);

  // Synchronously reset state during render when eventId changes so that
  // stale event data and stale availability can never be shown for the new ID.
  const [prevEventId, setPrevEventId] = useState(eventId);
  if (eventId !== prevEventId) {
    setPrevEventId(eventId);
    setEvent(null);
    setAvailability(null);
    setIsLoading(Boolean(eventId));
    setError(null);
  }

  // Synchronize activeEventIdRef synchronously during the commit phase via
  // useLayoutEffect so it tracks the new ID before any asynchronous tasks
  // can settle and evaluate the stale-result guard.
  const activeEventIdRef = useRef(eventId);
  useLayoutEffect(() => {
    activeEventIdRef.current = eventId;
  }, [eventId]);

  const applyResolution = useCallback((resolution) => {
    if (!resolution) {
      setEvent(null);
      setAvailability("inaccessible");
      setError("This event is inaccessible or does not exist.");
      setIsLoading(false);
      return;
    }

    if (resolution.status === "available") {
      setEvent(resolution.event);
      setAvailability("available");
      setError(null);
      setIsLoading(false);
    } else if (resolution.status === "inaccessible") {
      setEvent(null);
      setAvailability("inaccessible");
      setError("This event is inaccessible or does not exist.");
      setIsLoading(false);
    } else {
      setEvent(null);
      setAvailability("error");
      setError(resolution.error?.message || "Failed to load event.");
      setIsLoading(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    if (!eventId) {
      setEvent(null);
      setAvailability(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    const targetId = eventId;
    try {
      setIsLoading(true);
      setError(null);
      const resolution = await resolveEvent(targetId);
      if (activeEventIdRef.current === targetId) {
        applyResolution(resolution);
      }
    } catch (err) {
      if (activeEventIdRef.current === targetId) {
        setEvent(null);
        setAvailability("error");
        setError(err?.message || "Failed to load event.");
      }
    } finally {
      if (activeEventIdRef.current === targetId) {
        setIsLoading(false);
      }
    }
  }, [eventId, applyResolution]);

  useEffect(() => {
    if (!eventId) {
      return;
    }

    let isSubscribed = true;

    const unsubscribe = subscribeToEventResolution(eventId, (resolution) => {
      if (isSubscribed && activeEventIdRef.current === eventId) {
        applyResolution(resolution);
      }
    });

    return () => {
      isSubscribed = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [eventId, applyResolution]);

  return {
    event,
    availability,
    isLoading,
    loading: isLoading,
    error,
    refetch,
  };
}
