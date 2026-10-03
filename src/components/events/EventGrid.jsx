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

export default function EventGrid({
  events = [],
  isLoading = false,
  error = null,
  emptyTitle = "No events found",
  emptyDescription = "There are no events matching your criteria right now.",
  onRetry = null,
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

  if (!events || events.length === 0) {
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
      {events.map((event) => (
        <EventCard
          key={event.id}
          data-testid={`event-card-${event.id}`}
          event={event}
        />
      ))}
    </div>
  );
}
