/**
 * Milestone 18 — Unit 18.1: Campus Seeding Infrastructure
 *
 * Deterministic campus seeder for local emulators, E2E fixtures, and demo environments.
 * Idempotently writes first-class campus documents into the campuses collection.
 */

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { CAMPUS_LIST } from "../src/data/campuses.js";

const EMULATOR_PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-campusconnect-rules-test";

/**
 * Initializes or resolves a Firestore Admin instance for campus seeding.
 *
 * @returns {import("firebase-admin/firestore").Firestore}
 */
function resolveDb() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }

  const existingApps = getApps();
  const existingApp = existingApps.find((a) => a.name === "campus-seeder") || existingApps[0];
  const app = existingApp || initializeApp({ projectId: EMULATOR_PROJECT_ID }, "campus-seeder");
  return getFirestore(app);
}

/**
 * Seeds deterministic campus documents into Cloud Firestore.
 *
 * @param {import("firebase-admin/firestore").Firestore} [dbInstance] - Optional Firestore instance
 * @param {import("firebase-admin/firestore").Timestamp} [timestampInstance] - Optional Timestamp
 * @returns {Promise<string[]>} Array of seeded campus IDs
 */
export async function seedCampuses(dbInstance = null, timestampInstance = null) {
  const db = dbInstance || resolveDb();
  const now = timestampInstance || Timestamp.now();
  const seededIds = [];

  console.log(`[seedCampuses] Seeding ${CAMPUS_LIST.length} deterministic campuses...`);

  for (const campus of CAMPUS_LIST) {
    const campusRef = db.collection("campuses").doc(campus.id);
    await campusRef.set(
      {
        ...campus,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    console.log(`[seedCampuses]   ✓ Seeded campus: ${campus.name} (${campus.id})`);
    seededIds.push(campus.id);
  }

  return seededIds;
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith("seedCampuses.mjs")) {
  seedCampuses()
    .then((ids) => {
      console.log(`[seedCampuses] Seeding completed successfully for ${ids.length} campuses.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[seedCampuses] Seeding failed:", err);
      process.exit(1);
    });
}
