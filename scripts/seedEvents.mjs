/**
 * Milestone 20 — Unit 20.1: Event Seeding Infrastructure
 *
 * Deterministic event seeder for local emulators, E2E fixtures, and demo environments.
 * Idempotently writes first-class event documents into the root events collection.
 */

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  buildEventFixtures,
  buildCappedEventFixtures,
  EVENT_LIST,
  CAPPED_EVENT_LIST,
} from "../src/data/events.js";
import { createInitialEventCapacity } from "../src/data/eventCapacities.js";

const EMULATOR_PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-campusconnect-rules-test";

/**
 * Resolves the seed reference time from an explicit override, the E2E_SEED_NOW
 * environment variable, or the current system time.
 *
 * Requirements:
 * - parse predictably
 * - reject or fail clearly on invalid values rather than silently producing bad timestamps
 * - use exactly one resolved reference time for the whole seed operation
 *
 * @param {Date|number|string} [override=process.env.E2E_SEED_NOW] - Optional override value
 * @returns {Date} Deterministic reference Date
 * @throws {Error} If an invalid non-empty string or invalid Date/number is provided
 */
export function resolveSeedReferenceTime(override = process.env.E2E_SEED_NOW) {
  if (override === undefined || override === null || override === "") {
    return new Date();
  }

  if (override instanceof Date) {
    if (isNaN(override.getTime())) {
      throw new Error(
        "[resolveSeedReferenceTime] Invalid Date object provided as seed reference time."
      );
    }
    return override;
  }

  if (typeof override === "number") {
    const d = new Date(override);
    if (isNaN(d.getTime())) {
      throw new Error(
        `[resolveSeedReferenceTime] Invalid numeric timestamp for E2E_SEED_NOW: "${override}"`
      );
    }
    return d;
  }

  if (typeof override === "string") {
    const trimmed = override.trim();
    if (!trimmed) {
      return new Date();
    }
    // Check for numeric integer timestamp string (e.g. "1793500000000")
    if (/^-?\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const d = new Date(num);
      if (isNaN(d.getTime())) {
        throw new Error(
          `[resolveSeedReferenceTime] Invalid numeric timestamp for E2E_SEED_NOW: "${override}"`
        );
      }
      return d;
    }

    const d = new Date(trimmed);
    if (isNaN(d.getTime())) {
      throw new Error(
        `[resolveSeedReferenceTime] Invalid E2E_SEED_NOW date format: "${override}". Must be valid ISO 8601 or millisecond timestamp.`
      );
    }
    return d;
  }

  throw new Error(
    `[resolveSeedReferenceTime] Unsupported E2E_SEED_NOW type: ${typeof override}`
  );
}

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
 * @param {object} [options]
 * @param {boolean} [options.includeCapped=false] - Whether to also seed capped demo fixtures and coordinators
 * @returns {Promise<string[]>} Array of seeded event IDs
 */
export async function seedEvents(
  dbInstance = null,
  timestampInstance = null,
  { includeCapped = false } = {}
) {
  const db = dbInstance || resolveDb();

  // Resolve exactly one reference time for the entire seed operation
  let refDate;
  if (timestampInstance) {
    if (typeof timestampInstance.toDate === "function") {
      refDate = timestampInstance.toDate();
    } else if (typeof timestampInstance.toMillis === "function") {
      refDate = new Date(timestampInstance.toMillis());
    } else if (typeof timestampInstance.seconds === "number") {
      refDate = new Date(timestampInstance.seconds * 1000);
    } else {
      refDate = new Date(timestampInstance);
    }
  } else {
    refDate = resolveSeedReferenceTime(process.env.E2E_SEED_NOW);
  }

  const now = timestampInstance || Timestamp.fromDate(refDate);
  const eventList = buildEventFixtures(refDate);
  const seededIds = [];

  console.log(
    `[seedEvents] Seeding ${eventList.length} deterministic events (reference: ${refDate.toISOString()})...`
  );

  for (const event of eventList) {
    const eventRef = db.collection("events").doc(event.id);

    // Resolve timestamps for Firestore storage
    const startAt = Timestamp.fromDate(new Date(event.startAt));
    const endAt = Timestamp.fromDate(new Date(event.endAt));

    await eventRef.set(
      {
        id: event.id,
        campusId: event.campusId,
        communityId: event.communityId,
        title: event.title,
        slug: event.slug,
        description: event.description,
        category: event.category,
        location: event.location,
        startAt,
        endAt,
        imageURL: event.imageURL,
        createdBy: event.createdBy,
        organizerName: event.organizerName,
        status: event.status,
        visibility: event.visibility,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    console.log(
      `[seedEvents]   ✓ Seeded event: ${event.title} (${event.id}) [${event.campusId} | ${event.category} | ${event.status}]`
    );
    seededIds.push(event.id);
  }

  if (includeCapped) {
    const cappedIds = await seedCappedEvents(db, now, refDate);
    seededIds.push(...cappedIds);
  }

  return seededIds;
}

/**
 * Seeds deterministic capped-event fixtures, companion eventCapacities coordinators,
 * and initial confirmed attendee RSVPs for the fully-booked fixture into Cloud Firestore.
 *
 * @param {import("firebase-admin/firestore").Firestore} [dbInstance] - Optional Firestore instance
 * @param {import("firebase-admin/firestore").Timestamp} [timestampInstance] - Optional Timestamp
 * @param {Date|number|string} [refDateInstance] - Optional reference Date
 * @returns {Promise<string[]>} Array of seeded capped event IDs
 */
export async function seedCappedEvents(
  dbInstance = null,
  timestampInstance = null,
  refDateInstance = null
) {
  const db = dbInstance || resolveDb();

  let refDate;
  if (refDateInstance) {
    refDate = refDateInstance instanceof Date ? refDateInstance : new Date(refDateInstance);
  } else if (timestampInstance) {
    if (typeof timestampInstance.toDate === "function") {
      refDate = timestampInstance.toDate();
    } else if (typeof timestampInstance.toMillis === "function") {
      refDate = new Date(timestampInstance.toMillis());
    } else if (typeof timestampInstance.seconds === "number") {
      refDate = new Date(timestampInstance.seconds * 1000);
    } else {
      refDate = new Date(timestampInstance);
    }
  } else {
    refDate = resolveSeedReferenceTime(process.env.E2E_SEED_NOW);
  }

  const now = timestampInstance || Timestamp.fromDate(refDate);
  const cappedList = buildCappedEventFixtures(refDate);
  const seededIds = [];

  console.log(
    `[seedCappedEvents] Seeding ${cappedList.length} deterministic capped events (reference: ${refDate.toISOString()})...`
  );

  for (const event of cappedList) {
    const eventRef = db.collection("events").doc(event.id);

    const startAt = Timestamp.fromDate(new Date(event.startAt));
    const endAt = Timestamp.fromDate(new Date(event.endAt));

    await eventRef.set(
      {
        id: event.id,
        campusId: event.campusId,
        communityId: event.communityId,
        title: event.title,
        slug: event.slug,
        description: event.description,
        category: event.category,
        location: event.location,
        startAt,
        endAt,
        imageURL: event.imageURL,
        createdBy: event.createdBy,
        organizerName: event.organizerName,
        status: event.status,
        visibility: event.visibility,
        capacity: event.capacity,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    const capRef = db.collection("eventCapacities").doc(event.id);
    const coordinatorDoc = createInitialEventCapacity({
      eventId: event.id,
      campusId: event.campusId,
      confirmedCount: event.confirmedCount || 0,
      timestamp: now,
    });

    await capRef.set(coordinatorDoc, { merge: true });
    console.log(
      `[seedCappedEvents]   ✓ Seeded capped event + coordinator: ${event.title} (${event.id}) [capacity: ${event.capacity}, confirmed: ${event.confirmedCount || 0}]`
    );
    seededIds.push(event.id);
  }

  // Seed initial confirmed RSVPs for fully-booked fixture e2e-event-capped-full-waitlist
  const fullWaitlistEvent = cappedList.find((e) => e.id === "e2e-event-capped-full-waitlist");
  if (fullWaitlistEvent) {
    const attendees = ["e2e-student-a", "e2e-student-b"];
    for (const uid of attendees) {
      const rsvpId = `${fullWaitlistEvent.id}_${uid}`;
      const rsvpRef = db.collection("eventRsvps").doc(rsvpId);
      await rsvpRef.set(
        {
          id: rsvpId,
          eventId: fullWaitlistEvent.id,
          campusId: fullWaitlistEvent.campusId,
          userId: uid,
          createdAt: now,
        },
        { merge: true }
      );
      console.log(
        `[seedCappedEvents]   ✓ Seeded full-waitlist attendee RSVP: ${rsvpId}`
      );
    }
  }

  return seededIds;
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith("seedEvents.mjs")) {
  seedEvents(null, null, { includeCapped: true })
    .then((ids) => {
      console.log(`[seedEvents] Seeding completed successfully for ${ids.length} events.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[seedEvents] Seeding failed:", err);
      process.exit(1);
    });
}
