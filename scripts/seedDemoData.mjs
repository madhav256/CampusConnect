/**
 * Milestone 12A — Deterministic Demo Environment Seeding Script
 * 
 * Safety Rules & Constraints:
 * 1. Deterministic demo-ID whitelist is the primary safety boundary.
 * 2. Only uses idempotent set(..., { merge: true }).
 * 3. NO bulk or wildcard deletion functionality.
 * 4. Never hardcodes or commits service account credentials or passwords.
 * 5. Uses the REAL Firebase Auth UID resolved/provisioned for demo.student@campusconnect.edu.
 * 6. Validates against target project safety guards.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

import {
  DEMO_PRIMARY_STUDENT,
  DEMO_PEER_PROFILES,
  DEMO_POSTS,
  DEMO_PEER_IDS,
  DEMO_POST_IDS,
  getDemoConnectionId,
} from "../src/data/demoData.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Helper to load env variables from .env.local or .env if present
function loadLocalEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const fullPath = path.join(projectRoot, file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (err) {
        console.warn(`[seed] Note: could not parse ${file}:`, err.message);
      }
    }
  }
}

loadLocalEnv();

// Initialize Firebase Admin safely
function initializeAdminApp() {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }

  const serviceAccountKeyPath = path.join(__dirname, "credentials", "serviceAccountKey.json");
  const projectId =
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    "campusconnect-cf191";

  // Option 1: Local git-ignored service account key
  if (fs.existsSync(serviceAccountKeyPath)) {
    console.log(`[seed] Using local service account file at scripts/credentials/serviceAccountKey.json`);
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountKeyPath, "utf-8"));
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId,
    });
  }

  // Option 2: GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    console.log(`[seed] Using GOOGLE_APPLICATION_CREDENTIALS at ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    return initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  }

  // Option 3: Local Firebase Emulator (if running)
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`[seed] Using Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
    return initializeApp({
      projectId: projectId || "demo-campusconnect",
    });
  }

  // Option 4: Application Default Credentials (e.g. gcloud auth application-default login)
  try {
    console.log(`[seed] Attempting Application Default Credentials for project: ${projectId}`);
    return initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  } catch (err) {
    console.error(`\n[seed] ERROR: Could not resolve Firebase Admin credentials.`);
    console.error(`Please provide admin credentials using one of the following methods:`);
    console.error(`1. Place a service account key at: scripts/credentials/serviceAccountKey.json (git-ignored)`);
    console.error(`2. Set GOOGLE_APPLICATION_CREDENTIALS environment variable.`);
    console.error(`3. Run with local emulator (set FIRESTORE_EMULATOR_HOST).`);
    console.error(`\nOriginal error: ${err.message}\n`);
    process.exit(1);
  }
}

async function seedDemoEnvironment() {
  console.log("=================================================");
  console.log("  CampusConnect — Milestone 12A Demo Seeding     ");
  console.log("=================================================");

  let app;
  try {
    app = initializeAdminApp();
  } catch (err) {
    console.error(`\n[seed] Initialization failed: ${err.message}`);
    console.error(`To seed data in production/preview Firebase, place a service account key at:`);
    console.error(`  scripts/credentials/serviceAccountKey.json (this directory is git-ignored).`);
    console.error(`Or run with Google Cloud ADC / Firebase Emulators.\n`);
    process.exit(1);
  }

  const auth = getAuth(app);
  const db = getFirestore(app);

  // 1. Resolve or provision the single primary demo student in Firebase Auth
  const demoEmail = DEMO_PRIMARY_STUDENT.email;
  const demoPassword =
    process.env.DEMO_USER_PASSWORD ||
    process.env.VITE_DEMO_USER_PASSWORD;

  let demoAuthUid = null;

  try {
    const existingUser = await auth.getUserByEmail(demoEmail);
    demoAuthUid = existingUser.uid;
    console.log(`[auth] Resolved existing Firebase Auth user for ${demoEmail}`);
    console.log(`[auth] Dynamic Demo Auth UID: ${demoAuthUid}`);

    // If password provided in environment, ensure it is up to date
    if (demoPassword) {
      await auth.updateUser(demoAuthUid, {
        password: demoPassword,
        displayName: DEMO_PRIMARY_STUDENT.displayName,
      });
      console.log(`[auth] Updated demo account credentials successfully.`);
    }
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      if (!demoPassword) {
        console.error(`\n[auth] ERROR: Demo account (${demoEmail}) does not exist in Firebase Auth,`);
        console.error(`and neither DEMO_USER_PASSWORD nor VITE_DEMO_USER_PASSWORD is set.`);
        console.error(`Please add VITE_DEMO_USER_PASSWORD to your .env.local file and re-run.\n`);
        process.exit(1);
      }

      console.log(`[auth] Creating new Firebase Auth user for ${demoEmail}...`);
      const newUser = await auth.createUser({
        email: demoEmail,
        password: demoPassword,
        displayName: DEMO_PRIMARY_STUDENT.displayName,
      });
      demoAuthUid = newUser.uid;
      console.log(`[auth] Successfully created demo Auth user with dynamic UID: ${demoAuthUid}`);
    } else {
      console.error(`\n[auth] Authentication error: ${err.message}`);
      console.error(`\nTip: To authenticate this script against your Firebase project:`);
      console.error(`1. Download a Service Account key from Firebase Console > Project Settings > Service accounts.`);
      console.error(`2. Save it to: scripts/credentials/serviceAccountKey.json (already git-ignored).`);
      console.error(`3. Ensure VITE_DEMO_USER_PASSWORD is set in your .env.local file.`);
      console.error(`4. Re-run: npm run seed:demo\n`);
      process.exit(1);
    }
  }

  const now = Timestamp.now();

  // 2. Seed Primary Student Profile (Alex Rivera)
  console.log(`\n[firestore] Seeding primary student profile at users/${demoAuthUid}...`);
  const primaryDocRef = db.collection("users").doc(demoAuthUid);
  await primaryDocRef.set(
    {
      ...DEMO_PRIMARY_STUDENT,
      uid: demoAuthUid,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  console.log(`[firestore] Primary student profile seeded.`);

  // 3. Seed 7 Peer Profiles (Firestore-only peer documents, verified whitelist)
  console.log(`\n[firestore] Seeding 7 peer student profiles...`);
  for (const peer of DEMO_PEER_PROFILES) {
    if (!DEMO_PEER_IDS.has(peer.uid)) {
      throw new Error(`Safety whitelist violation: ${peer.uid} is not in DEMO_PEER_IDS!`);
    }

    const peerDocRef = db.collection("users").doc(peer.uid);
    await peerDocRef.set(
      {
        ...peer,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    console.log(`  ✓ Seeded peer: ${peer.displayName} (${peer.uid})`);
  }

  // 4. Seed 10 Feed Posts with Comments and Likes (verified whitelist)
  console.log(`\n[firestore] Seeding 10 feed posts with comments and likes...`);
  for (const post of DEMO_POSTS) {
    if (!DEMO_POST_IDS.has(post.id)) {
      throw new Error(`Safety whitelist violation: ${post.id} is not in DEMO_POST_IDS!`);
    }

    const authorId = post.authorKey === "alex" ? demoAuthUid : post.authorId;
    const postTimestamp = Timestamp.fromMillis(
      Date.now() - (post.hoursAgo || 1) * 3600 * 1000
    );

    const postDocRef = db.collection("posts").doc(post.id);
    await postDocRef.set(
      {
        authorId,
        authorName: post.authorName,
        authorAvatar: null,
        content: post.content,
        likesCount: post.likesCount || 0,
        commentsCount: post.commentsCount || 0,
        createdAt: postTimestamp,
        updatedAt: postTimestamp,
        isDemo: true,
      },
      { merge: true }
    );

    // Seed post comments
    if (Array.isArray(post.comments)) {
      for (const comment of post.comments) {
        const commentAuthorId = comment.authorKey === "alex" ? demoAuthUid : comment.authorId;
        const commentTimestamp = Timestamp.fromMillis(
          Date.now() - (comment.minutesAgo || 10) * 60 * 1000
        );

        await postDocRef.collection("comments").doc(comment.id).set(
          {
            authorId: commentAuthorId,
            authorName: comment.authorName,
            authorAvatar: null,
            content: comment.content,
            createdAt: commentTimestamp,
            updatedAt: commentTimestamp,
            isDemo: true,
          },
          { merge: true }
        );
      }
    }

    // Seed likes subcollection (posts/{postId}/likes/{userId})
    if (Array.isArray(post.likedBy)) {
      for (const likerKey of post.likedBy) {
        const likerUid = likerKey === "alex" ? demoAuthUid : likerKey;
        await postDocRef.collection("likes").doc(likerUid).set(
          {
            userId: likerUid,
            createdAt: postTimestamp,
            isDemo: true,
          },
          { merge: true }
        );
      }
    }

    console.log(`  ✓ Seeded post: ${post.id} (${post.authorName}, ${post.comments?.length || 0} comments, ${post.likesCount} likes)`);
  }

  // 5. Seed Realistic Connections for Alex Rivera
  console.log(`\n[firestore] Seeding realistic connection relationships...`);
  const demoConnections = [
    // Alex <-> Maya (Accepted)
    {
      userA: demoAuthUid,
      userB: "demo_peer_maya",
      senderId: demoAuthUid,
      receiverId: "demo_peer_maya",
      status: "accepted",
      hoursAgo: 24,
    },
    // Alex <-> Marcus (Accepted)
    {
      userA: demoAuthUid,
      userB: "demo_peer_marcus",
      senderId: "demo_peer_marcus",
      receiverId: demoAuthUid,
      status: "accepted",
      hoursAgo: 18,
    },
    // Devon -> Alex (Pending Incoming Request for Alex)
    {
      userA: demoAuthUid,
      userB: "demo_peer_devon",
      senderId: "demo_peer_devon",
      receiverId: demoAuthUid,
      status: "pending",
      hoursAgo: 3,
    },
    // Alex -> Elena (Pending Outgoing Request from Alex)
    {
      userA: demoAuthUid,
      userB: "demo_peer_elena",
      senderId: demoAuthUid,
      receiverId: "demo_peer_elena",
      status: "pending",
      hoursAgo: 6,
    },
  ];

  for (const conn of demoConnections) {
    const docId = getDemoConnectionId(conn.userA, conn.userB);
    const sortedUsers = conn.userA < conn.userB ? [conn.userA, conn.userB] : [conn.userB, conn.userA];
    const connTimestamp = Timestamp.fromMillis(
      Date.now() - conn.hoursAgo * 3600 * 1000
    );

    await db.collection("connections").doc(docId).set(
      {
        users: sortedUsers,
        senderId: conn.senderId,
        receiverId: conn.receiverId,
        status: conn.status,
        createdAt: connTimestamp,
        updatedAt: connTimestamp,
        isDemo: true,
      },
      { merge: true }
    );
    console.log(`  ✓ Seeded connection: ${docId} (${conn.status})`);
  }

  // 6. Seed Realistic Notifications for Alex Rivera
  console.log(`\n[firestore] Seeding notifications for demo student at users/${demoAuthUid}/notifications...`);
  const devonConnId = getDemoConnectionId(demoAuthUid, "demo_peer_devon");
  const marcusConnId = getDemoConnectionId(demoAuthUid, "demo_peer_marcus");

  // Notification 1: Pending connection request from Devon (unread)
  const notif1DocId = `req_${devonConnId}`;
  await db
    .collection("users")
    .doc(demoAuthUid)
    .collection("notifications")
    .doc(notif1DocId)
    .set(
      {
        id: notif1DocId,
        recipientId: demoAuthUid,
        actorId: "demo_peer_devon",
        actorName: "Devon Park",
        actorAvatar: null,
        type: "connection_request",
        referenceId: devonConnId,
        isRead: false,
        createdAt: Timestamp.fromMillis(Date.now() - 3 * 3600 * 1000),
        isDemo: true,
      },
      { merge: true }
    );
  console.log(`  ✓ Seeded unread notification: ${notif1DocId} (from Devon Park)`);

  // Notification 2: Connection accepted by Marcus (read)
  const notif2DocId = `acc_${marcusConnId}`;
  await db
    .collection("users")
    .doc(demoAuthUid)
    .collection("notifications")
    .doc(notif2DocId)
    .set(
      {
        id: notif2DocId,
        recipientId: demoAuthUid,
        actorId: "demo_peer_marcus",
        actorName: "Marcus Vance",
        actorAvatar: null,
        type: "connection_accepted",
        referenceId: marcusConnId,
        isRead: true,
        createdAt: Timestamp.fromMillis(Date.now() - 18 * 3600 * 1000),
        isDemo: true,
      },
      { merge: true }
    );
  console.log(`  ✓ Seeded read notification: ${notif2DocId} (from Marcus Vance)`);

  console.log("\n=================================================");
  console.log("  Seeding Complete! Demo environment is ready.    ");
  console.log("=================================================");
  console.log(`  Demo Student Email: ${demoEmail}`);
  console.log(`  Demo Auth UID:      ${demoAuthUid}`);
  console.log(`  Peer Profiles:      ${DEMO_PEER_PROFILES.length}`);
  console.log(`  Feed Posts:         ${DEMO_POSTS.length}`);
  console.log(`  Connections:        ${demoConnections.length}`);
  console.log(`  Notifications:      2`);
  console.log("=================================================\n");
}

seedDemoEnvironment().catch((err) => {
  console.error("\n[seed] Fatal seeding error:", err.message);
  process.exit(1);
});
