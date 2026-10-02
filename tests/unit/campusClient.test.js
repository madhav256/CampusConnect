import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { APEX_CAMPUS_ID, ST_JUDE_CAMPUS_ID } from "../../src/constants.js";
import { CAMPUS_A, CAMPUS_B } from "../../src/data/campuses.js";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id, collection: coll })),
  collection: vi.fn((_db, name) => ({ path: name, name })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  limit: vi.fn((n) => ({ limit: n })),
  startAfter: vi.fn((cursor) => ({ startAfter: cursor })),
  endBefore: vi.fn((cursor) => ({ endBefore: cursor })),
  serverTimestamp: vi.fn(() => ({ _methodName: "serverTimestamp" })),
  runTransaction: vi.fn(),
  mockDb: { id: "mock-db" },
  useAuth: vi.fn(),
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
  addDoc: mocks.addDoc,
  deleteDoc: mocks.deleteDoc,
  updateDoc: mocks.updateDoc,
  writeBatch: mocks.writeBatch,
  onSnapshot: mocks.onSnapshot,
  query: mocks.query,
  orderBy: mocks.orderBy,
  where: mocks.where,
  limit: mocks.limit,
  startAfter: mocks.startAfter,
  endBefore: mocks.endBefore,
  serverTimestamp: mocks.serverTimestamp,
  runTransaction: mocks.runTransaction,
}));

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => mocks.useAuth(),
}));

import {
  campusDocRef,
  campusesCollectionRef,
  normalizeCampus,
  fetchCampusById,
  fetchAllCampuses,
  subscribeToCampus,
  clearCampusCache,
} from "../../src/services/campusService.js";

import { CampusContext } from "../../src/contexts/CampusContext.jsx";

import { useCampus } from "../../src/hooks/useCampus.js";
import { createPost, fetchOlderPosts } from "../../src/services/postService.js";
import {
  normalizePublicProfile,
  normalizeUserSettings,
  fetchAllUsers,
  clearUsersCache,
} from "../../src/services/userService.js";
import { sendConnectionRequest } from "../../src/services/connectionService.js";

describe("Milestone 18 — Unit 18.3: Client Services & Campus Context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCampusCache();
    clearUsersCache();
    mocks.useAuth.mockReturnValue({
      user: { uid: "test-user-1", email: "user1@apex.edu" },
      loading: false,
    });
  });

  describe("Campus Service (Goal 2)", () => {
    it("campusDocRef returns document reference for valid ID and throws on missing ID", () => {
      const ref = campusDocRef(APEX_CAMPUS_ID);
      expect(ref.path).toBe(`campuses/${APEX_CAMPUS_ID}`);
      expect(() => campusDocRef("")).toThrow("Campus ID is required");
    });

    it("campusesCollectionRef returns reference to campuses collection", () => {
      const colRef = campusesCollectionRef();
      expect(colRef.path).toBe("campuses");
    });

    it("normalizeCampus safely normalizes full campus records", () => {
      const normalized = normalizeCampus(APEX_CAMPUS_ID, CAMPUS_A);
      expect(normalized).toEqual({
        id: APEX_CAMPUS_ID,
        name: "Apex Institute of Technology",
        shortName: "Apex Tech",
        slug: "apex-university",
        domain: "campusconnect.edu",
        location: {
          city: "Bengaluru",
          state: "Karnataka",
          country: "India",
        },
        status: "active",
        isActive: true,
        branding: {
          logoURL: null,
          primaryColor: "#c2410c",
        },
        createdAt: null,
        updatedAt: null,
      });
    });

    it("normalizeCampus safely handles partial/null data with defaults", () => {
      expect(normalizeCampus(APEX_CAMPUS_ID, null)).toBeNull();

      const partial = normalizeCampus("custom-id", { name: "Custom College" });
      expect(partial.id).toBe("custom-id");
      expect(partial.name).toBe("Custom College");
      expect(partial.isActive).toBe(true);
      expect(partial.location.country).toBe("India");
    });

    it("fetchCampusById returns normalized campus and caches result", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: APEX_CAMPUS_ID,
        data: () => CAMPUS_A,
      });

      const campus1 = await fetchCampusById(APEX_CAMPUS_ID);
      expect(campus1.name).toBe("Apex Institute of Technology");
      expect(mocks.getDoc).toHaveBeenCalledTimes(1);

      // Second call hits in-memory cache without getDoc call
      const campus2 = await fetchCampusById(APEX_CAMPUS_ID);
      expect(campus2).toBe(campus1);
      expect(mocks.getDoc).toHaveBeenCalledTimes(1);
    });

    it("fetchCampusById returns null for unknown campus not in registry", async () => {
      mocks.getDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      const res = await fetchCampusById("unknown-non-existent-campus");
      expect(res).toBeNull();
    });

    it("fetchCampusById falls back to static CAMPUSES on network/doc failure", async () => {
      mocks.getDoc.mockRejectedValueOnce(new Error("Network timeout"));

      const campus = await fetchCampusById(ST_JUDE_CAMPUS_ID);
      expect(campus.name).toBe("St. Jude University");
      expect(campus.location.city).toBe("Mumbai");
    });

    it("fetchAllCampuses returns campuses list from Firestore or fallback", async () => {
      mocks.getDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          { id: APEX_CAMPUS_ID, data: () => CAMPUS_A },
          { id: ST_JUDE_CAMPUS_ID, data: () => CAMPUS_B },
        ],
      });

      const list = await fetchAllCampuses();
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe(APEX_CAMPUS_ID);
      expect(list[1].id).toBe(ST_JUDE_CAMPUS_ID);
    });

    it("subscribeToCampus attaches realtime listener", () => {
      mocks.onSnapshot.mockReturnValue(vi.fn());
      const callback = vi.fn();
      const unsubscribe = subscribeToCampus(APEX_CAMPUS_ID, callback);

      expect(typeof unsubscribe).toBe("function");
      expect(mocks.onSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ path: `campuses/${APEX_CAMPUS_ID}` }),
        expect.any(Function),
        expect.any(Function)
      );
    });
  });

  describe("Campus Context & useCampus Hook (Goal 1)", () => {
    const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

    it("useCampus throws if used outside CampusProvider", () => {
      internals.H = {
        useContext: () => null,
      };
      expect(() => useCampus()).toThrow("useCampus must be used within a CampusProvider");
    });

    it("useCampus returns context value when inside CampusProvider", () => {
      const customValue = {
        campus: CAMPUS_A,
        campusId: APEX_CAMPUS_ID,
        loading: false,
        error: null,
        refreshCampus: vi.fn(),
      };
      internals.H = {
        useContext: (ctx) => (ctx === CampusContext ? customValue : null),
      };
      expect(useCampus()).toEqual(customValue);
    });
  });

  describe("Service Campus-Awareness (Goal 3 & 4)", () => {
    describe("postService", () => {
      it("createPost attaches campusId when provided and omits it when null", async () => {
        mocks.addDoc.mockResolvedValueOnce({ id: "post-1" });
        await createPost("user-1", "Alice", null, "Hello Apex!", APEX_CAMPUS_ID);

        expect(mocks.addDoc).toHaveBeenCalledWith(
          expect.objectContaining({ path: "posts" }),
          expect.objectContaining({
            content: "Hello Apex!",
            authorId: "user-1",
            campusId: APEX_CAMPUS_ID,
          })
        );

        mocks.addDoc.mockResolvedValueOnce({ id: "post-2" });
        await createPost("user-1", "Alice", null, "Hello legacy world!", null);

        const lastCallData = mocks.addDoc.mock.calls[1][1];
        expect(lastCallData).not.toHaveProperty("campusId");
        expect(lastCallData.content).toBe("Hello legacy world!");
      });

      it("fetchOlderPosts applies where constraint when campusId is provided", async () => {
        mocks.getDocs.mockResolvedValueOnce({ docs: [] });

        await fetchOlderPosts(10, null, APEX_CAMPUS_ID);

        expect(mocks.where).toHaveBeenCalledWith("campusId", "==", APEX_CAMPUS_ID);
        expect(mocks.orderBy).toHaveBeenCalledWith("createdAt", "desc");
      });

      it("fetchOlderPosts preserves legacy query without where when campusId is omitted", async () => {
        mocks.getDocs.mockResolvedValueOnce({ docs: [] });

        await fetchOlderPosts(10, null);

        expect(mocks.where).not.toHaveBeenCalled();
        expect(mocks.orderBy).toHaveBeenCalledWith("createdAt", "desc");
      });
    });

    describe("userService", () => {
      it("normalizePublicProfile includes campusId when present, preserves 8 keys when absent", () => {
        const withCampus = normalizePublicProfile("u1", {
          displayName: "Alice",
          campusId: APEX_CAMPUS_ID,
        });
        expect(withCampus.campusId).toBe(APEX_CAMPUS_ID);

        const withoutCampus = normalizePublicProfile("u2", {
          displayName: "Bob",
        });
        expect(withoutCampus).not.toHaveProperty("campusId");
        expect(Object.keys(withoutCampus).sort()).toEqual([
          "bio",
          "department",
          "displayName",
          "photoURL",
          "skills",
          "socialLinks",
          "uid",
          "year",
        ]);
      });

      it("normalizeUserSettings includes campusId when present, omits when absent", () => {
        const settingsWith = normalizeUserSettings("u1", {
          email: "alice@apex.edu",
          campusId: APEX_CAMPUS_ID,
        });
        expect(settingsWith.campusId).toBe(APEX_CAMPUS_ID);

        const settingsWithout = normalizeUserSettings("u2", {
          email: "bob@test.com",
        });
        expect(settingsWithout).not.toHaveProperty("campusId");
      });

      it("fetchAllUsers filters by campusId when provided and partitions cache", async () => {
        mocks.getDocs.mockResolvedValueOnce({ docs: [] });

        await fetchAllUsers(50, { campusId: APEX_CAMPUS_ID });

        expect(mocks.where).toHaveBeenCalledWith("campusId", "==", APEX_CAMPUS_ID);
        expect(mocks.orderBy).toHaveBeenCalledWith("updatedAt", "desc");
        expect(mocks.limit).toHaveBeenCalledWith(50);
      });
    });

    describe("connectionService", () => {
      it("sendConnectionRequest blocks connection between students of different campuses", async () => {
        // Mock getDoc for fetchUserById in userService
        mocks.getDoc
          .mockResolvedValueOnce({
            exists: () => true,
            id: "alice",
            data: () => ({ displayName: "Alice", campusId: APEX_CAMPUS_ID }),
          })
          .mockResolvedValueOnce({
            exists: () => true,
            id: "bob",
            data: () => ({ displayName: "Bob", campusId: ST_JUDE_CAMPUS_ID }),
          });

        await expect(sendConnectionRequest("alice", "bob")).rejects.toThrow(
          "Students must belong to the same campus to connect."
        );
      });

      it("sendConnectionRequest permits connection and stamps campusId when both share campus", async () => {
        mocks.getDoc
          .mockResolvedValueOnce({
            exists: () => true,
            id: "alice",
            data: () => ({ displayName: "Alice", campusId: APEX_CAMPUS_ID }),
          })
          .mockResolvedValueOnce({
            exists: () => true,
            id: "charlie",
            data: () => ({ displayName: "Charlie", campusId: APEX_CAMPUS_ID }),
          });

        const mockTx = {
          get: vi.fn().mockResolvedValue({ exists: () => false }),
          set: vi.fn(),
        };
        mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx));

        await sendConnectionRequest("alice", "charlie");

        expect(mockTx.set).toHaveBeenCalledWith(
          expect.objectContaining({ path: "connections/alice_charlie" }),
          expect.objectContaining({
            users: ["alice", "charlie"],
            campusId: APEX_CAMPUS_ID,
          })
        );
      });
    });
  });
});
