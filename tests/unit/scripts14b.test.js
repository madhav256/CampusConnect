import { describe, expect, it } from "vitest";
import { LEGACY_PROFILE_FIELDS } from "../../scripts/snapshotLegacyFields.mjs";
import {
  FIELDS_TO_DELETE,
  PROTECTED_PRIVATE_FIELDS,
} from "../../scripts/cleanupLegacyFields.mjs";
import { ALLOWED_PRIVATE_KEYS } from "../../scripts/verifyPrivateSchema.mjs";

describe("Milestone 14B - Script Configurations & Safety Boundaries", () => {
  it("snapshotLegacyFields tracks exactly the 7 public profile fields", () => {
    expect([...LEGACY_PROFILE_FIELDS].sort()).toEqual([
      "bio",
      "department",
      "displayName",
      "photoURL",
      "skills",
      "socialLinks",
      "year",
    ]);
    expect(LEGACY_PROFILE_FIELDS).not.toContain("isDemo");
    expect(LEGACY_PROFILE_FIELDS).not.toContain("email");
    expect(LEGACY_PROFILE_FIELDS).not.toContain("isDiscoverable");
    expect(LEGACY_PROFILE_FIELDS).not.toContain("notificationPreferences");
    expect(LEGACY_PROFILE_FIELDS).not.toContain("createdAt");
    expect(LEGACY_PROFILE_FIELDS).not.toContain("updatedAt");
  });

  it("cleanupLegacyFields defines disjoint deletion and protected field sets", () => {
    expect([...FIELDS_TO_DELETE].sort()).toEqual([
      "bio",
      "department",
      "displayName",
      "isDemo",
      "photoURL",
      "skills",
      "socialLinks",
      "year",
    ]);

    expect([...PROTECTED_PRIVATE_FIELDS].sort()).toEqual([
      "createdAt",
      "email",
      "isDiscoverable",
      "notificationPreferences",
      "uid",
      "updatedAt",
    ]);

    // Safety assertion: intersection MUST be empty
    const intersection = FIELDS_TO_DELETE.filter((field) =>
      PROTECTED_PRIVATE_FIELDS.includes(field)
    );
    expect(intersection).toEqual([]);
  });

  it("verifyPrivateSchema allows strictly the 6 private fields", () => {
    expect([...ALLOWED_PRIVATE_KEYS].sort()).toEqual([
      "createdAt",
      "email",
      "isDiscoverable",
      "notificationPreferences",
      "uid",
      "updatedAt",
    ]);
  });
});
