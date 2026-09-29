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
  normalizePublicProfile,
  normalizeUserSettings,
} from "../../src/services/userService.js";

describe("userService — Pure Normalizers & Projections", () => {
  describe("normalizePublicProfile", () => {
    it("strictly produces the 8 frozen public profile fields", () => {
      const rawData = {
        uid: "student-1",
        displayName: "Jane Doe",
        photoURL: "https://example.test/avatar.jpg",
        bio: "CS Sophomore passionate about AI",
        department: "Computer Science",
        year: "Sophomore",
        skills: ["React", "Python"],
        socialLinks: {
          github: "https://github.com/janedoe",
          linkedin: "https://linkedin.com/in/janedoe",
          portfolio: "https://janedoe.me",
          website: "https://janedoe.com",
        },
        // Private/forbidden fields that MUST NOT leak:
        email: "jane@university.edu",
        isDiscoverable: true,
        notificationPreferences: { connectionRequests: true, connectionAccepted: true },
        isDemo: true,
        createdAt: { seconds: 1700000000 },
        updatedAt: { seconds: 1700000000 },
        extraSecretField: "secret",
      };

      const publicProfile = normalizePublicProfile("student-1", rawData);

      // Exactly 8 keys allowed
      expect(Object.keys(publicProfile).sort()).toEqual([
        "bio",
        "department",
        "displayName",
        "photoURL",
        "skills",
        "socialLinks",
        "uid",
        "year",
      ]);

      expect(publicProfile).toEqual({
        uid: "student-1",
        displayName: "Jane Doe",
        photoURL: "https://example.test/avatar.jpg",
        bio: "CS Sophomore passionate about AI",
        department: "Computer Science",
        year: "Sophomore",
        skills: ["React", "Python"],
        socialLinks: {
          github: "https://github.com/janedoe",
          linkedin: "https://linkedin.com/in/janedoe",
          portfolio: "https://janedoe.me",
          website: "https://janedoe.com",
        },
      });

      // Explicitly verify forbidden fields are absent
      expect(publicProfile).not.toHaveProperty("email");
      expect(publicProfile).not.toHaveProperty("isDiscoverable");
      expect(publicProfile).not.toHaveProperty("notificationPreferences");
      expect(publicProfile).not.toHaveProperty("isDemo");
      expect(publicProfile).not.toHaveProperty("createdAt");
      expect(publicProfile).not.toHaveProperty("updatedAt");
    });

    it("handles null/missing raw data with safe defaults", () => {
      const publicProfile = normalizePublicProfile("student-2", null);

      expect(publicProfile).toEqual({
        uid: "student-2",
        displayName: "CampusConnect Student",
        photoURL: null,
        bio: "",
        department: "Department not added",
        year: "Academic year not added",
        skills: [],
        socialLinks: {
          github: "",
          linkedin: "",
          portfolio: "",
          website: "",
        },
      });
    });
  });

  describe("normalizeUserSettings", () => {
    it("normalizes settings while preserving explicit false values", () => {
      const rawData = {
        email: "alice@example.test",
        isDiscoverable: false,
        notificationPreferences: {
          connectionRequests: false,
          connectionAccepted: true,
        },
        // Public fields that must not be in settings
        displayName: "Should Not Be Here",
        bio: "Should Not Be Here",
      };

      const settings = normalizeUserSettings("student-1", rawData);

      expect(settings).toEqual({
        uid: "student-1",
        email: "alice@example.test",
        isDiscoverable: false,
        notificationPreferences: {
          connectionRequests: false,
          connectionAccepted: true,
        },
        createdAt: null,
        updatedAt: null,
      });

      expect(settings).not.toHaveProperty("displayName");
      expect(settings).not.toHaveProperty("bio");
    });

    it("uses default settings when raw data is absent", () => {
      const settings = normalizeUserSettings("student-2", null);

      expect(settings).toEqual({
        uid: "student-2",
        email: "",
        isDiscoverable: true,
        notificationPreferences: {
          connectionRequests: true,
          connectionAccepted: true,
        },
        createdAt: null,
        updatedAt: null,
      });
    });
  });

  describe("directoryIndex projection derivation", () => {
    it("derives directoryIndex fields directly from publicProfiles", () => {
      const publicProfile = normalizePublicProfile("student-3", {
        displayName: "Alex Smith",
        photoURL: null,
        bio: "Electrical engineering student",
        department: "Electrical Engineering",
        year: "Junior",
        skills: ["Embedded", "C++"],
        socialLinks: { github: "https://github.com/alex", linkedin: "", portfolio: "", website: "" },
      });

      // Derive directoryIndex projection
      const directoryDoc = {
        uid: publicProfile.uid,
        displayName: publicProfile.displayName,
        photoURL: publicProfile.photoURL,
        department: publicProfile.department,
        year: publicProfile.year,
        skills: publicProfile.skills,
      };

      expect(directoryDoc).toEqual({
        uid: "student-3",
        displayName: "Alex Smith",
        photoURL: null,
        department: "Electrical Engineering",
        year: "Junior",
        skills: ["Embedded", "C++"],
      });

      // Ensure directoryIndex does not include bio or socialLinks
      expect(directoryDoc).not.toHaveProperty("bio");
      expect(directoryDoc).not.toHaveProperty("socialLinks");
    });
  });
});

describe("userService — Firestore Service Methods", () => {
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

  describe("fetchUserById — Exclusive publicProfiles Read Path", () => {
    it("returns public profile when publicProfiles document exists", async () => {
      const publicData = {
        uid: "user-1",
        displayName: "Alice Student",
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
      expect(profile.displayName).toBe("Alice Student");
      expect(profile.department).toBe("Computer Science");
      expect(profile.skills).toEqual(["React", "Firebase"]);
      expect(profile.uid).toBe("user-1");
      expect(mocks.getDoc).toHaveBeenCalledTimes(1);
      expect(mocks.doc).toHaveBeenCalledWith(mocks.mockDb, "publicProfiles", "user-1");
      expect(mocks.doc).not.toHaveBeenCalledWith(mocks.mockDb, "users", "user-1");
    });

    it("returns null when publicProfiles document is missing (no fallback to users)", async () => {
      mocks.getDoc.mockResolvedValue({ exists: () => false, data: () => null });

      const profile = await fetchUserById("missing-uid");

      expect(profile).toBeNull();
      expect(mocks.getDoc).toHaveBeenCalledTimes(1);
      expect(mocks.doc).toHaveBeenCalledWith(mocks.mockDb, "publicProfiles", "missing-uid");
      expect(mocks.doc).not.toHaveBeenCalledWith(mocks.mockDb, "users", "missing-uid");
    });

    it("propagates read error from publicProfiles without catching or falling back to users", async () => {
      mocks.getDoc.mockRejectedValue(new Error("Permission denied on publicProfiles"));

      await expect(fetchUserById("err-uid")).rejects.toThrow("Permission denied on publicProfiles");
      expect(mocks.getDoc).toHaveBeenCalledTimes(1);
      expect(mocks.doc).not.toHaveBeenCalledWith(mocks.mockDb, "users", "err-uid");
    });

    it("returns null when uid is empty or null without calling firestore", async () => {
      const resNull = await fetchUserById(null);
      const resEmpty = await fetchUserById("");

      expect(resNull).toBeNull();
      expect(resEmpty).toBeNull();
      expect(mocks.getDoc).not.toHaveBeenCalled();
    });
  });

  describe("subscribeToUserProfile — Exclusive Split Subscriptions", () => {
    it("sources public profile from publicProfiles and private settings from users", () => {
      let userCb, publicCb;
      mocks.onSnapshot.mockImplementation((ref, onNext) => {
        if (ref.path.startsWith("users/")) userCb = onNext;
        if (ref.path.startsWith("publicProfiles/")) publicCb = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      subscribeToUserProfile("sub-1", callback);

      // User snapshot arrives with private settings
      userCb({
        exists: () => true,
        data: () => ({
          email: "sub1@test.edu",
          isDiscoverable: false,
          notificationPreferences: { connectionRequests: false, connectionAccepted: true },
          // Legacy fields that must NOT override public profile
          displayName: "Legacy User Name",
          bio: "Legacy Bio",
        }),
      });

      expect(callback).not.toHaveBeenCalled();

      // Public snapshot arrives
      publicCb({
        exists: () => true,
        data: () => ({
          displayName: "Canonical Public Name",
          bio: "Canonical Public Bio",
          department: "Physics",
          year: "Senior",
          skills: ["Quantum"],
          socialLinks: { github: "", linkedin: "", portfolio: "", website: "" },
        }),
      });

      expect(callback).toHaveBeenCalledTimes(1);
      const emitted = callback.mock.calls[0][0];
      // Public fields strictly from publicProfiles:
      expect(emitted.displayName).toBe("Canonical Public Name");
      expect(emitted.bio).toBe("Canonical Public Bio");
      expect(emitted.department).toBe("Physics");
      expect(emitted.skills).toEqual(["Quantum"]);
      // Private fields strictly from users:
      expect(emitted.email).toBe("sub1@test.edu");
      expect(emitted.isDiscoverable).toBe(false);
      expect(emitted.notificationPreferences.connectionRequests).toBe(false);
    });

    it("does NOT fall back to users public fields when publicProfiles does not exist", () => {
      let userCb, publicCb;
      mocks.onSnapshot.mockImplementation((ref, onNext) => {
        if (ref.path.startsWith("users/")) userCb = onNext;
        if (ref.path.startsWith("publicProfiles/")) publicCb = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      subscribeToUserProfile("missing-pub", callback);

      userCb({
        exists: () => true,
        data: () => ({
          displayName: "Old Legacy Name",
          bio: "Old Legacy Bio",
          department: "Chemistry",
          year: "Sophomore",
          skills: ["Organic Chem"],
          email: "old@test.edu",
          isDiscoverable: true,
          notificationPreferences: { connectionRequests: true, connectionAccepted: true },
        }),
      });

      // publicProfiles does not exist
      publicCb({
        exists: () => false,
        data: () => null,
      });

      expect(callback).toHaveBeenCalledTimes(1);
      const emitted = callback.mock.calls[0][0];
      // Missing publicProfiles returns default public values, NOT users legacy data
      expect(emitted.displayName).toBe("CampusConnect Student");
      expect(emitted.bio).toBe("");
      expect(emitted.department).toBe("Department not added");
      expect(emitted.skills).toEqual([]);
      // Private settings still come from users:
      expect(emitted.email).toBe("old@test.edu");
      expect(emitted.isDiscoverable).toBe(true);
    });

    it("propagates listener errors to onError without hanging", () => {
      let userErrCb;
      mocks.onSnapshot.mockImplementation((ref, _onNext, onErr) => {
        if (ref.path.startsWith("users/")) userErrCb = onErr;
        return vi.fn();
      });

      const callback = vi.fn();
      const onError = vi.fn();
      subscribeToUserProfile("err-user", callback, onError);

      const simError = new Error("Firestore permission denied on users");
      userErrCb(simError);

      expect(onError).toHaveBeenCalledWith(simError);
      expect(callback).not.toHaveBeenCalled();
    });

    it("returns an unsubscribe function that cleans up both listeners", () => {
      const unsubUser = vi.fn();
      const unsubPub = vi.fn();
      mocks.onSnapshot.mockImplementation((ref) => {
        if (ref.path.startsWith("users/")) return unsubUser;
        if (ref.path.startsWith("publicProfiles/")) return unsubPub;
        return vi.fn();
      });

      const unsubscribe = subscribeToUserProfile("unsub-uid", vi.fn());
      unsubscribe();

      expect(unsubUser).toHaveBeenCalledTimes(1);
      expect(unsubPub).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetchAllUsers — directoryIndex Exclusive Query Path", () => {
    it("queries directoryIndex exclusively and never queries users", async () => {
      const mockDocs = [
        {
          id: "u1",
          data: () => ({
            displayName: "Alice Index",
            department: "Computer Science",
            year: "Junior",
            skills: ["React"],
            updatedAt: { seconds: 1700000000 },
          }),
        },
        {
          id: "u2",
          data: () => ({
            displayName: "Bob Index",
            department: "Electrical Engineering",
            year: "Senior",
            skills: ["Circuits"],
            updatedAt: { seconds: 1700000100 },
          }),
        },
      ];

      mocks.getDocs.mockResolvedValue({ docs: mockDocs });

      const results = await fetchAllUsers(50);

      expect(mocks.collection).toHaveBeenCalledWith(mocks.mockDb, "directoryIndex");
      expect(mocks.collection).not.toHaveBeenCalledWith(mocks.mockDb, "users");
      expect(mocks.orderBy).toHaveBeenCalledWith("updatedAt", "desc");
      expect(mocks.limit).toHaveBeenCalledWith(50);
      expect(results).toHaveLength(2);
      expect(results[0].displayName).toBe("Alice Index");
      expect(results[0].department).toBe("Computer Science");
      expect(results[0].year).toBe("Junior");
      expect(results[0].skills).toEqual(["React"]);
      expect(results[0].isDiscoverable).toBeUndefined();
      expect(results[0].email).toBeUndefined();
      expect(results[1].displayName).toBe("Bob Index");
    });
  });

  describe("createUserProfile — Tri-Collection Write Parity", () => {
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

      // 1. users/{uid} set call: private schema fields
      const userSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "users/new-user-1",
      );
      expect(userSetCall).toBeDefined();
      expect(userSetCall[1].email).toBe("new@example.test");
      expect(userSetCall[1].isDiscoverable).toBe(true);
      expect(userSetCall[1].notificationPreferences).toEqual({
        connectionRequests: true,
        connectionAccepted: true,
      });

      // 2. publicProfiles/{uid} set call: strict 8 public fields
      const pubSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "publicProfiles/new-user-1",
      );
      expect(pubSetCall).toBeDefined();
      expect(pubSetCall[1]).toEqual({
        uid: "new-user-1",
        displayName: "New Student",
        photoURL: "https://avatar.test/new.jpg",
        bio: "",
        department: "",
        year: "",
        skills: [],
        socialLinks: { github: "", linkedin: "", portfolio: "", website: "" },
      });
      // Private fields strictly absent:
      expect(pubSetCall[1]).not.toHaveProperty("email");
      expect(pubSetCall[1]).not.toHaveProperty("isDiscoverable");
      expect(pubSetCall[1]).not.toHaveProperty("notificationPreferences");

      // 3. directoryIndex/{uid} set call
      const indexSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "directoryIndex/new-user-1",
      );
      expect(indexSetCall).toBeDefined();
      expect(indexSetCall[1].uid).toBe("new-user-1");
      expect(indexSetCall[1].displayName).toBe("New Student");

      expect(result.uid).toBe("new-user-1");
      expect(result.displayName).toBe("New Student");
      expect(result.isDiscoverable).toBe(true);
    });

    it("omits directoryIndex document when isDiscoverable is false", async () => {
      mocks.getDoc.mockResolvedValue({ exists: () => false, data: () => null });

      await createUserProfile({
        uid: "hidden-user-1",
        displayName: "Hidden Student",
        email: "hidden@example.test",
        isDiscoverable: false,
      });

      const userSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "users/hidden-user-1",
      );
      const pubSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "publicProfiles/hidden-user-1",
      );
      const indexSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "directoryIndex/hidden-user-1",
      );

      expect(userSetCall).toBeDefined();
      expect(pubSetCall).toBeDefined();
      expect(indexSetCall).toBeUndefined();
    });
  });

  describe("updateUserProfile — Strict Public Profile Authority & Directory Parity", () => {
    it("writes public profile data to publicProfiles and synchronizes directoryIndex when discoverable without writing to users", async () => {
      mocks.getDoc.mockImplementation(async (ref) => {
        if (ref.path === "publicProfiles/edit-user-1") {
          return {
            exists: () => true,
            data: () => ({
              uid: "edit-user-1",
              displayName: "Alice Prior",
              photoURL: null,
              bio: "Prior bio",
              department: "CS",
              year: "Junior",
              skills: ["JS"],
              socialLinks: { github: "", linkedin: "", portfolio: "", website: "" },
            }),
          };
        }
        if (ref.path === "users/edit-user-1") {
          return {
            exists: () => true,
            data: () => ({
              email: "alice@test.edu",
              isDiscoverable: true,
            }),
          };
        }
        return { exists: () => false, data: () => null };
      });

      await updateUserProfile("edit-user-1", {
        displayName: "Alice Updated",
        bio: "Updated bio",
        skills: ["JS", "TypeScript"],
        department: "Computer Science",
      });

      expect(mockBatch.commit).toHaveBeenCalledTimes(1);

      // 1. publicProfiles update
      const pubSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "publicProfiles/edit-user-1",
      );
      expect(pubSetCall).toBeDefined();
      expect(pubSetCall[1].displayName).toBe("Alice Updated");
      expect(pubSetCall[1].bio).toBe("Updated bio");
      expect(pubSetCall[1].skills).toEqual(["JS", "TypeScript"]);

      // 2. users collection MUST NOT be written to during profile update (Strict Boundary)
      const userUpdateCall = mockBatch.update.mock.calls.find(
        (c) => c[0].path === "users/edit-user-1",
      );
      expect(userUpdateCall).toBeUndefined();
      const userSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "users/edit-user-1",
      );
      expect(userSetCall).toBeUndefined();

      // 3. directoryIndex update
      const indexSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "directoryIndex/edit-user-1",
      );
      expect(indexSetCall).toBeDefined();
      expect(indexSetCall[1].displayName).toBe("Alice Updated");
      expect(indexSetCall[1].skills).toEqual(["JS", "TypeScript"]);
    });

    it("omits directoryIndex update when user is undiscoverable and writes only to publicProfiles", async () => {
      mocks.getDoc.mockImplementation(async (ref) => {
        if (ref.path === "publicProfiles/edit-user-2") {
          return {
            exists: () => true,
            data: () => ({ displayName: "Bob Prior", skills: [] }),
          };
        }
        if (ref.path === "users/edit-user-2") {
          return {
            exists: () => true,
            data: () => ({ isDiscoverable: false }),
          };
        }
        return { exists: () => false, data: () => null };
      });

      await updateUserProfile("edit-user-2", {
        displayName: "Bob Updated",
      });

      // When undiscoverable, single-document write to publicProfiles via setDoc
      expect(mocks.setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "publicProfiles/edit-user-2" }),
        expect.objectContaining({
          uid: "edit-user-2",
          displayName: "Bob Updated",
        }),
        { merge: true },
      );
      expect(mockBatch.commit).not.toHaveBeenCalled();

      // Verify no writes occurred to users collection
      expect(mocks.updateDoc).not.toHaveBeenCalled();
      const userSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "users/edit-user-2",
      );
      expect(userSetCall).toBeUndefined();
    });
  });

  describe("Discoverability Transitions", () => {
    it("creates directoryIndex projection when toggling isDiscoverable false -> true", async () => {
      mocks.getDoc.mockImplementation(async (ref) => {
        if (ref.path === "publicProfiles/toggle-user") {
          return {
            exists: () => true,
            data: () => ({
              displayName: "Toggle User",
              photoURL: "https://avatar.test/toggle.jpg",
              department: "Economics",
              year: "Senior",
              skills: ["Data Analysis"],
            }),
          };
        }
        return { exists: () => false, data: () => null };
      });

      await updateUserSettings("toggle-user", { isDiscoverable: true });

      expect(mockBatch.commit).toHaveBeenCalledTimes(1);

      // users doc updated
      const userUpdateCall = mockBatch.update.mock.calls.find(
        (c) => c[0].path === "users/toggle-user",
      );
      expect(userUpdateCall).toBeDefined();
      expect(userUpdateCall[1].isDiscoverable).toBe(true);

      // directoryIndex created
      const indexSetCall = mockBatch.set.mock.calls.find(
        (c) => c[0].path === "directoryIndex/toggle-user",
      );
      expect(indexSetCall).toBeDefined();
      expect(indexSetCall[1].displayName).toBe("Toggle User");
      expect(indexSetCall[1].department).toBe("Economics");
    });

    it("deletes directoryIndex document when toggling isDiscoverable true -> false", async () => {
      await updateUserSettings("toggle-user-2", { isDiscoverable: false });

      expect(mockBatch.commit).toHaveBeenCalledTimes(1);

      const userUpdateCall = mockBatch.update.mock.calls.find(
        (c) => c[0].path === "users/toggle-user-2",
      );
      expect(userUpdateCall).toBeDefined();
      expect(userUpdateCall[1].isDiscoverable).toBe(false);

      const indexDeleteCall = mockBatch.delete.mock.calls.find(
        (c) => c[0].path === "directoryIndex/toggle-user-2",
      );
      expect(indexDeleteCall).toBeDefined();
    });
  });

  describe("Notifications & Privacy Boundary", () => {
    it("stores notificationPreferences strictly in users collection without leaking to publicProfiles or directoryIndex", async () => {
      await updateUserSettings("notif-user", {
        notificationPreferences: {
          connectionRequests: false,
          connectionAccepted: true,
        },
      });

      expect(mocks.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/notif-user" }),
        expect.objectContaining({
          notificationPreferences: {
            connectionRequests: false,
            connectionAccepted: true,
          },
        }),
      );
      expect(mocks.setDoc).not.toHaveBeenCalled();
      expect(mockBatch.set).not.toHaveBeenCalled();
    });
  });
});
