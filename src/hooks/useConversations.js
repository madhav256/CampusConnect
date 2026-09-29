import { useEffect, useState, useMemo } from "react";
import { useAuth } from "./useAuth";
import { subscribeToConversations } from "../services/messageService";

/**
 * Hook providing real-time access to the authenticated user's active conversations,
 * sorted by most recent activity (updatedAt descending), with derived total unread count.
 *
 * Delegates strictly to messageService.subscribeToConversations and does not
 * call Firebase directly.
 *
 * @returns {{
 *   conversations: Array<object>,
 *   totalUnread: number,
 *   unreadCount: number,
 *   isLoading: boolean,
 *   error: string|null,
 * }}
 */
export function useConversations() {
  const { user: authUser } = useAuth();
  const currentUid = authUser?.uid || null;

  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(currentUid));
  const [error, setError] = useState(null);

  const [prevUid, setPrevUid] = useState(currentUid);
  if (currentUid !== prevUid) {
    setPrevUid(currentUid);
    setConversations([]);
    setIsLoading(Boolean(currentUid));
    setError(null);
  }

  useEffect(() => {
    if (!currentUid) {
      return;
    }

    const unsubscribe = subscribeToConversations(
      currentUid,
      (items) => {
        setConversations(items || []);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useConversations subscription error:", err);
        setError(err?.message || "Failed to load conversations.");
        setIsLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [currentUid]);

  const totalUnread = useMemo(() => {
    if (!currentUid || !Array.isArray(conversations)) {
      return 0;
    }

    return conversations.reduce((total, conv) => {
      const count = conv?.unreadCount?.[currentUid];
      return total + (typeof count === "number" && count > 0 ? count : 0);
    }, 0);
  }, [conversations, currentUid]);

  return {
    conversations,
    totalUnread,
    unreadCount: totalUnread,
    isLoading: !currentUid ? false : isLoading,
    error: !currentUid ? null : error,
  };
}
