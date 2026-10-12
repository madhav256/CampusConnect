/**
 * Milestone 21 — Unit 21.4: RSVP Detail Interaction UI
 *
 * Attendee preview component rendering real-time attendee avatars (up to 8)
 * and bounded headcount text ("N going" / "50+ going", empty state).
 * Gated by event visibility / availability.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Users } from "lucide-react";
import { useEventAttendees } from "../../hooks/useEventAttendees.js";
import { fetchUserById } from "../../services/userService.js";
import Avatar from "../ui/Avatar.jsx";

/**
 * Renders attendee avatars and headcount for an event.
 *
 * @param {object} props
 * @param {string|null} props.eventId - Event document ID
 * @param {boolean} [props.enabled=true] - Query enabled flag (disabled if event is inaccessible)
 * @param {Array<object>} [props.attendees] - Direct override for unit testing
 * @param {number} [props.count] - Direct count override for unit testing
 * @param {boolean} [props.hasMore] - Direct hasMore override for unit testing
 * @param {boolean} [props.isLoading] - Direct loading override for unit testing
 * @param {string|null} [props.error] - Direct error override for unit testing
 * @param {string} [props.className=""] - Additional CSS classes
 * @returns {React.ReactElement}
 */
export default function EventAttendeePreview({
  eventId,
  enabled = true,
  attendees: propAttendees,
  count: propCount,
  hasMore: propHasMore,
  isLoading: propIsLoading,
  error: propError,
  className = "",
}) {
  const shouldHook = propAttendees === undefined && Boolean(eventId);
  const hookResult = useEventAttendees(shouldHook ? eventId : null, {
    enabled,
    limit: 51,
  });

  const attendees = useMemo(
    () => (propAttendees !== undefined ? propAttendees : (hookResult?.attendees || [])),
    [propAttendees, hookResult?.attendees],
  );
  const count = propCount !== undefined ? propCount : (hookResult?.count || 0);
  const hasMore = propHasMore !== undefined ? propHasMore : Boolean(hookResult?.hasMore);
  const isLoading = propIsLoading !== undefined ? propIsLoading : Boolean(hookResult?.isLoading);
  const error = propError !== undefined ? propError : (hookResult?.error || null);

  const [profiles, setProfiles] = useState({});
  const requestedUidsRef = useRef(new Set());

  // Fetch public profiles for the first 8 attendees
  useEffect(() => {
    if (!attendees || attendees.length === 0) return;

    let isMounted = true;
    const top8 = attendees.slice(0, 8);

    top8.forEach((att) => {
      const uid = att?.userId;
      if (!uid || requestedUidsRef.current.has(uid)) return;
      requestedUidsRef.current.add(uid);

      fetchUserById(uid)
        .then((profile) => {
          if (isMounted && profile) {
            setProfiles((prev) => ({
              ...prev,
              [uid]: profile,
            }));
          }
        })
        .catch(() => {
          // Non-fatal: avatar falls back to initials
        });
    });

    return () => {
      isMounted = false;
    };
  }, [attendees]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div
        data-testid="event-attendees-loading"
        className={`flex items-center gap-3 animate-pulse ${className}`}
      >
        <div className="flex -space-x-2">
          <div className="h-8 w-8 rounded-full bg-stone-200 ring-2 ring-surface" />
          <div className="h-8 w-8 rounded-full bg-stone-200 ring-2 ring-surface" />
          <div className="h-8 w-8 rounded-full bg-stone-200 ring-2 ring-surface" />
        </div>
        <div className="h-4 w-20 rounded-md bg-stone-200" />
      </div>
    );
  }

  // Error state
  if (error) {
    const isPermissionError =
      typeof error === "string" &&
      (error.toLowerCase().includes("permission") ||
        error.toLowerCase().includes("not available"));

    return (
      <div
        data-testid="event-attendees-error"
        className={`flex items-center gap-2 text-xs text-ink-muted ${className}`}
      >
        <Users className="h-4 w-4 text-stone-400 shrink-0" aria-hidden="true" />
        <span>
          {isPermissionError
            ? "Attendee list is not available to you."
            : error || "Unable to load attendees."}
        </span>
      </div>
    );
  }

  // Empty state
  if (!attendees || attendees.length === 0 || count === 0) {
    return (
      <div
        data-testid="event-attendees-empty"
        className={`flex items-center gap-2 text-xs font-medium text-ink-muted ${className}`}
      >
        <Users className="h-4 w-4 text-stone-400 shrink-0" aria-hidden="true" />
        <span>Be the first to RSVP</span>
      </div>
    );
  }

  const top8 = attendees.slice(0, 8);
  const countLabel = hasMore
    ? "50+ going"
    : count === 1
    ? "1 going"
    : `${count} going`;

  return (
    <div
      data-testid="event-attendee-preview"
      className={`flex items-center gap-3 ${className}`}
    >
      <div
        data-testid="attendee-avatars"
        className="flex -space-x-2 overflow-hidden shrink-0"
      >
        {top8.map((att) => {
          const userProfile = profiles[att.userId];
          return (
            <div
              key={att.userId}
              data-testid={`attendee-avatar-${att.userId}`}
              className="inline-block"
            >
              <Avatar
                name={userProfile?.displayName || "Student"}
                photoURL={userProfile?.photoURL || null}
                size="sm"
                bordered
              />
            </div>
          );
        })}
        {(hasMore || count > 8) && (
          <div
            data-testid="attendee-overflow"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-stone-700 ring-2 ring-surface shadow-2xs"
          >
            {hasMore ? "50+" : `+${count - 8}`}
          </div>
        )}
      </div>

      <span
        data-testid="event-attendee-count"
        className="text-xs sm:text-sm font-medium text-ink-muted"
      >
        {countLabel}
      </span>
    </div>
  );
}
