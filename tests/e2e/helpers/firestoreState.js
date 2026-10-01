import process from "node:process";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { E2E_USERS } from "../fixtures/testUsers.js";

process.env.GOOGLE_AUTH_SUPPRESS_CREDENTIALS_WARNINGS = "true";

const EMULATOR_PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-campusconnect-rules-test";

// Guard: Refuse to target production Firebase database
if (
  EMULATOR_PROJECT_ID.includes("campusconnect-cf191") &&
  !process.env.FIRESTORE_EMULATOR_HOST
) {
  throw new Error("FATAL: Refusing to run E2E state helpers against production database.");
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}

const existingApps = getApps();
const existingApp = existingApps.find((a) => a.name === "e2e-state");
const app = existingApp || initializeApp({ projectId: EMULATOR_PROJECT_ID }, "e2e-state");
export const db = getFirestore(app);

export function getConnectionId(uidA, uidB) {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

/**
 * Completely resets any connection, notifications, and conversation between two users
 * back to a pristine clean state (no relationship).
 *
 * @param {string} uidA
 * @param {string} uidB
 */
export async function resetCleanPair(uidA, uidB) {
  const connectionId = getConnectionId(uidA, uidB);

  // 1. Delete connection document
  await db.collection("connections").doc(connectionId).delete();

  // 2. Delete conversation and messages subcollection if present
  const convRef = db.collection("conversations").doc(connectionId);
  const msgSnap = await convRef.collection("messages").get();
  if (!msgSnap.empty) {
    const batch = db.batch();
    msgSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  await convRef.delete();

  // 3. Delete deterministic notifications (req_ and acc_) for both users
  const notifIds = [`req_${connectionId}`, `acc_${connectionId}`];
  for (const notifId of notifIds) {
    await db.collection("users").doc(uidA).collection("notifications").doc(notifId).delete();
    await db.collection("users").doc(uidB).collection("notifications").doc(notifId).delete();
  }

  // Also query any remaining notifications matching referenceId
  for (const uid of [uidA, uidB]) {
    const querySnap = await db
      .collection("users")
      .doc(uid)
      .collection("notifications")
      .where("referenceId", "==", connectionId)
      .get();
    if (!querySnap.empty) {
      const batch = db.batch();
      querySnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
}

/**
 * Creates a deterministic pending connection request from fromUser to toUser
 * along with the corresponding recipient notification.
 *
 * @param {object} fromUser
 * @param {object} toUser
 */
export async function createPendingRequest(fromUser, toUser) {
  const now = Timestamp.now();
  const connId = getConnectionId(fromUser.uid, toUser.uid);
  const sortedUsers =
    fromUser.uid < toUser.uid ? [fromUser.uid, toUser.uid] : [toUser.uid, fromUser.uid];

  await db.collection("connections").doc(connId).set({
    users: sortedUsers,
    senderId: fromUser.uid,
    receiverId: toUser.uid,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  await db
    .collection("users")
    .doc(toUser.uid)
    .collection("notifications")
    .doc(`req_${connId}`)
    .set({
      id: `req_${connId}`,
      recipientId: toUser.uid,
      actorId: fromUser.uid,
      actorName: fromUser.displayName,
      actorAvatar: null,
      type: "connection_request",
      referenceId: connId,
      isRead: false,
      createdAt: now,
    });
}

/**
 * Idempotently restores the deterministic Student A <-> Student B conversation
 * and accepted connection state with exactly 1 unread message for Student A.
 */
export async function resetMessagingPairAB() {
  const now = Timestamp.now();
  const connABId = getConnectionId(E2E_USERS.studentA.uid, E2E_USERS.studentB.uid);

  // Restore accepted connection
  await db.collection("connections").doc(connABId).set({
    users: [E2E_USERS.studentA.uid, E2E_USERS.studentB.uid],
    senderId: E2E_USERS.studentB.uid,
    receiverId: E2E_USERS.studentA.uid,
    status: "accepted",
    createdAt: now,
    updatedAt: now,
  });

  const convABRef = db.collection("conversations").doc(connABId);

  // Delete all non-seed messages
  const msgSnaps = await convABRef.collection("messages").get();
  if (!msgSnaps.empty) {
    const batch = db.batch();
    msgSnaps.docs.forEach((doc) => {
      if (doc.id !== "seed-msg-ab-1") {
        batch.delete(doc.ref);
      }
    });
    await batch.commit();
  }

  // Restore seed message
  await convABRef.collection("messages").doc("seed-msg-ab-1").set({
    id: "seed-msg-ab-1",
    conversationId: connABId,
    senderId: E2E_USERS.studentB.uid,
    content: "Hey Alex, excited to connect on CampusConnect!",
    createdAt: now,
  });

  // Restore conversation document with unreadCount: { studentA: 1, studentB: 0 }
  await convABRef.set({
    id: connABId,
    participants: [E2E_USERS.studentA.uid, E2E_USERS.studentB.uid],
    participantProfiles: {
      [E2E_USERS.studentA.uid]: {
        displayName: E2E_USERS.studentA.displayName,
        photoURL: null,
      },
      [E2E_USERS.studentB.uid]: {
        displayName: E2E_USERS.studentB.displayName,
        photoURL: null,
      },
    },
    lastMessage: {
      id: "seed-msg-ab-1",
      content: "Hey Alex, excited to connect on CampusConnect!",
      senderId: E2E_USERS.studentB.uid,
      createdAt: now,
    },
    unreadCount: {
      [E2E_USERS.studentA.uid]: 1,
      [E2E_USERS.studentB.uid]: 0,
    },
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Idempotently restores the deterministic Student B <-> Student C conversation
 * and accepted connection state (0 unread messages) for the disconnect test.
 */
export async function resetMessagingPairBC() {
  const now = Timestamp.now();
  const connBCId = getConnectionId(E2E_USERS.studentB.uid, E2E_USERS.studentC.uid);

  // Restore accepted connection
  await db.collection("connections").doc(connBCId).set({
    users: [E2E_USERS.studentB.uid, E2E_USERS.studentC.uid],
    senderId: E2E_USERS.studentB.uid,
    receiverId: E2E_USERS.studentC.uid,
    status: "accepted",
    createdAt: now,
    updatedAt: now,
  });

  const convBCRef = db.collection("conversations").doc(connBCId);

  // Delete all non-seed messages
  const msgSnaps = await convBCRef.collection("messages").get();
  if (!msgSnaps.empty) {
    const batch = db.batch();
    msgSnaps.docs.forEach((doc) => {
      if (doc.id !== "seed-msg-bc-1") {
        batch.delete(doc.ref);
      }
    });
    await batch.commit();
  }

  // Restore seed message
  await convBCRef.collection("messages").doc("seed-msg-bc-1").set({
    id: "seed-msg-bc-1",
    conversationId: connBCId,
    senderId: E2E_USERS.studentB.uid,
    content: "Hi Casey, glad we are connected!",
    createdAt: now,
  });

  // Restore conversation document with unreadCount: { studentB: 0, studentC: 0 }
  await convBCRef.set({
    id: connBCId,
    participants: [E2E_USERS.studentB.uid, E2E_USERS.studentC.uid],
    participantProfiles: {
      [E2E_USERS.studentB.uid]: {
        displayName: E2E_USERS.studentB.displayName,
        photoURL: null,
      },
      [E2E_USERS.studentC.uid]: {
        displayName: E2E_USERS.studentC.displayName,
        photoURL: null,
      },
    },
    lastMessage: {
      id: "seed-msg-bc-1",
      content: "Hi Casey, glad we are connected!",
      senderId: E2E_USERS.studentB.uid,
      createdAt: now,
    },
    unreadCount: {
      [E2E_USERS.studentB.uid]: 0,
      [E2E_USERS.studentC.uid]: 0,
    },
    createdAt: now,
    updatedAt: now,
  });
}
