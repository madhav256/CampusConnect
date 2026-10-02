/**
 * Milestone 19 — Unit 19.1: Community Seeding Infrastructure
 *
 * Deterministic community seeder for local emulators, E2E fixtures, and demo environments.
 * Idempotently writes first-class community documents into the root communities collection.
 */

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { COMMUNITY_LIST } from "../src/data/communities.js";

const EMULATOR_PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-campusconnect-rules-test";

/**
 * Initializes or resolves a Firestore Admin instance for community seeding.
 *
 * @returns {import("firebase-admin/firestore").Firestore}
 */
function resolveDb() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }

  const existingApps = getApps();
  const existingApp = existingApps.find((a) => a.name === "community-seeder") || existingApps[0];
  const app = existingApp || initializeApp({ projectId: EMULATOR_PROJECT_ID }, "community-seeder");
  return getFirestore(app);
}

/**
 * Seeds deterministic community documents into Cloud Firestore.
 *
 * @param {import("firebase-admin/firestore").Firestore} [dbInstance] - Optional Firestore instance
 * @param {import("firebase-admin/firestore").Timestamp} [timestampInstance] - Optional Timestamp
 * @returns {Promise<string[]>} Array of seeded community IDs
 */
export async function seedCommunities(dbInstance = null, timestampInstance = null) {
  const db = dbInstance || resolveDb();
  const now = timestampInstance || Timestamp.now();
  const seededIds = [];

  console.log(`[seedCommunities] Seeding ${COMMUNITY_LIST.length} deterministic communities...`);

  for (const community of COMMUNITY_LIST) {
    const communityRef = db.collection("communities").doc(community.id);
    await communityRef.set(
      {
        ...community,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    console.log(
      `[seedCommunities]   ✓ Seeded community: ${community.name} (${community.id}) [${community.campusId}]`
    );
    seededIds.push(community.id);
  }

  return seededIds;
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith("seedCommunities.mjs")) {
  seedCommunities()
    .then((ids) => {
      console.log(`[seedCommunities] Seeding completed successfully for ${ids.length} communities.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[seedCommunities] Seeding failed:", err);
      process.exit(1);
    });
}
