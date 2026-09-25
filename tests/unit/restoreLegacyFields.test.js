import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it, vi } from "vitest";
import {
  RESTORABLE_FIELDS,
  FORBIDDEN_PRIVATE_FIELDS,
  validateSnapshotStructure,
  constructRestorePayload,
  restoreLegacyFields,
} from "../../scripts/restoreLegacyFields.mjs";

describe("restoreLegacyFields - Unit Tests & Safety Invariants", () => {
  it("defines exact 8 restorable fields and disjoint private fields", () => {
    expect([...RESTORABLE_FIELDS].sort()).toEqual([
      "bio",
      "department",
      "displayName",
      "isDemo",
      "photoURL",
      "skills",
      "socialLinks",
      "year",
    ]);

    expect([...FORBIDDEN_PRIVATE_FIELDS].sort()).toEqual([
      "createdAt",
      "email",
      "isDiscoverable",
      "notificationPreferences",
      "uid",
      "updatedAt",
    ]);

    const intersection = RESTORABLE_FIELDS.filter((f) =>
      FORBIDDEN_PRIVATE_FIELDS.includes(f)
    );
    expect(intersection).toEqual([]);
  });

  it("constructs payload with all 8 deletable fields when present", () => {
    const record = {
      profileFields: {
        displayName: "Alice Test",
        photoURL: "https://avatar.test/alice.png",
        bio: "Bio text",
        department: "Computer Science",
        year: "Senior",
        skills: ["JS", "Python"],
        socialLinks: { github: "alice_gh", linkedin: "", portfolio: "", website: "" },
      },
      metadata: {
        isDemo: true,
      },
    };

    const payload = constructRestorePayload(record);
    expect(payload).toEqual({
      displayName: "Alice Test",
      photoURL: "https://avatar.test/alice.png",
      bio: "Bio text",
      department: "Computer Science",
      year: "Senior",
      skills: ["JS", "Python"],
      socialLinks: { github: "alice_gh", linkedin: "", portfolio: "", website: "" },
      isDemo: true,
    });
  });

  it("never includes private fields in the restore payload", () => {
    const maliciousRecord = {
      profileFields: {
        displayName: "Alice",
        email: "hacked@example.com",
        uid: "spoofed",
        isDiscoverable: false,
        notificationPreferences: {},
        createdAt: 12345,
        updatedAt: 67890,
      },
      metadata: { isDemo: true },
    };

    const payload = constructRestorePayload(maliciousRecord);
    for (const privateKey of FORBIDDEN_PRIVATE_FIELDS) {
      expect(payload[privateKey]).toBeUndefined();
    }
    expect(payload.displayName).toBe("Alice");
    expect(payload.isDemo).toBe(true);
  });

  it("restores isDemo: true when isDemoPresent is true and isDemo is true", () => {
    const record = {
      profileFields: { displayName: "Demo User" },
      metadata: { isDemoPresent: true, isDemo: true },
    };
    const payload = constructRestorePayload(record);
    expect(payload.isDemo).toBe(true);
  });

  it("restores isDemo: false when isDemoPresent is true and isDemo is false", () => {
    const record = {
      profileFields: { displayName: "Explicit False User" },
      metadata: { isDemoPresent: true, isDemo: false },
    };
    const payload = constructRestorePayload(record);
    expect(payload.isDemo).toBe(false);
    expect(payload).toEqual({ displayName: "Explicit False User", isDemo: false });
  });

  it("does not recreate isDemo when isDemoPresent is false or field is absent", () => {
    const recordWithAbsentFlag = {
      profileFields: { displayName: "Regular User" },
      metadata: { isDemoPresent: false },
    };
    const payloadA = constructRestorePayload(recordWithAbsentFlag);
    expect(payloadA.isDemo).toBeUndefined();
    expect(payloadA).toEqual({ displayName: "Regular User" });

    const recordWithEmptyMeta = {
      profileFields: { displayName: "Legacy Regular User" },
      metadata: {},
    };
    const payloadB = constructRestorePayload(recordWithEmptyMeta);
    expect(payloadB.isDemo).toBeUndefined();
    expect(payloadB).toEqual({ displayName: "Legacy Regular User" });
  });

  it("preserves null values, empty strings, arrays, and nested socialLinks", () => {
    const record = {
      profileFields: {
        displayName: "",
        photoURL: null,
        bio: "",
        department: "CSE",
        year: "2026",
        skills: ["Testing", "Vitest"],
        socialLinks: {
          github: "https://github.com/test",
          linkedin: null,
          nested: { flag: true },
        },
      },
      metadata: {},
    };

    const payload = constructRestorePayload(record);
    expect(payload.photoURL).toBeNull();
    expect(payload.displayName).toBe("");
    expect(payload.bio).toBe("");
    expect(payload.skills).toEqual(["Testing", "Vitest"]);
    expect(payload.socialLinks).toEqual({
      github: "https://github.com/test",
      linkedin: null,
      nested: { flag: true },
    });
  });

  it("rejects malformed snapshot structures", () => {
    expect(() => validateSnapshotStructure(null)).toThrow("Root must be a non-null object");
    expect(() => validateSnapshotStructure([])).toThrow("Root must be a non-null object");
    expect(() => validateSnapshotStructure({})).toThrow("Missing or malformed 'users' dictionary");
    expect(() => validateSnapshotStructure({ users: null })).toThrow("Missing or malformed 'users' dictionary");
    expect(() => validateSnapshotStructure({ users: { user1: null } })).toThrow("Record for user 'user1' must be an object");
    expect(() =>
      validateSnapshotStructure({
        users: { user1: { profileFields: { displayName: 123 } } },
      })
    ).toThrow("displayName for user 'user1' must be a string");
    expect(() =>
      validateSnapshotStructure({
        users: { user1: { profileFields: { skills: "not-an-array" } } },
      })
    ).toThrow("skills for user 'user1' must be an array");
    expect(() =>
      validateSnapshotStructure({
        users: { user1: { profileFields: { socialLinks: "not-an-object" } } },
      })
    ).toThrow("socialLinks for user 'user1' must be an object");
    expect(() =>
      validateSnapshotStructure({
        users: { user1: { profileFields: {}, metadata: { isDemoPresent: true } } },
      })
    ).toThrow("isDemo must be explicitly present and boolean when isDemoPresent is true");
    expect(() =>
      validateSnapshotStructure({
        users: { user1: { profileFields: {}, metadata: { isDemoPresent: true, isDemo: "true" } } },
      })
    ).toThrow("isDemo for user 'user1' must be a boolean");
    expect(() =>
      validateSnapshotStructure({
        users: { user1: { profileFields: {}, metadata: { isDemoPresent: "invalid" } } },
      })
    ).toThrow("isDemoPresent for user 'user1' must be a boolean");
  });

  it("dry-run performs zero writes and returns accurate metrics", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-test-"));
    const snapshotPath = path.join(tempDir, "test_snapshot.json");

    const snapshot = {
      timestamp: new Date().toISOString(),
      userCount: 2,
      users: {
        userA: {
          profileFields: { displayName: "User A", bio: "Bio A" },
          metadata: { isDemo: true },
        },
        userB: {
          profileFields: { displayName: "User B", photoURL: null },
          metadata: { isDemo: false },
        },
      },
    };
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), "utf-8");

    const mockUpdate = vi.fn();
    const mockCommit = vi.fn();
    const mockBatch = {
      update: mockUpdate,
      commit: mockCommit,
    };
    const mockDb = {
      collection: vi.fn(() => ({
        doc: vi.fn((uid) => ({ id: uid })),
      })),
      batch: vi.fn(() => mockBatch),
    };

    const result = await restoreLegacyFields(snapshotPath, { dryRun: true, db: mockDb });

    expect(result.isDryRun).toBe(true);
    expect(result.totalUsersInSnapshot).toBe(2);
    expect(result.usersRestored).toBe(2);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("live mode executes batch updates and behaves idempotently", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-live-"));
    const snapshotPath = path.join(tempDir, "test_snapshot.json");

    const snapshot = {
      timestamp: new Date().toISOString(),
      userCount: 1,
      users: {
        userX: {
          profileFields: { displayName: "User X", skills: ["Code"] },
          metadata: { isDemo: true },
        },
      },
    };
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), "utf-8");

    const updatesLogged = [];
    const mockBatch = {
      update: vi.fn((ref, payload) => {
        updatesLogged.push({ ref, payload });
      }),
      commit: vi.fn(async () => {}),
    };
    const mockDb = {
      collection: vi.fn(() => ({
        doc: vi.fn((uid) => ({ id: uid })),
      })),
      batch: vi.fn(() => mockBatch),
    };

    // First live run
    const result1 = await restoreLegacyFields(snapshotPath, { dryRun: false, db: mockDb });
    expect(result1.usersRestored).toBe(1);
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    expect(updatesLogged.length).toBe(1);
    expect(updatesLogged[0].payload).toEqual({
      displayName: "User X",
      skills: ["Code"],
      isDemo: true,
    });

    // Second live run (idempotent payload generation)
    updatesLogged.length = 0;
    const result2 = await restoreLegacyFields(snapshotPath, { dryRun: false, db: mockDb });
    expect(result2.usersRestored).toBe(1);
    expect(updatesLogged[0].payload).toEqual({
      displayName: "User X",
      skills: ["Code"],
      isDemo: true,
    });

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
