import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CAPPED_EVENT_DEFINITIONS,
  buildCappedEventFixtures,
  CAPPED_EVENT_LIST,
  EVENT_CAPPED_MICRO_LAB_DEF,
  EVENT_CAPPED_FULL_WAITLIST_DEF,
} from "../../src/data/events.js";
import {
  validateEventCapacity,
  createInitialEventCapacity,
  EVENT_CAPACITY_FIELDS,
} from "../../src/data/eventCapacities.js";
import { seedEvents, seedCappedEvents } from "../../scripts/seedEvents.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Milestone 24.4.2 — Unit Tests: Capped Event Fixtures & CI Pipeline Alignment", () => {
  const dummyTimestamp = { seconds: 1700000000, nanoseconds: 0 };
  const dummyDate = new Date("2026-10-25T12:00:00Z");

  describe("Capped Event Definitions & Fixtures", () => {
    it("defines the 2 deterministic capped event fixtures with expected capacities", () => {
      expect(CAPPED_EVENT_DEFINITIONS).toHaveLength(2);
      expect(CAPPED_EVENT_LIST).toHaveLength(2);

      expect(EVENT_CAPPED_MICRO_LAB_DEF.id).toBe("e2e-event-capped-micro-lab");
      expect(EVENT_CAPPED_MICRO_LAB_DEF.capacity).toBe(12);
      expect(EVENT_CAPPED_MICRO_LAB_DEF.confirmedCount).toBe(0);

      expect(EVENT_CAPPED_FULL_WAITLIST_DEF.id).toBe("e2e-event-capped-full-waitlist");
      expect(EVENT_CAPPED_FULL_WAITLIST_DEF.capacity).toBe(2);
      expect(EVENT_CAPPED_FULL_WAITLIST_DEF.confirmedCount).toBe(2);
    });

    it("buildCappedEventFixtures resolves temporal fields and preserves capacity", () => {
      const fixtures = buildCappedEventFixtures(dummyDate);
      expect(fixtures).toHaveLength(2);

      const [microLab, fullWaitlist] = fixtures;
      expect(microLab.id).toBe("e2e-event-capped-micro-lab");
      expect(microLab.capacity).toBe(12);
      expect(microLab.startAt).toBeDefined();
      expect(microLab.endAt).toBeDefined();

      expect(fullWaitlist.id).toBe("e2e-event-capped-full-waitlist");
      expect(fullWaitlist.capacity).toBe(2);
      expect(fullWaitlist.startAt).toBeDefined();
      expect(fullWaitlist.endAt).toBeDefined();
    });

    it("satisfies coordinator domain invariants for both capped fixtures", () => {
      const fixtures = buildCappedEventFixtures(dummyDate);

      for (const event of fixtures) {
        const coordinator = createInitialEventCapacity({
          eventId: event.id,
          campusId: event.campusId,
          confirmedCount: event.confirmedCount || 0,
          timestamp: dummyTimestamp,
        });

        // Ensure all required fields exist
        for (const field of EVENT_CAPACITY_FIELDS) {
          expect(coordinator[field]).toBeDefined();
        }

        const validation = validateEventCapacity(coordinator, event);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });

    it("validateEventCapacity detects capacity violations", () => {
      const fullWaitlistEvent = buildCappedEventFixtures(dummyDate).find(
        (e) => e.id === "e2e-event-capped-full-waitlist"
      );
      const invalidCoordinator = createInitialEventCapacity({
        eventId: fullWaitlistEvent.id,
        campusId: fullWaitlistEvent.campusId,
        confirmedCount: 3, // capacity is 2
        timestamp: dummyTimestamp,
      });

      const validation = validateEventCapacity(invalidCoordinator, fullWaitlistEvent);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toMatch(/exceeds event capacity/i);
    });
  });

  describe("seedCappedEvents Function", () => {
    it("writes event, eventCapacities, and attendee RSVP documents idempotently", async () => {
      const collections = {
        events: new Map(),
        eventCapacities: new Map(),
        eventRsvps: new Map(),
      };

      const mockDb = {
        collection: vi.fn((colName) => ({
          doc: vi.fn((docId) => ({
            id: docId,
            set: vi.fn((data, options) => {
              if (!collections[colName]) {
                collections[colName] = new Map();
              }
              collections[colName].set(docId, { data, options });
              return Promise.resolve();
            }),
          })),
        })),
      };

      const seededIds = await seedCappedEvents(mockDb, dummyTimestamp, dummyDate);

      expect(seededIds).toEqual([
        "e2e-event-capped-micro-lab",
        "e2e-event-capped-full-waitlist",
      ]);

      // Check events collection
      expect(collections.events.has("e2e-event-capped-micro-lab")).toBe(true);
      expect(collections.events.has("e2e-event-capped-full-waitlist")).toBe(true);
      expect(collections.events.get("e2e-event-capped-micro-lab").data.capacity).toBe(12);
      expect(collections.events.get("e2e-event-capped-full-waitlist").data.capacity).toBe(2);

      // Check eventCapacities coordinators
      expect(collections.eventCapacities.has("e2e-event-capped-micro-lab")).toBe(true);
      const microLabCoord = collections.eventCapacities.get("e2e-event-capped-micro-lab").data;
      expect(microLabCoord.confirmedCount).toBe(0);
      expect(microLabCoord.headSequence).toBe(1);
      expect(microLabCoord.nextSequence).toBe(1);

      expect(collections.eventCapacities.has("e2e-event-capped-full-waitlist")).toBe(true);
      const fullWaitlistCoord = collections.eventCapacities.get("e2e-event-capped-full-waitlist").data;
      expect(fullWaitlistCoord.confirmedCount).toBe(2);
      expect(fullWaitlistCoord.headSequence).toBe(1);
      expect(fullWaitlistCoord.nextSequence).toBe(1);

      // Check confirmed RSVPs seeded for full-waitlist fixture
      expect(collections.eventRsvps.has("e2e-event-capped-full-waitlist_e2e-student-a")).toBe(true);
      expect(collections.eventRsvps.has("e2e-event-capped-full-waitlist_e2e-student-b")).toBe(true);
      const rsvpA = collections.eventRsvps.get("e2e-event-capped-full-waitlist_e2e-student-a").data;
      expect(rsvpA.userId).toBe("e2e-student-a");
      expect(rsvpA.eventId).toBe("e2e-event-capped-full-waitlist");
    });
  });

  describe("seedEvents with includeCapped option", () => {
    it("returns only 8 uncapped event IDs when includeCapped is false or omitted", async () => {
      const setMock = vi.fn().mockResolvedValue(undefined);
      const docMock = vi.fn((id) => ({ id, set: setMock }));
      const collectionMock = vi.fn(() => ({ doc: docMock }));
      const mockDb = { collection: collectionMock };

      const ids = await seedEvents(mockDb, dummyTimestamp, { includeCapped: false });
      expect(ids).toHaveLength(8);
      expect(collectionMock).toHaveBeenCalledTimes(8);
      // eventCapacities should not be touched
      expect(collectionMock).not.toHaveBeenCalledWith("eventCapacities");
    });

    it("returns 10 event IDs (8 uncapped + 2 capped) when includeCapped is true", async () => {
      const setMock = vi.fn().mockResolvedValue(undefined);
      const docMock = vi.fn((id) => ({ id, set: setMock }));
      const collectionMock = vi.fn(() => ({ doc: docMock }));
      const mockDb = { collection: collectionMock };

      const ids = await seedEvents(mockDb, dummyTimestamp, { includeCapped: true });
      expect(ids).toHaveLength(10);
      expect(ids).toContain("e2e-event-capped-micro-lab");
      expect(ids).toContain("e2e-event-capped-full-waitlist");
      expect(collectionMock).toHaveBeenCalledWith("eventCapacities");
    });
  });

  describe("CI Workflow Alignment (.github/workflows/ci.yml)", () => {
    it("includes Cloud Functions boundary tests and timeout-minutes 25", () => {
      const ciPath = path.resolve(__dirname, "../../.github/workflows/ci.yml");
      const content = fs.readFileSync(ciPath, "utf-8");

      expect(content).toMatch(/timeout-minutes:\s*25/);
      expect(content).toMatch(/name:\s*Cloud Functions boundary tests/);
      expect(content).toMatch(/run:\s*npm run test:functions/);

      // Verify execution order: test:rules before test:functions
      const rulesIndex = content.indexOf("npm run test:rules");
      const functionsIndex = content.indexOf("npm run test:functions");
      const buildIndex = content.indexOf("npm run build");

      expect(rulesIndex).toBeGreaterThan(-1);
      expect(functionsIndex).toBeGreaterThan(rulesIndex);
      expect(buildIndex).toBeGreaterThan(functionsIndex);
    });
  });
});
