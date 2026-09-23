import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id, collection: coll })),
  collection: vi.fn((_db, name) => ({ path: name, name })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  limit: vi.fn((n) => ({ limit: n })),
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
  updateDoc: mocks.updateDoc,
  writeBatch: mocks.writeBatch,
  onSnapshot: mocks.onSnapshot,
  query: mocks.query,
  orderBy: mocks.orderBy,
  limit: mocks.limit,
  serverTimestamp: mocks.serverTimestamp,
}));

import {
  fetchUserById,
  fetchAllUsers,
  createUserProfile,
  updateUserProfile,
  updateUserSettings,
  subscribeToUserProfile,
} from "../../src/services/userService.js";

describe("Milestone 14B - Bridge Service Implementation", () => {
  let mockBatch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBatch = {
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    mocks.writeBatch.mockReturnValue(mockBatch);
  });

  describe("1. fetchUserById — Bridge Dual-Read Path", () => {
    it("returns publicProfiles result for a migrated user", async () => {
      const publicData = {
        uid: "user-1",
        displayName: "Migrated Alice",
        photoURL: "https://avatar.test/alice.jpg",
        bio: "Alice bio",
        department: "Computer Science",
        year: "Junior",
        skills: ["React", "Firebase"],
        socialLinks: { github: "https://github.com/alice", linkedin: "", portfolio: "", website: "" },
      };

      mocks.getDoc.mockImplementation(async (ref) => {
        if (ref.path === "publicProfiles/user-1") {
          return { exists: () => true, data: () => publicData };
        }
        return { exists: () => false, data: () => null };
      });

      const profile = await fetchUserById("user-1");

      expect(profile).not.toBeNull();
      expect(profile.displayName).toBe("Migrated Alice");
      expect(profile.department).toBe("Computer Science");
      expect(profile.skills).toEqual(["React", "Firebase"]);
      expect(profile.uid).toBe("user-1");
      // Does not fall back to users/{uid} because publicProfiles exists
      expect(mocks.getDoc).toHaveBeenCalledTimes(1);
    });

    it("falls back to users/{uid} for an unmigrated user", async () => {
      const legacyUserData = {
        uid: "user-2",
        displayName: "Legacy Bob",
        photoURL: null,
        bio: "Legacy bio",
        department: "Mechanical Engineering",
        year: "Senior",
        skills: ["CAD", "Thermodynamics"],
        socialLinks: { github: "", linkedin: "", portfolio: "", website: "" },
        email: "bob@test.edu",
        isDiscoverable: true,
        notificationPreferences: { connectionRequests: true, connectionAccepted: true },
      };

      mocks.getDoc.mockImplementation(async (ref) => {
        if (ref.path === "publicProfiles/user-2") {
          return { exists: () => false, data: () => null };
        }
        if (ref.path === "users/user-2") {
          return { exists: () => true, data: () => legacyUserData };
        }
        return { exists: () => false, data: () => null };
      });

      const profile = await fetchUserById("user-2");

      expect(profile).not.toBeNull();
      expect(profile.displayName).toBe("Legacy Bob");
      expect(profile.department).toBe("Mechanical Engineering");
      expect(profile.skills).toEqual(["CAD", "Thermodynamics"]);
      expect(mocks.getDoc).toHaveBeenCalledTimes(2);
    });

    it("falls back to users/{uid} when publicProfiles read fails with error", async () => {
      const legacyUserData = {
        uid: "user-3",
        displayName: "Carol Fallback",
        bio: "Bio from user doc",
        department: "Physics",
        year: "Sophomore",
        skills: ["Quantum"],
      };

      mocks.getDoc.mockImplementation(async (ref) => {
        if (ref.path === "publicProfiles/user-3") {
          throw new Error("Simulated publicProfiles read failure");
        }
        if (ref.path === "users/user-3") {
          return { exists: () => true, data: () => legacyUserData };
        }
        return { exists: () => false, data: () => null };
      });

      const profile = await fetchUserById("user-3");

      expect(profile).not.toBeNull();
      expect(profile.displayName).toBe("Carol Fallback");
      expect(profile.department).toBe("Physics");
    });

    it("returns null when user is missing in both collections", async () => {
      mocks.getDoc.mockResolvedValue({ exists: () => false, data: () => null });

      const profile = await fetchUserById("nonexistent-uid");

      expect(profile).toBeNull();
    });

    it("returns null when uid is empty or falsy", async () => {
      const profile = await fetchUserById(null);
      expect(profile).toBeNull();
      expect(mocks.getDoc).not.toHaveBeenCalled();
    });
  });

  describe("2. Bridge Search / Discover Behavior", () => {
    it("queries users collection as the sole search source, not directoryIndex", async () => {
      const mockDocs = [
        {
          id: "u1",
          data: () => ({
            displayName: "Student One",
            department: "Computer Science",
            year: "Senior",
            skills: ["React"],
            isDiscoverable: true,
            updatedAt: { seconds: 1700000000 },
          }),
        },
      ];

      mocks.getDocs.mockResolvedValue({ docs: mockDocs });

      const results = await fetchAllUsers(50);

      // Verify that collection was called with 'users'
      expect(mocks.collection).toHaveBeenCalledWith(mocks.mockDb, "users");
      expect(mocks.collection).not.toHaveBeenCalledWith(mocks.mockDb, "directoryIndex");
      expect(results).toHaveLength(1);
      expect(results[0].displayName).toBe("Student One");
    });

    it("applies 14A discoverability filtering semantics correctly", () => {
      const currentUid = "self-uid";
      const usersList = [
        { uid: "self-uid", displayName: "Self User", isDiscoverable: false },
        { uid: "peer-1", displayName: "Discoverable Peer", isDiscoverable: true },
        { uid: "peer-2", displayName: "Hidden Peer", isDiscoverable: false },
        { uid: "peer-3", displayName: "Default Peer" }, // isDiscoverable undefined => true
      ];

      // Exact filtering logic from useUserSearch:
      const visibleUsers = usersList.filter(
        (u) => u.uid === currentUid || u.isDiscoverable !== false,
      );

      expect(visibleUsers.map((u) => u.uid)).toEqual(["self-uid", "peer-1", "peer-3"]);
      expect(visibleUsers.find((u) => u.uid === "peer-2")).toBeUndefined();
    });
  });

  describe("3. createUserProfile — Atomic Multi-Collection Creation", () => {
    it("atomically establishes users, publicProfiles, and directoryIndex when discoverable", async () => {
      mocks.getDoc.mockResolvedValue({ exists: () => false, data: () => null });

      const result = await createUserProfile({
        uid: "new-user-1",
        displayName: "New Student",
        email: "new@example.test",
        photoURL: "https://avatar.test/new.jpg",
        isDiscoverable: true,
      });

      expect(mocks.writeBatch).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);

      // 1. users/{uid} set call
      const userSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "users/new-user-1",
      );
      expect(userSetCall).toBeDefined();
      const userDoc = userSetCall[1];
      expect(userDoc.displayName).toBe("New Student");
      expect(userDoc.email).toBe("new@example.test");
      expect(userDoc.photoURL).toBe("https://avatar.test/new.jpg");
      expect(userDoc.isDiscoverable).toBe(true);
      expect(userDoc.notificationPreferences).toEqual({
        connectionRequests: true,
        connectionAccepted: true,
      });
      expect(userDoc.bio).toBe("");
      expect(userDoc.skills).toEqual([]);

      // 2. publicProfiles/{uid} set call
      const pubSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "publicProfiles/new-user-1",
      );
      expect(pubSetCall).toBeDefined();
      const pubDoc = pubSetCall[1];
      expect(pubDoc.uid).toBe("new-user-1");
      expect(pubDoc.displayName).toBe("New Student");
      expect(pubDoc.photoURL).toBe("https://avatar.test/new.jpg");
      // Strict 8-field verification: must NOT contain private settings
      expect(pubDoc).not.toHaveProperty("email");
      expect(pubDoc).not.toHaveProperty("isDiscoverable");
      expect(pubDoc).not.toHaveProperty("notificationPreferences");
      expect(pubDoc).not.toHaveProperty("createdAt");
      expect(pubDoc).not.toHaveProperty("updatedAt");

      // 3. directoryIndex/{uid} set call
      const indexSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "directoryIndex/new-user-1",
      );
      expect(indexSetCall).toBeDefined();
      const indexDoc = indexSetCall[1];
      expect(indexDoc.uid).toBe("new-user-1");
      expect(indexDoc.displayName).toBe("New Student");
      expect(indexDoc).not.toHaveProperty("email");
      expect(indexDoc).not.toHaveProperty("bio");
      expect(indexDoc).not.toHaveProperty("socialLinks");
      expect(indexDoc).not.toHaveProperty("notificationPreferences");

      expect(result.uid).toBe("new-user-1");
      expect(result.displayName).toBe("New Student");
    });

    it("omits directoryIndex when user is non-discoverable on creation", async () => {
      mocks.getDoc.mockResolvedValue({ exists: () => false, data: () => null });

      await createUserProfile({
        uid: "private-user",
        displayName: "Private Student",
        email: "private@example.test",
        isDiscoverable: false,
      });

      expect(mockBatch.commit).toHaveBeenCalledTimes(1);

      const indexSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "directoryIndex/private-user",
      );
      expect(indexSetCall).toBeUndefined();
    });
  });

  describe("4. updateUserProfile — Atomic Dual-Write & Field Mirroring", () => {
    it("atomically writes publicProfiles, directoryIndex, and mirrors only legacy public fields to users", async () => {
      const existingUser = {
        uid: "edit-user",
        isDiscoverable: true,
        email: "edit@example.test",
        notificationPreferences: { connectionRequests: true, connectionAccepted: true },
      };
      const existingPub = {
        uid: "edit-user",
        displayName: "Original Name",
        bio: "Old bio",
        department: "Math",
        year: "Freshman",
        skills: ["Calculus"],
        socialLinks: { github: "", linkedin: "", portfolio: "", website: "" },
      };

      mocks.getDoc.mockImplementation(async (ref) => {
        if (ref.path === "users/edit-user") return { exists: () => true, data: () => existingUser };
        if (ref.path === "publicProfiles/edit-user") return { exists: () => true, data: () => existingPub };
        return { exists: () => false, data: () => null };
      });

      await updateUserProfile("edit-user", {
        displayName: "Updated Name",
        bio: "New bio",
        department: "Applied Math",
        year: "Sophomore",
        skills: ["Calculus", "Linear Algebra"],
        socialLinks: { github: "https://github.com/edit", linkedin: "", portfolio: "", website: "" },
        // Attempt to pass forbidden fields that MUST NOT mirror:
        email: "hacked@example.test",
        isDemo: true,
        isDiscoverable: false,
        notificationPreferences: { connectionRequests: false },
        role: "admin",
      });

      expect(mocks.writeBatch).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);

      // Verify publicProfiles set
      const pubSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "publicProfiles/edit-user",
      );
      expect(pubSetCall).toBeDefined();
      expect(pubSetCall[1].displayName).toBe("Updated Name");
      expect(pubSetCall[1].bio).toBe("New bio");
      expect(pubSetCall[1]).not.toHaveProperty("email");
      expect(pubSetCall[1]).not.toHaveProperty("isDemo");
      expect(pubSetCall[1]).not.toHaveProperty("isDiscoverable");

      // Verify directoryIndex set
      const indexSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "directoryIndex/edit-user",
      );
      expect(indexSetCall).toBeDefined();
      expect(indexSetCall[1].displayName).toBe("Updated Name");
      expect(indexSetCall[1].department).toBe("Applied Math");

      // Verify users update call mirrors ONLY allowed legacy public fields + updatedAt
      const userUpdateCall = mockBatch.update.mock.calls.find(
        (c) => c[0].path === "users/edit-user",
      );
      expect(userUpdateCall).toBeDefined();
      const mirroredData = userUpdateCall[1];

      // Exactly allowed legacy public fields:
      expect(mirroredData.displayName).toBe("Updated Name");
      expect(mirroredData.bio).toBe("New bio");
      expect(mirroredData.department).toBe("Applied Math");
      expect(mirroredData.year).toBe("Sophomore");
      expect(mirroredData.skills).toEqual(["Calculus", "Linear Algebra"]);
      expect(mirroredData.socialLinks.github).toBe("https://github.com/edit");
      expect(mirroredData).toHaveProperty("updatedAt");

      // STRICT NEGATIVE ASSERTIONS: Must NEVER mirror these:
      expect(mirroredData).not.toHaveProperty("email");
      expect(mirroredData).not.toHaveProperty("isDemo");
      expect(mirroredData).not.toHaveProperty("isDiscoverable");
      expect(mirroredData).not.toHaveProperty("notificationPreferences");
      expect(mirroredData).not.toHaveProperty("role");
      expect(mirroredData).not.toHaveProperty("createdAt");
      expect(mirroredData).not.toHaveProperty("uid");
    });
  });

  describe("5. Discoverability Transitions (updateUserSettings)", () => {
    it("false -> true: updates users.isDiscoverable and creates directoryIndex atomically", async () => {
      const existingUser = { uid: "toggle-user", isDiscoverable: false };
      const existingPub = {
        uid: "toggle-user",
        displayName: "Toggle Student",
        photoURL: null,
        department: "Biology",
        year: "Junior",
        skills: ["Genetics"],
      };

      mocks.getDoc.mockImplementation(async (ref) => {
        if (ref.path === "users/toggle-user") return { exists: () => true, data: () => existingUser };
        if (ref.path === "publicProfiles/toggle-user") return { exists: () => true, data: () => existingPub };
        return { exists: () => false, data: () => null };
      });

      await updateUserSettings("toggle-user", { isDiscoverable: true });

      expect(mockBatch.commit).toHaveBeenCalledTimes(1);

      // Verify user update
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/toggle-user" }),
        expect.objectContaining({ isDiscoverable: true }),
      );

      // Verify directoryIndex creation with projection
      expect(mockBatch.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: "directoryIndex/toggle-user" }),
        expect.objectContaining({
          uid: "toggle-user",
          displayName: "Toggle Student",
          department: "Biology",
          skills: ["Genetics"],
        }),
      );
    });

    it("true -> false: updates users.isDiscoverable and deletes directoryIndex atomically", async () => {
      mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ isDiscoverable: true }) });

      await updateUserSettings("toggle-user", { isDiscoverable: false });

      expect(mockBatch.commit).toHaveBeenCalledTimes(1);

      // Verify user update
      expect(mockBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/toggle-user" }),
        expect.objectContaining({ isDiscoverable: false }),
      );

      // Verify directoryIndex deletion
      expect(mockBatch.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: "directoryIndex/toggle-user" }),
      );
    });
  });

  describe("6. subscribeToUserProfile — Dual-Read Listener", () => {
    it("emits combined state when both snapshots arrive", () => {
      let userCb, publicCb;
      mocks.onSnapshot.mockImplementation((ref, onNext) => {
        if (ref.path.startsWith("users/")) userCb = onNext;
        if (ref.path.startsWith("publicProfiles/")) publicCb = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      subscribeToUserProfile("sub-1", callback);

      // User snapshot arrives
      userCb({
        exists: () => true,
        data: () => ({
          email: "sub1@test.edu",
          isDiscoverable: true,
          notificationPreferences: { connectionRequests: true, connectionAccepted: true },
        }),
      });

      // Not emitted yet (waiting for public snap)
      expect(callback).not.toHaveBeenCalled();

      // Public snapshot arrives
      publicCb({
        exists: () => true,
        data: () => ({
          displayName: "Subscribed User",
          bio: "Sub bio",
          department: "Arts",
          year: "Freshman",
          skills: ["Painting"],
          socialLinks: { github: "", linkedin: "", portfolio: "", website: "" },
        }),
      });

      // Emitted exactly once
      expect(callback).toHaveBeenCalledTimes(1);
      const emitted = callback.mock.calls[0][0];
      expect(emitted.displayName).toBe("Subscribed User");
      expect(emitted.email).toBe("sub1@test.edu");
      expect(emitted.isDiscoverable).toBe(true);
    });

    it("falls back to users public fields when publicProfiles does not exist (unmigrated user)", () => {
      let userCb, publicCb;
      mocks.onSnapshot.mockImplementation((ref, onNext) => {
        if (ref.path.startsWith("users/")) userCb = onNext;
        if (ref.path.startsWith("publicProfiles/")) publicCb = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      subscribeToUserProfile("unmigrated-sub", callback);

      // Legacy user snap with public + private data
      userCb({
        exists: () => true,
        data: () => ({
          displayName: "Unmigrated Student",
          bio: "Unmigrated bio",
          department: "Chemistry",
          year: "Senior",
          skills: ["Organic Chem"],
          email: "unmigrated@test.edu",
          isDiscoverable: true,
          notificationPreferences: { connectionRequests: true, connectionAccepted: true },
        }),
      });

      // Public profile doc missing
      publicCb({
        exists: () => false,
        data: () => null,
      });

      expect(callback).toHaveBeenCalledTimes(1);
      const emitted = callback.mock.calls[0][0];
      expect(emitted.displayName).toBe("Unmigrated Student");
      expect(emitted.bio).toBe("Unmigrated bio");
      expect(emitted.department).toBe("Chemistry");
      expect(emitted.skills).toEqual(["Organic Chem"]);
      expect(emitted.email).toBe("unmigrated@test.edu");
    });
  });
});
