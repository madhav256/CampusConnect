import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  APEX_CAMPUS_ID,
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../../src/constants.js";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id, collection: coll })),
  collection: vi.fn((_db, name) => ({ path: name, name })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  serverTimestamp: vi.fn(() => ({ _methodName: "serverTimestamp" })),
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
  setDoc: mocks.setDoc,
  deleteDoc: mocks.deleteDoc,
  onSnapshot: mocks.onSnapshot,
  query: mocks.query,
  where: mocks.where,
  serverTimestamp: mocks.serverTimestamp,
}));

import {
  communityMemberDocRef,
  communityMembersCollectionRef,
  normalizeCommunityMember,
  getCommunityMembership,
  subscribeToCommunityMembership,
  getCommunityMembers,
  subscribeToCommunityMembers,
  joinCommunity,
  leaveCommunity,
} from "../../src/services/communityMemberService.js";

describe("Milestone 19 — Unit 19.4: Community Member Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Reference helpers & normalization", () => {
    it("communityMemberDocRef returns document reference for valid ID and throws on missing ID", () => {
      const ref = communityMemberDocRef("apex-ai-club_user-1");
      expect(ref.path).toBe("communityMembers/apex-ai-club_user-1");
      expect(() => communityMemberDocRef("")).toThrow("Membership ID is required");
      expect(() => communityMemberDocRef(null)).toThrow("Membership ID is required");
    });

    it("communityMembersCollectionRef returns reference to communityMembers collection", () => {
      const colRef = communityMembersCollectionRef();
      expect(colRef.path).toBe("communityMembers");
    });

    it("normalizeCommunityMember handles null/undefined safely", () => {
      expect(normalizeCommunityMember("any-id", null)).toBeNull();
      expect(normalizeCommunityMember("any-id", undefined)).toBeNull();
    });

    it("normalizeCommunityMember standardizes membership fields and defaults", () => {
      const raw = {
        communityId: "apex-ai-club",
        userId: "user-1",
        campusId: APEX_CAMPUS_ID,
      };
      const normalized = normalizeCommunityMember("apex-ai-club_user-1", raw);
      expect(normalized).toEqual({
        id: "apex-ai-club_user-1",
        communityId: "apex-ai-club",
        userId: "user-1",
        campusId: APEX_CAMPUS_ID,
        role: COMMUNITY_MEMBER_ROLES.MEMBER,
        status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
        joinedAt: null,
        updatedAt: null,
      });
    });
  });

  describe("getCommunityMembership", () => {
    it("returns null for missing parameters", async () => {
      expect(await getCommunityMembership("", "user-1")).toBeNull();
      expect(await getCommunityMembership("apex-ai-club", "")).toBeNull();
      expect(await getCommunityMembership(null, null)).toBeNull();
    });

    it("returns normalized membership when document exists", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: "apex-ai-club_user-1",
        data: () => ({
          communityId: "apex-ai-club",
          userId: "user-1",
          campusId: APEX_CAMPUS_ID,
          role: "admin",
          status: "active",
        }),
      });

      const membership = await getCommunityMembership("apex-ai-club", "user-1");
      expect(membership).not.toBeNull();
      expect(membership.id).toBe("apex-ai-club_user-1");
      expect(membership.role).toBe("admin");
      expect(membership.status).toBe("active");
    });

    it("returns null when membership document does not exist", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const membership = await getCommunityMembership("apex-ai-club", "nonmember-user");
      expect(membership).toBeNull();
    });
  });

  describe("subscribeToCommunityMembership", () => {
    it("calls callback immediately with null for missing parameters", () => {
      const cb = vi.fn();
      const unsub = subscribeToCommunityMembership("", "user-1", cb);
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

      subscribeToCommunityMembership("apex-ai-club", "user-1", cb);
      expect(mocks.doc).toHaveBeenCalledWith(
        expect.anything(),
        "communityMembers",
        "apex-ai-club_user-1"
      );

      snapshotHandler({
        exists: () => true,
        id: "apex-ai-club_user-1",
        data: () => ({
          communityId: "apex-ai-club",
          userId: "user-1",
          campusId: APEX_CAMPUS_ID,
          role: "member",
          status: "active",
        }),
      });

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "apex-ai-club_user-1",
          role: "member",
          status: "active",
        })
      );
    });

    it("notifies callback with null when membership document is deleted or missing", () => {
      const cb = vi.fn();
      let snapshotHandler;
      mocks.onSnapshot.mockImplementationOnce((_ref, handler) => {
        snapshotHandler = handler;
        return vi.fn();
      });

      subscribeToCommunityMembership("apex-ai-club", "user-1", cb);
      snapshotHandler({
        exists: () => false,
      });

      expect(cb).toHaveBeenCalledWith(null);
    });
  });

  describe("getCommunityMembers", () => {
    it("returns empty array for invalid communityId", async () => {
      expect(await getCommunityMembers("")).toEqual([]);
      expect(await getCommunityMembers(null)).toEqual([]);
    });

    it("queries communityMembers collection filtered by communityId", async () => {
      mocks.getDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: "apex-ai-club_u1",
            data: () => ({
              communityId: "apex-ai-club",
              userId: "u1",
              campusId: APEX_CAMPUS_ID,
              role: "admin",
            }),
          },
          {
            id: "apex-ai-club_u2",
            data: () => ({
              communityId: "apex-ai-club",
              userId: "u2",
              campusId: APEX_CAMPUS_ID,
              role: "member",
            }),
          },
        ],
      });

      const members = await getCommunityMembers("apex-ai-club");
      expect(mocks.query).toHaveBeenCalledWith(
        expect.objectContaining({ path: "communityMembers" }),
        expect.anything()
      );
      expect(mocks.where).toHaveBeenCalledWith("communityId", "==", "apex-ai-club");
      expect(members).toHaveLength(2);
      expect(members[0].userId).toBe("u1");
      expect(members[1].userId).toBe("u2");
    });
  });

  describe("subscribeToCommunityMembers", () => {
    it("calls callback immediately with empty array for missing communityId", () => {
      const cb = vi.fn();
      const unsub = subscribeToCommunityMembers("", cb);
      expect(cb).toHaveBeenCalledWith([]);
      expect(typeof unsub).toBe("function");
    });

    it("sets up onSnapshot query and notifies callback of member updates", () => {
      const cb = vi.fn();
      let snapshotHandler;
      mocks.onSnapshot.mockImplementationOnce((_q, handler) => {
        snapshotHandler = handler;
        return vi.fn();
      });

      subscribeToCommunityMembers("apex-ai-club", cb);
      expect(mocks.where).toHaveBeenCalledWith("communityId", "==", "apex-ai-club");

      snapshotHandler({
        docs: [
          {
            id: "apex-ai-club_u1",
            data: () => ({
              communityId: "apex-ai-club",
              userId: "u1",
              campusId: APEX_CAMPUS_ID,
              role: "member",
            }),
          },
        ],
      });

      expect(cb).toHaveBeenCalledWith([
        expect.objectContaining({ id: "apex-ai-club_u1", userId: "u1" }),
      ]);
    });
  });

  describe("joinCommunity", () => {
    it("validates required parameters and throws error on missing fields", async () => {
      await expect(joinCommunity("", "u1", APEX_CAMPUS_ID)).rejects.toThrow(
        "communityId, userId, and campusId are required"
      );
      await expect(joinCommunity("apex-ai-club", "", APEX_CAMPUS_ID)).rejects.toThrow(
        "communityId, userId, and campusId are required"
      );
      await expect(joinCommunity("apex-ai-club", "u1", "")).rejects.toThrow(
        "communityId, userId, and campusId are required"
      );
    });

    it("creates an active member document with deterministic ID and valid schema", async () => {
      mocks.setDoc.mockResolvedValueOnce();

      const created = await joinCommunity("apex-ai-club", "u1", APEX_CAMPUS_ID);
      expect(created.id).toBe("apex-ai-club_u1");
      expect(created.role).toBe(COMMUNITY_MEMBER_ROLES.MEMBER);
      expect(created.status).toBe(COMMUNITY_MEMBER_STATUSES.ACTIVE);
      expect(mocks.setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "communityMembers/apex-ai-club_u1" }),
        expect.objectContaining({
          id: "apex-ai-club_u1",
          communityId: "apex-ai-club",
          userId: "u1",
          campusId: APEX_CAMPUS_ID,
          role: COMMUNITY_MEMBER_ROLES.MEMBER,
          status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
        })
      );
    });
  });

  describe("leaveCommunity", () => {
    it("validates required parameters and throws error on missing fields", async () => {
      await expect(leaveCommunity("", "u1")).rejects.toThrow(
        "communityId and userId are required"
      );
      await expect(leaveCommunity("apex-ai-club", "")).rejects.toThrow(
        "communityId and userId are required"
      );
    });

    it("deletes the community membership document", async () => {
      mocks.deleteDoc.mockResolvedValueOnce();

      await leaveCommunity("apex-ai-club", "u1");
      expect(mocks.deleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "communityMembers/apex-ai-club_u1" })
      );
    });
  });
});
