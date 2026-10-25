/**
 * Milestone 21 — Unit 21.4: RSVP Detail Interaction UI
 *
 * Interactive button component managing event RSVP lifecycle and mutation states.
 * Handles Going / Cancel RSVP transitions, disabled reason states (cancelled, ended,
 * started, unreadable), concurrency locks, and error presentation.
 */

import { useState } from "react";
import { Check, CalendarPlus, Clock, Sparkles } from "lucide-react";
import Button from "../ui/Button.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useEventRsvp } from "../../hooks/useEventRsvp.js";
import { EVENT_STATUSES } from "../../constants.js";
import { getEventTemporalState } from "../../data/events.js";
import { computeCapacityMetrics, isCappedEvent } from "../../data/eventCapacities.js";

/**
 * Event RSVP interaction button.
 *
 * @param {object} props
 * @param {string|null} props.eventId - Event ID
 * @param {object|null} [props.event] - Event document
 * @param {string|null} [props.availability="available"] - "available"|"inaccessible"|"error"
 * @param {Date|number|string} [props.referenceDate] - Temporal comparison date (default: now)
 * @param {object|null} [props.rsvp] - Direct RSVP override for unit tests
 * @param {boolean} [props.isGoing] - Direct isGoing override for unit tests
 * @param {boolean} [props.isLoading] - Direct loading override for unit tests
 * @param {boolean} [props.isMutating] - Direct mutating override for unit tests
 * @param {string|null} [props.error] - Direct error override for unit tests
 * @param {() => Promise<void>} [props.onRsvp] - Direct RSVP action override
 * @param {() => Promise<void>} [props.onCancel] - Direct Cancel action override
 * @param {string} [props.size="md"] - Button size
 * @param {string} [props.className=""] - Additional CSS classes
 * @returns {React.ReactElement}
 */
export default function EventRsvpButton({
  eventId,
  event,
  availability = "available",
  referenceDate,
  coordinator = null,
  metrics: propMetrics = null,
  isOnWaitlist = false,
  isOffered = false,
  queuePosition = null,
  onOpenWaitlist = null,
  onClaimOffer = null,
  rsvp: propRsvp,
  isGoing: propIsGoing,
  isLoading: propIsLoading,
  isMutating: propIsMutating,
  error: propError,
  onRsvp,
  onCancel,
  size = "md",
  className = "",
}) {
  const { user: authUser } = useAuth();

  const shouldHook =
    propRsvp === undefined &&
    propIsGoing === undefined &&
    propIsMutating === undefined &&
    Boolean(eventId);

  const hookResult = useEventRsvp(
    shouldHook ? eventId : null,
    shouldHook ? event : null,
    shouldHook ? coordinator : null
  );

  const isGoing =
    propIsGoing !== undefined
      ? propIsGoing
      : propRsvp !== undefined
      ? Boolean(propRsvp)
      : Boolean(hookResult?.isGoing);

  const isLoading =
    propIsLoading !== undefined ? propIsLoading : Boolean(hookResult?.isLoading);
  const isMutating =
    propIsMutating !== undefined ? propIsMutating : Boolean(hookResult?.isMutating);
  const hookError = hookResult?.error || null;

  const [localError, setLocalError] = useState(null);
  const displayError = propError || localError || hookError;

  const isCapped = isCappedEvent(event);
  const activeMetrics =
    propMetrics ||
    (isCapped && coordinator
      ? computeCapacityMetrics({ event, coordinator })
      : null);

  const needsWaitlistJoin = Boolean(
    !isGoing &&
      !isOnWaitlist &&
      !isOffered &&
      isCapped &&
      activeMetrics &&
      !activeMetrics.canDirectRsvp &&
      activeMetrics.canJoinWaitlist
  );

  const handleAction = async () => {
    setLocalError(null);
    try {
      if (isGoing) {
        if (onCancel) {
          await onCancel();
        } else if (hookResult?.cancelRsvp) {
          await hookResult.cancelRsvp();
        }
      } else if (isOffered) {
        if (onClaimOffer) {
          await onClaimOffer();
        } else if (onOpenWaitlist) {
          onOpenWaitlist();
        }
      } else if (isOnWaitlist || needsWaitlistJoin) {
        if (onOpenWaitlist) {
          onOpenWaitlist();
        }
      } else {
        if (onRsvp) {
          await onRsvp();
        } else if (hookResult?.rsvpToEvent) {
          await hookResult.rsvpToEvent();
        }
      }
    } catch (err) {
      setLocalError(err?.message || "An error occurred while updating RSVP.");
    }
  };

  // Determine temporal & lifecycle states
  const now = referenceDate ? new Date(referenceDate) : new Date();
  const isUnavailable = availability === "inaccessible" || availability === "error" || (!event && !isLoading);
  const isCancelled =
    event?.status === EVENT_STATUSES.CANCELLED || event?.status === "cancelled";

  const temporalState = event ? getEventTemporalState(event, now) : "upcoming";
  const isEnded = temporalState === "completed" || (event?.endAt && new Date(event.endAt) <= now);
  const isStarted = !isEnded && (temporalState === "ongoing" || (event?.startAt && new Date(event.startAt) <= now));

  // Determine disabled state and reason
  let isDisabled = false;
  let disabledReason = null;

  if (!authUser && !isGoing) {
    isDisabled = true;
    disabledReason = "Sign in to RSVP";
  } else if (isUnavailable) {
    if (!isGoing) {
      isDisabled = true;
      disabledReason = "Event is unavailable";
    }
  } else if (isCancelled) {
    if (!isGoing) {
      isDisabled = true;
      disabledReason = "Registration closed — event has been cancelled";
    }
  } else if (isEnded) {
    if (!isGoing) {
      isDisabled = true;
      disabledReason = "Event has ended";
    }
  } else if (isStarted && !isGoing) {
    isDisabled = true;
    disabledReason = "Registration closed — event has started";
  }

  // Loading state placeholder
  if (isLoading && !isGoing) {
    return (
      <div className={`w-full ${className}`}>
        <Button
          disabled
          size={size}
          data-testid="event-rsvp-button"
          className="w-full opacity-60"
        >
          Loading...
        </Button>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <Button
        data-testid="event-rsvp-button"
        disabled={isDisabled || isMutating}
        loading={isMutating}
        loadingText={isGoing ? "Cancelling..." : "Registering..."}
        onClick={handleAction}
        size={size}
        variant={isGoing ? "outline" : "primary"}
        className={`w-full gap-2 ${
          isGoing
            ? "border-emerald-300 bg-emerald-50/50 text-emerald-800 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
            : ""
        }`}
      >
        {isGoing ? (
          <>
            <Check className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>Cancel RSVP</span>
          </>
        ) : isOffered ? (
          <>
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Claim Seat</span>
          </>
        ) : isOnWaitlist ? (
          <>
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {queuePosition ? `On Waitlist (#${queuePosition})` : "On Waitlist"}
            </span>
          </>
        ) : needsWaitlistJoin ? (
          <>
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Join Waitlist</span>
          </>
        ) : (
          <>
            <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>RSVP</span>
          </>
        )}
      </Button>

      {disabledReason && (
        <p
          data-testid="rsvp-disabled-reason"
          className="mt-1.5 text-center text-xs text-ink-muted"
        >
          {disabledReason}
        </p>
      )}

      {displayError && (
        <p
          data-testid="rsvp-error"
          role="alert"
          className="mt-1.5 text-center text-xs font-medium text-rose-600"
        >
          {displayError}
        </p>
      )}
    </div>
  );
}
