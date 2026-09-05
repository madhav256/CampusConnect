import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { fetchAllUsers, fetchUserById } from "../services/userService";

/**
 * Checks if an error thrown by Firebase corresponds to a security permission denial.
 *
 * @param {any} err
 * @returns {boolean}
 */
function isPermissionDenied(err) {
  if (!err) return false;
  const code = err.code || "";
  const msg = (err.message || "").toLowerCase();
  return (
    code === "permission-denied" ||
    msg.includes("permission-denied") ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("insufficient permissions")
  );
}

/**
 * Runs development-only security validation tests for Milestone 8 Firestore rules.
 *
 * Tests the 4 required unauthorized operations:
 * 1. Create a notification with a fake actor profile.
 * 2. Read another user's notification.
 * 3. Modify a notification field other than isRead.
 * 4. Create a notification without the corresponding connection transaction.
 *
 * @param {string} currentUid - Authenticated user's UID
 * @param {string} [existingNotificationId] - Optional existing notification ID for update test
 * @returns {Promise<Array<{
 *   id: number,
 *   title: string,
 *   description: string,
 *   passed: boolean,
 *   blocked: boolean,
 *   code: string,
 *   message: string
 * }>>}
 */
export async function runMilestone8SecurityTests(currentUid, existingNotificationId = null) {
  if (!currentUid) {
    throw new Error("Cannot run security tests without an authenticated user UID.");
  }

  const results = [];

  // Find or determine a target user UID (another user in the system)
  let targetUid = "security_victim_test_uid_999";
  try {
    const allUsers = await fetchAllUsers(10);
    const otherUser = allUsers.find((u) => u.uid && u.uid !== currentUid);
    if (otherUser) {
      targetUid = otherUser.uid;
    }
  } catch {
    // Fallback to dummy target UID if users cannot be listed
  }

  // Fetch actor's actual profile to construct accurate baseline tests
  const currentProfile = await fetchUserById(currentUid).catch(() => ({
    displayName: "CampusConnect Student",
    photoURL: null,
  }));

  console.group("🛡️ Running Milestone 8 Firestore Security Rules Audit");
  console.log("Current Auth UID:", currentUid);
  console.log("Target User UID:", targetUid);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Create a notification with a fake actor profile
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const testDocId = `test_fake_profile_${Date.now()}`;
    const fakeConnId = [currentUid, targetUid].sort().join("_");
    const connRef = doc(db, "connections", fakeConnId);
    const notifRef = doc(db, "users", targetUid, "notifications", `req_${fakeConnId}`);

    await runTransaction(db, async (transaction) => {
      // Attempt to write connection + notification with forged actorName
      transaction.set(connRef, {
        users: [currentUid, targetUid].sort(),
        senderId: currentUid,
        receiverId: targetUid,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      transaction.set(notifRef, {
        id: `req_${fakeConnId}`,
        recipientId: targetUid,
        actorId: currentUid,
        actorName: "FORGED_IMPERSONATOR_NAME_" + testDocId, // Deliberate forgery
        actorAvatar: "https://attacker-site.com/fake.png",
        type: "connection_request",
        referenceId: fakeConnId,
        isRead: false,
        createdAt: serverTimestamp(),
      });
    });

    // If transaction succeeded, security test failed!
    results.push({
      id: 1,
      title: "Create notification with fake actor profile",
      description: "Attempts atomic creation with forged actorName and spoofed avatar URL",
      passed: false,
      blocked: false,
      code: "SUCCESS_UNEXPECTED",
      message: "VULNERABILITY: Write succeeded with a forged actor profile.",
    });
  } catch (err) {
    const blocked = isPermissionDenied(err);
    results.push({
      id: 1,
      title: "Create notification with fake actor profile",
      description: "Attempts atomic creation with forged actorName and spoofed avatar URL",
      passed: blocked,
      blocked,
      code: err.code || "error",
      message: blocked
        ? "Correctly rejected: Firestore rules blocked forged actor profile."
        : `Unexpected failure: ${err.message}`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Read another user's notification
  // ───────────────────────────────────────────────────────────────────────────
  try {
    // Attempt list query on target user's notification subcollection
    const otherUserNotifCol = collection(db, "users", targetUid, "notifications");
    const snapshot = await getDocs(query(otherUserNotifCol, limit(5)));

    results.push({
      id: 2,
      title: "Read another user's notification",
      description: "Attempts list query on target user's notifications subcollection",
      passed: false,
      blocked: false,
      code: "SUCCESS_UNEXPECTED",
      message: `VULNERABILITY: Read succeeded! Fetched ${snapshot.docs.length} docs from another user.`,
    });
  } catch (err) {
    const blocked = isPermissionDenied(err);
    results.push({
      id: 2,
      title: "Read another user's notification",
      description: "Attempts list query on target user's notifications subcollection",
      passed: blocked,
      blocked,
      code: err.code || "error",
      message: blocked
        ? "Correctly rejected: Firestore rules blocked unauthorized notification listing."
        : `Unexpected failure: ${err.message}`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Modify a notification field other than isRead
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const targetNotifId = existingNotificationId || "test_notif_field_tamper";
    const myNotifRef = doc(db, "users", currentUid, "notifications", targetNotifId);

    // Attempt to tamper with actorName or type (only isRead should be mutable)
    await updateDoc(myNotifRef, {
      actorName: "TAMPERED_ACTOR_NAME",
    });

    results.push({
      id: 3,
      title: "Modify notification field other than isRead",
      description: "Attempts to update 'actorName' on a notification document",
      passed: false,
      blocked: false,
      code: "SUCCESS_UNEXPECTED",
      message: "VULNERABILITY: Update to immutable field 'actorName' succeeded.",
    });
  } catch (err) {
    const blocked = isPermissionDenied(err);
    results.push({
      id: 3,
      title: "Modify notification field other than isRead",
      description: "Attempts to update 'actorName' on a notification document",
      passed: blocked,
      blocked,
      code: err.code || "error",
      message: blocked
        ? "Correctly rejected: Firestore rules blocked update to field outside ['isRead']."
        : `Unexpected failure: ${err.message}`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Create a notification without corresponding connection transaction
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const orphanId = `orphan_${Date.now()}`;
    const orphanNotifRef = doc(db, "users", targetUid, "notifications", `req_${orphanId}`);

    // Direct setDoc without any connection document created
    await setDoc(orphanNotifRef, {
      id: `req_${orphanId}`,
      recipientId: targetUid,
      actorId: currentUid,
      actorName: currentProfile?.displayName || "CampusConnect Student",
      actorAvatar: currentProfile?.photoURL || null,
      type: "connection_request",
      referenceId: orphanId,
      isRead: false,
      createdAt: serverTimestamp(),
    });

    results.push({
      id: 4,
      title: "Create notification without connection transaction",
      description: "Attempts standalone setDoc without atomic connection creation",
      passed: false,
      blocked: false,
      code: "SUCCESS_UNEXPECTED",
      message: "VULNERABILITY: Standalone notification creation succeeded without connection transaction.",
    });
  } catch (err) {
    const blocked = isPermissionDenied(err);
    results.push({
      id: 4,
      title: "Create notification without connection transaction",
      description: "Attempts standalone setDoc without atomic connection creation",
      passed: blocked,
      blocked,
      code: err.code || "error",
      message: blocked
        ? "Correctly rejected: Firestore rules blocked notification lacking atomic connection state."
        : `Unexpected failure: ${err.message}`,
    });
  }

  console.table(
    results.map((r) => ({
      Test: r.title,
      Status: r.passed ? "✅ BLOCKED (PASS)" : "❌ FAILED",
      Code: r.code,
      Details: r.message,
    }))
  );
  console.groupEnd();

  return results;
}

// Attach to window in development mode for easy DevTools execution
if (typeof window !== "undefined" && import.meta.env.DEV) {
  window.__runSecurityTests = async () => {
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();
    if (!auth.currentUser) {
      console.warn("Please log in before running __runSecurityTests()");
      return;
    }
    return runMilestone8SecurityTests(auth.currentUser.uid);
  };
}
