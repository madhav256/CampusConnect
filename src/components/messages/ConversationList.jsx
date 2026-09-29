import { Link } from "react-router-dom";
import { MessageSquare, AlertCircle } from "lucide-react";
import ConversationItem from "./ConversationItem";
import EmptyState from "../ui/EmptyState";

/**
 * Renders the list of active conversations with loading skeletons and empty states.
 *
 * @param {{
 *   conversations: Array<object>,
 *   currentUid: string,
 *   activeConversationId?: string|null,
 *   isLoading?: boolean,
 *   error?: string|null,
 * }} props
 */
export default function ConversationList({
  conversations = [],
  currentUid,
  activeConversationId = null,
  isLoading = false,
  error = null,
}) {
  return (
    <div className="flex h-full flex-col bg-surface">
      {/* List Header */}
      <div className="flex items-center justify-between border-b border-border-warm px-4 py-3.5">
        <h2 className="font-serif text-lg font-bold tracking-tight text-ink">
          Messages
        </h2>
        {conversations.length > 0 && (
          <span className="text-xs text-ink-muted">
            {conversations.length}{" "}
            {conversations.length === 1 ? "thread" : "threads"}
          </span>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4">
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="divide-y divide-border-warm/60">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
              <div className="h-12 w-12 shrink-0 rounded-full bg-stone-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/3 rounded bg-stone-200" />
                <div className="h-3 w-3/4 rounded bg-stone-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && conversations.length === 0 && (
        <div className="flex flex-1 items-center justify-center p-4">
          <EmptyState
            compact
            icon={MessageSquare}
            title="No conversations yet"
            description="Connect with other students in Discover to start messaging."
            action={
              <Link
                to="/discover"
                className="inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-terracotta-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
              >
                Explore Discover
              </Link>
            }
          />
        </div>
      )}

      {/* Conversation Items */}
      {!isLoading && conversations.length > 0 && (
        <div className="flex-1 overflow-y-auto divide-y divide-border-warm/40">
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              currentUid={currentUid}
              isActive={conv.id === activeConversationId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
