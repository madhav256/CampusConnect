/**
 * Milestone 20 — Unit 20.4: Event Discovery UI & Navigation
 *
 * Responsive grid component for rendering event cards with built-in
 * skeleton loading states, error states, and empty states.
 * Layout: 1 col (mobile) -> 2 cols (tablet) -> 3 cols (desktop).
 */

import { Calendar, AlertCircle } from "lucide-react";
import EventCard from "./EventCard";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";

export function InaccessibleEventCard({
  rsvp,
  onRemove,
  isRemoving = false,
  removeError = null,
  "data-testid": testId,
}) {
  return (
    <Card
      data-testid={testId || `event-inaccessible-card-${rsvp.eventId}`}
      className="flex h-full flex-col justify-between border-dashed border-stone-300 bg-stone-50/70 p-6"
    >
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span
            data-testid="rsvp-inaccessible-badge"
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600"
          >
            <AlertCircle className="h-3.5 w-3.5 text-stone-500 shrink-0" aria-hidden="true" />
            <span>No longer available</span>
          </span>
        </div>

        <h3
          data-testid="event-inaccessible-title"
          className="font-serif text-base font-semibold text-stone-700"
        >
          Event Unavailable
        </h3>

        <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">
          This event has been removed or is no longer accessible to your campus account.
        </p>

        {removeError && (
          <p
            data-testid={`remove-rsvp-error-${rsvp.eventId}`}
            className="mt-2 text-xs text-rose-600 font-medium"
          >
            {removeError}
          </p>
        )}
      </div>

      <div className="mt-5 border-t border-border-warm/60 pt-4">
        <button
          type="button"
          data-testid={`remove-rsvp-btn-${rsvp.eventId}`}
          onClick={onRemove}
          disabled={isRemoving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
        >
          {isRemoving ? "Removing..." : "Remove RSVP"}
        </button>
      </div>
    </Card>
  );
}

export function ResolutionErrorCard({
  eventId,
  error,
  onRetry,
  isRetrying = false,
  "data-testid": testId,
}) {
  return (
    <Card
      data-testid={testId || `event-error-card-${eventId}`}
      className="flex h-full flex-col justify-between border-rose-200/80 bg-rose-50/40 p-6"
    >
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-100/60 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" aria-hidden="true" />
            <span>Resolution Error</span>
          </span>
        </div>

        <h3 className="font-serif text-base font-semibold text-ink">
          Unable to Load Event
        </h3>

        <p className="mt-1.5 text-xs text-rose-700 leading-relaxed">
          {error?.message || "A network or server error occurred while retrieving event details."}
        </p>
      </div>

      <div className="mt-5 border-t border-border-warm/60 pt-4">
        <button
          type="button"
          data-testid={`retry-resolve-btn-${eventId}`}
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-terracotta-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-terracotta-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 disabled:opacity-50"
        >
          {isRetrying ? "Retrying..." : "Retry"}
        </button>
      </div>
    </Card>
  );
}

export default function EventGrid({
  events = [],
  isLoading = false,
  error = null,
  emptyTitle = "No events found",
  emptyDescription = "There are no events matching your criteria right now.",
  onRetry = null,
  hasActiveFilters = false,
  rsvpEventIds = null,
  inaccessibleRsvps = [],
  onRemoveRsvp = null,
  removingRsvps = {},
  removeErrors = {},
  resolutionErrors = [],
  onRetryResolve = null,
  retryingResolutions = {},
}) {
  if (error) {
    return (
      <Card className="text-center" data-testid="event-grid-error">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-ink">
          Unable to Load Events
        </h3>
        <p className="mt-1 text-sm text-ink-muted">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            data-testid="event-grid-retry-button"
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-terracotta-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
          >
            Try Again
          </button>
        )}
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div
        data-testid="event-grid-loading"
        className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      >
        {[1, 2, 3, 4, 5, 6].map((idx) => (
          <div
            key={idx}
            data-testid="event-skeleton-card"
            className="animate-pulse rounded-2xl border border-border-warm bg-surface p-6 shadow-xs"
          >
            <div className="h-36 w-full rounded-xl bg-stone-200" />
            <div className="mt-4 flex gap-2">
              <div className="h-5 w-16 rounded bg-stone-200" />
              <div className="h-5 w-20 rounded bg-stone-200" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-6 w-3/4 rounded bg-stone-200" />
              <div className="h-4 w-1/2 rounded bg-stone-200" />
            </div>
            <div className="mt-4 space-y-1.5">
              <div className="h-3 w-full rounded bg-stone-200" />
              <div className="h-3 w-5/6 rounded bg-stone-200" />
            </div>
            <div className="mt-6 space-y-2 border-t border-border-warm/60 pt-4">
              <div className="h-4 w-32 rounded bg-stone-200" />
              <div className="h-4 w-28 rounded bg-stone-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const hasProblemCards =
    Boolean(inaccessibleRsvps && inaccessibleRsvps.length > 0) ||
    Boolean(resolutionErrors && resolutionErrors.length > 0);

  const hasEvents = Boolean(events && events.length > 0);

  if (!hasProblemCards) {
    if (!hasEvents) {
      return (
        <EmptyState
          data-testid="event-grid-empty"
          icon={Calendar}
          title={emptyTitle}
          description={emptyDescription}
        />
      );
    }

    return (
      <div
        data-testid="event-grid"
        className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      >
        {events.map((event) => {
          const isGoing = Boolean(
            event.isGoing ||
            (rsvpEventIds && (
              typeof rsvpEventIds.has === "function"
                ? rsvpEventIds.has(event.id)
                : Array.isArray(rsvpEventIds)
                ? rsvpEventIds.includes(event.id)
                : false
            ))
          );

          return (
            <EventCard
              key={event.id}
              data-testid={`event-card-${event.id}`}
              event={event}
              isGoing={isGoing}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section
        data-testid="event-grid-attention-section"
        aria-label="RSVPs requiring attention"
        className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-900">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
            <span>RSVPs Requiring Attention</span>
          </div>
          <span className="text-xs font-medium text-amber-800/80">
            {(inaccessibleRsvps?.length || 0) + (resolutionErrors?.length || 0)} item
            {(inaccessibleRsvps?.length || 0) + (resolutionErrors?.length || 0) === 1 ? "" : "s"}
          </span>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ...inaccessibleRsvps.map((rsvp) => (
              <InaccessibleEventCard
                key={rsvp.id || rsvp.eventId}
                data-testid={`event-inaccessible-card-${rsvp.eventId}`}
                rsvp={rsvp}
                onRemove={() => onRemoveRsvp?.(rsvp.eventId)}
                isRemoving={Boolean(removingRsvps[rsvp.eventId])}
                removeError={removeErrors[rsvp.eventId] || null}
              />
            )),
            ...resolutionErrors.map((item) => (
              <ResolutionErrorCard
                key={item.eventId}
                data-testid={`event-error-card-${item.eventId}`}
                eventId={item.eventId}
                error={item.error}
                onRetry={() => onRetryResolve?.(item.eventId)}
                isRetrying={Boolean(retryingResolutions[item.eventId])}
              />
            )),
          ]}
        </div>
      </section>

      {hasEvents && (
        <div
          data-testid="event-grid"
          className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        >
          {events.map((event) => {
            const isGoing = Boolean(
              event.isGoing ||
              (rsvpEventIds && (
                typeof rsvpEventIds.has === "function"
                  ? rsvpEventIds.has(event.id)
                  : Array.isArray(rsvpEventIds)
                  ? rsvpEventIds.includes(event.id)
                  : false
              ))
            );

            return (
              <EventCard
                key={event.id}
                data-testid={`event-card-${event.id}`}
                event={event}
                isGoing={isGoing}
              />
            );
          })}
        </div>
      )}

      {!hasEvents && hasActiveFilters && (
        <EmptyState
          data-testid="event-grid-empty"
          icon={Calendar}
          title={emptyTitle}
          description={emptyDescription}
        />
      )}
    </div>
  );
}
