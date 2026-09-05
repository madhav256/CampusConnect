import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import {
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from "../services/notificationService";

/**
 * Hook providing real-time access to the current user's notifications,
 * unread count, and action handlers.
 *
 * @returns {{
 *   notifications: object[],
 *   unreadCount: number,
 *   isLoading: boolean,
 *   error: string|null,
 *   markAsRead: (notificationId: string) => Promise<void>,
 *   markAllAsRead: () => Promise<void>,
 *   deleteNotificationItem: (notificationId: string) => Promise<void>,
 * }}
 */
export function useNotifications() {
  const { user: authUser } = useAuth();
  const currentUid = authUser?.uid;

  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentUid) {
      return;
    }

    const unsubscribe = subscribeToNotifications(
      currentUid,
      (items) => {
        setNotifications(items);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useNotifications error:", err);
        setError("Failed to load notifications.");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUid]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function handleMarkAsRead(notificationId) {
    if (!currentUid || !notificationId) return;
    try {
      await markNotificationAsRead(currentUid, notificationId);
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  }

  async function handleMarkAllAsRead() {
    if (!currentUid) return;
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;

    try {
      await markAllNotificationsAsRead(currentUid, unreadIds);
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
    }
  }

  async function handleDeleteNotification(notificationId) {
    if (!currentUid || !notificationId) return;
    try {
      await deleteNotification(currentUid, notificationId);
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  }

  return {
    notifications,
    unreadCount,
    isLoading: !currentUid ? false : isLoading,
    error,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    deleteNotificationItem: handleDeleteNotification,
  };
}
