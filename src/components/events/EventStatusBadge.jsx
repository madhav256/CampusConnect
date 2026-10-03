/**
 * Milestone 20 — Unit 20.4: Event Discovery UI & Navigation
 *
 * Badge component representing the distinction between stored event lifecycle (published/cancelled)
 * and dynamic derived temporal state (upcoming/ongoing/completed).
 */

import { EVENT_STATUSES } from "../../constants.js";
import { getEventTemporalState } from "../../data/events.js";

export default function EventStatusBadge({
  event,
  status,
  temporalState,
  referenceDate,
  className = "",
}) {
  const isCancelled =
    status === EVENT_STATUSES.CANCELLED ||
    event?.status === EVENT_STATUSES.CANCELLED ||
    status === "cancelled" ||
    event?.status === "cancelled";

  if (isCancelled) {
    return (
      <span
        data-testid="event-status-badge"
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold border bg-rose-50 text-rose-700 border-rose-200/70 ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true" />
        <span>Cancelled</span>
      </span>
    );
  }

  const derivedState =
    temporalState ||
    (event ? getEventTemporalState(event, referenceDate) : "upcoming");

  if (derivedState === "ongoing") {
    return (
      <span
        data-testid="event-status-badge"
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold border bg-amber-50 text-amber-800 border-amber-200/70 ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
        <span>Ongoing</span>
      </span>
    );
  }

  if (derivedState === "completed") {
    return (
      <span
        data-testid="event-status-badge"
        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border bg-stone-100 text-stone-600 border-stone-200/70 ${className}`}
      >
        <span>Completed</span>
      </span>
    );
  }

  // Default: upcoming
  return (
    <span
      data-testid="event-status-badge"
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200/70 ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      <span>Upcoming</span>
    </span>
  );
}
