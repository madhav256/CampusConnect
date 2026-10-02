import { describe, expect, it, vi } from "vitest";
import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  DEFAULT_CAMPUS_ID,
} from "../../src/constants.js";
import {
  CAMPUSES,
  CAMPUS_LIST,
  CAMPUS_A,
  CAMPUS_B,
} from "../../src/data/campuses.js";
import { seedCampuses } from "../../scripts/seedCampuses.mjs";

describe("Milestone 18 — Unit 18.1: Campus Domain Model & Seeding Invariants", () => {
  describe("Campus Constants", () => {
    it("exports valid deterministic campus identifiers", () => {
      expect(APEX_CAMPUS_ID).toBe("apex-university");
      expect(ST_JUDE_CAMPUS_ID).toBe("st-jude-university");
      expect(DEFAULT_CAMPUS_ID).toBe(APEX_CAMPUS_ID);
    });
  });

  describe("Campus Fixtures & Schema Compliance", () => {
    it("exports distinct initial campuses in CAMPUS_LIST", () => {
      expect(CAMPUS_LIST).toHaveLength(2);
      expect(CAMPUS_LIST.map((c) => c.id)).toEqual([
        "apex-university",
        "st-jude-university",
      ]);
    });

    it("CAMPUSES map indexes each campus by its canonical ID", () => {
      expect(CAMPUSES[APEX_CAMPUS_ID]).toEqual(CAMPUS_A);
      expect(CAMPUSES[ST_JUDE_CAMPUS_ID]).toEqual(CAMPUS_B);
    });

    it("every campus adheres strictly to the documented schema", () => {
      for (const campus of CAMPUS_LIST) {
        expect(typeof campus.id).toBe("string");
        expect(typeof campus.name).toBe("string");
        expect(typeof campus.shortName).toBe("string");
        expect(typeof campus.slug).toBe("string");
        expect(typeof campus.domain).toBe("string");
        expect(campus.id).toBe(campus.slug);

        // Location structure
        expect(campus.location).toBeDefined();
        expect(typeof campus.location.city).toBe("string");
        expect(typeof campus.location.state).toBe("string");
        expect(typeof campus.location.country).toBe("string");

        // Status
        expect(["active", "pending", "inactive"]).toContain(campus.status);

        // Branding structure
        expect(campus.branding).toBeDefined();
        expect(
          campus.branding.logoURL === null ||
            typeof campus.branding.logoURL === "string"
        ).toBe(true);
        expect(
          campus.branding.primaryColor === null ||
            typeof campus.branding.primaryColor === "string"
        ).toBe(true);
      }
    });
  });

  describe("seedCampuses Function", () => {
    it("idempotently sets each campus document with merge: true", async () => {
      const setMock = vi.fn().mockResolvedValue(undefined);
      const docMock = vi.fn((id) => ({
        id,
        set: setMock,
      }));
      const collectionMock = vi.fn((name) => {
        expect(name).toBe("campuses");
        return { doc: docMock };
      });

      const mockDb = {
        collection: collectionMock,
      };

      const mockTimestamp = { seconds: 1700000000, nanoseconds: 0 };

      const seededIds = await seedCampuses(mockDb, mockTimestamp);

      expect(seededIds).toEqual([APEX_CAMPUS_ID, ST_JUDE_CAMPUS_ID]);
      expect(collectionMock).toHaveBeenCalledTimes(2);
      expect(docMock).toHaveBeenCalledWith(APEX_CAMPUS_ID);
      expect(docMock).toHaveBeenCalledWith(ST_JUDE_CAMPUS_ID);

      expect(setMock).toHaveBeenCalledTimes(2);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: APEX_CAMPUS_ID,
          name: "Apex Institute of Technology",
          shortName: "Apex Tech",
          slug: "apex-university",
          domain: "campusconnect.edu",
          status: "active",
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
        }),
        { merge: true }
      );
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: ST_JUDE_CAMPUS_ID,
          name: "St. Jude University",
          shortName: "St. Jude",
          slug: "st-jude-university",
          domain: "stjude.edu",
          status: "active",
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
        }),
        { merge: true }
      );
    });
  });
});
