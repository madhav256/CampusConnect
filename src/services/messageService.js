import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import { getConnectionDocId } from "./connectionService";
import { fetchUserById } from "./userService";

export const MAX_MESSAGE_LENGTH = 1000;
export const MESSAGES_PAGE_SIZE = 25;
export const CONVERSATIONS_LIMIT = 50;

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

/**
 * Computes the deterministic canonical conversation ID for a pair of students.
 * Matches the connection canonical ID: min(uidA, uidB) + "_" + max(uidA, uidB).
 *
 * @param {string} uidA
 * @param {string} uidB
 * @returns {string} Canonical conversation document ID
 */
export function getCanonicalConversationId(uidA, uidB) {
  return getConnectionDocId(uidA, uidB);
}

export function conversationDocRef(conversationId) {
  return doc(requireDb(), "conversations", conversationId);
}

export function messagesCollectionRef(conversationId) {
  return collection(requireDb(), "conversations", conversationId, "messages");
}

export function messageDocRef(conversationId, messageId) {
  return doc(requireDb(), "conversations", conversationId, "messages", messageId);
}

/**
 * Normalizes a raw Firestore conversation document into the application data contract.
 *
 * @param {string} id - Conversation document ID
 * @param {object} data - Raw Firestore document data
 * @returns {object} Normalized conversation object
 */
export function normalizeConversation(id, data) {
  const participants = Array.isArray(data?.participants) ? data.participants : [];

  const participantProfiles = {};
  if (data?.participantProfiles && typeof data.participantProfiles === "object") {
    for (const [uid, profile] of Object.entries(data.participantProfiles)) {
      participantProfiles[uid] = {
        displayName: profile?.displayName || "CampusConnect Student",
        photoURL: profile?.photoURL || null,
      };
    }
  }

  let lastMessage = null;
  if (data?.lastMessage && typeof data.lastMessage === "object") {
    lastMessage = {
      id: data.lastMessage.id || "",
      content: data.lastMessage.content || "",
      senderId: data.lastMessage.senderId || "",
      createdAt: data.lastMessage.createdAt?.toDate
        ? data.lastMessage.createdAt.toDate()
        : data.lastMessage.createdAt || null,
    };
  }

  const unreadCount = {};
  if (data?.unreadCount && typeof data.unreadCount === "object") {
    for (const [uid, count] of Object.entries(data.unreadCount)) {
      unreadCount[uid] = typeof count === "number" && count >= 0 ? count : 0;
    }
  }

  return {
    id,
    participants,
    participantProfiles,
    lastMessage,
    unreadCount,
    createdAt: data?.createdAt?.toDate
      ? data.createdAt.toDate()
      : data?.createdAt || null,
    updatedAt: data?.updatedAt?.toDate
      ? data.updatedAt.toDate()
      : data?.updatedAt || null,
  };
}

/**
 * Normalizes a raw Firestore message document into the append-only message contract.
 *
 * @param {string} id - Message document ID
 * @param {object} data - Raw Firestore document data
 * @returns {object} Normalized message object
 */
export function normalizeMessage(id, data) {
  return {
    id,
    conversationId: data?.conversationId || "",
    senderId: data?.senderId || "",
    content: data?.content || "",
    createdAt: data?.createdAt?.toDate
      ? data.createdAt.toDate()
      : data?.createdAt || null,
  };
}

/**
 * Sends a message from senderId to recipientId.
 *
 * Uses Firestore runTransaction() to guarantee race-safe first and subsequent sends:
 * - Reads connections/{conversationId} inside the transaction to verify active 'accepted' status.
 * - Reads conversations/{conversationId} inside the transaction before any writes.
 * - If absent, creates the conversation document and first message document together.
 * - If present, appends the new message and updates conversation metadata (lastMessage, updatedAt,
 *   sender unreadCount = 0, recipient unreadCount incremented by 1 based on transactional state).
 * - Concurrent first messages are safely sequenced: any concurrent peer create causes a retry
 *   that branches cleanly into the subsequent-message update path without overwriting.
 *
 * @param {string|object} arg1 - senderId string OR { senderId, recipientId, content }
 * @param {string} [arg2] - recipientId string
 * @param {string} [arg3] - content string
 * @returns {Promise<{ messageId: string, conversationId: string }>}
 */
export async function sendMessage(arg1, arg2, arg3) {
  let senderId;
  let recipientId;
  let content;

  if (typeof arg1 === "object" && arg1 !== null) {
    senderId = arg1.senderId;
    recipientId = arg1.recipientId;
    content = arg1.content;
  } else {
    senderId = arg1;
    recipientId = arg2;
    content = arg3;
  }

  if (!senderId || !recipientId) {
    throw new Error("Sender ID and Recipient ID are required.");
  }

  if (senderId === recipientId) {
    throw new Error("Invalid participant UIDs: Cannot message yourself.");
  }

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Message content cannot be empty.");
  }

  const trimmedContent = content.trim();

  if (trimmedContent.length > MAX_MESSAGE_LENGTH) {
    throw new Error(
      `Message content exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters.`
    );
  }

  const conversationId = getCanonicalConversationId(senderId, recipientId);
  const firestore = requireDb();

  // Pre-fetch participant profiles for first-message metadata
  const [senderProfile, recipientProfile] = await Promise.all([
    fetchUserById(senderId),
    fetchUserById(recipientId),
  ]);

  const connRef = doc(firestore, "connections", conversationId);
  const convRef = conversationDocRef(conversationId);
  const messagesRef = messagesCollectionRef(conversationId);
  // Keep the message document reference and ID stable across transaction retries
  const newMsgRef = doc(messagesRef);

  return runTransaction(firestore, async (transaction) => {
    // 1. Transactional reads must precede all writes
    const connDoc = await transaction.get(connRef);

    if (!connDoc.exists() || connDoc.data()?.status !== "accepted") {
      throw new Error(
        "Cannot send message: You can only message connected students."
      );
    }

    const convDoc = await transaction.get(convRef);

    // 2. Prepare new message document
    const newMsg = {
      id: newMsgRef.id,
      conversationId,
      senderId,
      content: trimmedContent,
      createdAt: serverTimestamp(),
    };

    if (!convDoc.exists()) {
      // First-message creation: atomically set conversation + first message
      const sortedParticipants =
        senderId < recipientId ? [senderId, recipientId] : [recipientId, senderId];

      const newConv = {
        id: conversationId,
        participants: sortedParticipants,
        participantProfiles: {
          [senderId]: {
            displayName: senderProfile?.displayName || "CampusConnect Student",
            photoURL: senderProfile?.photoURL || null,
          },
          [recipientId]: {
            displayName: recipientProfile?.displayName || "CampusConnect Student",
            photoURL: recipientProfile?.photoURL || null,
          },
        },
        lastMessage: {
          id: newMsgRef.id,
          content: trimmedContent,
          senderId,
          createdAt: serverTimestamp(),
        },
        unreadCount: {
          [senderId]: 0,
          [recipientId]: 1,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      transaction.set(convRef, newConv);
      transaction.set(newMsgRef, newMsg);
    } else {
      // Subsequent-message creation: update conversation metadata + append message
      const convData = convDoc.data() || {};
      const currentRecipientUnread =
        typeof convData.unreadCount?.[recipientId] === "number" &&
        convData.unreadCount[recipientId] >= 0
          ? convData.unreadCount[recipientId]
          : 0;

      transaction.set(newMsgRef, newMsg);
      transaction.update(convRef, {
        lastMessage: {
          id: newMsgRef.id,
          content: trimmedContent,
          senderId,
          createdAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
        [`unreadCount.${senderId}`]: 0,
        [`unreadCount.${recipientId}`]: currentRecipientUnread + 1,
      });
    }

    return {
      messageId: newMsgRef.id,
      conversationId,
    };
  });
}

/**
 * Resets the unread count for the current user on the specified conversation.
 * Targets only the current user's unreadCount key; does not modify the peer's count.
 *
 * @param {string} conversationId
 * @param {string} userId
 */
export async function markConversationAsRead(conversationId, userId) {
  if (!conversationId || !userId) {
    return;
  }

  const convRef = conversationDocRef(conversationId);

  await updateDoc(convRef, {
    [`unreadCount.${userId}`]: 0,
  });
}

/**
 * Subscribes in real-time to the user's active conversations.
 * Ordered by updatedAt descending, bounded by limitCount.
 *
 * @param {string} userId - Auth UID of the participant
 * @param {function} callback - Receives normalized conversation array
 * @param {function} [onError] - Optional error handler
 * @param {number} [limitCount=50]
 * @returns {function} Unsubscribe function
 */
export function subscribeToConversations(
  userId,
  callback,
  onError,
  limitCount = CONVERSATIONS_LIMIT
) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const firestore = requireDb();
  const convsRef = collection(firestore, "conversations");
  const q = query(
    convsRef,
    where("participants", "array-contains", userId),
    orderBy("updatedAt", "desc"),
    limit(limitCount)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const conversations = snapshot.docs.map((docSnap) =>
        normalizeConversation(docSnap.id, docSnap.data())
      );
      callback(conversations);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.error("Error subscribing to conversations:", error);
      }
    }
  );
}

/**
 * Subscribes in real-time to recent messages for a single active conversation thread.
 * Scoped strictly to the active conversation window.
 *
 * @param {string} conversationId
 * @param {function} callback - Receives normalized message array (newest first)
 * @param {function} [onError] - Optional error handler
 * @param {number} [limitCount=25]
 * @returns {function} Unsubscribe function
 */
export function subscribeToConversationMessages(
  conversationId,
  callback,
  onError,
  limitCount = MESSAGES_PAGE_SIZE
) {
  if (!conversationId) {
    callback([]);
    return () => {};
  }

  const firestore = requireDb();
  const msgsRef = collection(firestore, "conversations", conversationId, "messages");
  const q = query(msgsRef, orderBy("createdAt", "desc"), limit(limitCount));

  return onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map((docSnap) =>
        normalizeMessage(docSnap.id, docSnap.data())
      );
      callback(messages);
    },
    (error) => {
      // If the conversation doc does not exist yet (before the first message is sent),
      // Firestore rules reject reading subcollections of non-existent parents.
      // Treat this initial empty state as an empty message list.
      if (error?.code === "permission-denied") {
        callback([]);
        return;
      }
      if (onError) {
        onError(error);
      } else {
        console.error("Error subscribing to conversation messages:", error);
      }
    }
  );
}

/**
 * Fetches an older page of messages for cursor-based pagination.
 *
 * @param {string} conversationId
 * @param {object} [oldestMessageDoc=null] - DocumentSnapshot of oldest currently loaded message
 * @param {number} [pageSize=25]
 * @returns {Promise<DocumentSnapshot[]>} Array of DocumentSnapshots
 */
export async function fetchOlderMessages(
  conversationId,
  oldestMessageDoc = null,
  pageSize = MESSAGES_PAGE_SIZE
) {
  if (!conversationId) {
    return [];
  }

  const firestore = requireDb();
  const msgsRef = collection(firestore, "conversations", conversationId, "messages");
  let q = query(msgsRef, orderBy("createdAt", "desc"), limit(pageSize));

  if (oldestMessageDoc) {
    q = query(q, startAfter(oldestMessageDoc));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs;
}
