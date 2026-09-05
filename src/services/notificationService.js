import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

/**
 * Normalizes a raw Firestore notification document.
 *
 * @param {string} id
 * @param {object} data
 * @returns {object}
 */
export function normalizeNotification(id, data) {
  return {
    id,
    recipientId: data.recipientId,
    actorId: data.actorId,
    actorName: data.actorName || "CampusConnect Student",
    actorAvatar: data.actorAvatar || null,
    type: data.type, // "connection_request" | "connection_accepted"
    referenceId: data.referenceId,
    isRead: Boolean(data.isRead),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
  };
}

/**
 * Subscribes in real-time to the user's 30 most recent notifications.
 *
 * @param {string} userId - Recipient user UID
 * @param {function} callback - Receives array of normalized notification objects
 * @param {function} [onError] - Optional error handler
 * @returns {function} Unsubscribe function
 */
export function subscribeToNotifications(userId, callback, onError) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const firestore = requireDb();
  const notifRef = collection(firestore, "users", userId, "notifications");
  const q = query(notifRef, orderBy("createdAt", "desc"), limit(30));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) =>
        normalizeNotification(docSnap.id, docSnap.data())
      );
      callback(items);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.error("Error subscribing to notifications:", error);
      }
    }
  );
}

/**
 * Marks a single notification as read.
 *
 * @param {string} userId
 * @param {string} notificationId
 */
export async function markNotificationAsRead(userId, notificationId) {
  if (!userId || !notificationId) return;

  const firestore = requireDb();
  const notifRef = doc(firestore, "users", userId, "notifications", notificationId);
  await updateDoc(notifRef, { isRead: true });
}

/**
 * Marks multiple notifications as read in a single batch.
 *
 * @param {string} userId
 * @param {string[]} notificationIds
 */
export async function markAllNotificationsAsRead(userId, notificationIds) {
  if (!userId || !Array.isArray(notificationIds) || notificationIds.length === 0) return;

  const firestore = requireDb();
  const batch = writeBatch(firestore);

  notificationIds.forEach((id) => {
    const notifRef = doc(firestore, "users", userId, "notifications", id);
    batch.update(notifRef, { isRead: true });
  });

  await batch.commit();
}

/**
 * Deletes a notification from the user's inbox.
 *
 * @param {string} userId
 * @param {string} notificationId
 */
export async function deleteNotification(userId, notificationId) {
  if (!userId || !notificationId) return;

  const firestore = requireDb();
  const notifRef = doc(firestore, "users", userId, "notifications", notificationId);
  await deleteDoc(notifRef);
}
