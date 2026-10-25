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
 * Normalizes an optional offer expiration value into a valid Date instance.
 * Returns null when the input is absent or malformed.
 *
 * @param {any} value
 * @returns {Date|null}
 */
function normalizeOfferExpiresAt(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value?.toDate === "function") {
    try {
      const converted = value.toDate();
      return converted instanceof Date && !Number.isNaN(converted.getTime())
        ? converted
        : null;
    } catch {
      return null;
    }
  }
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime()) ? value : null;
  }
  if (typeof value?.toMillis === "function") {
    try {
      const ms = value.toMillis();
      if (typeof ms === "number" && Number.isFinite(ms)) {
        const d = new Date(ms);
        return !Number.isNaN(d.getTime()) ? d : null;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (
    typeof value === "object" &&
    typeof value.seconds === "number" &&
    Number.isFinite(value.seconds)
  ) {
    const d = new Date(value.seconds * 1000);
    return !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const d = new Date(value);
    return !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const d = new Date(value.trim());
    return !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}

/**
 * Normalizes a raw Firestore notification document.
 *
 * @param {string} id
 * @param {object} data
 * @returns {object}
 */
export function normalizeNotification(id, data) {
  const safeData = data && typeof data === "object" ? data : {};
  const normalized = {
    id,
    recipientId: safeData.recipientId,
    actorId: safeData.actorId,
    actorName: safeData.actorName || "CampusConnect Student",
    actorAvatar: safeData.actorAvatar || null,
    type: safeData.type, // "connection_request" | "connection_accepted" | "event_rsvp" | "event_cancelled" | "event_waitlist_offer"
    referenceId: safeData.referenceId,
    isRead: Boolean(safeData.isRead),
    createdAt: safeData.createdAt?.toDate ? safeData.createdAt.toDate() : null,
  };

  if (safeData.referenceTitle !== undefined) {
    normalized.referenceTitle = safeData.referenceTitle;
  }
  if (safeData.cycleId !== undefined) {
    normalized.cycleId = safeData.cycleId;
  }
  if (typeof safeData.slotId === "string" && safeData.slotId.trim().length > 0) {
    normalized.slotId = safeData.slotId.trim();
  }
  if (
    typeof safeData.slotSequence === "number" &&
    Number.isInteger(safeData.slotSequence) &&
    safeData.slotSequence > 0
  ) {
    normalized.slotSequence = safeData.slotSequence;
  }
  const normalizedOfferExpiresAt = normalizeOfferExpiresAt(safeData.offerExpiresAt);
  if (normalizedOfferExpiresAt !== null) {
    normalized.offerExpiresAt = normalizedOfferExpiresAt;
  }

  return normalized;
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
