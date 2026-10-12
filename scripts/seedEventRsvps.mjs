/**
 * Milestone 21 — Unit 21.1: RSVP Seeding Infrastructure
 *
 * Deterministic event RSVP seeder for local emulators, E2E fixtures, and testing environments.
 * Idempotently writes first-class RSVP documents into the root eventRsvps collection.
 *
 * PREREQUISITES:
 * The standalone RSVP seeder requires parent event documents (`events` collection)
 * and user accounts/profiles (`users`, `publicProfiles`) to be seeded beforehand
 * (e.g., via `node scripts/seedEvents.mjs` or `npm run seed:e2e`).
 * This seeder does not seed parent event or user documents automatically.
 */

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  buildEventRsvpFixtures,
  validateEventRsvp,
  MAX_REPRESENTABLE_DATE_MS,
} from "../src/data/eventRsvps.js";
import { resolveSeedReferenceTime } from "./seedEvents.mjs";

const EMULATOR_PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-campusconnect-rules-test";

/**
 * Initializes or resolves a Firestore Admin instance for event RSVP seeding.
 *
 * @returns {import("firebase-admin/firestore").Firestore}
 */
function resolveDb() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }

  const existingApps = getApps();
  const existingApp =
    existingApps.find((a) => a.name === "event-rsvp-seeder") || existingApps[0];
  const app =
    existingApp || initializeApp({ projectId: EMULATOR_PROJECT_ID }, "event-rsvp-seeder");
  return getFirestore(app);
}

/**
 * Seeds deterministic event RSVP documents into Cloud Firestore.
 *
 * Requirements:
 * - Deterministic document IDs ({eventId}_{userId})
 * - Strict 5-field schema (id, eventId, campusId, userId, createdAt)
 * - Idempotent across multiple runs
 * - Preserves temporal determinism relative to seed reference time
 * - Rejects malformed, incomplete, or ID-mismatched entries before writing to Firestore
 * - End-to-end normalization for all accepted createdAt inputs (Date, ISO string, millis, Timestamp, toMillis, toDate, seconds)
 *
 * PREREQUISITE:
 * Parent event documents (`events/{eventId}`) and user documents (`users/{userId}`)
 * must already exist in Firestore. This function does not seed parent data.
 *
 * @param {import("firebase-admin/firestore").Firestore} [dbInstance] - Optional Firestore instance
 * @param {import("firebase-admin/firestore").Timestamp} [timestampInstance] - Optional Timestamp
 * @param {Array<object>} [rsvpsList] - Optional explicit RSVP list override
 * @returns {Promise<string[]>} Array of seeded RSVP document IDs
 */
export async function seedEventRsvps(
  dbInstance = null,
  timestampInstance = null,
  rsvpsList = null
) {
  const db = dbInstance || resolveDb();

  // Resolve exactly one reference time for the entire seed operation
  let refDate;
  if (timestampInstance) {
    if (timestampInstance instanceof Timestamp) {
      refDate = timestampInstance.toDate();
    } else if (typeof timestampInstance.toDate === "function") {
      refDate = timestampInstance.toDate();
    } else if (typeof timestampInstance.toMillis === "function") {
      refDate = new Date(timestampInstance.toMillis());
    } else if (typeof timestampInstance.seconds === "number") {
      refDate = new Date(timestampInstance.seconds * 1000);
    } else if (timestampInstance instanceof Date) {
      refDate = timestampInstance;
    } else {
      refDate = new Date(timestampInstance);
    }
  } else {
    refDate = resolveSeedReferenceTime(process.env.E2E_SEED_NOW);
  }

  if (
    !(refDate instanceof Date) ||
    isNaN(refDate.getTime()) ||
    Math.abs(refDate.getTime()) > MAX_REPRESENTABLE_DATE_MS
  ) {
    throw new Error(
      "[seedEventRsvps] Invalid seed reference date: unable to parse into a valid timestamp."
    );
  }

  const listToSeed = rsvpsList || buildEventRsvpFixtures(refDate);

  // Validate all entries before writing any document to Firestore.
  // Rejects malformed documents, extra fields, wrong identifier types,
  // malformed timestamps, and mismatched composite IDs.
  for (const rsvp of listToSeed) {
    const validation = validateEventRsvp(rsvp);
    if (!validation.valid) {
      throw new Error(
        `[seedEventRsvps] Invalid RSVP document rejected before write: ${validation.errors.join("; ")}`
      );
    }
  }

  const seededIds = [];
  const seenIds = new Set();

  console.log(
    `[seedEventRsvps] Seeding ${listToSeed.length} deterministic event RSVPs (reference: ${refDate.toISOString()})...`
  );
  console.log(
    `[seedEventRsvps] Prerequisite note: Parent events and user profiles must be seeded beforehand.`
  );

  for (const rsvp of listToSeed) {
    if (seenIds.has(rsvp.id)) {
      console.warn(`[seedEventRsvps]   ⚠ Skipping duplicate RSVP ID: ${rsvp.id}`);
      continue;
    }
    seenIds.add(rsvp.id);

    const rsvpRef = db.collection("eventRsvps").doc(rsvp.id);

    // Resolve createdAt as Firestore Timestamp
    let createdAt;
    if (rsvp.createdAt instanceof Timestamp) {
      createdAt = rsvp.createdAt;
    } else if (
      typeof rsvp.createdAt === "object" &&
      rsvp.createdAt !== null &&
      typeof rsvp.createdAt.seconds === "number" &&
      Number.isFinite(rsvp.createdAt.seconds)
    ) {
      const nanos =
        typeof rsvp.createdAt.nanoseconds === "number" &&
        Number.isFinite(rsvp.createdAt.nanoseconds) &&
        rsvp.createdAt.nanoseconds >= 0 &&
        rsvp.createdAt.nanoseconds < 1e9
          ? rsvp.createdAt.nanoseconds
          : 0;
      createdAt = new Timestamp(rsvp.createdAt.seconds, nanos);
    } else if (
      typeof rsvp.createdAt === "object" &&
      rsvp.createdAt !== null &&
      typeof rsvp.createdAt.toDate === "function"
    ) {
      const d = rsvp.createdAt.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) {
        createdAt = Timestamp.fromDate(d);
      }
    } else if (
      typeof rsvp.createdAt === "object" &&
      rsvp.createdAt !== null &&
      typeof rsvp.createdAt.toMillis === "function"
    ) {
      const ms = rsvp.createdAt.toMillis();
      if (
        typeof ms === "number" &&
        Number.isFinite(ms) &&
        Math.abs(ms) <= MAX_REPRESENTABLE_DATE_MS
      ) {
        createdAt = Timestamp.fromMillis(ms);
      }
    } else if (typeof rsvp.createdAt === "number") {
      if (Number.isFinite(rsvp.createdAt) && Math.abs(rsvp.createdAt) <= MAX_REPRESENTABLE_DATE_MS) {
        createdAt = Timestamp.fromMillis(rsvp.createdAt);
      }
    } else if (rsvp.createdAt instanceof Date) {
      if (!isNaN(rsvp.createdAt.getTime())) {
        createdAt = Timestamp.fromDate(rsvp.createdAt);
      }
    } else if (typeof rsvp.createdAt === "string") {
      const parsed = new Date(rsvp.createdAt);
      if (!isNaN(parsed.getTime())) {
        createdAt = Timestamp.fromDate(parsed);
      }
    }

    if (!createdAt || typeof createdAt.toMillis !== "function") {
      throw new Error(
        `[seedEventRsvps] Unable to resolve valid Firestore Timestamp for RSVP: ${rsvp.id}`
      );
    }

    // Overwrite with exact 5 fields to prevent stale fields from violating schema
    await rsvpRef.set({
      id: rsvp.id,
      eventId: rsvp.eventId,
      campusId: rsvp.campusId,
      userId: rsvp.userId,
      createdAt,
    });

    console.log(
      `[seedEventRsvps]   ✓ Seeded RSVP: ${rsvp.id} [${rsvp.campusId}] (user: ${rsvp.userId} -> event: ${rsvp.eventId})`
    );
    seededIds.push(rsvp.id);
  }

  return seededIds;
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith("seedEventRsvps.mjs")) {
  console.log(
    "[seedEventRsvps] Prerequisite note: Standalone execution requires parent events and user profiles to be seeded first."
  );
  seedEventRsvps()
    .then((ids) => {
      console.log(`[seedEventRsvps] Seeding completed successfully for ${ids.length} RSVPs.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[seedEventRsvps] Seeding failed:", err);
      process.exit(1);
    });
}
