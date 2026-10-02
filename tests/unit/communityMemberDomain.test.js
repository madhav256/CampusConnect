import { describe, expect, it, vi } from "vitest";
import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_ROLE_LIST,
  COMMUNITY_MEMBER_STATUSES,
  COMMUNITY_MEMBER_STATUS_LIST,
} from "../../src/constants.js";
import {
  getCommunityMemberId,
  buildCommunityMember,
  COMMUNITY_MEMBERS,
  COMMUNITY_MEMBER_LIST,
  COMMUNITY_MEMBER_APEX_AI_STUDENT1,
  COMMUNITY_MEMBER_APEX_AI_STUDENT2,
  COMMUNITY_MEMBER_ST_JUDE_STUDENT3,
} from "../../src/data/communityMembers.js";
import { seedCommunityMembers } from "../../scripts/seedCommunityMembers.mjs";

describe("Milestone 19 — Unit 19.2: Community Membership Domain Model & Seeding Invariants", () => {
  describe("Community Membership Constants & Roles", () => {
    it("exports all required community member roles", () => {
      expect(COMMUNITY_MEMBER_ROLES.MEMBER).toBe("member");
      expect(COMMUNITY_MEMBER_ROLES.MODERATOR).toBe("moderator");
      expect(COMMUNITY_MEMBER_ROLES.ADMIN).toBe("admin");

      expect(COMMUNITY_MEMBER_ROLE_LIST).toEqual(["member", "moderator", "admin"]);
    });

    it("exports all required community member statuses", () => {
      expect(COMMUNITY_MEMBER_STATUSES.ACTIVE).toBe("active");
      expect(COMMUNITY_MEMBER_STATUSES.REMOVED).toBe("removed");
      expect(COMMUNITY_MEMBER_STATUSES.PENDING).toBe("pending");

      expect(COMMUNITY_MEMBER_STATUS_LIST).toEqual(["active", "removed", "pending"]);
    });
  });

  describe("Deterministic Identifiers & Schema Compliance", () => {
    it("generates deterministic canonical IDs using {communityId}_{userId} format", () => {
      const id = getCommunityMemberId("apex-ai-club", "user123");
      expect(id).toBe("apex-ai-club_user123");
    });

    it("buildCommunityMember constructs a valid member object", () => {
      const member = buildCommunityMember({
        communityId: "apex-ai-club",
        userId: "alice",
        campusId: APEX_CAMPUS_ID,
        role: COMMUNITY_MEMBER_ROLES.MEMBER,
        status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
      });

      expect(member).toEqual({
        id: "apex-ai-club_alice",
        communityId: "apex-ai-club",
        userId: "alice",
        campusId: APEX_CAMPUS_ID,
        role: "member",
        status: "active",
      });
    });

    it("COMMUNITY_MEMBERS map indexes each membership by deterministic ID", () => {
      expect(COMMUNITY_MEMBERS[COMMUNITY_MEMBER_APEX_AI_STUDENT1.id]).toEqual(
        COMMUNITY_MEMBER_APEX_AI_STUDENT1
      );
      expect(COMMUNITY_MEMBERS[COMMUNITY_MEMBER_APEX_AI_STUDENT2.id]).toEqual(
        COMMUNITY_MEMBER_APEX_AI_STUDENT2
      );
      expect(COMMUNITY_MEMBERS[COMMUNITY_MEMBER_ST_JUDE_STUDENT3.id]).toEqual(
        COMMUNITY_MEMBER_ST_JUDE_STUDENT3
      );
    });

    it("every membership fixture adheres strictly to the documented schema", () => {
      for (const member of COMMUNITY_MEMBER_LIST) {
        expect(typeof member.id).toBe("string");
        expect(member.id).toBe(`${member.communityId}_${member.userId}`);

        // Reference checks
        expect(typeof member.communityId).toBe("string");
        expect(typeof member.userId).toBe("string");
        expect([APEX_CAMPUS_ID, ST_JUDE_CAMPUS_ID]).toContain(member.campusId);

        // Role & Status enums
        expect(COMMUNITY_MEMBER_ROLE_LIST).toContain(member.role);
        expect(COMMUNITY_MEMBER_STATUS_LIST).toContain(member.status);
      }
    });

    it("Apex and St. Jude community member fixtures reflect specified role architecture", () => {
      // Apex: apex-ai-club student1 is admin, student2 is member
      expect(COMMUNITY_MEMBER_APEX_AI_STUDENT1.communityId).toBe("apex-ai-club");
      expect(COMMUNITY_MEMBER_APEX_AI_STUDENT1.role).toBe(COMMUNITY_MEMBER_ROLES.ADMIN);
      expect(COMMUNITY_MEMBER_APEX_AI_STUDENT1.campusId).toBe(APEX_CAMPUS_ID);

      expect(COMMUNITY_MEMBER_APEX_AI_STUDENT2.communityId).toBe("apex-ai-club");
      expect(COMMUNITY_MEMBER_APEX_AI_STUDENT2.role).toBe(COMMUNITY_MEMBER_ROLES.MEMBER);
      expect(COMMUNITY_MEMBER_APEX_AI_STUDENT2.campusId).toBe(APEX_CAMPUS_ID);

      // St. Jude: st-jude-medical-society student3 is admin
      expect(COMMUNITY_MEMBER_ST_JUDE_STUDENT3.communityId).toBe("st-jude-medical-society");
      expect(COMMUNITY_MEMBER_ST_JUDE_STUDENT3.role).toBe(COMMUNITY_MEMBER_ROLES.ADMIN);
      expect(COMMUNITY_MEMBER_ST_JUDE_STUDENT3.campusId).toBe(ST_JUDE_CAMPUS_ID);
    });
  });

  describe("seedCommunityMembers Function", () => {
    it("idempotently sets each membership document with merge: true", async () => {
      const setMock = vi.fn().mockResolvedValue(undefined);
      const docMock = vi.fn((id) => ({
        id,
        set: setMock,
      }));
      const collectionMock = vi.fn((name) => {
        expect(name).toBe("communityMembers");
        return { doc: docMock };
      });

      const mockDb = { collection: collectionMock };
      const mockTimestamp = { seconds: 1700000000, nanoseconds: 0 };

      const seededIds = await seedCommunityMembers(mockDb, mockTimestamp);

      expect(seededIds).toEqual(COMMUNITY_MEMBER_LIST.map((m) => m.id));
      expect(collectionMock).toHaveBeenCalledTimes(COMMUNITY_MEMBER_LIST.length);

      for (const member of COMMUNITY_MEMBER_LIST) {
        expect(docMock).toHaveBeenCalledWith(member.id);
        expect(setMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: member.id,
            communityId: member.communityId,
            userId: member.userId,
            campusId: member.campusId,
            role: member.role,
            status: member.status,
            joinedAt: mockTimestamp,
            updatedAt: mockTimestamp,
          }),
          { merge: true }
        );
      }
    });

    it("running seeder twice produces deterministic, idempotent output without duplicate writes", async () => {
      const setMock = vi.fn().mockResolvedValue(undefined);
      const docMock = vi.fn((id) => ({
        id,
        set: setMock,
      }));
      const collectionMock = vi.fn(() => ({ doc: docMock }));
      const mockDb = { collection: collectionMock };
      const mockTimestamp = { seconds: 1700000000, nanoseconds: 0 };

      const run1 = await seedCommunityMembers(mockDb, mockTimestamp);
      const run2 = await seedCommunityMembers(mockDb, mockTimestamp);

      expect(run1).toEqual(run2);
      expect(new Set(run1).size).toBe(run1.length);
      expect(setMock).toHaveBeenCalledTimes(COMMUNITY_MEMBER_LIST.length * 2);
    });

    it("gracefully filters out duplicate membership IDs in passed list", async () => {
      const setMock = vi.fn().mockResolvedValue(undefined);
      const docMock = vi.fn((id) => ({ id, set: setMock }));
      const collectionMock = vi.fn(() => ({ doc: docMock }));
      const mockDb = { collection: collectionMock };

      const listWithDuplicates = [
        COMMUNITY_MEMBER_APEX_AI_STUDENT1,
        COMMUNITY_MEMBER_APEX_AI_STUDENT1, // duplicate
        COMMUNITY_MEMBER_APEX_AI_STUDENT2,
      ];

      const seeded = await seedCommunityMembers(mockDb, null, listWithDuplicates);
      expect(seeded).toHaveLength(2);
      expect(seeded).toEqual([
        COMMUNITY_MEMBER_APEX_AI_STUDENT1.id,
        COMMUNITY_MEMBER_APEX_AI_STUDENT2.id,
      ]);
    });
  });
});
