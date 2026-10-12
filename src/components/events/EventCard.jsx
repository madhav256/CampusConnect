/**
 * Milestone 20 — Unit 20.4: Event Discovery UI & Navigation
 *
 * Card component for displaying an event in discovery feeds and grids.
 * Shows banner, category badge, temporal/cancelled status, title, organizer,
 * date/time, and venue location.
 */

import { Link } from "react-router-dom";
import { Calendar, MapPin } from "lucide-react";
import Card from "../ui/Card";
import EventCategoryBadge from "./EventCategoryBadge";
import EventStatusBadge from "./EventStatusBadge";
import RsvpStatusBadge from "./RsvpStatusBadge";
import { EVENT_STATUSES } from "../../constants.js";

function formatEventDate(startAt) {
  if (!startAt) return "Date TBA";
  const start = startAt.toDate ? startAt.toDate() : new Date(startAt);
  if (isNaN(start.getTime())) return "Date TBA";

  const dateStr = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(start);

  const timeStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(start);

  return `${dateStr} • ${timeStr}`;
}

export default function EventCard({
  event,
  isGoing = false,
  "data-testid": testId,
}) {
  if (!event) return null;

  const isCancelled =
    event.status === EVENT_STATUSES.CANCELLED || event.status === "cancelled";
  const formattedDate = formatEventDate(event.startAt);

  return (
    <Link
      to={`/events/${event.id}`}
      data-testid={testId || `event-card-${event.id}`}
      aria-label={`View event details for ${event.title}`}
      className="group block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
    >
      <Card
        className={`flex h-full flex-col justify-between transition duration-150 group-hover:border-stone-300 group-hover:shadow-sm ${
          isCancelled ? "opacity-90 border-rose-200/60 bg-stone-50/50" : ""
        }`}
      >
        <div>
          {/* Banner Image or Fallback Decorative Header */}
          {event.imageURL ? (
            <div className="relative mb-4 h-36 w-full overflow-hidden rounded-xl bg-stone-100">
              <img
                src={event.imageURL}
                alt={event.title || "Event banner"}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="relative mb-4 flex h-24 w-full items-center justify-between rounded-xl bg-gradient-to-br from-terracotta-50/80 via-surface to-stone-100 p-4 border border-border-warm/60">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-terracotta-200/60 bg-surface text-terracotta-600 shadow-xs">
                <Calendar className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>
          )}

          {/* Badges Row */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <EventCategoryBadge category={event.category} />
            <EventStatusBadge event={event} />
            {isGoing && (
              <span data-testid="event-card-going-badge" className="inline-flex">
                <RsvpStatusBadge state="going" />
              </span>
            )}
          </div>

          {/* Title */}
          <h3
            data-testid="event-card-title"
            className={`font-serif text-lg font-bold tracking-tight text-ink line-clamp-2 transition ${
              isCancelled
                ? "line-through text-stone-500"
                : "group-hover:text-terracotta-700"
            }`}
          >
            {event.title || "Untitled Event"}
          </h3>

          {/* Organizer */}
          {event.organizerName && (
            <p
              data-testid="event-card-organizer"
              className="mt-1 text-xs font-medium text-ink-muted truncate"
            >
              Organized by{" "}
              <span className="text-stone-700 font-semibold">
                {event.organizerName}
              </span>
            </p>
          )}

          {/* Description snippet */}
          {event.description && (
            <p className="mt-2 text-xs text-ink-muted line-clamp-2 leading-relaxed">
              {event.description}
            </p>
          )}
        </div>

        {/* Footer: Date and Location */}
        <div className="mt-5 space-y-1.5 border-t border-border-warm/60 pt-3.5 text-xs text-ink-muted">
          <div
            className="flex items-center gap-2"
            data-testid="event-card-date"
          >
            <Calendar
              className="h-4 w-4 shrink-0 text-stone-400"
              aria-hidden="true"
            />
            <span className="truncate">{formattedDate}</span>
          </div>

          {event.location && (
            <div
              className="flex items-center gap-2"
              data-testid="event-card-location"
            >
              <MapPin
                className="h-4 w-4 shrink-0 text-stone-400"
                aria-hidden="true"
              />
              <span className="truncate">{event.location}</span>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
