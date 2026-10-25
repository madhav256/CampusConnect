/**
 * Milestone 21 — Unit 21.3: RSVP Client Services & Hook Layer
 *
 * Hook to retrieve and manage the current user's RSVP for an event.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "./useAuth.js";
import { useOptionalCampus } from "./useCampus.js";
import {
  subscribeToMyEventRsvp,
  createEventRsvp,
  deleteEventRsvp,
} from "../services/eventRsvpService.js";

/**
 * Hook providing real-time access and mutations for a user's RSVP to an event.
 *
 * @param {string|null} eventId
 * @returns {{
 *   rsvp: object|null,
 *   isGoing: boolean,
 *   isLoading: boolean,
 *   isMutating: boolean,
 *   error: string|null,
 *   rsvpToEvent: () => Promise<object>,
 *   cancelRsvp: () => Promise<void>,
 * }}
 */
export function useEventRsvp(eventId, event = null, coordinator = null) {
  const { user: authUser } = useAuth();
  const campusCtx = useOptionalCampus();

  const eventRef = useRef(event);
  const coordinatorRef = useRef(coordinator);
  useEffect(() => {
    eventRef.current = event;
    coordinatorRef.current = coordinator;
  }, [event, coordinator]);

  const userId = authUser?.uid || null;
  const campusId = campusCtx?.campusId || null;

  const [rsvp, setRsvp] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(eventId && userId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);

  // Synchronously reset state during render when eventId or userId changes
  const compositeKey = `${eventId || ""}_${userId || ""}`;
  const [prevKey, setPrevKey] = useState(compositeKey);
  if (compositeKey !== prevKey) {
    setPrevKey(compositeKey);
    setRsvp(null);
    setIsLoading(Boolean(eventId && userId));
    setError(null);
  }

  const isMutatingRef = useRef(false);
  const activeKeyRef = useRef(compositeKey);
  useEffect(() => {
    activeKeyRef.current = compositeKey;
  }, [compositeKey]);

  const isGoing = Boolean(rsvp);

  useEffect(() => {
    if (!eventId || !userId) {
      return;
    }

    let isSubscribed = true;

    const unsubscribe = subscribeToMyEventRsvp(
      eventId,
      userId,
      (nextRsvp) => {
        if (isSubscribed) {
          setRsvp(nextRsvp);
          setIsLoading(false);
        }
      },
      (err) => {
        if (isSubscribed) {
          setError(err?.message || "Failed to load RSVP.");
          setIsLoading(false);
        }
      }
    );

    return () => {
      isSubscribed = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [eventId, userId]);

  const rsvpToEvent = useCallback(async () => {
    if (isMutatingRef.current) {
      return;
    }
    if (!userId) {
      const err = new Error("You must be logged in to RSVP to an event.");
      setError(err.message);
      throw err;
    }
    if (!campusId) {
      const err = new Error("Campus context is required to RSVP to an event.");
      setError(err.message);
      throw err;
    }
    if (!eventId) {
      const err = new Error("Event ID is required to RSVP to an event.");
      setError(err.message);
      throw err;
    }

    const mutationKey = `${eventId}_${userId}`;
    isMutatingRef.current = true;
    setIsMutating(true);
    setError(null);

    try {
      const payload = { eventId, userId, campusId };
      const latestEvent = event ?? eventRef.current;
      const latestCoordinator = coordinator ?? coordinatorRef.current;
      if (latestEvent) {
        payload.event = latestEvent;
      }
      if (latestCoordinator) {
        payload.coordinator = latestCoordinator;
      }
      return await createEventRsvp(payload);
    } catch (err) {
      if (activeKeyRef.current === mutationKey) {
        setError(err?.message || "Failed to RSVP to event.");
      }
      throw err;
    } finally {
      isMutatingRef.current = false;
      setIsMutating(false);
    }
  }, [eventId, userId, campusId, event, coordinator]);

  const cancelRsvp = useCallback(async () => {
    if (isMutatingRef.current) {
      return;
    }
    if (!userId) {
      const err = new Error("You must be logged in to cancel an RSVP.");
      setError(err.message);
      throw err;
    }
    if (!eventId) {
      const err = new Error("Event ID is required to cancel an RSVP.");
      setError(err.message);
      throw err;
    }

    const mutationKey = `${eventId}_${userId}`;
    isMutatingRef.current = true;
    setIsMutating(true);
    setError(null);

    try {
      const latestEvent = event ?? eventRef.current;
      const latestCoordinator = coordinator ?? coordinatorRef.current;
      if (latestEvent || latestCoordinator) {
        await deleteEventRsvp(eventId, userId, {
          event: latestEvent,
          coordinator: latestCoordinator,
        });
      } else {
        await deleteEventRsvp(eventId, userId);
      }
    } catch (err) {
      if (activeKeyRef.current === mutationKey) {
        setError(err?.message || "Failed to cancel RSVP.");
      }
      throw err;
    } finally {
      isMutatingRef.current = false;
      setIsMutating(false);
    }
  }, [eventId, userId, event, coordinator]);

  return {
    rsvp,
    isGoing,
    isLoading,
    isMutating,
    error,
    rsvpToEvent,
    confirmRsvp: rsvpToEvent,
    cancelRsvp,
  };
}
