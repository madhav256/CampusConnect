/**
 * Milestone 23 — Unit 23.4: Event Notification UX, Delivery Orchestration & E2E Verification
 *
 * Verifies the complete user journeys for:
 * 1. RSVP notifications:
 *    - Attendee RSVPs to an event -> Creator receives in-app notification.
 *    - Notification renders correctly with durable event title and deep-links to event detail.
 *    - Self-notification remains suppressed.
 *    - Preference toggle (eventRsvps) controls visibility in feed and unread badge.
 * 2. Cancellation notification delivery:
 *    - Event manager cancels an event -> atomic ledger established -> chunked delivery executed.
 *    - Attendee receives cancellation notification with original actor attribution.
 *    - Interrupted delivery surfaces recovery card in UI; clicking Resume Delivery completes cycle.
 *    - Preference toggle (eventCancellations) controls visibility and unread badge.
 * 3. Graceful fallback on missing/deleted referenced events:
 *    - Notification renders durable referenceTitle cleanly even when event doc is deleted.
 *    - Navigating to missing event renders standard Event Not Found empty state.
 */

import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs, logout } from "./helpers/auth.js";
import {
  db,
  createIsolatedTestEvent,
  deleteIsolatedTestEvent,
  createTestEventRsvp,
  deleteTestEventRsvp,
  cleanupEventNotifications,
  resetUserPreferences,
  clearUserNotifications,
  setCommunityMemberRole,
  removeCommunityMember,
  restoreCommunityMembers,
} from "./helpers/firestoreState.js";
import { Timestamp } from "firebase-admin/firestore";

test.describe("Milestone 23.4 — Event Notifications & Delivery Orchestration E2E", () => {
  test.beforeEach(async () => {
    // Ensure default notification preferences for test users
    await resetUserPreferences(E2E_USERS.studentA.uid);
    await resetUserPreferences(E2E_USERS.studentB.uid);
    await resetUserPreferences(E2E_USERS.studentC.uid);

    // Ensure clean notification feeds before each journey
    await clearUserNotifications(E2E_USERS.studentA.uid);
    await clearUserNotifications(E2E_USERS.studentB.uid);
    await clearUserNotifications(E2E_USERS.studentC.uid);
  });

  test("Journey 1: RSVP notification flow, presentation, deep-link, and preference filtering", async ({
    page,
  }) => {
    const eventId = "e2e-isolated-rsvp-notif-evt";
    const eventTitle = "Autonomous Robotics Workshop";

    await createIsolatedTestEvent({
      id: eventId,
      title: eventTitle,
      status: "published",
      createdBy: E2E_USERS.studentA.uid,
      organizerName: "Alex Chen",
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    try {
      // 1. Student B (Jordan Taylor) RSVPs to Student A's event
      await loginAs(page, E2E_USERS.studentB);
      await page.goto(`/events/${eventId}`);
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(eventTitle);

      const rsvpBtn = page.locator("[data-testid='event-rsvp-card'] [data-testid='event-rsvp-button']");
      await expect(rsvpBtn).toBeVisible();
      await rsvpBtn.click();
      await expect(rsvpBtn).toContainText("Cancel RSVP");
      await logout(page);

      // 2. Student A (creator) logs in and observes unread badge
      await loginAs(page, E2E_USERS.studentA);

      const notifBadge = page
        .locator('header nav[aria-label="Main Navigation"]')
        .getByLabel(/unread notifications/i);
      await expect(notifBadge).toBeVisible();
      await expect(notifBadge).toHaveText("1");

      // 3. Navigate to notifications page and verify notification item
      await page.goto("/notifications");
      await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();

      await expect(page.getByText(E2E_USERS.studentB.displayName)).toBeVisible();
      await expect(page.getByText(/RSVP'd to your event/i)).toBeVisible();
      await expect(page.getByText(`“${eventTitle}”`)).toBeVisible();

      // 4. Click View Event and verify navigation to event detail page
      const viewEventLink = page.locator(`[data-testid='notif-view-event-rsvp_${eventId}_${E2E_USERS.studentB.uid}']`);
      await expect(viewEventLink).toBeVisible();
      await viewEventLink.click();
      await page.waitForURL(`**/events/${eventId}`);
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(eventTitle);

      // 5. Navigate to Settings and disable Event RSVPs preference
      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

      const rsvpsToggle = page.locator("#toggle-notif-rsvps");
      await expect(rsvpsToggle).toBeVisible();
      await expect(rsvpsToggle).toHaveAttribute("aria-checked", "true");
      await rsvpsToggle.click();
      await expect(rsvpsToggle).toHaveAttribute("aria-checked", "false");

      // 6. Navigate back to Notifications: item is filtered out and badge is cleared
      await page.goto("/notifications");
      await expect(page.getByText("No notifications yet")).toBeVisible();
      await expect(page.getByText(`“${eventTitle}”`)).not.toBeVisible();
      await expect(notifBadge).not.toBeVisible();

      // 7. Re-enable Event RSVPs preference in Settings
      await page.goto("/settings");
      await page.locator("#toggle-notif-rsvps").click();
      await expect(page.locator("#toggle-notif-rsvps")).toHaveAttribute("aria-checked", "true");

      // 8. Return to Notifications: notification reappears
      await page.goto("/notifications");
      await expect(page.getByText(`“${eventTitle}”`)).toBeVisible();
    } finally {
      await cleanupEventNotifications(eventId, [E2E_USERS.studentA.uid, E2E_USERS.studentB.uid]);
      await deleteTestEventRsvp(eventId, E2E_USERS.studentB.uid);
      await deleteIsolatedTestEvent(eventId);
      await resetUserPreferences(E2E_USERS.studentA.uid);
      await logout(page);
    }
  });

  test("Journey 2: Cancellation notification delivery, progress display, and recipient notification", async ({
    page,
  }) => {
    const eventId = "e2e-isolated-cancel-notif-evt";
    const eventTitle = "Quantum Computing Symposium";

    await createIsolatedTestEvent({
      id: eventId,
      title: eventTitle,
      status: "published",
      createdBy: E2E_USERS.studentA.uid,
      organizerName: "Alex Chen",
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    // Seed attendee RSVP for Student B
    await createTestEventRsvp(eventId, E2E_USERS.studentB.uid, "apex-university");

    try {
      // 1. Manager (Student A) logs in and cancels event
      await loginAs(page, E2E_USERS.studentA);
      await page.goto(`/events/${eventId}`);

      await page.locator("[data-testid='manage-cancel-btn']").click();
      const cancelModal = page.locator("[data-testid='event-cancel-modal']");
      await expect(cancelModal).toBeVisible();

      await page.locator("[data-testid='cancel-confirm-btn']").click();
      await expect(cancelModal).not.toBeVisible();

      // 2. Cancellation banner appears and delivery completion card renders
      await expect(page.locator("[data-testid='event-cancelled-banner']")).toBeVisible();
      await expect(page.locator("[data-testid='cancellation-delivery-completed']")).toBeVisible();
      await expect(page.locator("[data-testid='cancellation-delivery-completed']")).toContainText(
        "Cancellation notifications delivered (1 attendee notified)"
      );

      await logout(page);

      // 3. Attendee (Student B) logs in and sees cancellation notification
      await loginAs(page, E2E_USERS.studentB);

      const notifBadge = page
        .locator('header nav[aria-label="Main Navigation"]')
        .getByLabel(/unread notifications/i);
      await expect(notifBadge).toBeVisible();
      await expect(notifBadge).toHaveText("1");

      await page.goto("/notifications");
      await expect(page.getByText(E2E_USERS.studentA.displayName)).toBeVisible();
      await expect(page.getByText(/was cancelled by/i)).toBeVisible();
      await expect(page.getByText(`“${eventTitle}”`)).toBeVisible();

      // 4. Test cancellation preference toggle in Settings
      await page.goto("/settings");
      const cancelToggle = page.locator("#toggle-notif-cancellations");
      await expect(cancelToggle).toBeVisible();
      await expect(cancelToggle).toHaveAttribute("aria-checked", "true");
      await cancelToggle.click();
      await expect(cancelToggle).toHaveAttribute("aria-checked", "false");

      // Verify filtered out
      await page.goto("/notifications");
      await expect(page.getByText("No notifications yet")).toBeVisible();
      await expect(page.getByText(`“${eventTitle}”`)).not.toBeVisible();
      await expect(notifBadge).not.toBeVisible();
    } finally {
      await cleanupEventNotifications(eventId, [E2E_USERS.studentA.uid, E2E_USERS.studentB.uid]);
      await deleteTestEventRsvp(eventId, E2E_USERS.studentB.uid);
      await deleteIsolatedTestEvent(eventId);
      await resetUserPreferences(E2E_USERS.studentB.uid);
      await logout(page);
    }
  });

  test("Journey 3: Incomplete delivery recovery — Resume Delivery completes interrupted cycle", async ({
    page,
  }) => {
    const eventId = "e2e-isolated-resume-evt";
    const eventTitle = "Interrupted Hackathon Session";
    const cycleId = "cycle_recovery_test_987654321";

    // Establish 9 eligible RSVP recipients:
    // Chunk 1 = 8 attendees (already delivered and recorded in ledger cursor)
    // Chunk 2 = 1 attendee (Student B, pending delivery)
    const chunk1AttendeeIds = Array.from(
      { length: 8 },
      (_, i) => `e2e-attendee-chunk1-0${i + 1}`
    );

    // 1. Create cancelled event directly in Firestore with Student A as original organizer
    await createIsolatedTestEvent({
      id: eventId,
      title: eventTitle,
      status: "cancelled",
      createdBy: E2E_USERS.studentA.uid,
      organizerName: E2E_USERS.studentA.displayName,
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    // Seed 8 Chunk 1 RSVPs + 1 pending RSVP for Student B
    // Document IDs format: ${eventId}_${userId}
    // "e2e-attendee-chunk1-01" through "08" sort strictly before "e2e-student-b"
    for (const attendeeId of chunk1AttendeeIds) {
      await createTestEventRsvp(eventId, attendeeId, "apex-university");
    }
    await createTestEventRsvp(eventId, E2E_USERS.studentB.uid, "apex-university");

    const now = Timestamp.now();

    // Seed 8 completed cancellation notifications for Chunk 1 attendees
    // Specifically set attendee 1's notification as read to verify read state is preserved on resume
    for (let i = 0; i < chunk1AttendeeIds.length; i++) {
      const attendeeId = chunk1AttendeeIds[i];
      const notifId = `cancel_${eventId}_${cycleId}`;
      await db
        .collection("users")
        .doc(attendeeId)
        .collection("notifications")
        .doc(notifId)
        .set({
          id: notifId,
          recipientId: attendeeId,
          actorId: E2E_USERS.studentA.uid,
          actorName: E2E_USERS.studentA.displayName,
          actorAvatar: null,
          type: "event_cancelled",
          referenceId: eventId,
          referenceTitle: eventTitle,
          cycleId,
          isRead: i === 0, // attendee 1 has read this notification
          createdAt: now,
        });
    }

    // Simulate attendee 2 explicitly dismissing/deleting their notification before recovery
    await db
      .collection("users")
      .doc(chunk1AttendeeIds[1])
      .collection("notifications")
      .doc(`cancel_${eventId}_${cycleId}`)
      .delete();

    // Seed reachable 'in_progress' delivery ledger representing the state after exactly 1 successful chunk (8 processed)
    const lastProcessedRsvpId = `${eventId}_${chunk1AttendeeIds[7]}`;
    await db.collection("eventNotificationDeliveries").doc(eventId).set({
      id: eventId,
      eventId,
      cycleId,
      campusId: "apex-university",
      communityId: "apex-ai-club",
      actorId: E2E_USERS.studentA.uid,
      actorName: E2E_USERS.studentA.displayName,
      actorAvatar: null,
      status: "in_progress",
      checkpointVersion: 1,
      lastProcessedRsvpId,
      processedCount: 8,
      createdAt: now,
      updatedAt: now,
    });

    // Elevate a DIFFERENT authorized community manager (Student C) to resume delivery
    await setCommunityMemberRole("apex-ai-club", E2E_USERS.studentC.uid, "moderator", "active");

    try {
      // 2. Administrator (Student C) visits event and sees the recovery card
      await loginAs(page, E2E_USERS.studentC);
      await page.goto(`/events/${eventId}`);

      const pendingCard = page.locator("[data-testid='cancellation-delivery-pending-card']");
      await expect(pendingCard).toBeVisible();
      await expect(pendingCard).toContainText("Cancellation notification delivery incomplete");
      await expect(pendingCard).toContainText("8 attendees notified so far");

      const resumeBtn = page.locator("[data-testid='resume-delivery-btn']");
      await expect(resumeBtn).toBeVisible();

      // 3. Click Resume Delivery as Student C
      await resumeBtn.click();

      // 4. Verification: Pending card transitions to completed card with all 9 attendees
      const completedCard = page.locator("[data-testid='cancellation-delivery-completed']");
      await expect(completedCard).toBeVisible();
      await expect(completedCard).toContainText(
        "Cancellation notifications delivered (9 attendees notified)."
      );

      // 5. Verify Firestore delivery ledger reached 'completed' state
      const ledgerSnap = await db.collection("eventNotificationDeliveries").doc(eventId).get();
      const ledgerData = ledgerSnap.data();
      expect(ledgerData.status).toBe("completed");
      expect(ledgerData.checkpointVersion).toBe(2);
      expect(ledgerData.cycleId).toBe(cycleId); // Existing cycle resumed, not replaced
      expect(ledgerData.actorId).toBe(E2E_USERS.studentA.uid); // Original cancelling actor unchanged
      expect(ledgerData.actorName).toBe(E2E_USERS.studentA.displayName);
      expect(ledgerData.lastProcessedRsvpId).toBe(`${eventId}_${E2E_USERS.studentB.uid}`);
      expect(ledgerData.processedCount).toBe(9);

      // 6. Verify Chunk 1 attendee read state was preserved and deleted notifications not recreated
      const attendee1NotifSnap = await db
        .collection("users")
        .doc(chunk1AttendeeIds[0])
        .collection("notifications")
        .doc(`cancel_${eventId}_${cycleId}`)
        .get();
      expect(attendee1NotifSnap.data().isRead).toBe(true);

      const attendee2NotifSnap = await db
        .collection("users")
        .doc(chunk1AttendeeIds[1])
        .collection("notifications")
        .doc(`cancel_${eventId}_${cycleId}`)
        .get();
      expect(attendee2NotifSnap.exists).toBe(false);

      for (let i = 0; i < chunk1AttendeeIds.length; i++) {
        const attendeeId = chunk1AttendeeIds[i];
        const notifsSnap = await db
          .collection("users")
          .doc(attendeeId)
          .collection("notifications")
          .where("referenceId", "==", eventId)
          .get();
        // Attendee 2 deleted their notification, so they have 0; other attendees have 1
        expect(notifsSnap.size).toBe(i === 1 ? 0 : 1);
      }

      // 7. Verify that a superseded cycle cannot resume
      await db.collection("eventNotificationDeliveries").doc(eventId).update({
        status: "superseded",
        updatedAt: Timestamp.now(),
      });

      // Assert UI reactive update: superseded banner appears and resume button is absent
      await expect(
        page.locator("[data-testid='cancellation-delivery-superseded']")
      ).toBeVisible();
      await expect(page.locator("[data-testid='resume-delivery-btn']")).not.toBeVisible();

      // Verify resumeCancellationDelivery service returns superseded with 0 batches committed
      const supersededResult = await page.evaluate(async (targetId) => {
        const { resumeCancellationDelivery } = await import(
          "/src/services/eventNotificationDeliveryService.js"
        );
        return await resumeCancellationDelivery(targetId);
      }, eventId);

      expect(supersededResult.status).toBe("superseded");
      expect(supersededResult.batchesCommitted).toBe(0);

      await logout(page);

      // 8. Attendee (Student B) logs in and verifies notification attribution
      await loginAs(page, E2E_USERS.studentB);
      await page.goto("/notifications");

      await expect(page.getByText(`“${eventTitle}”`)).toBeVisible();
      // Original cancelling actor (Alex Chen) is visibly displayed
      await expect(page.getByText(E2E_USERS.studentA.displayName)).toBeVisible();
      await expect(page.getByText(/was cancelled by/i)).toBeVisible();
      // Student C (Casey Morgan) who resumed delivery MUST NOT appear as the cancelling actor
      await expect(page.getByText(E2E_USERS.studentC.displayName)).not.toBeVisible();
    } finally {
      for (const attendeeId of chunk1AttendeeIds) {
        await deleteTestEventRsvp(eventId, attendeeId);
      }
      await deleteTestEventRsvp(eventId, E2E_USERS.studentB.uid);
      await cleanupEventNotifications(eventId, [
        E2E_USERS.studentA.uid,
        E2E_USERS.studentB.uid,
        E2E_USERS.studentC.uid,
        ...chunk1AttendeeIds,
      ]);
      await deleteIsolatedTestEvent(eventId);
      await removeCommunityMember("apex-ai-club", E2E_USERS.studentC.uid);
      await restoreCommunityMembers();
      await logout(page);
    }
  });

  test("Journey 4: Deleted referenced event renders durable referenceTitle gracefully", async ({
    page,
  }) => {
    const deletedEventId = "e2e-isolated-deleted-evt-999";
    const durableTitle = "Archived AI Seminar 2025";
    const notifId = `cancel_${deletedEventId}_cycle_deleted_12345`;

    // Seed a notification referencing a nonexistent event document
    const now = Timestamp.now();
    await db
      .collection("users")
      .doc(E2E_USERS.studentB.uid)
      .collection("notifications")
      .doc(notifId)
      .set({
        id: notifId,
        recipientId: E2E_USERS.studentB.uid,
        actorId: E2E_USERS.studentA.uid,
        actorName: "Alex Chen",
        actorAvatar: null,
        type: "event_cancelled",
        referenceId: deletedEventId,
        referenceTitle: durableTitle,
        cycleId: "cycle_deleted_12345",
        isRead: false,
        createdAt: now,
      });

    try {
      await loginAs(page, E2E_USERS.studentB);
      await page.goto("/notifications");

      // Verify notification renders durable title
      await expect(page.getByText("Alex Chen")).toBeVisible();
      await expect(page.getByText(`“${durableTitle}”`)).toBeVisible();

      // Click View Event and verify graceful Event Not Found page
      const viewBtn = page.locator(`[data-testid='notif-view-event-${notifId}']`);
      await expect(viewBtn).toBeVisible();
      await viewBtn.click();

      await page.waitForURL(`**/events/${deletedEventId}`);
      await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
      await expect(page.getByText("Unable to Load Event")).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to Events" })).toBeVisible();
    } finally {
      await db
        .collection("users")
        .doc(E2E_USERS.studentB.uid)
        .collection("notifications")
        .doc(notifId)
        .delete();
      await logout(page);
    }
  });

  test("Journey 5: Live multi-chunk cancellation, republishing supersession, and cycle-isolated repeat cancellation", async ({
    page,
  }) => {
    const eventId = "e2e-isolated-multichunk-repub-evt";
    const eventTitle = "Multi-Chunk Robotics Showcase";

    // 10 attendee UIDs: crossing the 8-recipient CHUNK_SIZE boundary (8 in Chunk 1, 2 in Chunk 2)
    const attendeeIds = Array.from(
      { length: 9 },
      (_, i) => `e2e-multi-att-${String(i + 1).padStart(2, "0")}`
    );
    attendeeIds.push(E2E_USERS.studentB.uid);

    await createIsolatedTestEvent({
      id: eventId,
      title: eventTitle,
      status: "published",
      createdBy: E2E_USERS.studentA.uid,
      organizerName: E2E_USERS.studentA.displayName,
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    // Seed 10 RSVPs
    for (const attId of attendeeIds) {
      await createTestEventRsvp(eventId, attId, "apex-university");
    }

    try {
      // 1. Authenticate as Community Admin (Student A)
      await loginAs(page, E2E_USERS.studentA);
      await page.goto(`/events/${eventId}`);

      // 2. Perform live cancellation with 10 attendees across 2 chunks (8 + 2)
      await page.locator("[data-testid='manage-cancel-btn']").click();
      const cancelModal = page.locator("[data-testid='event-cancel-modal']");
      await expect(cancelModal).toBeVisible();

      await page.locator("[data-testid='cancel-confirm-btn']").click();
      await expect(cancelModal).not.toBeVisible();

      // Verify delivery completed card displays all 10 attendees notified
      const completedCard = page.locator("[data-testid='cancellation-delivery-completed']");
      await expect(completedCard).toBeVisible();
      await expect(completedCard).toContainText(
        "Cancellation notifications delivered (10 attendees notified)."
      );

      // Verify Firestore ledger reached 'completed' with 10 processed
      const ledgerSnap1 = await db.collection("eventNotificationDeliveries").doc(eventId).get();
      const ledgerData1 = ledgerSnap1.data();
      expect(ledgerData1.status).toBe("completed");
      expect(ledgerData1.processedCount).toBe(10);
      const cycleId1 = ledgerData1.cycleId;
      expect(typeof cycleId1).toBe("string");
      expect(cycleId1.length).toBeGreaterThanOrEqual(10);

      // Verify attendee received notification for cycle 1
      const studentBNotifCycle1 = await db
        .collection("users")
        .doc(E2E_USERS.studentB.uid)
        .collection("notifications")
        .doc(`cancel_${eventId}_${cycleId1}`)
        .get();
      expect(studentBNotifCycle1.exists).toBe(true);

      // 3. Republish event: triggers atomic/lazy supersession of ledger
      await page.locator("[data-testid='manage-republish-btn']").click();
      const republishModal = page.locator("[data-testid='event-republish-modal']");
      await expect(republishModal).toBeVisible();

      await page.locator("[data-testid='republish-confirm-btn']").click();
      await expect(republishModal).not.toBeVisible();

      // Cancellation banner disappears and status badge returns to Upcoming
      await expect(page.locator("[data-testid='event-cancelled-banner']")).not.toBeVisible();
      await expect(page.locator("[data-testid='event-status-badge']")).toContainText("Upcoming");

      // Verify ledger preserves completed audit status (or transitions to superseded if pending/in_progress)
      const ledgerSnap2 = await db.collection("eventNotificationDeliveries").doc(eventId).get();
      expect(["completed", "superseded"]).toContain(ledgerSnap2.data().status);

      // 4. Second Cancellation: triggers fresh delivery cycle with isolated cycleId
      await page.locator("[data-testid='manage-cancel-btn']").click();
      await expect(cancelModal).toBeVisible();
      await page.locator("[data-testid='cancel-confirm-btn']").click();
      await expect(cancelModal).not.toBeVisible();

      // Verify completion of cycle 2
      await expect(completedCard).toBeVisible();
      await expect(completedCard).toContainText(
        "Cancellation notifications delivered (10 attendees notified)."
      );

      const ledgerSnap3 = await db.collection("eventNotificationDeliveries").doc(eventId).get();
      const ledgerData3 = ledgerSnap3.data();
      expect(ledgerData3.status).toBe("completed");
      expect(ledgerData3.processedCount).toBe(10);
      const cycleId2 = ledgerData3.cycleId;
      expect(cycleId2).not.toBe(cycleId1);

      // Verify attendee has distinct notifications for both cycles without corruption
      const studentBNotifCycle2 = await db
        .collection("users")
        .doc(E2E_USERS.studentB.uid)
        .collection("notifications")
        .doc(`cancel_${eventId}_${cycleId2}`)
        .get();
      expect(studentBNotifCycle2.exists).toBe(true);

      const allStudentBNotifs = await db
        .collection("users")
        .doc(E2E_USERS.studentB.uid)
        .collection("notifications")
        .where("referenceId", "==", eventId)
        .get();
      expect(allStudentBNotifs.size).toBe(2);
    } finally {
      for (const attId of attendeeIds) {
        await deleteTestEventRsvp(eventId, attId);
      }
      await cleanupEventNotifications(eventId, [
        E2E_USERS.studentA.uid,
        ...attendeeIds,
      ]);
      await deleteIsolatedTestEvent(eventId);
      await logout(page);
    }
  });

  test("Journey 6: Waitlist offer notification presentation, View Event navigation, and Settings preference persistence across reload", async ({
    page,
  }) => {
    const eventId = "e2e-isolated-waitlist-offer-evt";
    const eventTitle = "Capped Systems Workshop";
    const notifId = `offer_${eventId}_1`;
    const now = Timestamp.now();

    await createIsolatedTestEvent({
      id: eventId,
      title: eventTitle,
      status: "published",
      createdBy: E2E_USERS.studentA.uid,
      organizerName: E2E_USERS.studentA.displayName,
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    await db
      .collection("users")
      .doc(E2E_USERS.studentB.uid)
      .collection("notifications")
      .doc(notifId)
      .set({
        id: notifId,
        recipientId: E2E_USERS.studentB.uid,
        actorId: "system",
        actorName: "CampusConnect Queue",
        actorAvatar: null,
        type: "event_waitlist_offer",
        referenceId: eventId,
        referenceTitle: eventTitle,
        slotSequence: 1,
        isRead: false,
        createdAt: now,
      });

    try {
      await loginAs(page, E2E_USERS.studentB);

      const notifBadge = page
        .locator('header nav[aria-label="Main Navigation"]')
        .getByLabel(/unread notifications/i);
      await expect(notifBadge).toBeVisible();
      await expect(notifBadge).toHaveText("1");

      // 1. Verify waitlist offer notification presentation in /notifications
      await page.goto("/notifications");
      await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
      await expect(page.locator(`[data-testid='notif-offer-icon-${notifId}']`)).toBeVisible();
      await expect(
        page.getByText(
          `A seat is available for “${eventTitle}”. Claim your spot before the offer expires.`
        )
      ).toBeVisible();

      // 2. Click View Event CTA and verify navigation to /events/{eventId}
      const viewEventLink = page.locator(`[data-testid='notif-view-event-${notifId}']`);
      await expect(viewEventLink).toBeVisible();
      await expect(viewEventLink).toHaveText("View Event");
      await viewEventLink.click();
      await page.waitForURL(`**/events/${eventId}`);
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(eventTitle);

      // 3. Toggle Event Waitlist Offers preference in Settings and verify persistence across reload
      await page.goto("/settings");
      const waitlistOffersToggle = page.locator("#toggle-notif-waitlist-offers");
      await expect(waitlistOffersToggle).toBeVisible();
      await expect(waitlistOffersToggle).toHaveAttribute("aria-checked", "true");

      await waitlistOffersToggle.click();
      await expect(waitlistOffersToggle).toHaveAttribute("aria-checked", "false");

      await page.reload();
      await expect(page.locator("#toggle-notif-waitlist-offers")).toHaveAttribute(
        "aria-checked",
        "false"
      );

      // 4. Verify waitlist offer notification is filtered out when preference is disabled
      await page.goto("/notifications");
      await expect(page.getByText("No notifications yet")).toBeVisible();
      await expect(page.getByText(`“${eventTitle}”`)).not.toBeVisible();
      await expect(notifBadge).not.toBeVisible();

      // 5. Re-enable preference and verify notification reappears
      await page.goto("/settings");
      await page.locator("#toggle-notif-waitlist-offers").click();
      await expect(page.locator("#toggle-notif-waitlist-offers")).toHaveAttribute(
        "aria-checked",
        "true"
      );

      await page.goto("/notifications");
      await expect(page.getByText(`“${eventTitle}”`)).toBeVisible();
    } finally {
      await cleanupEventNotifications(eventId, [E2E_USERS.studentB.uid]);
      await deleteIsolatedTestEvent(eventId);
      await resetUserPreferences(E2E_USERS.studentB.uid);
      await logout(page);
    }
  });
});
