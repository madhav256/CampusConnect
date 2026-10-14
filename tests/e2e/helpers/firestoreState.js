import process from "node:process";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { E2E_USERS } from "../fixtures/testUsers.js";
import { seedEventRsvps } from "../../../scripts/seedEventRsvps.mjs";
import { EVENT_RSVP_DEFINITIONS } from "../../../src/data/eventRsvps.js";
import { seedEvents } from "../../../scripts/seedEvents.mjs";
import { seedCommunityMembers } from "../../../scripts/seedCommunityMembers.mjs";
import { COMMUNITY_MEMBER_LIST } from "../../../src/data/communityMembers.js";

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
    campusId: fromUser.campusId || "apex-university",
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
    campusId: "apex-university",
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
    campusId: "apex-university",
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
    campusId: "apex-university",
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
    campusId: "apex-university",
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

const APPROVED_RSVP_IDS = new Set(EVENT_RSVP_DEFINITIONS.map((def) => def.id));

/**
 * Deterministically resets the eventRsvps collection to the exact approved
 * fixture whitelist, removing any extraneous/test-created RSVP documents and
 * restoring the approved fixtures to pristine state. Idempotent.
 */
export async function resetEventRsvps() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[resetEventRsvps] Refusing to run outside emulator environment.");
  }

  const snapshot = await db.collection("eventRsvps").get();
  const batch = db.batch();
  let deleteCount = 0;

  for (const doc of snapshot.docs) {
    if (!APPROVED_RSVP_IDS.has(doc.id)) {
      batch.delete(doc.ref);
      deleteCount++;
    }
  }

  if (deleteCount > 0) {
    await batch.commit();
  }

  // Restore the approved fixtures
  await seedEventRsvps(db);
}

/**
 * Creates a deterministic test RSVP document directly in Cloud Firestore
 * via the Admin SDK for tests that exercise cancellation or attention states.
 *
 * @param {string} eventId
 * @param {string} userId
 * @param {string} campusId
 * @returns {Promise<string>} Created RSVP document ID
 */
export async function createTestEventRsvp(eventId, userId, campusId) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[createTestEventRsvp] Refusing to run outside emulator environment.");
  }

  const rsvpId = `${eventId}_${userId}`;
  await db.collection("eventRsvps").doc(rsvpId).set({
    id: rsvpId,
    eventId,
    campusId,
    userId,
    createdAt: Timestamp.now(),
  });
  return rsvpId;
}

/**
 * Deletes a specific test RSVP document directly in Cloud Firestore.
 *
 * @param {string} eventId
 * @param {string} userId
 */
export async function deleteTestEventRsvp(eventId, userId) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[deleteTestEventRsvp] Refusing to run outside emulator environment.");
  }
  const rsvpId = `${eventId}_${userId}`;
  await db.collection("eventRsvps").doc(rsvpId).delete();
}

/**
 * Creates an isolated event document directly in Cloud Firestore for destructive or
 * lifecycle-specific tests. Uses an explicit isolated ID prefix (e2e-isolated-) to prevent
 * modifying or colliding with approved baseline fixtures.
 *
 * @param {object} [overrides={}]
 * @returns {Promise<object>} Created event document snapshot data
 */
export async function createIsolatedTestEvent(overrides = {}) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[createIsolatedTestEvent] Refusing to run outside emulator environment.");
  }

  const id = overrides.id || `e2e-isolated-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = Timestamp.now();
  const startAt = overrides.startAt || Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const endAt = overrides.endAt || Timestamp.fromMillis(Date.now() + 4 * 24 * 60 * 60 * 1000);

  const eventDoc = {
    id,
    campusId: overrides.campusId || "apex-university",
    communityId: overrides.communityId || "apex-ai-club",
    title: overrides.title || "Isolated Test Event",
    slug: overrides.slug || `isolated-${id}`,
    description: overrides.description || "Isolated test event description for automated testing.",
    category: overrides.category || "tech",
    location: overrides.location || "Innovation Lab 101",
    startAt,
    endAt,
    imageURL: overrides.imageURL !== undefined ? overrides.imageURL : null,
    createdBy: overrides.createdBy || E2E_USERS.studentA.uid,
    organizerName: overrides.organizerName || "Apex AI & Robotics Society",
    status: overrides.status || "published",
    visibility: overrides.visibility || "campus_public",
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  };

  await db.collection("events").doc(id).set(eventDoc);
  return eventDoc;
}

/**
 * Safely removes a single isolated event document. Strictly guards that the event ID
 * starts with 'e2e-isolated-' to prevent accidental deletion of shared fixtures.
 *
 * @param {string} eventId
 */
export async function deleteIsolatedTestEvent(eventId) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[deleteIsolatedTestEvent] Refusing to run outside emulator environment.");
  }
  if (!eventId || !eventId.startsWith("e2e-isolated-")) {
    throw new Error(`[deleteIsolatedTestEvent] Refusing to delete non-isolated event ID: ${eventId}`);
  }
  await db.collection("events").doc(eventId).delete();
}

/**
 * Deletes all test-created events matching the isolated prefix ('e2e-isolated-').
 * Never deletes shared baseline fixtures.
 */
export async function cleanupIsolatedEvents() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[cleanupIsolatedEvents] Refusing to run outside emulator environment.");
  }
  const snapshot = await db.collection("events").get();
  const batch = db.batch();
  let count = 0;
  for (const doc of snapshot.docs) {
    if (doc.id.startsWith("e2e-isolated-")) {
      batch.delete(doc.ref);
      count++;
    }
  }
  if (count > 0) {
    await batch.commit();
  }
}

/**
 * Deterministically resets the events collection to pristine baseline state by
 * purging any test-isolated events and re-seeding the approved fixtures.
 */
export async function resetEventFixtures() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[resetEventFixtures] Refusing to run outside emulator environment.");
  }
  await cleanupIsolatedEvents();
  await seedEvents(db);
}

/**
 * Updates or sets a user's role and status within a community.
 *
 * @param {string} communityId
 * @param {string} userId
 * @param {string} role
 * @param {string} [status="active"]
 */
export async function setCommunityMemberRole(communityId, userId, role, status = "active") {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[setCommunityMemberRole] Refusing to run outside emulator environment.");
  }
  const memberId = `${communityId}_${userId}`;
  await db.collection("communityMembers").doc(memberId).set(
    {
      id: memberId,
      communityId,
      userId,
      campusId: "apex-university",
      role,
      status,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Removes a community membership document.
 *
 * @param {string} communityId
 * @param {string} userId
 */
export async function removeCommunityMember(communityId, userId) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[removeCommunityMember] Refusing to run outside emulator environment.");
  }
  const memberId = `${communityId}_${userId}`;
  await db.collection("communityMembers").doc(memberId).delete();
}

/**
 * Restores community membership documents to their approved baseline state.
 */
export async function restoreCommunityMembers() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[restoreCommunityMembers] Refusing to run outside emulator environment.");
  }
  const snap = await db.collection("communityMembers").get();
  const baselineIds = new Set(COMMUNITY_MEMBER_LIST.map((m) => m.id));
  const batch = db.batch();
  for (const doc of snap.docs) {
    if (!baselineIds.has(doc.id)) {
      batch.delete(doc.ref);
    }
  }
  await batch.commit();
  await seedCommunityMembers(db);
}

/**
 * Cleans up any delivery ledgers and user notifications related to a given event.
 *
 * @param {string} eventId
 * @param {string[]} [userIds=[]]
 */
export async function cleanupEventNotifications(eventId, userIds = []) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[cleanupEventNotifications] Refusing to run outside emulator environment.");
  }
  if (!eventId) return;

  // 1. Delete delivery ledger
  await db.collection("eventNotificationDeliveries").doc(eventId).delete();

  // 2. Clean notifications for specified users
  for (const uid of userIds) {
    const querySnap = await db
      .collection("users")
      .doc(uid)
      .collection("notifications")
      .where("referenceId", "==", eventId)
      .get();
    if (!querySnap.empty) {
      const batch = db.batch();
      querySnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

/**
 * Updates a user's notification preferences directly in Firestore for deterministic E2E setup.
 *
 * @param {string} userId
 * @param {object} prefs
 */
export async function setUserPreferences(userId, prefs) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[setUserPreferences] Refusing to run outside emulator environment.");
  }
  await db.collection("users").doc(userId).set(
    {
      notificationPreferences: prefs,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Resets user preferences to the default all-enabled state.
 *
 * @param {string} userId
 */
export async function resetUserPreferences(userId) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[resetUserPreferences] Refusing to run outside emulator environment.");
  }
  await setUserPreferences(userId, {
    connectionRequests: true,
    connectionAccepted: true,
    eventRsvps: true,
    eventCancellations: true,
  });
}

/**
 * Deletes all notifications for a given user.
 *
 * @param {string} userId
 */
export async function clearUserNotifications(userId) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("[clearUserNotifications] Refusing to run outside emulator environment.");
  }
  const snap = await db.collection("users").doc(userId).collection("notifications").get();
  if (!snap.empty) {
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}
