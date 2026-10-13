/**
 * Milestone 22 — Unit 22.3: Event Management Hooks & Service Integration
 *
 * Dedicated custom hook managing authority evaluation, campus tenant parity,
 * reactive temporal permissions, boundary timer transitions, persistent concurrency
 * locks, event identity switching guards, and mutation lifecycles.
 */

import {
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useAuth } from "./useAuth.js";
import { useOptionalCampus } from "./useCampus.js";
import { useCommunityMembers } from "./useCommunityMembers.js";
import {
  EVENT_STATUSES,
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../constants.js";
import { getEventTemporalState } from "../data/events.js";
import {
  normalizeTimestamp,
  updateEvent,
  cancelEvent,
  republishEvent,
  deleteEvent,
} from "../services/eventService.js";

/**
 * Hook providing authority resolution, campus tenant parity, reactive lifecycle permissions,
 * persistent concurrency management, and mutation state machines for event management.
 *
 * @param {object|null} event - Normalized event document snapshot
 * @param {object|null} [explicitUser] - Optional user override (defaults to useAuth user)
 * @param {string|null} [explicitCampusId] - Optional campusId override (defaults to useOptionalCampus)
 * @returns {{
 *   // Authority & Campus Parity
 *   membership: object|null,
 *   isLeader: boolean,
 *   isAdmin: boolean,
 *   effectiveCampusId: string|null,
 *   hasCampusParity: boolean,
 *   isLoading: boolean,
 *
 *   // Temporal State & Reactive Permissions
 *   temporalState: "upcoming"|"ongoing"|"completed"|null,
 *   isOngoing: boolean,
 *   canEdit: boolean,
 *   canCancel: boolean,
 *   canRepublish: boolean,
 *   canDelete: boolean,
 *
 *   // Mutation State Machine
 *   isMutating: boolean,
 *   mutationError: string|null,
 *   clearError: () => void,
 *
 *   // Mutation Operations
 *   editDetails: (updates: object) => Promise<void>,
 *   cancelCurrentEvent: () => Promise<void>,
 *   republishCurrentEvent: () => Promise<void>,
 *   deleteCurrentEvent: () => Promise<void>,
 * }}
 */
export function useEventManagement(event, explicitUser = null, explicitCampusId = null) {
  const { user: authUser } = useAuth();
  const campusCtx = useOptionalCampus();

  const currentUser = explicitUser || authUser || null;
  const currentUid = currentUser?.uid || null;

  // Resolve effective campus ID: explicit override -> campus context -> auth user campusId
  const effectiveCampusId =
    (typeof explicitCampusId === "string" && explicitCampusId.trim()) ||
    (typeof campusCtx?.campusId === "string" && campusCtx.campusId.trim()) ||
    (typeof currentUser?.campusId === "string" && currentUser.campusId.trim()) ||
    null;

  // Campus tenant parity: fail closed if campus context unavailable or mismatched with event
  const hasCampusParity = Boolean(
    effectiveCampusId &&
      event?.campusId &&
      effectiveCampusId === event.campusId
  );

  // Sanitize communityId: must be a non-empty string
  const rawCommunityId = event?.communityId;
  const safeCommunityId =
    typeof rawCommunityId === "string" && rawCommunityId.trim()
      ? rawCommunityId.trim()
      : null;

  // Resolve membership via useCommunityMembers
  // If safeCommunityId is null, useCommunityMembers receives null and performs no subscriptions
  const { membership, isLoading: isMembershipLoading } = useCommunityMembers(
    safeCommunityId,
    currentUid
  );

  // Derive authority roles
  const isLeader = Boolean(
    safeCommunityId &&
      membership?.status === COMMUNITY_MEMBER_STATUSES.ACTIVE &&
      (membership?.role === COMMUNITY_MEMBER_ROLES.ADMIN ||
        membership?.role === COMMUNITY_MEMBER_ROLES.MODERATOR)
  );

  const isAdmin = Boolean(
    safeCommunityId &&
      membership?.status === COMMUNITY_MEMBER_STATUSES.ACTIVE &&
      membership?.role === COMMUNITY_MEMBER_ROLES.ADMIN
  );

  // Reactive boundary timer state
  const [timerTick, setTimerTick] = useState(0);

  const temporalState = useMemo(() => {
    if (!event) return null;
    return getEventTemporalState(event, new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, timerTick]);

  useEffect(() => {
    const startDate = normalizeTimestamp(event?.startAt);
    const endDate = normalizeTimestamp(event?.endAt);

    const startMs = startDate ? startDate.getTime() : null;
    const endMs = endDate ? endDate.getTime() : null;

    // Fail-closed validation using finite-number checks rather than truthiness
    // to ensure numeric zero (epoch) is not incorrectly rejected as invalid
    if (
      typeof startMs !== "number" ||
      !Number.isFinite(startMs) ||
      typeof endMs !== "number" ||
      !Number.isFinite(endMs) ||
      endMs < startMs
    ) {
      return;
    }

    const nowMs = Date.now();
    let delay;

    if (nowMs < startMs) {
      // Upcoming: next boundary transition is startAt
      delay = Math.max(0, startMs - nowMs);
    } else if (nowMs <= endMs) {
      // Ongoing: next boundary transition is completed at endMs + 1 ms
      // Safeguard: (endMs + 1) - nowMs is strictly > 0 while nowMs <= endMs
      delay = endMs + 1 - nowMs;
    } else {
      // Completed: no further temporal transitions
      return;
    }

    const timerId = setTimeout(() => {
      setTimerTick((t) => t + 1);
    }, delay);

    return () => {
      clearTimeout(timerId);
    };
  }, [event?.id, event?.startAt, event?.endAt, timerTick]);

  const isOngoing = temporalState === "ongoing";

  // All mutation permission flags strictly require hasCampusParity
  const canEdit = Boolean(
    hasCampusParity &&
      isLeader &&
      event?.status === EVENT_STATUSES.PUBLISHED &&
      (temporalState === "upcoming" || temporalState === "ongoing")
  );

  const canCancel = Boolean(
    hasCampusParity &&
      isLeader &&
      event?.status === EVENT_STATUSES.PUBLISHED &&
      (temporalState === "upcoming" || temporalState === "ongoing")
  );

  const canRepublish = Boolean(
    hasCampusParity &&
      isLeader &&
      event?.status === EVENT_STATUSES.CANCELLED &&
      temporalState === "upcoming"
  );

  const canDelete = Boolean(
    hasCampusParity &&
      isAdmin &&
      temporalState === "upcoming" &&
      (event?.status === EVENT_STATUSES.PUBLISHED ||
        event?.status === EVENT_STATUSES.CANCELLED)
  );

  // Persistent concurrency lock held until the mutation that acquired it actually settles
  const isMutatingRef = useRef(false);
  const isMountedRef = useRef(true);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState(null);

  // Synchronize activeEventIdRef synchronously during commit phase via useLayoutEffect
  const activeEventIdRef = useRef(event?.id);
  useLayoutEffect(() => {
    activeEventIdRef.current = event?.id;
  }, [event?.id]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Clear mutation display state synchronously during render if event identity changes
  // CRITICAL: Switching event identity does NOT release isMutatingRef.current!
  // The in-flight mutation on the prior event still holds the concurrency lock until it settles.
  const [prevEventId, setPrevEventId] = useState(event?.id);
  if (event?.id !== prevEventId) {
    setPrevEventId(event?.id);
    setMutationError(null);
    setIsMutating(false);
    // Do NOT reset isMutatingRef.current here!
  }

  const clearError = useCallback(() => {
    setMutationError(null);
  }, []);

  const editDetails = useCallback(
    async (updates) => {
      if (isMutatingRef.current) {
        throw new Error("Another event mutation is currently in progress.");
      }
      if (!event?.id) {
        throw new Error("No active event to edit.");
      }
      const targetEventId = event.id;
      isMutatingRef.current = true;
      setIsMutating(true);
      setMutationError(null);
      try {
        await updateEvent(targetEventId, updates, event);
      } catch (err) {
        if (isMountedRef.current && activeEventIdRef.current === targetEventId) {
          setMutationError(err?.message || "Failed to update event.");
        }
        throw err;
      } finally {
        isMutatingRef.current = false;
        if (isMountedRef.current && activeEventIdRef.current === targetEventId) {
          setIsMutating(false);
        }
      }
    },
    [event]
  );

  const cancelCurrentEvent = useCallback(
    async () => {
      if (isMutatingRef.current) {
        throw new Error("Another event mutation is currently in progress.");
      }
      if (!event?.id) {
        throw new Error("No active event to cancel.");
      }
      const targetEventId = event.id;
      isMutatingRef.current = true;
      setIsMutating(true);
      setMutationError(null);
      try {
        await cancelEvent(targetEventId, event);
      } catch (err) {
        if (isMountedRef.current && activeEventIdRef.current === targetEventId) {
          setMutationError(err?.message || "Failed to cancel event.");
        }
        throw err;
      } finally {
        isMutatingRef.current = false;
        if (isMountedRef.current && activeEventIdRef.current === targetEventId) {
          setIsMutating(false);
        }
      }
    },
    [event]
  );

  const republishCurrentEvent = useCallback(
    async () => {
      if (isMutatingRef.current) {
        throw new Error("Another event mutation is currently in progress.");
      }
      if (!event?.id) {
        throw new Error("No active event to republish.");
      }
      const targetEventId = event.id;
      isMutatingRef.current = true;
      setIsMutating(true);
      setMutationError(null);
      try {
        await republishEvent(targetEventId, event);
      } catch (err) {
        if (isMountedRef.current && activeEventIdRef.current === targetEventId) {
          setMutationError(err?.message || "Failed to republish event.");
        }
        throw err;
      } finally {
        isMutatingRef.current = false;
        if (isMountedRef.current && activeEventIdRef.current === targetEventId) {
          setIsMutating(false);
        }
      }
    },
    [event]
  );

  const deleteCurrentEvent = useCallback(
    async () => {
      if (isMutatingRef.current) {
        throw new Error("Another event mutation is currently in progress.");
      }
      if (!event?.id) {
        throw new Error("No active event to delete.");
      }
      const targetEventId = event.id;
      isMutatingRef.current = true;
      setIsMutating(true);
      setMutationError(null);
      try {
        await deleteEvent(targetEventId, event);
      } catch (err) {
        if (isMountedRef.current && activeEventIdRef.current === targetEventId) {
          setMutationError(err?.message || "Failed to delete event.");
        }
        throw err;
      } finally {
        isMutatingRef.current = false;
        if (isMountedRef.current && activeEventIdRef.current === targetEventId) {
          setIsMutating(false);
        }
      }
    },
    [event]
  );

  return {
    membership,
    isLeader,
    isAdmin,
    effectiveCampusId,
    hasCampusParity,
    isLoading: Boolean(safeCommunityId && isMembershipLoading),

    temporalState,
    isOngoing,
    canEdit,
    canCancel,
    canRepublish,
    canDelete,

    isMutating,
    mutationError,
    clearError,

    editDetails,
    cancelCurrentEvent,
    republishCurrentEvent,
    deleteCurrentEvent,
  };
}
