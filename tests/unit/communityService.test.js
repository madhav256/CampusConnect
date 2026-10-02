import { describe, expect, it, vi, beforeEach } from "vitest";
import { APEX_CAMPUS_ID, ST_JUDE_CAMPUS_ID } from "../../src/constants.js";
import { COMMUNITY_APEX_AI } from "../../src/data/communities.js";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id, collection: coll })),
  collection: vi.fn((_db, name) => ({ path: name, name })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  mockDb: { id: "mock-db" },
}));

vi.mock("../../src/firebase/config", () => ({
  db: mocks.mockDb,
  isFirebaseConfigured: true,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  collection: mocks.collection,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  onSnapshot: mocks.onSnapshot,
  query: mocks.query,
  where: mocks.where,
}));

import {
  communityDocRef,
  communitiesCollectionRef,
  normalizeCommunity,
  getCommunityById,
  getCommunitiesByCampus,
  subscribeToCommunitiesByCampus,
  subscribeToCommunity,
  getCommunityStats,
} from "../../src/services/communityService.js";

describe("Milestone 19 — Unit 19.4: Community Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Reference helpers & normalization", () => {
    it("communityDocRef returns document reference for valid ID and throws on missing ID", () => {
      const ref = communityDocRef("apex-ai-club");
      expect(ref.path).toBe("communities/apex-ai-club");
      expect(() => communityDocRef("")).toThrow("Community ID is required");
      expect(() => communityDocRef(null)).toThrow("Community ID is required");
    });

    it("communitiesCollectionRef returns reference to communities collection", () => {
      const colRef = communitiesCollectionRef();
      expect(colRef.path).toBe("communities");
    });

    it("normalizeCommunity handles null/undefined safely", () => {
      expect(normalizeCommunity("any-id", null)).toBeNull();
      expect(normalizeCommunity("any-id", undefined)).toBeNull();
    });

    it("normalizeCommunity normalizes document fields and defaults", () => {
      const raw = {
        name: "Test Club",
        campusId: "campus-1",
        description: "A testing club",
        stats: { memberCount: "10", postCount: 5 },
      };
      const normalized = normalizeCommunity("c1", raw);
      expect(normalized).toEqual({
        id: "c1",
        campusId: "campus-1",
        name: "Test Club",
        slug: "c1",
        description: "A testing club",
        category: "general",
        imageURL: null,
        bannerURL: null,
        createdBy: "system",
        stats: { memberCount: 10, postCount: 5 },
        status: "active",
        visibility: "campus_public",
        createdAt: null,
        updatedAt: null,
      });
    });
  });

  describe("getCommunityById", () => {
    it("returns null for empty or invalid communityId", async () => {
      expect(await getCommunityById("")).toBeNull();
      expect(await getCommunityById(null)).toBeNull();
      expect(await getCommunityById(123)).toBeNull();
    });

    it("returns normalized community when document exists", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: "apex-ai-club",
        data: () => ({
          name: "Apex AI & Robotics Society",
          campusId: APEX_CAMPUS_ID,
          stats: { memberCount: 42, postCount: 15 },
        }),
      });

      const result = await getCommunityById("apex-ai-club");
      expect(result).not.toBeNull();
      expect(result.id).toBe("apex-ai-club");
      expect(result.name).toBe("Apex AI & Robotics Society");
      expect(result.stats.memberCount).toBe(42);
    });

    it("falls back to static fixture when document does not exist in Firestore", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const result = await getCommunityById(COMMUNITY_APEX_AI.id);
      expect(result).not.toBeNull();
      expect(result.id).toBe(COMMUNITY_APEX_AI.id);
      expect(result.name).toBe(COMMUNITY_APEX_AI.name);
    });

    it("returns null when document does not exist and no static fixture matches", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const result = await getCommunityById("nonexistent-community-xyz");
      expect(result).toBeNull();
    });
  });

  describe("getCommunitiesByCampus", () => {
    it("returns empty array for invalid campusId", async () => {
      expect(await getCommunitiesByCampus("")).toEqual([]);
      expect(await getCommunitiesByCampus(null)).toEqual([]);
    });

    it("queries communities filtered by campusId and sorts by name", async () => {
      mocks.getDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: "apex-design",
            data: () => ({ name: "Beta Design Club", campusId: APEX_CAMPUS_ID }),
          },
          {
            id: "apex-ai",
            data: () => ({ name: "Alpha AI Club", campusId: APEX_CAMPUS_ID }),
          },
        ],
      });

      const results = await getCommunitiesByCampus(APEX_CAMPUS_ID);
      expect(mocks.query).toHaveBeenCalledWith(
        expect.objectContaining({ path: "communities" }),
        expect.anything()
      );
      expect(mocks.where).toHaveBeenCalledWith("campusId", "==", APEX_CAMPUS_ID);
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe("Alpha AI Club");
      expect(results[1].name).toBe("Beta Design Club");
    });

    it("falls back to static fixtures when Firestore query returns empty", async () => {
      mocks.getDocs.mockResolvedValueOnce({
        empty: true,
        docs: [],
      });

      const results = await getCommunitiesByCampus(ST_JUDE_CAMPUS_ID);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((c) => c.campusId === ST_JUDE_CAMPUS_ID)).toBe(true);
    });
  });

  describe("subscribeToCommunitiesByCampus", () => {
    it("calls callback immediately with empty array for missing campusId", () => {
      const cb = vi.fn();
      const unsub = subscribeToCommunitiesByCampus("", cb);
      expect(cb).toHaveBeenCalledWith([]);
      expect(typeof unsub).toBe("function");
    });

    it("sets up onSnapshot query and delivers sorted results to callback", () => {
      const cb = vi.fn();
      let snapshotHandler;
      mocks.onSnapshot.mockImplementationOnce((_q, handler) => {
        snapshotHandler = handler;
        return vi.fn();
      });

      subscribeToCommunitiesByCampus(APEX_CAMPUS_ID, cb);
      expect(mocks.where).toHaveBeenCalledWith("campusId", "==", APEX_CAMPUS_ID);

      snapshotHandler({
        docs: [
          { id: "c2", data: () => ({ name: "Zeta Club", campusId: APEX_CAMPUS_ID }) },
          { id: "c1", data: () => ({ name: "Alpha Club", campusId: APEX_CAMPUS_ID }) },
        ],
      });

      expect(cb).toHaveBeenCalledWith([
        expect.objectContaining({ id: "c1", name: "Alpha Club" }),
        expect.objectContaining({ id: "c2", name: "Zeta Club" }),
      ]);
    });
  });

  describe("subscribeToCommunity", () => {
    it("calls callback immediately with null for missing communityId", () => {
      const cb = vi.fn();
      const unsub = subscribeToCommunity("", cb);
      expect(cb).toHaveBeenCalledWith(null);
      expect(typeof unsub).toBe("function");
    });

    it("sets up onSnapshot listener and notifies callback on update", () => {
      const cb = vi.fn();
      let snapshotHandler;
      mocks.onSnapshot.mockImplementationOnce((_ref, handler) => {
        snapshotHandler = handler;
        return vi.fn();
      });

      subscribeToCommunity("apex-ai-club", cb);
      snapshotHandler({
        exists: () => true,
        id: "apex-ai-club",
        data: () => ({ name: "Live AI Society", campusId: APEX_CAMPUS_ID }),
      });

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ id: "apex-ai-club", name: "Live AI Society" })
      );
    });

    it("calls callback with null when document does not exist", () => {
      const cb = vi.fn();
      let snapshotHandler;
      mocks.onSnapshot.mockImplementationOnce((_ref, handler) => {
        snapshotHandler = handler;
        return vi.fn();
      });

      subscribeToCommunity("deleted-community", cb);
      snapshotHandler({
        exists: () => false,
      });

      expect(cb).toHaveBeenCalledWith(null);
    });
  });

  describe("getCommunityStats", () => {
    it("retrieves statistics counters for an existing community", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: "apex-ai-club",
        data: () => ({
          name: "Apex AI",
          stats: { memberCount: 50, postCount: 20 },
        }),
      });

      const stats = await getCommunityStats("apex-ai-club");
      expect(stats).toEqual({ memberCount: 50, postCount: 20 });
    });

    it("returns zeroed counters for non-existent community", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const stats = await getCommunityStats("nonexistent-club");
      expect(stats).toEqual({ memberCount: 0, postCount: 0 });
    });
  });
});
