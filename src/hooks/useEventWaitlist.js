/**
 * Milestone 24 — Unit 24.2: useEventWaitlist React Hook
 *
 * Real-time reactive listener for a student's waitlist membership, slot status,
 * relative queue position, active offer countdown timer, and claim actions.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  subscribeToWaitlistMember,
  subscribeToWaitlistSlot,
  joinWaitlist as serviceJoinWaitlist,
  withdrawNonHeadWaitlist,
  claimWaitlistOffer,
  declineWaitlistOffer,
  leaveWaitlist as serviceLeaveWaitlist,
} from "../services/eventWaitlistService.js";
import { isOfferActive, getOfferRemainingMs } from "../data/eventWaitlistSlots.js";
import { calculateQueuePosition } from "../data/eventWaitlistMembers.js";
import { subscribeToEventCapacity } from "../services/eventCapacityService.js";
import { WAITLIST_SLOT_STATUSES } from "../constants.js";

/**
 * Hook to manage a user's waitlist state for a specific event.
 *
 * @param {string} eventId - Target event ID
 * @param {string} [explicitUserId] - Student UID (optional, can be passed directly)
 * @returns {object} Waitlist state, countdown metrics, and actions
 */
export function useEventWaitlist(eventId, explicitUserId = null) {
  const userId = explicitUserId;

  const [member, setMember] = useState(null);
  const [slot, setSlot] = useState(null);
  const [coordinator, setCoordinator] = useState(null);
  const [loading, setLoading] = useState(Boolean(eventId && userId));
  const [error, setError] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Synchronously adjust state during render when eventId or userId changes
  const memberKey = `${eventId || ""}_${userId || ""}`;
  const [prevMemberKey, setPrevMemberKey] = useState(memberKey);
  if (memberKey !== prevMemberKey) {
    setPrevMemberKey(memberKey);
    setMember(null);
    setSlot(null);
    setLoading(Boolean(eventId && userId));
    setError(null);
  }

  const [prevEventId, setPrevEventId] = useState(eventId);
  if (eventId !== prevEventId) {
    setPrevEventId(eventId);
    setCoordinator(null);
  }

  const sequenceNumber = member?.sequenceNumber || null;
  const slotKey = `${eventId || ""}_${sequenceNumber || ""}`;
  const [prevSlotKey, setPrevSlotKey] = useState(slotKey);
  if (slotKey !== prevSlotKey) {
    setPrevSlotKey(slotKey);
    setSlot(null);
  }

  // 1. Subscribe to User's Member document: eventWaitlistMembers/{eventId}_{userId}
  useEffect(() => {
    if (!eventId || !userId) {
      return;
    }

    const unsubscribe = subscribeToWaitlistMember(
      eventId,
      userId,
      (memberData) => {
        setMember(memberData);
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
  }, [eventId, userId]);

  // 2. Subscribe to Event Coordinator to obtain current headSequence for queue positioning
  useEffect(() => {
    if (!eventId) {
      return;
    }

    const unsubscribe = subscribeToEventCapacity(
      eventId,
      (coordData) => {
        setCoordinator(coordData);
      },
      (err) => {
        console.warn(`[useEventWaitlist] Error listening to coordinator for event ${eventId}:`, err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [eventId]);

  // 3. Subscribe to Slot document when sequence number is known: eventWaitlistSlots/{eventId}_{seq}
  useEffect(() => {
    if (!eventId || !sequenceNumber) {
      return;
    }

    const unsubscribe = subscribeToWaitlistSlot(
      eventId,
      sequenceNumber,
      (slotData) => {
        setSlot(slotData);
      },
      (err) => {
        console.warn(`[useEventWaitlist] Error listening to slot ${sequenceNumber} on event ${eventId}:`, err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [eventId, sequenceNumber]);

  // 4. Live 1-second countdown ticker when an offer is active
  const isOffered = useMemo(() => {
    return slot?.status === WAITLIST_SLOT_STATUSES.OFFERED && isOfferActive(slot, now);
  }, [slot, now]);

  useEffect(() => {
    if (!isOffered) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [isOffered]);

  // Derived state & position
  const isOnWaitlist = Boolean(member);
  const isWaiting = member?.status === "waiting" || slot?.status === WAITLIST_SLOT_STATUSES.WAITING;
  const isClaimed = slot?.status === WAITLIST_SLOT_STATUSES.CLAIMED;
  const isDeclined = slot?.status === WAITLIST_SLOT_STATUSES.DECLINED;
  const isExpired = slot?.status === WAITLIST_SLOT_STATUSES.EXPIRED || (slot?.status === WAITLIST_SLOT_STATUSES.OFFERED && !isOfferActive(slot, now));
  const isWithdrawn = slot?.status === WAITLIST_SLOT_STATUSES.WITHDRAWN;

  const headSequence = coordinator?.headSequence;

  const queuePosition = useMemo(() => {
    if (!sequenceNumber || !headSequence) return null;
    return calculateQueuePosition(sequenceNumber, headSequence);
  }, [sequenceNumber, headSequence]);

  const timeRemainingMs = useMemo(() => {
    return getOfferRemainingMs(slot, now);
  }, [slot, now]);

  // Actions
  const join = useCallback(
    async (campusId) => {
      if (!eventId || !userId || !campusId) {
        throw new Error("[useEventWaitlist.join] eventId, userId, and campusId are required.");
      }
      setActionInProgress(true);
      setError(null);
      try {
        const result = await serviceJoinWaitlist(eventId, userId, campusId);
        return result;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setActionInProgress(false);
      }
    },
    [eventId, userId]
  );

  const leave = useCallback(async () => {
    if (!eventId || !userId) {
      throw new Error("[useEventWaitlist.leave] eventId and userId are required.");
    }
    setActionInProgress(true);
    setError(null);
    try {
      if (sequenceNumber && headSequence && sequenceNumber > headSequence) {
        // Non-head withdrawal via client atomic batch (PW-5 Non-Head)
        await withdrawNonHeadWaitlist(eventId, userId, sequenceNumber);
        return { success: true, method: "client_batch_non_head" };
      } else {
        // Head waiting candidate withdrawal via backend callable (PW-5 Head)
        const result = await serviceLeaveWaitlist({ eventId });
        return { success: true, method: "callable_head", ...result };
      }
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setActionInProgress(false);
    }
  }, [eventId, userId, sequenceNumber, headSequence]);

  const claim = useCallback(async () => {
    if (!eventId || !sequenceNumber) {
      throw new Error("[useEventWaitlist.claim] eventId and sequenceNumber are required.");
    }
    setActionInProgress(true);
    setError(null);
    try {
      const result = await claimWaitlistOffer({ eventId, slotSequence: sequenceNumber });
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setActionInProgress(false);
    }
  }, [eventId, sequenceNumber]);

  const decline = useCallback(async () => {
    if (!eventId || !sequenceNumber) {
      throw new Error("[useEventWaitlist.decline] eventId and sequenceNumber are required.");
    }
    setActionInProgress(true);
    setError(null);
    try {
      const result = await declineWaitlistOffer({ eventId, slotSequence: sequenceNumber });
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setActionInProgress(false);
    }
  }, [eventId, sequenceNumber]);

  return {
    member,
    slot,
    coordinator,
    isOnWaitlist,
    isWaiting,
    isOffered,
    isClaimed,
    isDeclined,
    isExpired,
    isWithdrawn,
    queuePosition,
    timeRemainingMs,
    offerExpiresAt: slot?.offerExpiresAt || null,
    loading,
    error,
    actionInProgress,
    join,
    leave,
    claim,
    decline,
  };
}
