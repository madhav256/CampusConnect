import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import { fetchUserById } from "./userService";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

/**
 * Computes the canonical sorted-pair connection document ID.
 * For any two users A and B, the ID is always min(A, B) + "_" + max(A, B).
 *
 * @param {string} uidA
 * @param {string} uidB
 * @returns {string} Deterministic connection document ID
 */
export function getConnectionDocId(uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) {
    throw new Error("Invalid participant UIDs.");
  }
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

/**
 * Sends a pending connection request from fromUid to toUid.
 * Uses a transaction to atomically verify no relationship exists before creating,
 * and atomically creates an incoming notification for the recipient.
 *
 * @param {string} fromUid - Sender's UID
 * @param {string} toUid - Receiver's UID
 */
export async function sendConnectionRequest(fromUid, toUid) {
  if (!fromUid || !toUid || fromUid === toUid) {
    throw new Error("Invalid participant UIDs.");
  }

  const firestore = requireDb();
  const docId = getConnectionDocId(fromUid, toUid);
  const connRef = doc(firestore, "connections", docId);
  const notifRef = doc(firestore, "users", toUid, "notifications", `req_${docId}`);

  // Fetch actor's verified profile for denormalized notification payload
  const senderProfile = await fetchUserById(fromUid);
  // Fetch recipient's profile to check their connection request notification preference
  const recipientProfile = await fetchUserById(toUid);
  const shouldNotifyRecipient =
    recipientProfile?.notificationPreferences?.connectionRequests !== false;

  await runTransaction(firestore, async (transaction) => {
    const connDoc = await transaction.get(connRef);

    if (connDoc.exists()) {
      const data = connDoc.data();
      if (data.status === "accepted") {
        throw new Error("You are already connected with this student.");
      }
      if (data.status === "pending" && data.senderId === fromUid) {
        throw new Error("You already have a pending request to this student.");
      }
      if (data.status === "pending" && data.receiverId === fromUid) {
        throw new Error(
          "You already have an incoming connection request from this student. Please review your pending requests."
        );
      }
      throw new Error("A connection already exists between these students.");
    }

    // Determine sorted users array for the canonical invariant
    const sortedUsers =
      fromUid < toUid ? [fromUid, toUid] : [toUid, fromUid];

    transaction.set(connRef, {
      users: sortedUsers,
      senderId: fromUid,
      receiverId: toUid,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Create recipient's connection_request notification atomically if enabled by recipient
    if (shouldNotifyRecipient) {
      transaction.set(notifRef, {
        id: `req_${docId}`,
        recipientId: toUid,
        actorId: fromUid,
        actorName: senderProfile?.displayName || "CampusConnect Student",
        actorAvatar: senderProfile?.photoURL || null,
        type: "connection_request",
        referenceId: docId,
        isRead: false,
        createdAt: serverTimestamp(),
      });
    }
  });
}

/**
 * Cancels an outgoing pending request. Only the original sender may cancel.
 * Deletes the connection document and conditionally deletes the recipient's notification
 * if the recipient has not already deleted it.
 *
 * @param {string} fromUid - Sender's UID (must be the original senderId)
 * @param {string} toUid - Receiver's UID
 */
export async function cancelConnectionRequest(fromUid, toUid) {
  if (!fromUid || !toUid) {
    throw new Error("Invalid participant UIDs.");
  }

  const firestore = requireDb();
  const docId = getConnectionDocId(fromUid, toUid);
  const connRef = doc(firestore, "connections", docId);
  const notifRef = doc(firestore, "users", toUid, "notifications", `req_${docId}`);

  await runTransaction(firestore, async (transaction) => {
    // Reads first:
    const connDoc = await transaction.get(connRef);
    const notifDoc = await transaction.get(notifRef);

    if (!connDoc.exists()) {
      throw new Error("Connection request no longer exists.");
    }

    const data = connDoc.data();

    if (data.status !== "pending") {
      throw new Error("Cannot cancel an already accepted connection. Use removeConnection instead.");
    }
    if (data.senderId !== fromUid) {
      throw new Error("Only the sender can cancel this request.");
    }

    // Mandatory connection deletion:
    transaction.delete(connRef);

    // Conditional notification deletion:
    if (notifDoc.exists()) {
      transaction.delete(notifRef);
    }
  });
}

/**
 * Accepts an incoming pending request. Only the receiver may accept.
 * Updates connection to accepted, cleans up the incoming notification if it exists,
 * and atomically creates an acceptance notification for the sender.
 *
 * @param {string} currentUid - The accepting user's UID (must be receiverId)
 * @param {string} targetUid - The requesting user's UID (must be senderId)
 */
export async function acceptConnectionRequest(currentUid, targetUid) {
  if (!currentUid || !targetUid) {
    throw new Error("Invalid participant UIDs.");
  }

  const firestore = requireDb();
  const docId = getConnectionDocId(currentUid, targetUid);
  const connRef = doc(firestore, "connections", docId);
  const incomingNotifRef = doc(firestore, "users", currentUid, "notifications", `req_${docId}`);
  const acceptedNotifRef = doc(firestore, "users", targetUid, "notifications", `acc_${docId}`);

  // Fetch accepting user's profile for the acceptance notification payload
  const acceptorProfile = await fetchUserById(currentUid);
  // Fetch recipient's (targetUid) profile to check their connection accepted notification preference
  const recipientProfile = await fetchUserById(targetUid);
  const shouldNotifyRecipient =
    recipientProfile?.notificationPreferences?.connectionAccepted !== false;

  await runTransaction(firestore, async (transaction) => {
    // Reads first:
    const connDoc = await transaction.get(connRef);
    const incomingNotifDoc = await transaction.get(incomingNotifRef);

    if (!connDoc.exists()) {
      throw new Error("Connection request no longer exists.");
    }

    const data = connDoc.data();

    if (data.status !== "pending") {
      throw new Error("This connection request has already been processed.");
    }
    if (data.receiverId !== currentUid) {
      throw new Error("Only the recipient of this request can accept it.");
    }

    // Update connection status to accepted
    transaction.update(connRef, {
      status: "accepted",
      updatedAt: serverTimestamp(),
    });

    // Clean up incoming request notification if recipient has not deleted it
    if (incomingNotifDoc.exists()) {
      transaction.delete(incomingNotifRef);
    }

    // Create acceptance notification for the sender (targetUid) if enabled by recipient
    if (shouldNotifyRecipient) {
      transaction.set(acceptedNotifRef, {
        id: `acc_${docId}`,
        recipientId: targetUid,
        actorId: currentUid,
        actorName: acceptorProfile?.displayName || "CampusConnect Student",
        actorAvatar: acceptorProfile?.photoURL || null,
        type: "connection_accepted",
        referenceId: docId,
        isRead: false,
        createdAt: serverTimestamp(),
      });
    }
  });
}

/**
 * Declines an incoming pending request. Only the receiver may decline.
 * Deletes the connection document and cleans up the incoming notification if it exists.
 *
 * @param {string} currentUid - The declining user's UID (must be receiverId)
 * @param {string} targetUid - The requesting user's UID (must be senderId)
 */
export async function rejectConnectionRequest(currentUid, targetUid) {
  if (!currentUid || !targetUid) {
    throw new Error("Invalid participant UIDs.");
  }

  const firestore = requireDb();
  const docId = getConnectionDocId(currentUid, targetUid);
  const connRef = doc(firestore, "connections", docId);
  const notifRef = doc(firestore, "users", currentUid, "notifications", `req_${docId}`);

  await runTransaction(firestore, async (transaction) => {
    // Reads first:
    const connDoc = await transaction.get(connRef);
    const notifDoc = await transaction.get(notifRef);

    if (!connDoc.exists()) {
      throw new Error("Connection request no longer exists.");
    }

    const data = connDoc.data();

    if (data.status !== "pending") {
      throw new Error("This connection request has already been processed.");
    }
    if (data.receiverId !== currentUid) {
      throw new Error("Only the recipient of this request can decline it.");
    }

    // Mandatory connection deletion:
    transaction.delete(connRef);

    // Conditional notification deletion:
    if (notifDoc.exists()) {
      transaction.delete(notifRef);
    }
  });
}

/**
 * Removes an accepted connection. Either connected participant may remove.
 *
 * @param {string} currentUid - The removing user's UID
 * @param {string} targetUid - The other participant's UID
 */
export async function removeConnection(currentUid, targetUid) {
  if (!currentUid || !targetUid) {
    throw new Error("Invalid participant UIDs.");
  }

  const firestore = requireDb();
  const docId = getConnectionDocId(currentUid, targetUid);
  const connRef = doc(firestore, "connections", docId);

  await runTransaction(firestore, async (transaction) => {
    const connDoc = await transaction.get(connRef);

    if (!connDoc.exists()) {
      throw new Error("Connection does not exist.");
    }

    const data = connDoc.data();

    if (data.status !== "accepted") {
      throw new Error("Cannot remove a connection that is not accepted.");
    }
    if (!data.users.includes(currentUid)) {
      throw new Error("Only participants can remove this connection.");
    }

    transaction.delete(connRef);
  });
}

/**
 * Subscribes in real-time to the single connection document for PublicProfile.
 * Returns null when no relationship exists (document does not exist).
 *
 * @param {string} currentUid
 * @param {string} targetUid
 * @param {function} callback - Called with the connection document data or null
 * @param {function} [onError] - Optional error callback
 * @returns {function} Unsubscribe function
 */
export function subscribeToConnectionState(currentUid, targetUid, callback, onError) {
  if (!currentUid || !targetUid || currentUid === targetUid) {
    callback(null);
    return () => {};
  }

  const firestore = requireDb();
  const docId = getConnectionDocId(currentUid, targetUid);
  const connRef = doc(firestore, "connections", docId);

  return onSnapshot(
    connRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() });
      } else {
        callback(null);
      }
    },
    (error) => {
      // Firestore returns permission-denied when the doc doesn't exist and the
      // read rule requires membership in users[]. Treat this as "no relationship".
      if (error.code === "permission-denied") {
        callback(null);
      } else if (onError) {
        onError(error);
      } else {
        console.error("Error subscribing to connection state:", error);
      }
    }
  );
}

/**
 * Subscribes in real-time to all connection documents for the current user.
 * Uses a single array-contains query to retrieve accepted connections and
 * pending requests in one stream. Client-side partitioning is done in the hook.
 *
 * @param {string} currentUid
 * @param {function} callback - Called with an array of connection documents
 * @param {function} [onError] - Optional error callback
 * @returns {function} Unsubscribe function
 */
export function subscribeToUserRelationships(currentUid, callback, onError) {
  if (!currentUid) {
    callback([]);
    return () => {};
  }

  const firestore = requireDb();
  const q = query(
    collection(firestore, "connections"),
    where("users", "array-contains", currentUid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(docs);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.error("Error subscribing to user relationships:", error);
      }
    }
  );
}
