/**
 * Milestone 20 — Unit 20.1: Event Seeding Infrastructure
 *
 * Deterministic event seeder for local emulators, E2E fixtures, and demo environments.
 * Idempotently writes first-class event documents into the root events collection.
 */

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { EVENT_LIST } from "../src/data/events.js";

const EMULATOR_PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-campusconnect-rules-test";

/**
 * Initializes or resolves a Firestore Admin instance for event seeding.
 *
 * @returns {import("firebase-admin/firestore").Firestore}
 */
function resolveDb() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }

  const existingApps = getApps();
  const existingApp = existingApps.find((a) => a.name === "event-seeder") || existingApps[0];
  const app = existingApp || initializeApp({ projectId: EMULATOR_PROJECT_ID }, "event-seeder");
  return getFirestore(app);
}

/**
 * Seeds deterministic event documents into Cloud Firestore.
 *
 * @param {import("firebase-admin/firestore").Firestore} [dbInstance] - Optional Firestore instance
 * @param {import("firebase-admin/firestore").Timestamp} [timestampInstance] - Optional Timestamp
 * @returns {Promise<string[]>} Array of seeded event IDs
 */
export async function seedEvents(dbInstance = null, timestampInstance = null) {
  const db = dbInstance || resolveDb();
  const now = timestampInstance || Timestamp.now();
  const seededIds = [];

  console.log(`[seedEvents] Seeding ${EVENT_LIST.length} deterministic events...`);

  for (const event of EVENT_LIST) {
    const eventRef = db.collection("events").doc(event.id);

    // Resolve timestamps for Firestore storage
    const startAt =
      event.startAt instanceof Timestamp
        ? event.startAt
        : typeof event.startAt?.toMillis === "function"
        ? event.startAt
        : Timestamp.fromDate(new Date(event.startAt));

    const endAt =
      event.endAt instanceof Timestamp
        ? event.endAt
        : typeof event.endAt?.toMillis === "function"
        ? event.endAt
        : Timestamp.fromDate(new Date(event.endAt));

    await eventRef.set(
      {
        ...event,
        startAt,
        endAt,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    console.log(
      `[seedEvents]   ✓ Seeded event: ${event.title} (${event.id}) [${event.campusId} | ${event.category}]`
    );
    seededIds.push(event.id);
  }

  return seededIds;
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith("seedEvents.mjs")) {
  seedEvents()
    .then((ids) => {
      console.log(`[seedEvents] Seeding completed successfully for ${ids.length} events.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[seedEvents] Seeding failed:", err);
      process.exit(1);
    });
}
