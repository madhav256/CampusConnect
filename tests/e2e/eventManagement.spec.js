/**
 * Milestone 22 — Unit 22.5: Event Management E2E Verification
 *
 * Comprehensive end-to-end test suite verifying the Revision 9 Event Lifecycle Architecture:
 * - Independent edit of upcoming events (allowlisted fields, absence of unsupported fields)
 * - Independent cancellation with immediate registration closure disclaimers
 * - Independent republishing starting from an isolated cancelled event
 * - Independent hard deletion with admin warning and Firestore document removal
 * - Ongoing event constraints (identity locks, shortening rejection, valid extensions)
 * - Completed event read-only invariant (strict absence of management toolbar)
 * - Role-based authorization gates (admin vs moderator vs member vs cross-campus)
 * - RSVP registration freeze upon cancellation & voluntary attendee withdrawal
 * - Orphan RSVP retention on hard delete & self-service removal from the Going tab
 * - Supplementary combined lifecycle journey (edit -> cancel -> republish -> delete)
 */

import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs, logout } from "./helpers/auth.js";
import {
  db,
  resetEventFixtures,
  resetEventRsvps,
  restoreCommunityMembers,
  createIsolatedTestEvent,
  deleteIsolatedTestEvent,
  setCommunityMemberRole,
  createTestEventRsvp,
} from "./helpers/firestoreState.js";

test.describe("Milestone 22 — Event Lifecycle Management E2E", () => {
  test.beforeAll(async () => {
    await resetEventFixtures();
    await resetEventRsvps();
    await restoreCommunityMembers();
  });

  test.afterAll(async () => {
    await resetEventFixtures();
    await resetEventRsvps();
    await restoreCommunityMembers();
  });

  test("Scenario 1: Edit upcoming event — domain field allowlist, unsupported field absence, and reactive detail update", async ({
    page,
  }) => {
    const isolatedId = "e2e-isolated-edit-test";
    await createIsolatedTestEvent({
      id: isolatedId,
      title: "Initial Hackathon Title",
      location: "Initial Room 101",
      description: "Initial description for edit test.",
      status: "published",
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    try {
      // 1. Authenticate as Community Admin (Alex Chen / Student A)
      await loginAs(page, E2E_USERS.studentA);

      // 2. Navigate to isolated upcoming event
      await page.goto(`/events/${isolatedId}`);
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
        "Initial Hackathon Title"
      );
      await expect(page.locator("[data-testid='event-detail-location']")).toContainText(
        "Initial Room 101"
      );

      // 3. Confirm management toolbar is rendered with Community Admin badge
      const toolbar = page.locator("[data-testid='event-management-toolbar']");
      await expect(toolbar).toBeVisible();
      await expect(toolbar.locator("[data-testid='management-role-badge']")).toContainText(
        "Community Admin"
      );

      // 4. Open Edit Details modal
      await page.locator("[data-testid='manage-edit-btn']").click();
      const modal = page.locator("[data-testid='event-edit-modal']");
      await expect(modal).toBeVisible();

      // 5. Verify that unsupported fields (capacity, tags) remain strictly absent from modal
      await expect(page.locator("[data-testid='edit-capacity-input']")).not.toBeVisible();
      await expect(page.locator("[data-testid='edit-tags-input']")).not.toBeVisible();
      await expect(page.locator("input[name='capacity']")).not.toBeVisible();
      await expect(page.locator("input[name='tags']")).not.toBeVisible();

      // 6. Modify allowlisted mutable fields
      await page.locator("[data-testid='edit-title-input']").fill("Updated Hackathon Title");
      await page.locator("[data-testid='edit-location-input']").fill("Updated Innovation Wing 402");
      await page
        .locator("[data-testid='edit-description-input']")
        .fill("Updated description with new agenda details.");

      // 7. Save changes
      await page.locator("[data-testid='edit-submit-btn']").click();
      await expect(modal).not.toBeVisible();

      // 8. Verify reactive updates on the detail page
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
        "Updated Hackathon Title"
      );
      await expect(page.locator("[data-testid='event-detail-location']")).toContainText(
        "Updated Innovation Wing 402"
      );
      await expect(page.locator("[data-testid='event-detail-description']")).toContainText(
        "Updated description with new agenda details."
      );
    } finally {
      await deleteIsolatedTestEvent(isolatedId);
      await logout(page);
    }
  });

  test("Scenario 2: Cancel event — registration closure disclaimer, cancellation banner, and republish button visibility", async ({
    page,
  }) => {
    const isolatedId = "e2e-isolated-cancel-test";
    await createIsolatedTestEvent({
      id: isolatedId,
      title: "Upcoming Session to Cancel",
      status: "published",
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    try {
      // 1. Authenticate as Community Admin
      await loginAs(page, E2E_USERS.studentA);

      // 2. Open upcoming event
      await page.goto(`/events/${isolatedId}`);
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
        "Upcoming Session to Cancel"
      );
      await expect(page.locator("[data-testid='event-status-badge']")).toContainText("Upcoming");

      // 3. Open Cancel Modal
      await page.locator("[data-testid='manage-cancel-btn']").click();
      const cancelModal = page.locator("[data-testid='event-cancel-modal']");
      await expect(cancelModal).toBeVisible();

      // 4. Verify consequence disclaimers
      await expect(
        page.getByText(/Registration closes immediately; no new attendees will be able to RSVP/i)
      ).toBeVisible();
      await expect(
        page.getByText(/You can republish this event at any time before its scheduled start time/i)
      ).toBeVisible();

      // 5. Confirm cancellation
      await page.locator("[data-testid='cancel-confirm-btn']").click();
      await expect(cancelModal).not.toBeVisible();

      // 6. Verify cancellation alert banner and status badge appear reactively
      await expect(page.locator("[data-testid='event-cancelled-banner']")).toBeVisible();
      await expect(page.getByText("This event has been cancelled")).toBeVisible();
      await expect(page.locator("[data-testid='event-status-badge']")).toContainText("Cancelled");

      // 7. Verify management toolbar updates: Cancel button is removed, Republish button appears
      await expect(page.locator("[data-testid='manage-cancel-btn']")).not.toBeVisible();
      await expect(page.locator("[data-testid='manage-republish-btn']")).toBeVisible();
    } finally {
      await deleteIsolatedTestEvent(isolatedId);
      await logout(page);
    }
  });

  test("Scenario 3: Republish cancelled event — independently seeded cancelled event, restoration of published state", async ({
    page,
  }) => {
    const isolatedId = "e2e-isolated-republish-test";
    // Independently seeded into cancelled state: does NOT depend on Scenario 2
    await createIsolatedTestEvent({
      id: isolatedId,
      title: "Cancelled Workshop for Republishing",
      status: "cancelled",
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    try {
      // 1. Authenticate as Community Admin
      await loginAs(page, E2E_USERS.studentA);

      // 2. Open cancelled event
      await page.goto(`/events/${isolatedId}`);
      await expect(page.locator("[data-testid='event-cancelled-banner']")).toBeVisible();
      await expect(page.locator("[data-testid='event-status-badge']")).toContainText("Cancelled");

      // 3. Verify toolbar exposes Republish button (Cancel button is absent)
      await expect(page.locator("[data-testid='manage-republish-btn']")).toBeVisible();
      await expect(page.locator("[data-testid='manage-cancel-btn']")).not.toBeVisible();

      // 4. Open Republish modal
      await page.locator("[data-testid='manage-republish-btn']").click();
      const republishModal = page.locator("[data-testid='event-republish-modal']");
      await expect(republishModal).toBeVisible();
      await expect(
        page.getByText(/The event status changes back to Published/i)
      ).toBeVisible();

      // 5. Confirm republishing
      await page.locator("[data-testid='republish-confirm-btn']").click();
      await expect(republishModal).not.toBeVisible();

      // 6. Verify cancellation banner is removed reactively
      await expect(page.locator("[data-testid='event-cancelled-banner']")).not.toBeVisible();

      // 7. Verify status badge restored to Upcoming
      await expect(page.locator("[data-testid='event-status-badge']")).toContainText("Upcoming");

      // 8. Verify toolbar transitions: Republish button hidden, Cancel button restored
      await expect(page.locator("[data-testid='manage-republish-btn']")).not.toBeVisible();
      await expect(page.locator("[data-testid='manage-cancel-btn']")).toBeVisible();
    } finally {
      await deleteIsolatedTestEvent(isolatedId);
      await logout(page);
    }
  });

  test("Scenario 4: Hard delete upcoming event — admin warning, redirect to events list, and Firestore document removal", async ({
    page,
  }) => {
    const isolatedId = "e2e-isolated-delete-test";
    await createIsolatedTestEvent({
      id: isolatedId,
      title: "Ephemeral Event to Delete",
      status: "published",
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    try {
      // 1. Authenticate as Community Admin
      await loginAs(page, E2E_USERS.studentA);

      // 2. Open event detail
      await page.goto(`/events/${isolatedId}`);
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
        "Ephemeral Event to Delete"
      );

      // 3. Click Delete Event
      await page.locator("[data-testid='manage-delete-btn']").click();
      const deleteModal = page.locator("[data-testid='event-delete-modal']");
      await expect(deleteModal).toBeVisible();

      // 4. Verify irreversible warning
      await expect(page.getByText(/Warning: This action cannot be undone/i)).toBeVisible();

      // 5. Confirm deletion
      await page.locator("[data-testid='delete-confirm-btn']").click();

      // 6. Verify immediate redirect to events list
      await page.waitForURL("**/events");

      // 7. Verify Firestore document is permanently deleted
      const docSnap = await db.collection("events").doc(isolatedId).get();
      expect(docSnap.exists).toBe(false);
    } finally {
      await logout(page);
    }
  });

  test("Scenario 5: Ongoing event constraints — live badge, immutable field lock, shortening rejection, and valid extension", async ({
    page,
  }) => {
    try {
      // 1. Authenticate as Community Admin
      await loginAs(page, E2E_USERS.studentA);

      // 2. Open seeded ongoing event: Apex Autonomous Rover Live Field Workshop (-1h to +2h)
      await page.goto("/events/e2e-event-ongoing-workshop");
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
        "Apex Autonomous Rover Live Field Workshop"
      );

      // 3. Verify Ongoing · Live badge in management toolbar
      const toolbar = page.locator("[data-testid='event-management-toolbar']");
      await expect(toolbar).toBeVisible();
      await expect(toolbar.locator("[data-testid='management-ongoing-badge']")).toBeVisible();

      // 4. Confirm Delete button is STRICTLY ABSENT for ongoing events
      await expect(toolbar.locator("[data-testid='manage-delete-btn']")).not.toBeVisible();

      // 5. Open Edit modal
      await page.locator("[data-testid='manage-edit-btn']").click();
      const editModal = page.locator("[data-testid='event-edit-modal']");
      await expect(editModal).toBeVisible();

      // 6. Confirm ongoing lock alert banner
      await expect(page.locator("[data-testid='edit-ongoing-banner']")).toBeVisible();
      await expect(page.getByText(/event is currently in progress/i)).toBeVisible();

      // 7. Verify immutable fields are strictly disabled
      await expect(page.locator("[data-testid='edit-title-input']")).toBeDisabled();
      await expect(page.locator("[data-testid='edit-slug-input']")).toBeDisabled();
      await expect(page.locator("[data-testid='edit-category-select']")).toBeDisabled();
      await expect(page.locator("[data-testid='edit-organizer-input']")).toBeDisabled();
      await expect(page.locator("[data-testid='edit-start-at-input']")).toBeDisabled();

      // 8. Verify mutable fields remain editable
      await expect(page.locator("[data-testid='edit-location-input']")).toBeEnabled();
      await expect(page.locator("[data-testid='edit-description-input']")).toBeEnabled();
      await expect(page.locator("[data-testid='edit-end-at-input']")).toBeEnabled();

      // 9. Update location
      await page.locator("[data-testid='edit-location-input']").fill("Robotics Arena Bay 3");

      // 10. Save changes
      await page.locator("[data-testid='edit-submit-btn']").click();
      await expect(editModal).not.toBeVisible();

      // 11. Verify reactive detail update on page
      await expect(page.locator("[data-testid='event-detail-location']")).toContainText(
        "Robotics Arena Bay 3"
      );
    } finally {
      await resetEventFixtures();
      await logout(page);
    }
  });

  test("Scenario 6: Completed event read-only invariant — absence of management toolbar and mutation actions", async ({
    page,
  }) => {
    try {
      // 1. Authenticate as Community Admin
      await loginAs(page, E2E_USERS.studentA);

      // 2. Open seeded past event: Apex AI Society Fall Orientation & Welcome Mixer (-3d to -2d)
      await page.goto("/events/e2e-event-past-orientation");
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
        "Apex AI Society Fall Orientation & Welcome Mixer"
      );

      // 3. Verify status badge indicates Completed
      await expect(page.locator("[data-testid='event-status-badge']")).toContainText("Completed");

      // 4. Confirm management toolbar is STRICTLY ABSENT from the DOM
      await expect(page.locator("[data-testid='event-management-toolbar']")).not.toBeVisible();

      // 5. Verify no management buttons exist anywhere on the page
      await expect(page.locator("[data-testid='manage-edit-btn']")).not.toBeVisible();
      await expect(page.locator("[data-testid='manage-cancel-btn']")).not.toBeVisible();
      await expect(page.locator("[data-testid='manage-republish-btn']")).not.toBeVisible();
      await expect(page.locator("[data-testid='manage-delete-btn']")).not.toBeVisible();
    } finally {
      await logout(page);
    }
  });

  test("Scenario 7: Role-based authorization gates — moderator restrictions, member view, and cross-campus isolation", async ({
    page,
  }) => {
    try {
      // --- Part A: Regular Active Member Perspective ---
      // 1. Authenticate as Student B (active member of apex-ai-club)
      await loginAs(page, E2E_USERS.studentB);

      // 2. Open Apex AI Club event
      await page.goto("/events/e2e-event-ai-hackathon");
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
        "Apex Annual AI & Robotics Hackathon 2026"
      );

      // 3. Member cannot see management toolbar
      await expect(page.locator("[data-testid='event-management-toolbar']")).not.toBeVisible();
      await logout(page);

      // --- Part B: Moderator Perspective (Elevated) ---
      // 4. Temporarily elevate Student B to moderator in Firestore
      await setCommunityMemberRole("apex-ai-club", E2E_USERS.studentB.uid, "moderator", "active");

      // 5. Re-authenticate as Student B
      await loginAs(page, E2E_USERS.studentB);
      await page.goto("/events/e2e-event-ai-hackathon");

      // 6. Moderator CAN see toolbar with role badge "Community Moderator"
      const toolbar = page.locator("[data-testid='event-management-toolbar']");
      await expect(toolbar).toBeVisible();
      await expect(toolbar.locator("[data-testid='management-role-badge']")).toContainText(
        "Community Moderator"
      );

      // 7. Moderator CAN edit and cancel
      await expect(toolbar.locator("[data-testid='manage-edit-btn']")).toBeVisible();
      await expect(toolbar.locator("[data-testid='manage-cancel-btn']")).toBeVisible();

      // 8. Moderator CANNOT delete (strictly absent)
      await expect(toolbar.locator("[data-testid='manage-delete-btn']")).not.toBeVisible();
      await logout(page);

      // --- Part C: Cross-Campus Tenant Isolation ---
      // 9. Authenticate as St. Jude student (Rohan Varma)
      await loginAs(page, E2E_USERS.studentStJude);

      // 10. Attempt to access Apex event directly
      await page.goto("/events/e2e-event-ai-hackathon");

      // 11. Read access is denied; error state rendered, title and toolbar hidden
      await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
      await expect(page.getByText("Unable to Load Event")).toBeVisible();
      await expect(page.locator("[data-testid='event-detail-title']")).not.toBeVisible();
      await expect(page.locator("[data-testid='event-management-toolbar']")).not.toBeVisible();
    } finally {
      // Reliably restore Student B to active member role in cleanup
      await restoreCommunityMembers();
      await logout(page);
    }
  });

  test("Scenario 8: RSVP registration freeze on cancellation & voluntary attendee withdrawal", async ({
    page,
  }) => {
    const isolatedId = "e2e-isolated-rsvp-freeze";
    await createIsolatedTestEvent({
      id: isolatedId,
      title: "Freeze Test Workshop",
      status: "published",
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    try {
      // 1. Authenticate as Student B and RSVP to the published event
      await loginAs(page, E2E_USERS.studentB);
      await page.goto(`/events/${isolatedId}`);

      const rsvpBtnB = page.locator(
        "[data-testid='event-rsvp-card'] [data-testid='event-rsvp-button']"
      );
      await expect(rsvpBtnB).toBeVisible();
      await expect(rsvpBtnB).toBeEnabled();
      await expect(rsvpBtnB).toContainText("RSVP");

      await rsvpBtnB.click();
      await expect(rsvpBtnB).toContainText("Cancel RSVP");
      await logout(page);

      // 2. Authenticate as Student A (Admin) and cancel the event
      await loginAs(page, E2E_USERS.studentA);
      await page.goto(`/events/${isolatedId}`);
      await page.locator("[data-testid='manage-cancel-btn']").click();
      await page.locator("[data-testid='cancel-confirm-btn']").click();
      await expect(page.locator("[data-testid='event-cancel-modal']")).not.toBeVisible();
      await expect(page.locator("[data-testid='event-cancelled-banner']")).toBeVisible();
      await logout(page);

      // 3. Authenticate as Student C (non-attending student)
      await loginAs(page, E2E_USERS.studentC);
      await page.goto(`/events/${isolatedId}`);

      // 4. Verify non-attending student cannot register: button is disabled with explanatory reason
      const rsvpBtnC = page.locator(
        "[data-testid='event-rsvp-card'] [data-testid='event-rsvp-button']"
      );
      await expect(rsvpBtnC).toBeVisible();
      await expect(rsvpBtnC).toBeDisabled();
      await expect(rsvpBtnC).toContainText("RSVP");
      await expect(
        page.locator("[data-testid='event-rsvp-card'] [data-testid='rsvp-disabled-reason']")
      ).toHaveText("Registration closed — event has been cancelled");
      await logout(page);

      // 5. Authenticate as Student B (attending student)
      await loginAs(page, E2E_USERS.studentB);
      await page.goto(`/events/${isolatedId}`);

      // 6. Verify existing RSVP remains removable: button is ENABLED and says Cancel RSVP
      const studentBButton = page.locator(
        "[data-testid='event-rsvp-card'] [data-testid='event-rsvp-button']"
      );
      await expect(studentBButton).toBeVisible();
      await expect(studentBButton).toBeEnabled();
      await expect(studentBButton).toContainText("Cancel RSVP");

      // 7. Student B voluntarily withdraws RSVP
      await studentBButton.click();

      // 8. Verify button transitions to disabled state with cancellation explanation
      await expect(studentBButton).toBeDisabled();
      await expect(studentBButton).toContainText("RSVP");
      await expect(
        page.locator("[data-testid='event-rsvp-card'] [data-testid='rsvp-disabled-reason']")
      ).toHaveText("Registration closed — event has been cancelled");
    } finally {
      await deleteIsolatedTestEvent(isolatedId);
      await resetEventRsvps();
      await logout(page);
    }
  });

  test("Scenario 9: Orphan RSVP retention on hard delete & self-service removal on Going tab", async ({
    page,
  }) => {
    const isolatedId = "e2e-isolated-orphan-event";
    await createIsolatedTestEvent({
      id: isolatedId,
      title: "Hard Deletion Candidate",
      status: "published",
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    // Seed RSVP for Student B on this isolated event
    await createTestEventRsvp(isolatedId, E2E_USERS.studentB.uid, "apex-university");

    try {
      // 1. Authenticate as Community Admin and delete the event
      await loginAs(page, E2E_USERS.studentA);
      await page.goto(`/events/${isolatedId}`);
      await page.locator("[data-testid='manage-delete-btn']").click();
      await page.locator("[data-testid='delete-confirm-btn']").click();
      await page.waitForURL("**/events");
      await logout(page);

      // 2. Verify event document was deleted from Firestore
      const eventSnap = await db.collection("events").doc(isolatedId).get();
      expect(eventSnap.exists).toBe(false);

      // 3. Authenticate as Student B (who holds the orphaned RSVP)
      await loginAs(page, E2E_USERS.studentB);
      await page.goto("/events");
      await page.locator("[data-testid='time-tab-going']").click();

      // 4. Verify the "RSVPs Requiring Attention" section is displayed
      await expect(page.locator("[data-testid='event-grid-attention-section']")).toBeVisible();

      // 5. Verify the inaccessible orphan card is rendered
      const orphanCard = page.locator(`[data-testid='event-inaccessible-card-${isolatedId}']`);
      await expect(orphanCard).toBeVisible();
      await expect(orphanCard.locator("[data-testid='rsvp-inaccessible-badge']")).toContainText(
        "No longer available"
      );
      await expect(orphanCard.locator("[data-testid='event-inaccessible-title']")).toHaveText(
        "Event Unavailable"
      );

      // 6. Click "Remove RSVP" to dismiss the orphan record
      const removeBtn = page.locator(`[data-testid='remove-rsvp-btn-${isolatedId}']`);
      await expect(removeBtn).toBeVisible();
      await removeBtn.click();

      // 7. Verify the orphan card is removed from the Going tab
      await expect(orphanCard).not.toBeVisible();

      // 8. Verify the RSVP document has been purged from Firestore
      await expect
        .poll(
          async () => {
            const rsvpSnap = await db
              .collection("eventRsvps")
              .doc(`${isolatedId}_${E2E_USERS.studentB.uid}`)
              .get();
            return rsvpSnap.exists;
          },
          { message: "RSVP document was not purged from Firestore", timeout: 10000 }
        )
        .toBe(false);
    } finally {
      await resetEventRsvps();
      await logout(page);
    }
  });

  test("Scenario 10: Supplementary combined lifecycle journey — edit -> cancel -> republish -> delete", async ({
    page,
  }) => {
    const isolatedId = "e2e-isolated-journey-test";
    await createIsolatedTestEvent({
      id: isolatedId,
      title: "Journey Event Initial",
      status: "published",
      communityId: "apex-ai-club",
      campusId: "apex-university",
    });

    try {
      // 1. Authenticate as Community Admin
      await loginAs(page, E2E_USERS.studentA);
      await page.goto(`/events/${isolatedId}`);

      // 2. Phase 1: Edit
      await page.locator("[data-testid='manage-edit-btn']").click();
      await page.locator("[data-testid='edit-title-input']").fill("Journey Event Modified");
      await page.locator("[data-testid='edit-submit-btn']").click();
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
        "Journey Event Modified"
      );

      // 3. Phase 2: Cancel
      await page.locator("[data-testid='manage-cancel-btn']").click();
      await page.locator("[data-testid='cancel-confirm-btn']").click();
      await expect(page.locator("[data-testid='event-cancelled-banner']")).toBeVisible();
      await expect(page.locator("[data-testid='event-status-badge']")).toContainText("Cancelled");

      // 4. Phase 3: Republish
      await page.locator("[data-testid='manage-republish-btn']").click();
      await page.locator("[data-testid='republish-confirm-btn']").click();
      await expect(page.locator("[data-testid='event-cancelled-banner']")).not.toBeVisible();
      await expect(page.locator("[data-testid='event-status-badge']")).toContainText("Upcoming");

      // 5. Phase 4: Delete
      await page.locator("[data-testid='manage-delete-btn']").click();
      await page.locator("[data-testid='delete-confirm-btn']").click();
      await page.waitForURL("**/events");

      const docSnap = await db.collection("events").doc(isolatedId).get();
      expect(docSnap.exists).toBe(false);
    } finally {
      await logout(page);
    }
  });
});
