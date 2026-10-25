import { describe, expect, it } from "vitest";
import {
  toPrivateUserDoc,
  toPublicProfileDoc,
  toDirectoryIndexDoc,
} from "../../scripts/seedDemoData.mjs";
import {
  DEMO_PRIMARY_STUDENT,
  DEMO_PEER_PROFILES,
} from "../../src/data/demoData.js";

describe("Milestone 24.4.2 — Unit Tests: Seed Demo Data & Notification Preferences", () => {
  const dummyTimestamp = { seconds: 1700000000, nanoseconds: 0 };

  describe("toPrivateUserDoc transformation", () => {
    it("produces complete 5-key notificationPreferences map defaulting to true", () => {
      const rawUser = {
        uid: "test-uid-1",
        email: "test1@apex.edu",
        isDiscoverable: true,
      };

      const doc = toPrivateUserDoc(rawUser, dummyTimestamp);

      expect(doc.notificationPreferences).toEqual({
        connectionRequests: true,
        connectionAccepted: true,
        eventRsvps: true,
        eventCancellations: true,
        eventWaitlistOffers: true,
      });
      expect(doc.uid).toBe("test-uid-1");
      expect(doc.email).toBe("test1@apex.edu");
      expect(doc.isDiscoverable).toBe(true);
      expect(doc.createdAt).toBe(dummyTimestamp);
      expect(doc.updatedAt).toBe(dummyTimestamp);
    });

    it("respects explicit false values in notification preferences", () => {
      const rawUser = {
        uid: "test-uid-2",
        email: "test2@apex.edu",
        isDiscoverable: false,
        notificationPreferences: {
          connectionRequests: false,
          connectionAccepted: true,
          eventRsvps: false,
          eventCancellations: true,
          eventWaitlistOffers: false,
        },
      };

      const doc = toPrivateUserDoc(rawUser, dummyTimestamp);

      expect(doc.notificationPreferences).toEqual({
        connectionRequests: false,
        connectionAccepted: true,
        eventRsvps: false,
        eventCancellations: true,
        eventWaitlistOffers: false,
      });
    });

    it("defaults missing preference keys to true when partially specified", () => {
      const rawUser = {
        uid: "test-uid-3",
        email: "test3@apex.edu",
        notificationPreferences: {
          connectionRequests: false,
        },
      };

      const doc = toPrivateUserDoc(rawUser, dummyTimestamp);

      expect(doc.notificationPreferences).toEqual({
        connectionRequests: false,
        connectionAccepted: true,
        eventRsvps: true,
        eventCancellations: true,
        eventWaitlistOffers: true,
      });
    });
  });

  describe("toPublicProfileDoc and toDirectoryIndexDoc transformations", () => {
    it("preserves profile identity, campus, and skills while omitting notification preferences", () => {
      const rawUser = {
        uid: "test-uid-4",
        displayName: "Test User",
        department: "Computer Science",
        year: "Senior",
        bio: "Test bio",
        skills: ["React", "Vitest"],
        campusId: "apex",
        photoURL: "https://example.com/photo.jpg",
        isDiscoverable: true,
      };

      const pubDoc = toPublicProfileDoc(rawUser, dummyTimestamp);
      expect(pubDoc.uid).toBe("test-uid-4");
      expect(pubDoc.displayName).toBe("Test User");
      expect(pubDoc.department).toBe("Computer Science");
      expect(pubDoc.skills).toEqual(["React", "Vitest"]);
      expect(pubDoc.notificationPreferences).toBeUndefined();

      const dirDoc = toDirectoryIndexDoc(rawUser, dummyTimestamp);
      expect(dirDoc.uid).toBe("test-uid-4");
      expect(dirDoc.displayName).toBe("Test User");
      expect(dirDoc.notificationPreferences).toBeUndefined();
    });
  });

  describe("Demo Fixture Definitions Parity (demoData.js)", () => {
    it("DEMO_PRIMARY_STUDENT has all 5 notification preferences set to true", () => {
      expect(DEMO_PRIMARY_STUDENT.notificationPreferences).toEqual({
        connectionRequests: true,
        connectionAccepted: true,
        eventRsvps: true,
        eventCancellations: true,
        eventWaitlistOffers: true,
      });
    });

    it("all 7 DEMO_PEER_PROFILES have all 5 notification preferences set to true", () => {
      expect(DEMO_PEER_PROFILES).toHaveLength(7);
      for (const peer of DEMO_PEER_PROFILES) {
        expect(peer.notificationPreferences).toEqual({
          connectionRequests: true,
          connectionAccepted: true,
          eventRsvps: true,
          eventCancellations: true,
          eventWaitlistOffers: true,
        });
      }
    });
  });
});
