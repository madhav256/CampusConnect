import { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import Avatar from "../ui/Avatar";
import {
  acceptConnectionRequest,
  rejectConnectionRequest,
} from "../../services/connectionService";

function formatRelativeTime(date) {
  if (!date) return "Just now";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "Just now";

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotificationItem({
  notification,
  currentUid,
  onMarkAsRead,
  onDelete,
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const isRequest = notification.type === "connection_request";
  const isAccepted = notification.type === "connection_accepted";
  const isEventRsvp = notification.type === "event_rsvp";
  const isEventCancelled = notification.type === "event_cancelled";
  const isEventWaitlistOffer = notification.type === "event_waitlist_offer";

  const trimmedActorName =
    typeof notification.actorName === "string" ? notification.actorName.trim() : "";
  const actorDisplayName =
    trimmedActorName || (isEventCancelled ? "an organizer" : "CampusConnect Student");

  const trimmedReferenceTitle =
    typeof notification.referenceTitle === "string"
      ? notification.referenceTitle.trim()
      : "";
  const validEventReferenceId =
    typeof notification.referenceId === "string" &&
    notification.referenceId.trim().length > 0 &&
    !notification.referenceId.trim().includes("/")
      ? notification.referenceId.trim()
      : null;

  async function handleAccept() {
    if (!currentUid || isBusy) return;
    setIsBusy(true);
    setActionError(null);
    try {
      await acceptConnectionRequest(currentUid, notification.actorId);
    } catch (err) {
      setActionError(err.message || "Failed to accept request.");
      setIsBusy(false);
    }
  }

  async function handleDecline() {
    if (!currentUid || isBusy) return;
    setIsBusy(true);
    setActionError(null);
    try {
      await rejectConnectionRequest(currentUid, notification.actorId);
      if (onDelete) {
        onDelete(notification.id);
      }
    } catch (err) {
      setActionError(err.message || "Failed to decline request.");
      setIsBusy(false);
    }
  }

  return (
    <div
      className={`group relative flex items-start gap-4 rounded-2xl border p-4 transition ${
        notification.isRead
          ? "border-border-warm bg-surface hover:border-stone-300"
          : "border-terracotta-200/70 bg-terracotta-50/40 hover:border-terracotta-300"
      }`}
    >
      {/* Unread indicator dot */}
      {!notification.isRead && (
        <span
          className="absolute top-4 right-4 h-2 w-2 rounded-full bg-terracotta-600"
          title="Unread notification"
          aria-label="Unread notification"
        />
      )}

      {/* Actor Avatar or Seat Offer Icon */}
      {isEventWaitlistOffer ? (
        <div
          data-testid={`notif-offer-icon-${notification.id}`}
          aria-label="Waitlist seat offer"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-100 text-amber-700 shadow-sm"
        >
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
      ) : (
        <Link
          to={notification.actorId ? `/users/${notification.actorId}` : "#"}
          className="shrink-0"
        >
          <Avatar
            name={actorDisplayName}
            photoURL={notification.actorAvatar}
            size="md"
          />
        </Link>
      )}

      {/* Body Content */}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink">
          {isEventWaitlistOffer ? (
            <span>
              A seat is available for{" "}
              {trimmedReferenceTitle ? (
                <span className="font-semibold text-ink">
                  &ldquo;{trimmedReferenceTitle}&rdquo;
                </span>
              ) : (
                "an event you joined on the waitlist"
              )}
              . Claim your spot before the offer expires.
            </span>
          ) : isEventCancelled ? (
            <span>
              The event{" "}
              {notification.referenceTitle ? (
                <span className="font-semibold text-ink">
                  &ldquo;{notification.referenceTitle}&rdquo;
                </span>
              ) : (
                "session"
              )}{" "}
              was cancelled by{" "}
              {notification.actorId ? (
                <Link
                  to={`/users/${notification.actorId}`}
                  className="font-semibold text-ink hover:underline"
                >
                  {actorDisplayName}
                </Link>
              ) : (
                <span className="font-semibold text-ink">{actorDisplayName}</span>
              )}
              .
            </span>
          ) : (
            <>
              {notification.actorId ? (
                <Link
                  to={`/users/${notification.actorId}`}
                  className="font-semibold text-ink hover:underline"
                >
                  {actorDisplayName}
                </Link>
              ) : (
                <span className="font-semibold text-ink">{actorDisplayName}</span>
              )}{" "}
              {isRequest && <span>sent you a connection request.</span>}
              {isAccepted && <span>accepted your connection request.</span>}
              {isEventRsvp && (
                <span>
                  RSVP'd to your event{" "}
                  {notification.referenceTitle ? (
                    <span className="font-semibold text-ink">
                      &ldquo;{notification.referenceTitle}&rdquo;
                    </span>
                  ) : (
                    "session"
                  )}
                  .
                </span>
              )}
              {!isRequest && !isAccepted && !isEventRsvp && <span>interacted with you.</span>}
            </>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
          <time dateTime={notification.createdAt ? notification.createdAt.toISOString() : undefined}>
            {formatRelativeTime(notification.createdAt)}
          </time>
        </div>

        {/* Action Error if any */}
        {actionError && (
          <p className="mt-2 text-xs text-rose-600" role="alert">
            {actionError}
          </p>
        )}

        {/* Inline Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isRequest && (
            <>
              <button
                id={`notif-btn-accept-${notification.id}`}
                onClick={handleAccept}
                disabled={isBusy}
                className="inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-terracotta-700 disabled:opacity-50"
              >
                {isBusy ? "Accepting…" : "Accept"}
              </button>
              <button
                id={`notif-btn-decline-${notification.id}`}
                onClick={handleDecline}
                disabled={isBusy}
                className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:text-ink hover:bg-stone-50 disabled:opacity-50"
              >
                {isBusy ? "Declining…" : "Decline"}
              </button>
            </>
          )}

          {isAccepted && (
            <Link
              to={`/users/${notification.actorId}`}
              className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-3 py-1.5 text-xs font-medium text-ink transition hover:border-stone-300 hover:text-terracotta-700"
            >
              View Profile
            </Link>
          )}

          {(isEventRsvp || isEventCancelled || isEventWaitlistOffer) &&
            validEventReferenceId && (
              <Link
                to={`/events/${validEventReferenceId}`}
                data-testid={`notif-view-event-${notification.id}`}
                className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-3 py-1.5 text-xs font-medium text-ink transition hover:border-stone-300 hover:text-terracotta-700"
              >
                View Event
              </Link>
            )}

          {/* Mark as Read button */}
          {!notification.isRead && onMarkAsRead && (
            <button
              onClick={() => onMarkAsRead(notification.id)}
              className="text-xs font-medium text-ink-muted hover:text-terracotta-700"
              title="Mark as read"
            >
              Mark as read
            </button>
          )}

          {/* Delete notification button */}
          {onDelete && (
            <button
              onClick={() => onDelete(notification.id)}
              className="text-xs text-stone-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-600 focus:opacity-100"
              title="Dismiss notification"
              aria-label="Dismiss notification"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
