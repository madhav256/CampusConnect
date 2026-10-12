/**
 * Milestone 21 — Unit 21.4: RSVP Detail Interaction UI
 *
 * Badge component displaying the client-derived RSVP display state (§11.2).
 * States: not_going, going, attended_window_passed, event_cancelled, event_unavailable.
 */

import { Check, AlertCircle, Clock, XCircle } from "lucide-react";
import {
  RSVP_DISPLAY_STATES,
  getRsvpDisplayState,
} from "../../data/eventRsvps.js";
import { useEventRsvp } from "../../hooks/useEventRsvp.js";

/**
 * Renders a badge for the derived RSVP display state.
 * Can be used controlled via `state` or `(resolution, rsvp)` props, or self-wired via `eventId`.
 *
 * @param {object} props
 * @param {string} [props.state] - Explicit RSVP display state
 * @param {string} [props.eventId] - Event ID to resolve user RSVP from hook
 * @param {object|null} [props.resolution] - Strict EventResolution contract ({ status, event, error })
 * @param {object|null} [props.rsvp] - RSVP document
 * @param {Date|number|string} [props.referenceDate] - Temporal reference date
 * @param {boolean} [props.showNotGoing=false] - Whether to render badge when state is not_going
 * @param {string} [props.className=""] - Additional CSS classes
 * @returns {React.ReactElement|null}
 */
/**
 * Validates that an object satisfies the complete EventResolution contract:
 * - status: "available" | "inaccessible" | "error"
 * - fields 'status', 'event', and 'error' must exist
 * - available: non-null event object and error: null
 * - inaccessible: event: null and error: null
 * - error: event: null and an actual Error instance
 *
 * @param {any} resolution
 * @returns {boolean}
 */
function isValidEventResolution(resolution) {
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    return false;
  }
  if (!("status" in resolution) || !("event" in resolution) || !("error" in resolution)) {
    return false;
  }
  if (resolution.status === "available") {
    return (
      typeof resolution.event === "object" &&
      resolution.event !== null &&
      !Array.isArray(resolution.event) &&
      resolution.error === null
    );
  }
  if (resolution.status === "inaccessible") {
    return resolution.event === null && resolution.error === null;
  }
  if (resolution.status === "error") {
    return resolution.event === null && resolution.error instanceof Error;
  }
  return false;
}

export default function RsvpStatusBadge({
  state: propState,
  eventId,
  resolution,
  rsvp: propRsvp,
  referenceDate,
  showNotGoing = false,
  className = "",
}) {
  // If neither explicit state nor explicit rsvp was supplied, use hook if eventId is provided
  const shouldHook = !propState && propRsvp === undefined && Boolean(eventId);
  const hookResult = useEventRsvp(shouldHook ? eventId : null);
  const resolvedRsvp = propRsvp !== undefined ? propRsvp : hookResult?.rsvp;

  const isValidResolution = isValidEventResolution(resolution);

  const displayState =
    propState ||
    (isValidResolution
      ? getRsvpDisplayState(resolution, resolvedRsvp, referenceDate)
      : resolvedRsvp
      ? RSVP_DISPLAY_STATES.GOING
      : RSVP_DISPLAY_STATES.NOT_GOING);

  if (displayState === RSVP_DISPLAY_STATES.GOING) {
    return (
      <span
        data-testid="rsvp-status-badge"
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200/70 shadow-2xs ${className}`}
      >
        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>Going</span>
      </span>
    );
  }

  if (displayState === RSVP_DISPLAY_STATES.ATTENDED_WINDOW_PASSED) {
    return (
      <span
        data-testid="rsvp-status-badge"
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium border bg-stone-100 text-stone-600 border-stone-200/70 ${className}`}
      >
        <Clock className="h-3.5 w-3.5 text-stone-500 shrink-0" aria-hidden="true" />
        <span>Went</span>
      </span>
    );
  }

  if (displayState === RSVP_DISPLAY_STATES.EVENT_CANCELLED) {
    return (
      <span
        data-testid="rsvp-status-badge"
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold border bg-rose-50 text-rose-700 border-rose-200/70 ${className}`}
      >
        <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" aria-hidden="true" />
        <span>Cancelled</span>
      </span>
    );
  }

  if (displayState === RSVP_DISPLAY_STATES.EVENT_UNAVAILABLE) {
    return (
      <span
        data-testid="rsvp-status-badge"
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium border bg-amber-50 text-amber-800 border-amber-200/70 ${className}`}
      >
        <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
        <span>Unavailable</span>
      </span>
    );
  }

  if (displayState === RSVP_DISPLAY_STATES.NOT_GOING && showNotGoing) {
    return (
      <span
        data-testid="rsvp-status-badge"
        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border bg-stone-50 text-stone-500 border-stone-200/60 ${className}`}
      >
        <span>Not Going</span>
      </span>
    );
  }

  return null;
}
