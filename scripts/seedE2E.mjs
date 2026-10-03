/**
 * Milestone 17 — Dedicated E2E Test Seeding Script
 *
 * Seeds deterministic authentication accounts and initial Firestore documents
 * into the local Firebase Emulators for Playwright E2E browser testing.
 * Refuses to run against production.
 */

import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { E2E_USERS } from "../tests/e2e/fixtures/testUsers.js";
import { seedCampuses } from "./seedCampuses.mjs";
import { seedCommunities } from "./seedCommunities.mjs";
import { seedCommunityMembers } from "./seedCommunityMembers.mjs";
import { seedEvents } from "./seedEvents.mjs";

const EMULATOR_PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-campusconnect-rules-test";

// Guard: Ensure we target emulators only
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
}

if (
  EMULATOR_PROJECT_ID.includes("campusconnect-cf191") &&
  !process.env.FIRESTORE_EMULATOR_HOST
) {
  console.error("FATAL: Refusing to seed production database.");
  process.exit(1);
}

const existingApps = getApps();
const existingApp = existingApps.find((a) => a.name === "e2e-seeder");
const app = existingApp || initializeApp({ projectId: EMULATOR_PROJECT_ID }, "e2e-seeder");
const db = getFirestore(app);
const auth = getAuth(app);

const now = Timestamp.now();

export async function seedE2EData() {
  console.log(`[seedE2E] Seeding deterministic E2E data to emulator (${EMULATOR_PROJECT_ID})...`);

  // 0. Seed deterministic campuses (Milestone 18)
  await seedCampuses(db, now);

  // 1. Seed deterministic communities (Milestone 19)
  await seedCommunities(db, now);

  // 1.5 Seed deterministic community members (Milestone 19.2)
  await seedCommunityMembers(db, now);

  // 1.75 Seed deterministic events (Milestone 20)
  await seedEvents(db, now);

  // 2. Establish deterministic Auth users
  for (const user of Object.values(E2E_USERS)) {
    try {
      await auth.createUser({
        uid: user.uid,
        email: user.email,
        password: user.password,
        displayName: user.displayName,
      });
      console.log(`[seedE2E] Created auth user: ${user.email} (${user.uid})`);
    } catch (err) {
      if (err.code === "auth/uid-already-exists" || err.code === "auth/email-already-exists") {
        await auth.updateUser(user.uid, {
          password: user.password,
          displayName: user.displayName,
        });
        console.log(`[seedE2E] Updated existing auth user: ${user.email} (${user.uid})`);
      } else {
        console.warn(`[seedE2E] Auth user warning for ${user.email}:`, err.message);
      }
    }

    // 2. Seed 3-collection model: users, publicProfiles, directoryIndex
    const userCampusId = user.campusId || "apex-university";

    await db.collection("users").doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      campusId: userCampusId,
      isDiscoverable: user.isDiscoverable !== false,
      notificationPreferences: {
        connectionRequests: true,
        connectionAccepted: true,
      },
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    await db.collection("publicProfiles").doc(user.uid).set({
      uid: user.uid,
      displayName: user.displayName,
      photoURL: null,
      bio: user.bio,
      department: user.department,
      year: user.year,
      skills: user.skills,
      campusId: userCampusId,
      socialLinks: {
        github: "",
        linkedin: "",
        portfolio: "",
        website: "",
      },
    }, { merge: true });

    if (user.isDiscoverable !== false) {
      await db.collection("directoryIndex").doc(user.uid).set({
        uid: user.uid,
        displayName: user.displayName,
        photoURL: null,
        department: user.department,
        year: user.year,
        skills: user.skills,
        campusId: userCampusId,
        updatedAt: now,
      }, { merge: true });
    }
  }

  // 3. Seed baseline feed post by primary student A (Apex University)
  await db.collection("posts").doc("e2e-seed-post-1").set({
    id: "e2e-seed-post-1",
    authorId: E2E_USERS.studentA.uid,
    authorName: E2E_USERS.studentA.displayName,
    authorAvatar: null,
    campusId: "apex-university",
    content: "Welcome to the CampusConnect E2E test environment!",
    likesCount: 0,
    commentsCount: 0,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  // Baseline feed post by St. Jude student (St. Jude University)
  if (E2E_USERS.studentStJude) {
    await db.collection("posts").doc("e2e-seed-post-st-jude-1").set({
      id: "e2e-seed-post-st-jude-1",
      authorId: E2E_USERS.studentStJude.uid,
      authorName: E2E_USERS.studentStJude.displayName,
      authorAvatar: null,
      campusId: "st-jude-university",
      content: "Welcome to the St. Jude University community feed!",
      likesCount: 0,
      commentsCount: 0,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  // 3b. Seed deterministic community post by Student A in apex-ai-club (Milestone 19.3)
  await db.collection("posts").doc("e2e-seed-community-post-1").set({
    id: "e2e-seed-community-post-1",
    authorId: E2E_USERS.studentA.uid,
    authorName: E2E_USERS.studentA.displayName,
    authorAvatar: null,
    campusId: "apex-university",
    communityId: "apex-ai-club",
    content: "Welcome to the Apex AI & Robotics Society discussion thread!",
    likesCount: 0,
    commentsCount: 0,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });


  // 4. Seed deterministic relationship: Student A <-> Student B (Accepted)
  const connABId = "e2e-student-a_e2e-student-b";
  await db.collection("connections").doc(connABId).set({
    users: [E2E_USERS.studentA.uid, E2E_USERS.studentB.uid],
    senderId: E2E_USERS.studentB.uid,
    receiverId: E2E_USERS.studentA.uid,
    status: "accepted",
    campusId: "apex-university",
    createdAt: now,
    updatedAt: now,
  });

  // Seed deterministic conversation & message: Student A <-> Student B (1 unread for Student A)
  const convABRef = db.collection("conversations").doc(connABId);
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

  await convABRef.collection("messages").doc("seed-msg-ab-1").set({
    id: "seed-msg-ab-1",
    conversationId: connABId,
    senderId: E2E_USERS.studentB.uid,
    content: "Hey Alex, excited to connect on CampusConnect!",
    createdAt: now,
  });

  // 5. Seed deterministic relationship: Student B <-> Student C (Accepted, for disconnect test)
  const connBCId = "e2e-student-b_e2e-student-c";
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

  await convBCRef.collection("messages").doc("seed-msg-bc-1").set({
    id: "seed-msg-bc-1",
    conversationId: connBCId,
    senderId: E2E_USERS.studentB.uid,
    content: "Hi Casey, glad we are connected!",
    createdAt: now,
  });

  console.log("[seedE2E] Deterministic E2E data seeded successfully.");
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith("seedE2E.mjs")) {
  seedE2EData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seedE2E] Seeding failed:", err);
      process.exit(1);
    });
}
