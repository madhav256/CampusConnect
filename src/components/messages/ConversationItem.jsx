import { Link } from "react-router-dom";
import Avatar from "../ui/Avatar";

function formatRelativeTime(date) {
  if (!date) return "";
  const d = date?.toDate
    ? date.toDate()
    : date instanceof Date
    ? date
    : new Date(date);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return "Just now";

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Renders a single conversation row in the conversation sidebar list.
 *
 * @param {{
 *   conversation: object,
 *   currentUid: string,
 *   isActive: boolean,
 * }} props
 */
export default function ConversationItem({
  conversation,
  currentUid,
  isActive = false,
}) {
  const peerUid = conversation.participants?.find((uid) => uid !== currentUid);
  const peerProfile = conversation.participantProfiles?.[peerUid] || {};
  const displayName = peerProfile.displayName || "CampusConnect Student";
  const photoURL = peerProfile.photoURL || null;

  const unreadCount = conversation.unreadCount?.[currentUid] || 0;
  const lastMessage = conversation.lastMessage;
  const timestamp = lastMessage?.createdAt || conversation.updatedAt;
  const timeFormatted = formatRelativeTime(timestamp);

  let snippet = "No messages yet";
  if (lastMessage?.content) {
    const isOwnLast = lastMessage.senderId === currentUid;
    snippet = `${isOwnLast ? "You: " : ""}${lastMessage.content}`;
  }

  return (
    <Link
      to={`/messages/${conversation.id}`}
      className={`group flex items-center gap-3 border-b border-border-warm/60 px-4 py-3.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 ${
        isActive
          ? "border-l-4 border-l-terracotta-600 bg-terracotta-50/60 font-medium"
          : "hover:bg-stone-50/80"
      }`}
      aria-current={isActive ? "page" : undefined}
    >
      <div className="relative shrink-0">
        <Avatar name={displayName} photoURL={photoURL} size="md" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 sm:hidden">
            <span className="relative inline-flex h-3 w-3 rounded-full bg-terracotta-600"></span>
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <p
            className={`truncate text-sm font-semibold ${
              unreadCount > 0 ? "text-ink font-bold" : "text-ink"
            }`}
          >
            {displayName}
          </p>
          {timeFormatted && (
            <span className="shrink-0 text-[11px] text-ink-muted">
              {timeFormatted}
            </span>
          )}
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={`truncate text-xs ${
              unreadCount > 0
                ? "font-semibold text-ink"
                : "text-ink-muted"
            }`}
          >
            {snippet}
          </p>

          {unreadCount > 0 && (
            <span
              className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-terracotta-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs"
              aria-label={`${unreadCount} unread messages`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
