/**
 * Milestone 19 — Unit 19.2: Community Membership Seeding Infrastructure
 *
 * Deterministic community membership seeder for local emulators, E2E fixtures, and demo environments.
 * Idempotently writes first-class membership documents into the root communityMembers collection.
 */

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { COMMUNITY_MEMBER_LIST } from "../src/data/communityMembers.js";

const EMULATOR_PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-campusconnect-rules-test";

/**
 * Initializes or resolves a Firestore Admin instance for community membership seeding.
 *
 * @returns {import("firebase-admin/firestore").Firestore}
 */
function resolveDb() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }

  const existingApps = getApps();
  const existingApp =
    existingApps.find((a) => a.name === "community-member-seeder") || existingApps[0];
  const app =
    existingApp ||
    initializeApp({ projectId: EMULATOR_PROJECT_ID }, "community-member-seeder");
  return getFirestore(app);
}

/**
 * Seeds deterministic community membership documents into Cloud Firestore.
 *
 * @param {import("firebase-admin/firestore").Firestore} [dbInstance] - Optional Firestore instance
 * @param {import("firebase-admin/firestore").Timestamp} [timestampInstance] - Optional Timestamp
 * @param {Array<Object>} [membersList] - Optional membership list override (defaults to COMMUNITY_MEMBER_LIST)
 * @returns {Promise<string[]>} Array of seeded membership document IDs
 */
export async function seedCommunityMembers(
  dbInstance = null,
  timestampInstance = null,
  membersList = null
) {
  const db = dbInstance || resolveDb();
  const now = timestampInstance || Timestamp.now();
  const listToSeed = membersList || COMMUNITY_MEMBER_LIST;
  const seededIds = [];
  const seenIds = new Set();

  console.log(
    `[seedCommunityMembers] Seeding ${listToSeed.length} deterministic community memberships...`
  );

  for (const member of listToSeed) {
    if (seenIds.has(member.id)) {
      console.warn(
        `[seedCommunityMembers]   ⚠ Skipping duplicate membership ID: ${member.id}`
      );
      continue;
    }
    seenIds.add(member.id);

    const memberRef = db.collection("communityMembers").doc(member.id);
    await memberRef.set(
      {
        ...member,
        joinedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    console.log(
      `[seedCommunityMembers]   ✓ Seeded membership: ${member.id} [${member.role}] (${member.status})`
    );
    seededIds.push(member.id);
  }

  return seededIds;
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith("seedCommunityMembers.mjs")) {
  seedCommunityMembers()
    .then((ids) => {
      console.log(
        `[seedCommunityMembers] Seeding completed successfully for ${ids.length} community memberships.`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("[seedCommunityMembers] Seeding failed:", err);
      process.exit(1);
    });
}
