import { describe, expect, it, vi } from "vitest";
import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LIST,
  COMMUNITY_STATUSES,
  COMMUNITY_STATUS_LIST,
  COMMUNITY_VISIBILITIES,
  COMMUNITY_VISIBILITY_LIST,
} from "../../src/constants.js";
import {
  COMMUNITIES,
  COMMUNITY_LIST,
  COMMUNITY_APEX_AI,
  COMMUNITY_APEX_DESIGN,
  COMMUNITY_ST_JUDE_MED,
} from "../../src/data/communities.js";
import { seedCommunities } from "../../scripts/seedCommunities.mjs";

describe("Milestone 19 — Unit 19.1: Community Domain Model & Seeding Invariants", () => {
  describe("Community Constants & Categories", () => {
    it("exports all required community categories", () => {
      expect(COMMUNITY_CATEGORIES.ACADEMIC).toBe("academic");
      expect(COMMUNITY_CATEGORIES.CULTURAL).toBe("cultural");
      expect(COMMUNITY_CATEGORIES.TECH).toBe("tech");
      expect(COMMUNITY_CATEGORIES.SPORTS).toBe("sports");
      expect(COMMUNITY_CATEGORIES.CAREER).toBe("career");
      expect(COMMUNITY_CATEGORIES.BATCH).toBe("batch");
      expect(COMMUNITY_CATEGORIES.INTEREST).toBe("interest");

      expect(COMMUNITY_CATEGORY_LIST).toEqual([
        "academic",
        "cultural",
        "tech",
        "sports",
        "career",
        "batch",
        "interest",
      ]);
    });

    it("exports valid community statuses", () => {
      expect(COMMUNITY_STATUSES.ACTIVE).toBe("active");
      expect(COMMUNITY_STATUSES.ARCHIVED).toBe("archived");
      expect(COMMUNITY_STATUSES.PENDING_APPROVAL).toBe("pending_approval");

      expect(COMMUNITY_STATUS_LIST).toEqual([
        "active",
        "archived",
        "pending_approval",
      ]);
    });

    it("exports valid community visibilities", () => {
      expect(COMMUNITY_VISIBILITIES.CAMPUS_PUBLIC).toBe("campus_public");
      expect(COMMUNITY_VISIBILITIES.CAMPUS_PRIVATE).toBe("campus_private");

      expect(COMMUNITY_VISIBILITY_LIST).toEqual([
        "campus_public",
        "campus_private",
      ]);
    });
  });

  describe("Community Fixtures & Schema Compliance", () => {
    it("exports deterministic communities across campuses", () => {
      expect(COMMUNITY_LIST.length).toBeGreaterThanOrEqual(2);
      expect(COMMUNITY_LIST.map((c) => c.id)).toContain("apex-ai-club");
      expect(COMMUNITY_LIST.map((c) => c.id)).toContain("st-jude-medical-society");
    });

    it("COMMUNITIES map indexes each community by its canonical ID", () => {
      expect(COMMUNITIES["apex-ai-club"]).toEqual(COMMUNITY_APEX_AI);
      expect(COMMUNITIES["apex-design-collective"]).toEqual(COMMUNITY_APEX_DESIGN);
      expect(COMMUNITIES["st-jude-medical-society"]).toEqual(COMMUNITY_ST_JUDE_MED);
    });

    it("every community fixture adheres strictly to the documented schema", () => {
      for (const community of COMMUNITY_LIST) {
        expect(typeof community.id).toBe("string");
        expect(community.id.length).toBeGreaterThan(0);

        // Multi-tenant boundary
        expect(typeof community.campusId).toBe("string");
        expect([APEX_CAMPUS_ID, ST_JUDE_CAMPUS_ID]).toContain(community.campusId);

        // Core metadata
        expect(typeof community.name).toBe("string");
        expect(typeof community.slug).toBe("string");
        expect(typeof community.description).toBe("string");

        // Category validation
        expect(COMMUNITY_CATEGORY_LIST).toContain(community.category);

        // Image / Banner URLs
        expect(
          community.imageURL === null || typeof community.imageURL === "string"
        ).toBe(true);
        expect(
          community.bannerURL === null || typeof community.bannerURL === "string"
        ).toBe(true);

        // Creator and status
        expect(typeof community.createdBy).toBe("string");
        expect(COMMUNITY_STATUS_LIST).toContain(community.status);
        expect(COMMUNITY_VISIBILITY_LIST).toContain(community.visibility);

        // Stats counters
        expect(community.stats).toBeDefined();
        expect(typeof community.stats.memberCount).toBe("number");
        expect(community.stats.memberCount).toBeGreaterThanOrEqual(0);
        expect(typeof community.stats.postCount).toBe("number");
        expect(community.stats.postCount).toBeGreaterThanOrEqual(0);
      }
    });

    it("Apex and St. Jude have respective communities", () => {
      const apexCommunities = COMMUNITY_LIST.filter(
        (c) => c.campusId === APEX_CAMPUS_ID
      );
      const stJudeCommunities = COMMUNITY_LIST.filter(
        (c) => c.campusId === ST_JUDE_CAMPUS_ID
      );

      expect(apexCommunities.length).toBeGreaterThanOrEqual(1);
      expect(stJudeCommunities.length).toBeGreaterThanOrEqual(1);
      expect(apexCommunities.some((c) => c.category === "tech")).toBe(true);
      expect(stJudeCommunities.some((c) => c.category === "academic")).toBe(true);
    });
  });

  describe("seedCommunities Function", () => {
    it("idempotently sets each community document with merge: true", async () => {
      const setMock = vi.fn().mockResolvedValue(undefined);
      const docMock = vi.fn((id) => ({
        id,
        set: setMock,
      }));
      const collectionMock = vi.fn((name) => {
        expect(name).toBe("communities");
        return { doc: docMock };
      });

      const mockDb = {
        collection: collectionMock,
      };

      const mockTimestamp = { seconds: 1700000000, nanoseconds: 0 };

      const seededIds = await seedCommunities(mockDb, mockTimestamp);

      expect(seededIds).toEqual(COMMUNITY_LIST.map((c) => c.id));
      expect(collectionMock).toHaveBeenCalledTimes(COMMUNITY_LIST.length);

      for (const community of COMMUNITY_LIST) {
        expect(docMock).toHaveBeenCalledWith(community.id);
        expect(setMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: community.id,
            campusId: community.campusId,
            name: community.name,
            slug: community.slug,
            category: community.category,
            status: community.status,
            createdAt: mockTimestamp,
            updatedAt: mockTimestamp,
          }),
          { merge: true }
        );
      }
    });

    it("running seeder twice produces deterministic, idempotent output without duplicates", async () => {
      const setMock = vi.fn().mockResolvedValue(undefined);
      const docMock = vi.fn((id) => ({
        id,
        set: setMock,
      }));
      const collectionMock = vi.fn(() => ({ doc: docMock }));
      const mockDb = { collection: collectionMock };
      const mockTimestamp = { seconds: 1700000000, nanoseconds: 0 };

      const run1 = await seedCommunities(mockDb, mockTimestamp);
      const run2 = await seedCommunities(mockDb, mockTimestamp);

      expect(run1).toEqual(run2);
      expect(new Set(run1).size).toBe(run1.length);
      expect(setMock).toHaveBeenCalledTimes(COMMUNITY_LIST.length * 2);
    });
  });
});
