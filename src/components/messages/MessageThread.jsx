import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw, MessageSquare } from "lucide-react";
import {
  useConversationMessages,
  deducePeerUid,
} from "../../hooks/useConversationMessages";
import { useConnectionState } from "../../hooks/useConnectionState";
import { fetchUserById } from "../../services/userService";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import MessageBubble from "./MessageBubble";
import MessageComposer from "./MessageComposer";
import DisconnectedNotice from "./DisconnectedNotice";

/**
 * Renders the active message thread, including header, auto-scrolling message list,
 * older-message pagination, disconnected notice, and composer.
 *
 * @param {{
 *   conversationId: string,
 *   currentUid: string,
 *   conversation?: object|null,
 *   onBack?: () => void,
 * }} props
 */
export default function MessageThread({
  conversationId,
  currentUid,
  conversation = null,
  onBack,
}) {
  const peerUid =
    conversation?.participants?.find((uid) => uid !== currentUid) ||
    deducePeerUid(conversationId, currentUid);

  const [fallbackPeer, setFallbackPeer] = useState(null);

  // If conversation profile snapshot is missing (e.g. direct deep link), fetch fallback
  useEffect(() => {
    let alive = true;
    if (peerUid && !conversation?.participantProfiles?.[peerUid]) {
      fetchUserById(peerUid)
        .then((p) => {
          if (alive && p) setFallbackPeer(p);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [peerUid, conversation]);

  const peerProfile =
    conversation?.participantProfiles?.[peerUid] || fallbackPeer || {};
  const peerName = peerProfile.displayName || "CampusConnect Student";
  const peerPhoto = peerProfile.photoURL || null;

  // Active message thread hook
  const {
    messages,
    isLoading,
    error,
    isFetchingOlder,
    olderError,
    hasMore,
    fetchOlderMessages,
    sendMessage,
    isSending,
    sendError,
    markAsRead,
  } = useConversationMessages(conversationId, peerUid);

  // Real-time connection authorization check
  const { connectionState, isConnLoading } = useConnectionState(peerUid);
  const isDisconnected = !isConnLoading && connectionState !== "connected";

  // Mark conversation as read upon entering / receiving messages in active thread
  useEffect(() => {
    if (
      conversationId &&
      currentUid &&
      conversation &&
      typeof conversation.unreadCount?.[currentUid] === "number" &&
      conversation.unreadCount[currentUid] > 0
    ) {
      markAsRead();
    }
  }, [conversationId, currentUid, markAsRead, conversation]);

  // Scroll anchor & scroll position preservation refs
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const isInitialLoadRef = useRef(true);
  const prevNewestIdRef = useRef(null);
  const prevOldestIdRef = useRef(null);
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);

  useEffect(() => {
    // Reset initial load flag and scroll tracking when active conversation changes
    isInitialLoadRef.current = true;
    prevNewestIdRef.current = null;
    prevOldestIdRef.current = null;
    prevScrollHeightRef.current = 0;
    prevScrollTopRef.current = 0;
  }, [conversationId]);

  // Track ongoing scroll position to snapshot before older-message updates
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      prevScrollHeightRef.current = container.scrollHeight;
      prevScrollTopRef.current = container.scrollTop;
    }
  }, []);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || isLoading || messages.length === 0) {
      return;
    }

    const currentOldestId = messages[0]?.id;
    const currentNewest = messages[messages.length - 1];
    const currentNewestId = currentNewest?.id;

    // 1. Initial thread load: instant scroll to newest message at bottom
    if (isInitialLoadRef.current) {
      container.scrollTop = container.scrollHeight;
      isInitialLoadRef.current = false;
      prevOldestIdRef.current = currentOldestId;
      prevNewestIdRef.current = currentNewestId;
      prevScrollHeightRef.current = container.scrollHeight;
      prevScrollTopRef.current = container.scrollTop;
      return;
    }

    const hasNewerAtBottom =
      Boolean(currentNewestId) && currentNewestId !== prevNewestIdRef.current;
    const hasOlderAtTop =
      Boolean(currentOldestId) &&
      Boolean(prevOldestIdRef.current) &&
      currentOldestId !== prevOldestIdRef.current;

    // 2. Older messages prepended: preserve scroll position relative to previously viewed content
    if (hasOlderAtTop && !hasNewerAtBottom) {
      const heightDelta = container.scrollHeight - prevScrollHeightRef.current;
      container.scrollTop = prevScrollTopRef.current + heightDelta;
    }
    // 3. New message appended: scroll toward bottom if user sent it or was near bottom
    else if (hasNewerAtBottom) {
      const isSentByMe = currentNewest?.senderId === currentUid;
      const wasNearBottom =
        prevScrollHeightRef.current - prevScrollTopRef.current - container.clientHeight < 150;

      if (isSentByMe || wasNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }

    // Refresh snapshots for the next change
    prevOldestIdRef.current = currentOldestId;
    prevNewestIdRef.current = currentNewestId;
    prevScrollHeightRef.current = container.scrollHeight;
    prevScrollTopRef.current = container.scrollTop;
  }, [messages, isLoading, currentUid]);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Thread Header */}
      <div className="flex items-center justify-between border-b border-border-warm bg-surface/90 px-4 py-3 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center rounded-xl p-1.5 text-stone-600 hover:bg-stone-100 hover:text-ink lg:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
              aria-label="Back to conversations list"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}

          <Link
            to={peerUid ? `/users/${peerUid}` : "#"}
            className="group flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 rounded-lg"
          >
            <Avatar name={peerName} photoURL={peerPhoto} size="md" />
            <div>
              <h3 className="font-serif text-base font-bold tracking-tight text-ink group-hover:text-terracotta-700 transition">
                {peerName}
              </h3>
              <p className="text-xs text-ink-muted">
                {isDisconnected ? (
                  <span className="font-medium text-amber-700">Disconnected</span>
                ) : (
                  <span className="text-emerald-700 font-medium">Connected</span>
                )}
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Message List Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2 bg-paper/40"
      >
        {/* Pagination Trigger / Status */}
        {hasMore && messages.length > 0 && (
          <div className="flex flex-col items-center justify-center py-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isFetchingOlder}
              onClick={fetchOlderMessages}
              className="text-xs"
            >
              {isFetchingOlder ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Loading older messages...
                </>
              ) : (
                "Load older messages"
              )}
            </Button>
          </div>
        )}

        {olderError && (
          <div className="my-2 flex items-center justify-center gap-2 text-xs text-rose-600">
            <span>{olderError}</span>
            <button
              type="button"
              onClick={fetchOlderMessages}
              className="inline-flex items-center gap-1 font-semibold underline hover:text-rose-700"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        )}

        {!hasMore && messages.length > 0 && (
          <p className="py-2 text-center text-[11px] text-ink-muted/80 uppercase tracking-wider font-medium">
            Beginning of conversation
          </p>
        )}

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="space-y-3 py-6">
            <div className="flex justify-start">
              <div className="h-10 w-48 rounded-2xl rounded-tl-xs bg-stone-200 animate-pulse" />
            </div>
            <div className="flex justify-end">
              <div className="h-12 w-64 rounded-2xl rounded-tr-xs bg-terracotta-200 animate-pulse" />
            </div>
            <div className="flex justify-start">
              <div className="h-8 w-40 rounded-2xl rounded-tl-xs bg-stone-200 animate-pulse" />
            </div>
          </div>
        )}

        {/* Subscription Error */}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 text-center"
          >
            {error}
          </div>
        )}

        {/* Empty Thread */}
        {!isLoading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-terracotta-50 text-terracotta-600 border border-terracotta-200/50">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h4 className="mt-3 font-serif text-base font-semibold text-ink">
              Say hello to {peerName}
            </h4>
            <p className="mt-1 max-w-xs text-xs text-ink-muted">
              {isDisconnected
                ? "You are no longer connected with this student."
                : "This is the start of your message thread. Send your first message below."}
            </p>
          </div>
        )}

        {/* Messages */}
        {!isLoading &&
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.senderId === currentUid}
            />
          ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Disconnected Notice */}
      {isDisconnected && (
        <div className="p-3 border-t border-border-warm bg-surface">
          <DisconnectedNotice />
        </div>
      )}

      {/* Composer */}
      <MessageComposer
        onSendMessage={sendMessage}
        isSending={isSending}
        sendError={sendError}
        disabled={isDisconnected}
      />
    </div>
  );
}
