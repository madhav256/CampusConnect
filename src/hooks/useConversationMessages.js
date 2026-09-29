import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import {
  fetchOlderMessages as serviceFetchOlderMessages,
  markConversationAsRead as serviceMarkConversationAsRead,
  normalizeMessage,
  sendMessage as serviceSendMessage,
  subscribeToConversationMessages,
} from "../services/messageService";

/**
 * Extracts peer UID from canonical conversation ID (uidA_uidB).
 *
 * @param {string} conversationId
 * @param {string} currentUid
 * @returns {string|null}
 */
export function deducePeerUid(conversationId, currentUid) {
  if (!conversationId || !currentUid) return null;
  if (conversationId.startsWith(currentUid + "_")) {
    return conversationId.slice(currentUid.length + 1);
  }
  if (conversationId.endsWith("_" + currentUid)) {
    return conversationId.slice(
      0,
      conversationId.length - currentUid.length - 1
    );
  }
  return null;
}

/**
 * Sorts messages in ascending chronological order (oldest to newest)
 * for standard chat thread rendering. Breaks ties deterministically by ID.
 *
 * @param {Array<object>} msgs
 * @returns {Array<object>}
 */
export function sortMessagesChronologically(msgs) {
  return [...msgs].sort((a, b) => {
    const timeA = a?.createdAt?.getTime
      ? a.createdAt.getTime()
      : a?.createdAt
      ? new Date(a.createdAt).getTime()
      : 0;
    const timeB = b?.createdAt?.getTime
      ? b.createdAt.getTime()
      : b?.createdAt
      ? new Date(b.createdAt).getTime()
      : 0;
    if (timeA !== timeB) return timeA - timeB;
    return (a?.id || "").localeCompare(b?.id || "");
  });
}

/**
 * Normalizes an item that may be either a raw Firestore DocumentSnapshot
 * or an already-normalized message object.
 *
 * @param {object} item
 * @returns {object}
 */
function normalizeDocOrMessage(item) {
  if (!item) return null;
  if (typeof item.data === "function") {
    return normalizeMessage(item.id, item.data());
  }
  return item;
}

/**
 * Hook providing real-time message subscription, older-message pagination,
 * send action with composer preservation, and mark-as-read delegation for
 * an active conversation.
 *
 * Scoped strictly to the active conversation while mounted.
 * Delegates all Firestore operations to messageService.js.
 *
 * @param {string|null|undefined} conversationId
 * @param {string|null|undefined} [recipientId=null] - Optional peer UID override
 * @returns {{
 *   messages: Array<object>,
 *   isLoading: boolean,
 *   error: string|null,
 *   isFetchingOlder: boolean,
 *   isLoadingOlder: boolean,
 *   hasMore: boolean,
 *   fetchOlderMessages: () => Promise<void>,
 *   fetchOlder: () => Promise<void>,
 *   sendMessage: (contentOrPayload: string|object, targetRecipientId?: string) => Promise<object>,
 *   isSending: boolean,
 *   sendError: string|null,
 *   markAsRead: () => Promise<void>,
 * }}
 */
export function useConversationMessages(conversationId, recipientId = null) {
  const { user: authUser } = useAuth();
  const currentUid = authUser?.uid || null;

  const [realtimeMessages, setRealtimeMessages] = useState([]);
  const [olderMessages, setOlderMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(conversationId && currentUid));
  const [error, setError] = useState(null);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const [olderError, setOlderError] = useState(null);
  const [hasMore, setHasMore] = useState(Boolean(conversationId && currentUid));
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  // Stable cursor tracking the oldest currently loaded message/doc
  const oldestCursorRef = useRef(null);

  // Track conversation and user changes to reset state during render
  const [prevId, setPrevId] = useState(conversationId);
  const [prevUid, setPrevUid] = useState(currentUid);

  if (conversationId !== prevId || currentUid !== prevUid) {
    setPrevId(conversationId);
    setPrevUid(currentUid);
    setRealtimeMessages([]);
    setOlderMessages([]);
    setIsLoading(Boolean(conversationId && currentUid));
    setError(null);
    setOlderError(null);
    setSendError(null);
    setHasMore(Boolean(conversationId && currentUid));
  }

  // Subscribe to real-time conversation messages
  useEffect(() => {
    oldestCursorRef.current = null;

    if (!conversationId || !currentUid) {
      return;
    }

    const unsubscribe = subscribeToConversationMessages(
      conversationId,
      (items, rawDocs) => {
        const normalized = (items || []).map(normalizeDocOrMessage);
        setRealtimeMessages(normalized);
        setIsLoading(false);
        setError(null);

        // Initialize cursor from the oldest message of the initial real-time page
        // only if older pages haven't been fetched yet
        if (!oldestCursorRef.current && normalized.length > 0) {
          const rawDoc = Array.isArray(rawDocs) ? rawDocs[rawDocs.length - 1] : null;
          oldestCursorRef.current = rawDoc || normalized[normalized.length - 1];
        }

        // If the initial conversation is completely empty, there are no older messages
        if (normalized.length === 0) {
          setHasMore(false);
        }
      },
      (err) => {
        console.error("useConversationMessages subscription error:", err);
        setError(err?.message || "Failed to load messages.");
        setIsLoading(false);
      }
    );

    return () => {
      oldestCursorRef.current = null;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [conversationId, currentUid]);

  // Combine real-time messages and paginated older messages, deduplicating by ID
  const messages = useMemo(() => {
    const map = new Map();

    for (const msg of olderMessages) {
      if (msg?.id) {
        map.set(msg.id, msg);
      }
    }

    for (const msg of realtimeMessages) {
      if (msg?.id) {
        // Real-time messages take precedence over older paginated snapshots
        map.set(msg.id, msg);
      }
    }

    return sortMessagesChronologically(Array.from(map.values()));
  }, [realtimeMessages, olderMessages]);

  /**
   * Fetches an older page of messages and prepends them without duplicates.
   */
  const handleFetchOlderMessages = useCallback(async () => {
    if (
      !conversationId ||
      !currentUid ||
      isFetchingOlder ||
      !hasMore ||
      !oldestCursorRef.current
    ) {
      return;
    }

    setIsFetchingOlder(true);
    setOlderError(null);

    try {
      const olderDocs = await serviceFetchOlderMessages(
        conversationId,
        oldestCursorRef.current
      );

      if (!Array.isArray(olderDocs) || olderDocs.length === 0) {
        setHasMore(false);
        setIsFetchingOlder(false);
        return;
      }

      const normalizedOlder = olderDocs
        .map(normalizeDocOrMessage)
        .filter(Boolean);

      // If fewer items returned than the default page size, no more older messages exist
      if (olderDocs.length < 25) {
        setHasMore(false);
      }

      // Update cursor to the oldest document in this newly loaded page
      const oldestDoc = olderDocs[olderDocs.length - 1];
      oldestCursorRef.current = oldestDoc;

      // Prepend older messages into state
      setOlderMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const trulyNewOlder = normalizedOlder.filter(
          (m) => !existingIds.has(m.id)
        );
        return [...trulyNewOlder, ...prev];
      });
    } catch (err) {
      console.error("useConversationMessages fetchOlder error:", err);
      setOlderError(err?.message || "Failed to load older messages.");
      // Do not mutate cursor or hasMore on error so user can retry
    } finally {
      setIsFetchingOlder(false);
    }
  }, [conversationId, currentUid, isFetchingOlder, hasMore]);

  /**
   * Sends a message in the active conversation thread.
   * If sending fails, throws the error so the caller/composer can preserve
   * the typed draft in local component state.
   *
   * @param {string|object} contentOrPayload
   * @param {string} [targetRecipientId]
   * @returns {Promise<object>}
   */
  const handleSendMessage = useCallback(
    async (contentOrPayload, targetRecipientId) => {
      let content;
      let effectiveRecipientId = targetRecipientId || recipientId;

      if (typeof contentOrPayload === "object" && contentOrPayload !== null) {
        content = contentOrPayload.content;
        effectiveRecipientId =
          contentOrPayload.recipientId || effectiveRecipientId;
      } else {
        content = contentOrPayload;
      }

      if (!effectiveRecipientId) {
        effectiveRecipientId = deducePeerUid(conversationId, currentUid);
      }

      if (!currentUid) {
        const err = new Error("User must be authenticated to send messages.");
        setSendError(err.message);
        throw err;
      }

      if (!effectiveRecipientId) {
        const err = new Error(
          "Recipient ID could not be determined for this conversation."
        );
        setSendError(err.message);
        throw err;
      }

      setIsSending(true);
      setSendError(null);

      try {
        const result = await serviceSendMessage({
          senderId: currentUid,
          recipientId: effectiveRecipientId,
          content,
        });
        setIsSending(false);
        setSendError(null);
        return result;
      } catch (err) {
        setIsSending(false);
        setSendError(err?.message || "Failed to send message.");
        // Rethrow so the composer can preserve typed text in its input
        throw err;
      }
    },
    [conversationId, currentUid, recipientId]
  );

  /**
   * Marks the current user's unread count on this active conversation as 0.
   * Delegates to messageService.markConversationAsRead, leaving updatedAt and
   * peer counters unaffected.
   */
  const handleMarkAsRead = useCallback(async () => {
    if (!conversationId || !currentUid) return;
    try {
      await serviceMarkConversationAsRead(conversationId, currentUid);
    } catch (err) {
      console.error("Failed to mark conversation as read:", err);
    }
  }, [conversationId, currentUid]);

  return {
    messages,
    isLoading: !conversationId || !currentUid ? false : isLoading,
    error,
    isFetchingOlder,
    isLoadingOlder: isFetchingOlder,
    olderError,
    hasMore: !conversationId || !currentUid ? false : hasMore,
    fetchOlderMessages: handleFetchOlderMessages,
    fetchOlder: handleFetchOlderMessages,
    sendMessage: handleSendMessage,
    isSending,
    sendError,
    markAsRead: handleMarkAsRead,
  };
}
