/**
 * Milestone 14B — Local Emulator Seeding Script
 *
 * Safely seeds representative 14B data into the local Firebase Emulator.
 * Refuses to run against production.
 */

import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const EMULATOR_PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-campusconnect-rules-test";

// Guard: NEVER run against production
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
}

if (
  EMULATOR_PROJECT_ID.includes("campusconnect-cf191") &&
  !process.env.FIRESTORE_EMULATOR_HOST
) {
  console.error("FATAL: Refusing to seed production database.");
  process.exit(1);
}

const app = initializeApp({ projectId: EMULATOR_PROJECT_ID }, "emulator-seeder");
const db = getFirestore(app);
const auth = getAuth(app);

const now = Timestamp.now();

export async function seedEmulatorData() {
  console.log(`Seeding 14B representative data to emulator (${EMULATOR_PROJECT_ID})...`);

  // 1. Create or update test users in Auth emulator
  const users = [
    {
      uid: "student-a",
      email: "demo.student@campusconnect.edu",
      password: "CampusDemo2026!",
      displayName: "Alice Chen",
    },
    {
      uid: "student-b",
      email: "bob@example.test",
      password: "Password123!",
      displayName: "Bob Smith",
    },
    {
      uid: "student-c",
      email: "carol@example.test",
      password: "Password123!",
      displayName: "Carol Taylor",
    },
  ];

  for (const u of users) {
    try {
      await auth.createUser({
        uid: u.uid,
        email: u.email,
        password: u.password,
        displayName: u.displayName,
      });
      console.log(`Created auth user: ${u.email}`);
    } catch (err) {
      if (err.code === "auth/uid-already-exists" || err.code === "auth/email-already-exists") {
        console.log(`Auth user already exists: ${u.email}`);
      } else {
        console.warn(`Auth creation warning for ${u.email}:`, err.message);
      }
    }
  }

  // 2. User A: Discoverable = true
  await db.collection("users").doc("student-a").set({
    uid: "student-a",
    email: "demo.student@campusconnect.edu",
    isDiscoverable: true,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    createdAt: now,
    updatedAt: now,
  });

  await db.collection("publicProfiles").doc("student-a").set({
    uid: "student-a",
    displayName: "Alice Chen",
    photoURL: null,
    bio: "Full stack developer & open source enthusiast.",
    department: "Computer Science",
    year: "Junior",
    skills: ["React", "TypeScript", "Node.js"],
    socialLinks: {
      github: "https://github.com/alicechen",
      linkedin: "",
      portfolio: "",
      website: "",
    },
  });

  await db.collection("directoryIndex").doc("student-a").set({
    uid: "student-a",
    displayName: "Alice Chen",
    photoURL: null,
    department: "Computer Science",
    year: "Junior",
    skills: ["React", "TypeScript", "Node.js"],
    updatedAt: now,
  });

  // 3. User B: Discoverable = false (NO directoryIndex)
  await db.collection("users").doc("student-b").set({
    uid: "student-b",
    email: "bob@example.test",
    isDiscoverable: false,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: false,
    },
    createdAt: now,
    updatedAt: now,
  });

  await db.collection("publicProfiles").doc("student-b").set({
    uid: "student-b",
    displayName: "Bob Smith",
    photoURL: null,
    bio: "Researching graph neural networks.",
    department: "Data Science",
    year: "Senior",
    skills: ["Python", "Machine Learning"],
    socialLinks: {
      github: "",
      linkedin: "",
      portfolio: "",
      website: "",
    },
  });

  // Explicitly ensure NO directoryIndex for User B
  await db.collection("directoryIndex").doc("student-b").delete();

  // 4. User C: Discoverable = true
  await db.collection("users").doc("student-c").set({
    uid: "student-c",
    email: "carol@example.test",
    isDiscoverable: true,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    createdAt: now,
    updatedAt: now,
  });

  await db.collection("publicProfiles").doc("student-c").set({
    uid: "student-c",
    displayName: "Carol Taylor",
    photoURL: null,
    bio: "Design systems and HCI researcher.",
    department: "Human-Computer Interaction",
    year: "Sophomore",
    skills: ["Figma", "UI/UX", "Tailwind"],
    socialLinks: {
      github: "",
      linkedin: "",
      portfolio: "",
      website: "",
    },
  });

  await db.collection("directoryIndex").doc("student-c").set({
    uid: "student-c",
    displayName: "Carol Taylor",
    photoURL: null,
    department: "Human-Computer Interaction",
    year: "Sophomore",
    skills: ["Figma", "UI/UX", "Tailwind"],
    updatedAt: now,
  });

  // 5. Connection: student-a <-> student-b (accepted)
  await db.collection("connections").doc("student-a_student-b").set({
    id: "student-a_student-b",
    senderId: "student-b",
    receiverId: "student-a",
    status: "accepted",
    participants: ["student-a", "student-b"],
    createdAt: now,
    updatedAt: now,
  });

  // 6. Post by student-a and comment by student-b
  await db.collection("posts").doc("post-demo-1").set({
    id: "post-demo-1",
    authorId: "student-a",
    authorName: "Alice Chen",
    authorAvatar: null,
    content: "Welcome to CampusConnect! Excited to connect with fellow students across departments.",
    likesCount: 1,
    commentsCount: 1,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection("posts").doc("post-demo-1").collection("comments").doc("comment-demo-1").set({
    id: "comment-demo-1",
    authorId: "student-b",
    authorName: "Bob Smith",
    authorAvatar: null,
    content: "Great to connect with you, Alice!",
    createdAt: now,
    updatedAt: now,
  });

  // 7. Notification for student-a
  await db.collection("users").doc("student-a").collection("notifications").doc("acc_student-a_student-b").set({
    id: "acc_student-a_student-b",
    recipientId: "student-a",
    actorId: "student-b",
    actorName: "Bob Smith",
    actorAvatar: null,
    type: "connection_accepted",
    referenceId: "student-a_student-b",
    isRead: false,
    createdAt: now,
  });

  console.log("Emulator 14B representative seeding complete!");
}

// If run directly from CLI
if (process.argv[1]?.endsWith("seedEmulator14b.mjs")) {
  seedEmulatorData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seeding failed:", err);
      process.exit(1);
    });
}
