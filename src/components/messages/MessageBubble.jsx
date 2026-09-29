function formatMessageTime(timestamp) {
  if (!timestamp) return "";
  const date = timestamp?.toDate
    ? timestamp.toDate()
    : timestamp instanceof Date
    ? timestamp
    : new Date(timestamp);

  if (isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Renders an individual chat message bubble with distinct styles
 * for sender vs recipient.
 *
 * @param {{
 *   message: object,
 *   isOwn: boolean,
 * }} props
 */
export default function MessageBubble({ message, isOwn }) {
  const timeFormatted = formatMessageTime(message.createdAt);

  return (
    <div
      className={`flex w-full ${isOwn ? "justify-end" : "justify-start"} my-1 px-1`}
    >
      <div
        className={`group relative max-w-[85%] sm:max-w-[72%] rounded-2xl px-4 py-2.5 shadow-xs transition ${
          isOwn
            ? "rounded-tr-xs bg-terracotta-600 text-white"
            : "rounded-tl-xs border border-border-warm bg-surface text-ink"
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed select-text">
          {message.content}
        </p>

        {timeFormatted && (
          <div
            className={`mt-1 flex items-center gap-1 text-[10px] ${
              isOwn
                ? "justify-end text-terracotta-200"
                : "justify-start text-ink-muted"
            }`}
          >
            <time dateTime={message.createdAt?.toISOString?.() || ""}>
              {timeFormatted}
            </time>
          </div>
        )}
      </div>
    </div>
  );
}
