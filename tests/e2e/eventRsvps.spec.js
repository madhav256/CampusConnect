/**
 * Milestone 21 — Unit 21.6: RSVP E2E Regression Suite
 *
 * Validates the complete Event RSVP lifecycle across:
 * 1. Public event RSVP lifecycle (RSVP -> attending state -> attendee count -> Going tab -> cancellation -> removal from Going)
 * 2. Community-only event authorization (active member can RSVP; non-member is strictly denied and unauthorized control not exposed)
 * 3. Cross-campus isolation (St. Jude student sees only St. Jude RSVPs; Apex student cannot access St. Jude attendee roster)
 * 4. Cancelled event and existing RSVP (disabled for non-attending, visible and removable for attending student)
 */

import process from "node:process";
import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs, logout } from "./helpers/auth.js";
import {
  resetEventRsvps,
  createTestEventRsvp,
  createIsolatedTestEvent,
  getIsolatedCappedEventState,
  cleanupIsolatedCappedEvent,
} from "./helpers/firestoreState.js";

test.describe("Milestone 21 — Unit 21.6: Event RSVP E2E Suite", () => {
  test.beforeEach(async ({ page }) => {
    // 1. Idempotently reset eventRsvps collection to approved deterministic fixtures
    await resetEventRsvps();

    // 2. Synchronize browser clock deterministically if E2E_SEED_NOW is provided
    if (process.env.E2E_SEED_NOW) {
      const seedTime = new Date(process.env.E2E_SEED_NOW).getTime();
      const timeOffset = seedTime - Date.now();
      await page.addInitScript((offset) => {
        const OrigDate = Date;
        class MockDate extends OrigDate {
          constructor(...args) {
            if (args.length === 0) {
              super(OrigDate.now() + offset);
            } else {
              super(...args);
            }
          }
          static now() {
            return OrigDate.now() + offset;
          }
        }
        MockDate.parse = OrigDate.parse;
        MockDate.UTC = OrigDate.UTC;
        window.Date = MockDate;
      }, timeOffset);
    }
  });

  test.afterEach(async () => {
    // Clean up any test-mutated or created RSVPs after test execution
    await resetEventRsvps();
  });

  test("Scenario 1: Public event RSVP lifecycle — register, headcount update, Going tab projection, and cancellation", async ({
    page,
  }) => {
    // 1. Authenticate as eligible Apex Student A (Alex Chen)
    await loginAs(page, E2E_USERS.studentA);

    // 2. Navigate to accessible, upcoming, campus-public event: Apex Annual AI & Robotics Hackathon 2026
    await page.goto("/events/e2e-event-ai-hackathon");
    await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
      "Apex Annual AI & Robotics Hackathon 2026"
    );

    // 3. Confirm initial RSVP state: Student A has not RSVP'd; Student B is the sole attendee
    const rsvpButton = page.locator("[data-testid='event-rsvp-card'] [data-testid='event-rsvp-button']");
    await expect(rsvpButton).toBeVisible();
    await expect(rsvpButton).toContainText("RSVP");
    await expect(rsvpButton).not.toContainText("Cancel");

    const attendeeCount = page.locator("[data-testid='event-attendee-count']");
    await expect(attendeeCount).toBeVisible();
    await expect(attendeeCount).toHaveText("1 going");

    // Verify Student B's avatar is in the attendee list, and Student A's avatar is absent
    await expect(
      page.locator("[data-testid='attendee-avatar-e2e-student-b']")
    ).toBeVisible();
    await expect(
      page.locator("[data-testid='attendee-avatar-e2e-student-a']")
    ).not.toBeVisible();

    // 4. RSVP to the event
    await rsvpButton.click();

    // 5. Verify the button transitions to attending/cancellation state
    await expect(rsvpButton).toContainText("Cancel RSVP");

    // 6. Verify that the attendee count increases from 1 to 2
    await expect(attendeeCount).toHaveText("2 going");
    await expect(
      page.locator("[data-testid='attendee-avatar-e2e-student-a']")
    ).toBeVisible();

    // 7. Verify that the event appears in Student A's Going tab
    await page.goto("/events");
    await page.locator("[data-testid='time-tab-going']").click();

    const hackathonCard = page.locator(
      "[data-testid='event-card-e2e-event-ai-hackathon']"
    );
    await expect(hackathonCard).toBeVisible();
    await expect(
      hackathonCard.locator("[data-testid='event-card-going-badge']")
    ).toBeVisible();

    // 8. Navigate back to event detail and cancel the RSVP
    await hackathonCard.click();
    await page.waitForURL("**/events/e2e-event-ai-hackathon");
    await expect(rsvpButton).toContainText("Cancel RSVP");

    await rsvpButton.click();

    // 9. Verify button transitions back to initial "RSVP" state and attendee count decrements
    await expect(rsvpButton).toContainText("RSVP");
    await expect(rsvpButton).not.toContainText("Cancel");
    await expect(attendeeCount).toHaveText("1 going");
    await expect(
      page.locator("[data-testid='attendee-avatar-e2e-student-a']")
    ).not.toBeVisible();

    // 10. Verify that the event disappears from Student A's Going tab
    await page.goto("/events");
    await page.locator("[data-testid='time-tab-going']").click();
    await expect(
      page.locator("[data-testid='event-card-e2e-event-ai-hackathon']")
    ).not.toBeVisible();
  });

  test("Scenario 2: Community-only event authorization — active member can RSVP, non-member is denied with no unauthorized control", async ({
    page,
  }) => {
    // --- Part A: Active Member Authorization ---
    // 1. Authenticate as Student A (Admin of Apex AI Club)
    await loginAs(page, E2E_USERS.studentA);

    // 2. Open published, upcoming community-only event: Apex AI Lab Internal Planning & Hardware Sync
    await page.goto("/events/e2e-event-ai-members-only");
    await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
      "Apex AI Lab Internal Planning & Hardware Sync"
    );
    await expect(page.locator("[data-testid='event-detail-visibility']")).toHaveText(
      "Community Only"
    );

    // 3. Confirm RSVP control is exposed and active member can RSVP
    const rsvpButton = page.locator("[data-testid='event-rsvp-card'] [data-testid='event-rsvp-button']");
    await expect(rsvpButton).toBeVisible();
    await expect(rsvpButton).toBeEnabled();
    await expect(rsvpButton).toContainText("RSVP");

    await rsvpButton.click();
    await expect(rsvpButton).toContainText("Cancel RSVP");

    // Clean up Student A's RSVP before Part B
    await rsvpButton.click();
    await expect(rsvpButton).toContainText("RSVP");

    // --- Part B: Non-Member Denial ---
    // 4. Sign out and authenticate as Student C (Apex student, NOT a member of Apex AI Club)
    await logout(page);
    await loginAs(page, E2E_USERS.studentC);

    // 5. Directly navigate non-member to the community-only event URL
    await page.goto("/events/e2e-event-ai-members-only");

    // 6. Verify authorization rejection: error state is displayed, title is hidden, and RSVP control is NOT exposed
    await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
    await expect(page.getByText("Unable to Load Event")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-title']")).not.toBeVisible();
    await expect(page.locator("[data-testid='event-rsvp-card'] [data-testid='event-rsvp-button']")).not.toBeVisible();
    await expect(page.locator("[data-testid='event-rsvp-mobile-bar'] [data-testid='event-rsvp-button']")).not.toBeVisible();

    // 7. Verify non-member cannot see the community-only event in community events tab
    await page.goto("/communities/apex-ai-club");
    await page.locator("[data-testid='community-tab-events']").click();
    await expect(
      page.locator("[data-testid='event-card-e2e-event-ai-hackathon']")
    ).toBeVisible();
    await expect(
      page.locator("[data-testid='event-card-e2e-event-ai-members-only']")
    ).not.toBeVisible();
  });

  test("Scenario 3: Cross-campus isolation — tenant-scoped Going tab and protected attendee roster", async ({
    page,
  }) => {
    // --- Part A: St. Jude Student Perspective ---
    // 1. Authenticate as St. Jude student (Rohan Varma)
    await loginAs(page, E2E_USERS.studentStJude);

    // 2. Open /events and navigate to Going tab
    await page.goto("/events");
    await page.locator("[data-testid='time-tab-going']").click();

    // 3. Confirm St. Jude student sees their St. Jude RSVP
    const stJudeCard = page.locator(
      "[data-testid='event-card-e2e-event-st-jude-symposium']"
    );
    await expect(stJudeCard).toBeVisible();
    await expect(
      stJudeCard.locator("[data-testid='event-card-going-badge']")
    ).toBeVisible();

    // 4. Confirm St. Jude student CANNOT see Apex-specific RSVP entries in Going tab
    await expect(
      page.locator("[data-testid='event-card-e2e-event-ai-hackathon']")
    ).not.toBeVisible();
    await expect(
      page.locator("[data-testid='event-card-e2e-event-design-sprint']")
    ).not.toBeVisible();
    await expect(
      page.locator("[data-testid='event-card-e2e-event-ai-members-only']")
    ).not.toBeVisible();

    // --- Part B: Apex Student Perspective ---
    // 5. Sign out and authenticate as Apex student (Alex Chen)
    await logout(page);
    await loginAs(page, E2E_USERS.studentA);

    // 6. Directly navigate Apex student to St. Jude event detail
    await page.goto("/events/e2e-event-st-jude-symposium");

    // 7. Confirm cross-campus read is denied: error state rendered, title not visible
    await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
    await expect(page.getByText("Unable to Load Event")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-title']")).not.toBeVisible();

    // 8. Confirm protected attendee roster cannot be accessed by cross-campus student
    await expect(
      page.locator("[data-testid='event-attendee-preview']")
    ).not.toBeVisible();
    await expect(
      page.locator("[data-testid='attendee-avatars']")
    ).not.toBeVisible();
    await expect(
      page.locator("[data-testid='attendee-avatar-e2e-student-st-jude']")
    ).not.toBeVisible();

    // 9. Confirm St. Jude event is not in Apex student's Going tab
    await page.goto("/events");
    await page.locator("[data-testid='time-tab-going']").click();
    await expect(
      page.locator("[data-testid='event-card-e2e-event-st-jude-symposium']")
    ).not.toBeVisible();
    await expect(
      page.locator("[data-testid='event-card-e2e-event-design-sprint']")
    ).toBeVisible();
  });

  test("Scenario 4: Cancelled event and existing RSVP — disabled for non-attending, visible and removable for attending student", async ({
    page,
  }) => {
    // --- Part A: Non-Attending Student on Cancelled Event ---
    // 1. Authenticate as Student B (who has NOT RSVP'd to the cancelled lecture)
    await loginAs(page, E2E_USERS.studentB);

    // 2. Open cancelled event: Guest Lecture: Typography in Spatial Computing
    await page.goto("/events/e2e-event-cancelled-lecture");
    await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
      "Guest Lecture: Typography in Spatial Computing"
    );

    // 3. Confirm cancellation warning banner is rendered
    await expect(page.locator("[data-testid='event-cancelled-banner']")).toBeVisible();
    await expect(
      page.getByText("This event has been cancelled")
    ).toBeVisible();

    // 4. Confirm RSVP control is disabled with explanatory reason
    const rsvpButton = page.locator("[data-testid='event-rsvp-card'] [data-testid='event-rsvp-button']");
    await expect(rsvpButton).toBeVisible();
    await expect(rsvpButton).toBeDisabled();

    const disabledReason = page.locator("[data-testid='event-rsvp-card'] [data-testid='rsvp-disabled-reason']");
    await expect(disabledReason).toBeVisible();
    await expect(disabledReason).toHaveText(
      "Registration closed — event has been cancelled"
    );

    // --- Part B: Attending Student on Cancelled Event ---
    // 5. Seed an existing RSVP for Student A on this cancelled event
    await createTestEventRsvp(
      "e2e-event-cancelled-lecture",
      E2E_USERS.studentA.uid,
      "apex-university"
    );

    // 6. Sign out and authenticate as Student A
    await logout(page);
    await loginAs(page, E2E_USERS.studentA);

    // 7. Verify the cancelled event appears in Student A's Going tab
    await page.goto("/events");
    await page.locator("[data-testid='time-tab-going']").click();

    const cancelledCard = page.locator(
      "[data-testid='event-card-e2e-event-cancelled-lecture']"
    );
    await expect(cancelledCard).toBeVisible();
    await expect(
      cancelledCard.locator("[data-testid='event-card-going-badge']")
    ).toBeVisible();

    // 8. Open the cancelled event detail page as the attending student
    await cancelledCard.click();
    await page.waitForURL("**/events/e2e-event-cancelled-lecture");

    // 9. Confirm that an existing RSVP remains removable: button is ENABLED and shows "Cancel RSVP"
    const studentARsvpButton = page.locator("[data-testid='event-rsvp-card'] [data-testid='event-rsvp-button']");
    await expect(studentARsvpButton).toBeVisible();
    await expect(studentARsvpButton).toBeEnabled();
    await expect(studentARsvpButton).toContainText("Cancel RSVP");
    await expect(
      page.locator("[data-testid='event-rsvp-card'] [data-testid='rsvp-disabled-reason']")
    ).not.toBeVisible();

    // 10. Attending student removes their RSVP from the cancelled event
    await studentARsvpButton.click();

    // 11. After removal, verify button transitions to disabled state with explanatory reason
    await expect(studentARsvpButton).toBeDisabled();
    await expect(studentARsvpButton).toContainText("RSVP");
    await expect(
      page.locator("[data-testid='event-rsvp-card'] [data-testid='rsvp-disabled-reason']")
    ).toBeVisible();
    await expect(
      page.locator("[data-testid='event-rsvp-card'] [data-testid='rsvp-disabled-reason']")
    ).toHaveText("Registration closed — event has been cancelled");

    // 12. Verify the cancelled event is now removed from Student A's Going tab
    await page.goto("/events");
    await page.locator("[data-testid='time-tab-going']").click();
    await expect(
      page.locator("[data-testid='event-card-e2e-event-cancelled-lecture']")
    ).not.toBeVisible();
  });

  test("Scenario 5: Capped-event waitlist journey — final seat RSVP, UI waitlist join, cancellation offer rollover, and seat claim", async ({
    page,
  }) => {
    test.setTimeout(60000);
    const cappedEventId = "e2e-isolated-capped-waitlist";
    await cleanupIsolatedCappedEvent(cappedEventId);

    try {
      // 1. Seed a capped event with capacity 1 and initial empty coordinator
      await createIsolatedTestEvent({
        id: cappedEventId,
        title: "Apex Systems Engineering Micro-Lab",
        capacity: 1,
        campusId: "apex-university",
        communityId: "apex-ai-club",
        visibility: "campus_public",
      });

      // 2. Student A occupies the final confirmed seat through the EventDetail UI
      await loginAs(page, E2E_USERS.studentA);
      await page.goto(`/events/${cappedEventId}`);
      await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
        "Apex Systems Engineering Micro-Lab"
      );

      const capacityIndicator = page.locator("[data-testid='capacity-indicator']");
      await expect(capacityIndicator).toBeVisible();
      await expect(page.locator("[data-testid='capacity-count-text']")).toHaveText(
        "0 / 1 seats filled"
      );
      await expect(page.locator("[data-testid='capacity-available-badge']")).toHaveText(
        "1 left"
      );

      const rsvpButton = page.locator(
        "[data-testid='event-rsvp-card'] [data-testid='event-rsvp-button']"
      );
      await expect(rsvpButton).toContainText("RSVP");
      await rsvpButton.click();

      await expect(rsvpButton).toContainText("Cancel RSVP");
      await expect(page.locator("[data-testid='capacity-count-text']")).toHaveText(
        "1 / 1 seats filled"
      );
      await expect(page.locator("[data-testid='capacity-full-badge']")).toHaveText("Full");

      // Verify persisted state after Student A takes the final seat
      let state = await getIsolatedCappedEventState(cappedEventId, [
        E2E_USERS.studentA.uid,
        E2E_USERS.studentB.uid,
      ]);
      expect(state.coordinator.confirmedCount).toBe(1);
      expect(state.coordinator.waitlistCount).toBe(0);
      expect(state.rsvps[E2E_USERS.studentA.uid]).toBeTruthy();

      // 3. Student B opens the full capped event and joins the waitlist through the UI
      await logout(page);
      await loginAs(page, E2E_USERS.studentB);
      await page.goto(`/events/${cappedEventId}`);

      await expect(page.locator("[data-testid='capacity-count-text']")).toHaveText(
        "1 / 1 seats filled"
      );
      await expect(page.locator("[data-testid='capacity-full-badge']")).toHaveText("Full");
      await expect(rsvpButton).toContainText("Join Waitlist");

      await rsvpButton.click();

      const waitlistModal = page.locator("[data-testid='waitlist-modal']");
      await expect(waitlistModal).toBeVisible();
      await expect(page.locator("[data-testid='estimated-queue-position']")).toHaveText("#1");

      await page.locator("[data-testid='join-waitlist-button']").click();
      await expect(waitlistModal).not.toBeVisible();

      // 4. Verify capacity indicator and waitlist position in UI and persisted Firestore state
      await expect(page.locator("[data-testid='capacity-waitlist-badge']")).toContainText(
        "1 on waitlist"
      );
      await expect(rsvpButton).toContainText("On Waitlist (#1)");

      // Open modal to verify live queue position #1 and Waiting status
      await rsvpButton.click();
      await expect(waitlistModal).toBeVisible();
      await expect(page.locator("[data-testid='waitlist-queue-position']")).toHaveText("#1");
      await expect(page.locator("[data-testid='waitlist-member-status']")).toContainText(
        "waiting"
      );
      await page.locator("[data-testid='waitlist-modal-close']").click();

      state = await getIsolatedCappedEventState(cappedEventId, [
        E2E_USERS.studentA.uid,
        E2E_USERS.studentB.uid,
      ]);
      expect(state.coordinator.confirmedCount).toBe(1);
      expect(state.coordinator.waitlistCount).toBe(1);
      expect(state.coordinator.headSequence).toBe(1);
      expect(state.coordinator.nextSequence).toBe(2);
      expect(state.members[E2E_USERS.studentB.uid]?.sequenceNumber).toBe(1);
      expect(state.members[E2E_USERS.studentB.uid]?.status).toBe("waiting");
      expect(state.slots[1]?.userId).toBe(E2E_USERS.studentB.uid);
      expect(state.slots[1]?.status).toBe("waiting");

      // 5. Student A cancels their confirmed RSVP through the UI, triggering automatic promotion of Student B
      await logout(page);
      await loginAs(page, E2E_USERS.studentA);
      await page.goto(`/events/${cappedEventId}`);
      await expect(rsvpButton).toContainText("Cancel RSVP");

      await rsvpButton.click();

      // Since the single seat is now reserved for offered candidate Student B, the event remains at 1/1 allocated
      await expect(rsvpButton).toContainText("Join Waitlist", { timeout: 15000 });
      await expect(page.locator("[data-testid='capacity-offered-count']")).toContainText(
        "(1 reserved)",
        { timeout: 15000 }
      );

      state = await getIsolatedCappedEventState(cappedEventId, [
        E2E_USERS.studentA.uid,
        E2E_USERS.studentB.uid,
      ]);
      expect(state.rsvps[E2E_USERS.studentA.uid]).toBeNull();
      expect(state.coordinator.confirmedCount).toBe(0);
      expect(state.coordinator.offeredCount).toBe(1);
      expect(state.coordinator.waitlistCount).toBe(0);
      expect(state.coordinator.headSequence).toBe(2);
      expect(state.members[E2E_USERS.studentB.uid]?.status).toBe("offered");
      expect(state.slots[1]?.status).toBe("offered");

      // 6. Student B returns to the event detail UI, sees the SeatClaimBanner offer state, and claims the seat
      await logout(page);
      await loginAs(page, E2E_USERS.studentB);
      await page.goto(`/events/${cappedEventId}`);

      const claimBanner = page.locator("[data-testid='seat-claim-banner']");
      await expect(claimBanner).toBeVisible();
      await expect(claimBanner).toContainText("A seat opened up for you!");
      await expect(page.locator("[data-testid='seat-claim-countdown']")).toBeVisible();
      await expect(rsvpButton).toContainText("Claim Seat");

      await page.locator("[data-testid='claim-seat-button']").click();

      // 7. Verify UI transitions to Going / Cancel RSVP, banner disappears without listener error, and persisted state is terminal
      await expect(claimBanner).not.toBeVisible({ timeout: 15000 });
      await expect(rsvpButton).toContainText("Cancel RSVP", { timeout: 15000 });
      await expect(
        page.locator("[data-testid='event-rsvp-card'] [data-testid='rsvp-status-badge']")
      ).toContainText("Going");
      await expect(page.locator("[data-testid='capacity-count-text']")).toHaveText(
        "1 / 1 seats filled"
      );

      state = await getIsolatedCappedEventState(cappedEventId, [
        E2E_USERS.studentA.uid,
        E2E_USERS.studentB.uid,
      ]);
      expect(state.rsvps[E2E_USERS.studentB.uid]).toBeTruthy();
      expect(state.members[E2E_USERS.studentB.uid]).toBeNull();
      expect(state.slots[1]?.status).toBe("claimed");
      expect(state.coordinator.confirmedCount).toBe(1);
      expect(state.coordinator.offeredCount).toBe(0);
      expect(state.coordinator.waitlistCount).toBe(0);
    } finally {
      await cleanupIsolatedCappedEvent(cappedEventId);
    }
  });
});
