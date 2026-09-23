import { describe, expect, it } from "vitest";
import {
  normalizePublicProfile,
  normalizeUserSettings,
} from "../../src/services/userService.js";

describe("Milestone 14B - normalizePublicProfile", () => {
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

describe("Milestone 14B - normalizeUserSettings", () => {
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

describe("Milestone 14B - directoryIndex projection derivation", () => {
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
