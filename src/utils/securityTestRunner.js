import { initializeApp, deleteApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db, firebaseConfig } from "../firebase/config";
import { fetchAllUsers, fetchUserById } from "../services/userService";

// Explicit DEV-only runtime safety guard: Never permit execution in production builds
if (!import.meta.env.DEV) {
  throw new Error("Security test runner cannot run in production builds.");
}


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

/**
 * Runs development-only security validation tests for Milestone 9 Settings & User rules.
 *
 * Uses an isolated secondary Firebase App and disposable Auth user so the real user's
 * document and session are NEVER touched or mutated under any circumstances.
 *
 * Tests the 5 required unauthorized operations:
 * 1. A attempting to update B's settings -> should be permission-denied.
 * 2. A attempting to change their own email -> rejected.
 * 3. A attempting to change their own UID -> rejected.
 * 4. A attempting to change createdAt or inject something like role: "admin" -> rejected.
 * 5. A attempting to submit invalid types such as isDiscoverable: "false" -> rejected.
 *
 * @param {string} currentUid - Authenticated primary user's UID (actor for cross-user test #1)
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
export async function runMilestone9SecurityTests(currentUid) {
  if (!currentUid) {
    throw new Error("Cannot run security tests without an authenticated user UID.");
  }

  const results = [];
  const cleanupReports = [];

  // Generate unique run identifier on every run
  const runTimestamp = Date.now();
  const runRandom = Math.random().toString(36).substring(2, 8);
  const appName = `ephemeral-audit-${runTimestamp}-${runRandom}`;
  const ephemeralEmail = `audit-${runTimestamp}-${runRandom}@disposable.local`;
  const ephemeralPassword = `AuditPass!_${runTimestamp}_${runRandom}`;

  let ephemeralApp = null;
  let ephemeralDb = null;
  let ephemeralUser = null;
  let ephemeralUid = null;

  console.group(`🛡️ Running Milestone 9 Firestore Security Rules Audit (Disposable Isolated Target: ${appName})`);
  console.log("Primary Auth UID (Active User, NEVER MUTATED):", currentUid);
  console.log("Disposable Test Identity:", ephemeralEmail);

  try {
    // 1. Initialize secondary isolated Firebase App
    ephemeralApp = initializeApp(firebaseConfig, appName);
    const ephemeralAuth = getAuth(ephemeralApp);
    ephemeralDb = getFirestore(ephemeralApp);

    // 2. Create isolated disposable auth user
    const cred = await createUserWithEmailAndPassword(
      ephemeralAuth,
      ephemeralEmail,
      ephemeralPassword
    );
    ephemeralUser = cred.user;
    ephemeralUid = ephemeralUser.uid;
    console.log("Disposable User Created with UID:", ephemeralUid);

    // Helper to ensure the disposable document is deleted and re-seeded with a fresh baseline
    const resetBaseline = async () => {
      const disposableDocRef = doc(ephemeralDb, "users", ephemeralUid);
      try {
        await deleteDoc(disposableDocRef);
      } catch {
        // Document might not exist prior to the first test seed
      }

      await setDoc(disposableDocRef, {
        uid: ephemeralUid,
        email: ephemeralEmail,
        displayName: "Disposable Test Student",
        photoURL: null,
        bio: "Ephemeral test bio",
        department: "Computer Science",
        year: "3rd",
        skills: ["Testing"],
        socialLinks: {},
        isDiscoverable: true,
        notificationPreferences: {
          connectionRequests: true,
          connectionAccepted: true,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Primary user (A) attempting to update Disposable user (B)'s settings
    // ─────────────────────────────────────────────────────────────────────────
    try {
      await resetBaseline();
      // Use primary app's db (currentUid auth context) attempting to write to disposable user's doc
      const targetDocRef = doc(db, "users", ephemeralUid);
      await updateDoc(targetDocRef, {
        isDiscoverable: false,
      });

      results.push({
        id: 1,
        title: "A attempting to update B's settings",
        description: "Primary user attempts cross-user update on disposable User B's document",
        passed: false,
        blocked: false,
        code: "SUCCESS_UNEXPECTED",
        message: "VULNERABILITY: User A succeeded in mutating User B's settings.",
      });
    } catch (err) {
      const blocked = isPermissionDenied(err);
      results.push({
        id: 1,
        title: "A attempting to update B's settings",
        description: "Primary user attempts cross-user update on disposable User B's document",
        passed: blocked,
        blocked,
        code: err.code || "error",
        message: blocked
          ? "Correctly rejected: Firestore rules blocked cross-user settings update (permission-denied)."
          : `Unexpected failure: ${err.message}`,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Disposable user attempting to change their own email
    // ─────────────────────────────────────────────────────────────────────────
    try {
      await resetBaseline();
      const disposableDocRef = doc(ephemeralDb, "users", ephemeralUid);
      await updateDoc(disposableDocRef, {
        email: `spoofed_email_${Date.now()}@attacker.com`,
      });

      results.push({
        id: 2,
        title: "A attempting to change own email",
        description: "Disposable user attempts to overwrite immutable 'email' field on own document",
        passed: false,
        blocked: false,
        code: "SUCCESS_UNEXPECTED",
        message: "VULNERABILITY: User was able to mutate immutable email field.",
      });
    } catch (err) {
      const blocked = isPermissionDenied(err);
      results.push({
        id: 2,
        title: "A attempting to change own email",
        description: "Disposable user attempts to overwrite immutable 'email' field on own document",
        passed: blocked,
        blocked,
        code: err.code || "error",
        message: blocked
          ? "Correctly rejected: Firestore rules enforced email immutability."
          : `Unexpected failure: ${err.message}`,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Disposable user attempting to change their own UID
    // ─────────────────────────────────────────────────────────────────────────
    try {
      await resetBaseline();
      const disposableDocRef = doc(ephemeralDb, "users", ephemeralUid);
      await updateDoc(disposableDocRef, {
        uid: `spoofed_uid_${Date.now()}`,
      });

      results.push({
        id: 3,
        title: "A attempting to change own UID",
        description: "Disposable user attempts to overwrite immutable 'uid' field on own document",
        passed: false,
        blocked: false,
        code: "SUCCESS_UNEXPECTED",
        message: "VULNERABILITY: User was able to mutate immutable uid field.",
      });
    } catch (err) {
      const blocked = isPermissionDenied(err);
      results.push({
        id: 3,
        title: "A attempting to change own UID",
        description: "Disposable user attempts to overwrite immutable 'uid' field on own document",
        passed: blocked,
        blocked,
        code: err.code || "error",
        message: blocked
          ? "Correctly rejected: Firestore rules enforced UID immutability."
          : `Unexpected failure: ${err.message}`,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Disposable user attempting to change createdAt or inject role: "admin"
    // ─────────────────────────────────────────────────────────────────────────
    try {
      await resetBaseline();
      const disposableDocRef = doc(ephemeralDb, "users", ephemeralUid);
      await updateDoc(disposableDocRef, {
        role: "admin",
        createdAt: serverTimestamp(),
      });

      results.push({
        id: 4,
        title: "A attempting to mutate createdAt or inject role: 'admin'",
        description: "Disposable user attempts unauthorized field injection ('role') and mutation of 'createdAt'",
        passed: false,
        blocked: false,
        code: "SUCCESS_UNEXPECTED",
        message: "VULNERABILITY: Arbitrary property injection or createdAt mutation succeeded.",
      });
    } catch (err) {
      const blocked = isPermissionDenied(err);
      results.push({
        id: 4,
        title: "A attempting to mutate createdAt or inject role: 'admin'",
        description: "Disposable user attempts unauthorized field injection ('role') and mutation of 'createdAt'",
        passed: blocked,
        blocked,
        code: err.code || "error",
        message: blocked
          ? "Correctly rejected: Firestore rules enforced allowed keys whitelist and createdAt immutability."
          : `Unexpected failure: ${err.message}`,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Disposable user attempting to submit invalid types such as isDiscoverable: "false"
    // ─────────────────────────────────────────────────────────────────────────
    try {
      await resetBaseline();
      const disposableDocRef = doc(ephemeralDb, "users", ephemeralUid);
      await updateDoc(disposableDocRef, {
        isDiscoverable: "false", // String literal instead of boolean
      });

      results.push({
        id: 5,
        title: "A attempting to submit invalid types (isDiscoverable: 'false')",
        description: "Disposable user attempts to update boolean field with string literal 'false'",
        passed: false,
        blocked: false,
        code: "SUCCESS_UNEXPECTED",
        message: "VULNERABILITY: Type constraint bypassed; string accepted for boolean field.",
      });
    } catch (err) {
      const blocked = isPermissionDenied(err);
      results.push({
        id: 5,
        title: "A attempting to submit invalid types (isDiscoverable: 'false')",
        description: "Disposable user attempts to update boolean field with string literal 'false'",
        passed: blocked,
        blocked,
        code: err.code || "error",
        message: blocked
          ? "Correctly rejected: Firestore rules enforced boolean type constraint on isDiscoverable."
          : `Unexpected failure: ${err.message}`,
      });
    }
  } catch (setupErr) {
    console.error("Setup error in disposable security test suite:", setupErr);
    results.push({
      id: 0,
      title: "Disposable test environment setup",
      description: "Initializes secondary Firebase App and disposable test user",
      passed: false,
      blocked: false,
      code: setupErr.code || "SETUP_ERROR",
      message: `Failed to initialize disposable test environment: ${setupErr.message}`,
    });
  } finally {
    // ─────────────────────────────────────────────────────────────────────────
    // EXPLICIT TEARDOWN REPORTING (NO SILENT CATCH)
    // ─────────────────────────────────────────────────────────────────────────
    console.group("🧹 Disposable Environment Teardown");

    // 1. Delete disposable Firestore document
    if (ephemeralDb && ephemeralUid) {
      try {
        await deleteDoc(doc(ephemeralDb, "users", ephemeralUid));
        cleanupReports.push({
          resource: "Firestore Document",
          target: `/users/${ephemeralUid}`,
          success: true,
          message: "Deleted successfully",
        });
        console.log(`✅ [CLEANUP] Deleted disposable Firestore document /users/${ephemeralUid}`);
      } catch (docErr) {
        const warnMsg = `CLEANUP WARNING: Failed to delete disposable Firestore document /users/${ephemeralUid}: ${docErr.message}`;
        console.warn(`⚠️ ${warnMsg}`);
        cleanupReports.push({
          resource: "Firestore Document",
          target: `/users/${ephemeralUid}`,
          success: false,
          message: warnMsg,
        });
      }
    }

    // 2. Delete disposable Firebase Auth user
    if (ephemeralUser) {
      try {
        await deleteUser(ephemeralUser);
        cleanupReports.push({
          resource: "Firebase Auth User",
          target: ephemeralEmail,
          success: true,
          message: "Deleted successfully",
        });
        console.log(`✅ [CLEANUP] Deleted disposable Auth user ${ephemeralEmail}`);
      } catch (authErr) {
        const warnMsg = `CLEANUP WARNING: Failed to delete disposable Auth user ${ephemeralEmail}: ${authErr.message}`;
        console.warn(`⚠️ ${warnMsg}`);
        cleanupReports.push({
          resource: "Firebase Auth User",
          target: ephemeralEmail,
          success: false,
          message: warnMsg,
        });
      }
    }

    // 3. Delete secondary Firebase App
    if (ephemeralApp) {
      try {
        await deleteApp(ephemeralApp);
        cleanupReports.push({
          resource: "Secondary Firebase App",
          target: appName,
          success: true,
          message: "Deleted successfully",
        });
        console.log(`✅ [CLEANUP] Deleted secondary Firebase app ${appName}`);
      } catch (appErr) {
        const warnMsg = `CLEANUP WARNING: Failed to delete secondary Firebase app ${appName}: ${appErr.message}`;
        console.warn(`⚠️ ${warnMsg}`);
        cleanupReports.push({
          resource: "Secondary Firebase App",
          target: appName,
          success: false,
          message: warnMsg,
        });
      }
    }

    console.groupEnd();
  }

  // Attach cleanup reports to result array
  results.cleanup = cleanupReports;

  console.table(
    results.map((r) => ({
      Test: r.title,
      Status: r.passed ? "✅ BLOCKED (PASS)" : "❌ FAILED",
      Code: r.code,
      Details: r.message,
    }))
  );
  if (cleanupReports.some((c) => !c.success)) {
    console.warn("⚠️ Cleanup Warnings Encountered:", cleanupReports.filter((c) => !c.success));
  } else {
    console.log("✅ All disposable resources cleaned up successfully.");
  }
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

  window.__runSettingsSecurityTests = async () => {
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();
    if (!auth.currentUser) {
      console.warn("Please log in before running __runSettingsSecurityTests()");
      return;
    }
    return runMilestone9SecurityTests(auth.currentUser.uid);
  };
}
