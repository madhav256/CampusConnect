/**
 * Milestone 20 — Unit 20.6: Event System Playwright E2E Regression Suite
 *
 * Validates the complete Event domain lifecycle across:
 * 1. Event Discovery (/events, headers, cards, metadata)
 * 2. Category Filtering (filtering to category pill, resetting)
 * 3. Temporal State (Upcoming vs. Past switching based on startAt/endAt)
 * 4. Event Detail Page (/events/:eventId, metadata, sponsoring community link navigation)
 * 5. Community Events Tab (/communities/:communityId -> Events tab, cards, switcher)
 * 6. Multi-Tenant Isolation (Apex student cannot see or read St. Jude events)
 * 7. Community-Only Visibility (Active member sees restricted event; non-member is denied)
 * 8. Event Creation Journey (Authorized leader creates event via EventComposerModal, navigates to detail)
 * 9. Form Validation (endAt < startAt rejection, required field enforcement)
 * 10. Unauthorized Creation Guard (Non-leader student cannot create events)
 * 11. Strict Event Resolution Regression (Inaccessible or missing events never fall back to fixture data)
 */

import process from "node:process";
import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs, logout } from "./helpers/auth.js";
import { db } from "./helpers/firestoreState.js";

// Helper to remove any test-created event documents to preserve deterministic test isolation
async function cleanupTestEvents() {
  try {
    const snapshot = await db.collection("events").get();
    const batch = db.batch();
    let deleteCount = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (
        data.title?.startsWith("E2E Automated Test") ||
        doc.id.startsWith("e2e-created-")
      ) {
        batch.delete(doc.ref);
        deleteCount++;
      }
    }
    if (deleteCount > 0) {
      await batch.commit();
    }
  } catch (err) {
    console.warn("[cleanupTestEvents] Non-fatal cleanup warning:", err.message);
  }
}

// Helper to format dynamic ISO datetime-local input strings relative to test reference time
function getFutureDateTimeStrings(daysFromNow = 10) {
  const base = process.env.E2E_SEED_NOW ? new Date(process.env.E2E_SEED_NOW) : new Date();
  const start = new Date(base.getTime() + daysFromNow * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const pad = (n) => String(n).padStart(2, "0");
  const formatInput = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return {
    startStr: formatInput(start),
    endStr: formatInput(end),
  };
}

function getInvertedDateTimeStrings(daysFromNow = 10) {
  const base = process.env.E2E_SEED_NOW ? new Date(process.env.E2E_SEED_NOW) : new Date();
  const start = new Date(base.getTime() + daysFromNow * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() - 2 * 60 * 60 * 1000);

  const pad = (n) => String(n).padStart(2, "0");
  const formatInput = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return {
    startStr: formatInput(start),
    endStr: formatInput(end),
  };
}

test.describe("Milestone 20 — Unit 20.6: Campus Events E2E Suite", () => {
  test.beforeEach(async ({ page }) => {
    // If seed reference time is overridden via E2E_SEED_NOW, synchronize browser clock deterministically
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
    await cleanupTestEvents();
  });

  test.afterAll(async () => {
    await cleanupTestEvents();
  });

  test("1. Event Discovery: authenticated student discovers campus events with full metadata", async ({
    page,
  }) => {
    // 1. Authenticate as Apex student A
    await loginAs(page, E2E_USERS.studentA);

    // 2. Navigate to /events discovery
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Discover Campus Events" })).toBeVisible();

    // 3. Verify campus identity badge
    const campusBadge = page.locator("[data-testid='events-campus-badge']");
    await expect(campusBadge).toBeVisible();
    await expect(campusBadge).toContainText("Apex Tech");

    // 4. Verify deterministic seeded event cards are rendered in Upcoming tab
    const hackathonCard = page.locator("[data-testid='event-card-e2e-event-ai-hackathon']");
    const sprintCard = page.locator("[data-testid='event-card-e2e-event-design-sprint']");
    const festCard = page.locator("[data-testid='event-card-e2e-event-campus-fest']");
    const ongoingCard = page.locator("[data-testid='event-card-e2e-event-ongoing-workshop']");
    const cancelledCard = page.locator("[data-testid='event-card-e2e-event-cancelled-lecture']");

    await expect(hackathonCard).toBeVisible();
    await expect(sprintCard).toBeVisible();
    await expect(festCard).toBeVisible();
    await expect(ongoingCard).toBeVisible();
    await expect(cancelledCard).toBeVisible();

    // 5. Inspect card metadata on hackathon card
    await expect(hackathonCard.locator("[data-testid='event-card-title']")).toContainText(
      "Apex Annual AI & Robotics Hackathon 2026"
    );
    await expect(hackathonCard.locator("[data-testid='event-card-organizer']")).toContainText(
      "Apex AI & Robotics Society"
    );
    await expect(hackathonCard.locator("[data-testid='event-category-badge']")).toContainText(
      "Tech"
    );
    await expect(hackathonCard.locator("[data-testid='event-card-location']")).toContainText(
      "Turing Auditorium"
    );
    await expect(hackathonCard.locator("[data-testid='event-card-date']")).toBeVisible();

    // Verify temporal status badge on ongoing card
    await expect(ongoingCard.locator("[data-testid='event-status-badge']")).toContainText(
      "Ongoing"
    );

    // Verify cancelled status badge on cancelled card
    await expect(cancelledCard.locator("[data-testid='event-status-badge']")).toContainText(
      "Cancelled"
    );

    // 6. Verify count label displays total public events in upcoming view (7 events: 5 uncapped + 2 capped)
    const countLabel = page.locator("[data-testid='events-count-label']");
    await expect(countLabel).toBeVisible();
    await expect(countLabel).toContainText("7 events");
  });

  test("2. Category Filtering: filters events by category and resets back to all", async ({
    page,
  }) => {
    await loginAs(page, E2E_USERS.studentA);
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Discover Campus Events" })).toBeVisible();

    // Initially Apex public events are present
    const hackathonCard = page.locator("[data-testid='event-card-e2e-event-ai-hackathon']");
    const sprintCard = page.locator("[data-testid='event-card-e2e-event-design-sprint']");
    const festCard = page.locator("[data-testid='event-card-e2e-event-campus-fest']");

    await expect(hackathonCard).toBeVisible();
    await expect(sprintCard).toBeVisible();
    await expect(festCard).toBeVisible();

    // Filter to Tech category
    const techPill = page.locator("[data-testid='category-pill-tech']");
    await expect(techPill).toBeVisible();
    await techPill.click();

    // Verify Tech events appear, Cultural event does not
    await expect(hackathonCard).toBeVisible();
    await expect(festCard).toBeVisible();
    await expect(sprintCard).not.toBeVisible();

    // Reset filters via All Categories pill
    const allPill = page.locator("[data-testid='category-pill-all']");
    await allPill.click();

    // Verify all events are restored
    await expect(hackathonCard).toBeVisible();
    await expect(sprintCard).toBeVisible();
    await expect(festCard).toBeVisible();
  });

  test("3. Upcoming / Past Tabs: switches temporal scope correctly", async ({
    page,
  }) => {
    await loginAs(page, E2E_USERS.studentA);
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Discover Campus Events" })).toBeVisible();

    // Upcoming tab is active by default
    const upcomingTab = page.locator("[data-testid='time-tab-upcoming']");
    const pastTab = page.locator("[data-testid='time-tab-past']");

    await expect(upcomingTab).toHaveAttribute("aria-selected", "true");
    const hackathonCard = page.locator("[data-testid='event-card-e2e-event-ai-hackathon']");
    const pastCard = page.locator("[data-testid='event-card-e2e-event-past-orientation']");

    await expect(hackathonCard).toBeVisible();
    await expect(pastCard).not.toBeVisible();

    // Switch to Past Events
    await pastTab.click();
    await expect(pastTab).toHaveAttribute("aria-selected", "true");

    // Upcoming event is not visible in Past tab; completed event is visible with Completed badge
    await expect(hackathonCard).not.toBeVisible();
    await expect(pastCard).toBeVisible();
    await expect(pastCard.locator("[data-testid='event-card-title']")).toContainText(
      "Apex AI Society Fall Orientation & Welcome Mixer"
    );
    await expect(pastCard.locator("[data-testid='event-status-badge']")).toContainText(
      "Completed"
    );

    // Switch back to Upcoming
    await upcomingTab.click();
    await expect(hackathonCard).toBeVisible();
    await expect(pastCard).not.toBeVisible();
  });

  test("4. Event Detail: navigates to /events/:eventId and verifies metadata and sponsoring community navigation", async ({
    page,
  }) => {
    await loginAs(page, E2E_USERS.studentA);
    await page.goto("/events");

    // Click on the Hackathon card to navigate to detail
    const hackathonCard = page.locator("[data-testid='event-card-e2e-event-ai-hackathon']");
    await hackathonCard.click();

    // Verify URL navigation
    await page.waitForURL("**/events/e2e-event-ai-hackathon");

    // Verify Event Detail Header & Title
    await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
      "Apex Annual AI & Robotics Hackathon 2026"
    );
    await expect(page.locator("[data-testid='event-detail-organizer']")).toContainText(
      "Apex AI & Robotics Society"
    );
    await expect(page.locator("[data-testid='event-category-badge']")).toContainText("Tech");
    await expect(page.locator("[data-testid='event-status-badge']")).toContainText("Upcoming");

    // Verify Description Card
    const descCard = page.locator("[data-testid='event-detail-description']");
    await expect(descCard).toBeVisible();
    await expect(descCard).toContainText("24-hour sprint building autonomous agents");

    // Verify Sidebar Metadata
    await expect(page.locator("[data-testid='event-detail-date']")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-time']")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-location']")).toContainText(
      "Turing Auditorium & Robotics Lab, Tech Block"
    );
    await expect(page.locator("[data-testid='event-detail-visibility']")).toHaveText(
      "Campus Public"
    );

    // Verify Sponsoring Community Card & Link Navigation
    const commCard = page.locator("[data-testid='event-sponsoring-community-card']");
    await expect(commCard).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-community-name']")).toContainText(
      "Apex AI & Robotics Society"
    );

    const commLink = page.locator("[data-testid='event-community-link']");
    await expect(commLink).toBeVisible();
    await commLink.click();

    // Lands on sponsoring community page
    await page.waitForURL("**/communities/apex-ai-club");
    await expect(page.locator("[data-testid='community-hero-name']")).toContainText(
      "Apex AI & Robotics Society"
    );
  });

  test("5. Community Events Tab: displays community events and supports card navigation", async ({
    page,
  }) => {
    await loginAs(page, E2E_USERS.studentA);
    await page.goto("/communities/apex-ai-club");
    await expect(page.locator("[data-testid='community-hero-name']")).toContainText(
      "Apex AI & Robotics Society"
    );

    // Verify Events tab is present
    const eventsTab = page.locator("[data-testid='community-tab-events']");
    await expect(eventsTab).toBeVisible();

    // Switch from Discussion to Events tab
    await eventsTab.click();
    await expect(eventsTab).toHaveClass(/border-terracotta-600/);

    // Verify Community Events section is visible
    const eventsSection = page.locator("[data-testid='community-events-section']");
    await expect(eventsSection).toBeVisible();

    // Verify community events are rendered
    const hackathonCard = page.locator("[data-testid='event-card-e2e-event-ai-hackathon']");
    const festCard = page.locator("[data-testid='event-card-e2e-event-campus-fest']");
    await expect(hackathonCard).toBeVisible();
    await expect(festCard).toBeVisible();

    // Verify Design Sprint (from different community) is NOT in this community's events
    await expect(page.locator("[data-testid='event-card-e2e-event-design-sprint']")).not.toBeVisible();

    // Click event card to navigate to detail
    await hackathonCard.click();
    await page.waitForURL("**/events/e2e-event-ai-hackathon");
    await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
      "Apex Annual AI & Robotics Hackathon 2026"
    );
  });

  test("6. Multi-Tenant Isolation: Apex student cannot see or read St. Jude events", async ({
    page,
  }) => {
    // 1. Authenticate as Apex student A
    await loginAs(page, E2E_USERS.studentA);
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Discover Campus Events" })).toBeVisible();

    // 2. Verify Apex events are visible, St. Jude symposium is NOT visible in discovery
    await expect(page.locator("[data-testid='event-card-e2e-event-ai-hackathon']")).toBeVisible();
    await expect(page.locator("[data-testid='event-card-e2e-event-st-jude-symposium']")).not.toBeVisible();
    await expect(page.getByText("St. Jude Clinical Research & Medical Ethics Symposium")).not.toBeVisible();

    // 3. Attempt direct cross-tenant navigation to St. Jude event detail
    await page.goto("/events/e2e-event-st-jude-symposium");

    // 4. Verify Firestore security rules reject the read -> Error state is shown
    await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
    await expect(page.getByText("Unable to Load Event")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-title']")).not.toBeVisible();

    // Verify Retry action re-queries Firestore strictly and never falls back to fixture
    const retryBtn = page.getByRole("button", { name: "Retry" });
    await retryBtn.click();
    await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-title']")).not.toBeVisible();
    await expect(
      page.getByText("St. Jude Clinical Research & Medical Ethics Symposium")
    ).not.toBeVisible();

    // 5. Sign out and log in as St. Jude student
    await logout(page);
    await loginAs(page, E2E_USERS.studentStJude);
    await page.goto("/events");

    // 6. Verify St. Jude student sees St. Jude event and NOT Apex events
    await expect(page.locator("[data-testid='event-card-e2e-event-st-jude-symposium']")).toBeVisible();
    await expect(page.locator("[data-testid='event-card-e2e-event-ai-hackathon']")).not.toBeVisible();

    // 7. St. Jude student can read their own event detail
    await page.locator("[data-testid='event-card-e2e-event-st-jude-symposium']").click();
    await page.waitForURL("**/events/e2e-event-st-jude-symposium");
    await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
      "St. Jude Clinical Research & Medical Ethics Symposium"
    );
  });

  test("7. Community-Only Visibility: Active member can access community-only event; non-member is strictly denied", async ({
    page,
  }) => {
    // 1. Log in as studentB (active member of Apex AI club)
    await loginAs(page, E2E_USERS.studentB);

    // 2. Open /communities/apex-ai-club -> Events tab
    await page.goto("/communities/apex-ai-club");
    await page.locator("[data-testid='community-tab-events']").click();

    // 3. Verify community_only event is visible to active member
    const membersOnlyCard = page.locator("[data-testid='event-card-e2e-event-ai-members-only']");
    await expect(membersOnlyCard).toBeVisible();

    // 4. Member clicks through to event detail
    await membersOnlyCard.click();
    await page.waitForURL("**/events/e2e-event-ai-members-only");
    await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(
      "Apex AI Lab Internal Planning & Hardware Sync"
    );
    await expect(page.locator("[data-testid='event-detail-visibility']")).toHaveText(
      "Community Only"
    );

    // 5. Sign out and log in as studentC (student at Apex, but NOT a member of apex-ai-club)
    await logout(page);
    await loginAs(page, E2E_USERS.studentC);

    // 6. Navigate to /communities/apex-ai-club -> Events tab
    await page.goto("/communities/apex-ai-club");
    await page.locator("[data-testid='community-tab-events']").click();

    // 7. Verify public events are visible, but community_only event is NOT visible
    await expect(page.locator("[data-testid='event-card-e2e-event-ai-hackathon']")).toBeVisible();
    await expect(page.locator("[data-testid='event-card-e2e-event-ai-members-only']")).not.toBeVisible();

    // 8. Non-member attempts direct navigation to /events/e2e-event-ai-members-only
    await page.goto("/events/e2e-event-ai-members-only");

    // 9. Verify Firestore security rules reject read -> error state rendered
    await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
    await expect(page.getByText("Unable to Load Event")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-title']")).not.toBeVisible();

    // Verify Retry action on community-denied event does not fall back to fixture
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-title']")).not.toBeVisible();
    await expect(
      page.getByText("Apex AI Lab Internal Planning & Hardware Sync")
    ).not.toBeVisible();
  });

  test("8. Event Creation Journey: eligible leader creates an event and verifies detail rendering", async ({
    page,
  }) => {
    // 1. Log in as studentA (admin of apex-ai-club)
    await loginAs(page, E2E_USERS.studentA);
    await page.goto("/events");

    // 2. Verify Create Event action is enabled
    const createBtn = page.locator("[data-testid='create-event-btn']");
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // 3. Verify modal opens
    const modal = page.locator("[data-testid='event-composer-modal']");
    await expect(modal).toBeVisible();

    // 4. Fill in event creation details
    const uniqueTitle = `E2E Automated Test Robotics Meetup ${Date.now()}`;
    await page.locator("[data-testid='composer-title-input']").fill(uniqueTitle);

    // Select category: workshop
    await page.locator("[data-testid='composer-category-select']").selectOption("workshop");

    // Fill location
    await page.locator("[data-testid='composer-location-input']").fill("Room 101, Science Building");

    // Fill start and end times (future dates generated dynamically relative to test reference time)
    const { startStr, endStr } = getFutureDateTimeStrings(10);
    await page.locator("[data-testid='composer-start-at-input']").fill(startStr);
    await page.locator("[data-testid='composer-end-at-input']").fill(endStr);

    // Fill description
    await page
      .locator("[data-testid='composer-description-input']")
      .fill("Hands-on robotics hardware workshop covering ROS 2 setup and sensor calibration.");

    // 5. Submit form
    await page.locator("[data-testid='composer-submit-btn']").click();

    // 6. Verify navigation to the new event detail page
    await page.waitForURL("**/events/**");
    await expect(page.locator("[data-testid='event-detail-title']")).toHaveText(uniqueTitle);
    await expect(page.locator("[data-testid='event-category-badge']")).toContainText("Workshop");
    await expect(page.locator("[data-testid='event-detail-location']")).toContainText(
      "Room 101, Science Building"
    );
    await expect(page.locator("[data-testid='event-detail-visibility']")).toHaveText(
      "Campus Public"
    );
    await expect(page.locator("[data-testid='event-detail-description']")).toContainText(
      "Hands-on robotics hardware workshop covering ROS 2 setup"
    );
  });

  test("9. Form Validation: endAt < startAt prevents submission and displays error", async ({
    page,
  }) => {
    await loginAs(page, E2E_USERS.studentA);
    await page.goto("/events");

    // Open composer
    await page.locator("[data-testid='create-event-btn']").click();
    await expect(page.locator("[data-testid='event-composer-modal']")).toBeVisible();

    // Attempt 1: Submit with endAt before startAt (generated dynamically)
    const { startStr: invStart, endStr: invEnd } = getInvertedDateTimeStrings(10);
    await page.locator("[data-testid='composer-title-input']").fill("Validation Test Event");
    await page.locator("[data-testid='composer-location-input']").fill("Lab 3");
    await page.locator("[data-testid='composer-start-at-input']").fill(invStart);
    await page.locator("[data-testid='composer-end-at-input']").fill(invEnd); // 2 hours earlier

    await page.locator("[data-testid='composer-submit-btn']").click();

    // Verify validation error message appears
    await expect(
      page.getByText("End time must be after or equal to start time.")
    ).toBeVisible();

    // Attempt 2: Clear title and verify required validation
    await page.locator("[data-testid='composer-title-input']").fill("");
    await page.locator("[data-testid='composer-submit-btn']").click();

    await expect(page.getByText("Event title is required.")).toBeVisible();

    // Modal remains open and did not navigate
    await expect(page.locator("[data-testid='event-composer-modal']")).toBeVisible();

    // Close modal
    await page.locator("[data-testid='composer-close-btn']").click();
    await expect(page.locator("[data-testid='event-composer-modal']")).not.toBeVisible();
  });

  test("10. Unauthorized Creation Guard: regular student without leadership role has creation disabled", async ({
    page,
  }) => {
    // Log in as studentC (non-leader, regular student with no community mod/admin roles)
    await loginAs(page, E2E_USERS.studentC);
    await page.goto("/events");

    // Verify the create event button is disabled / placeholder
    const placeholderBtn = page.locator("[data-testid='create-event-placeholder-btn']");
    await expect(placeholderBtn).toBeVisible();
    await expect(placeholderBtn).toBeDisabled();

    // The active create button is not present
    await expect(page.locator("[data-testid='create-event-btn']")).not.toBeVisible();

    // Modal cannot be opened
    await expect(page.locator("[data-testid='event-composer-modal']")).not.toBeVisible();
  });

  test("11. Strict Event Resolution Regression: denied or inaccessible events never fall back to local fixture data", async ({
    page,
  }) => {
    // 1. Authenticate as Apex student A
    await loginAs(page, E2E_USERS.studentA);

    // 2. Direct navigation to cross-tenant event that exists in fixture definitions (e2e-event-st-jude-symposium)
    await page.goto("/events/e2e-event-st-jude-symposium");

    // 3. Verify error state rendered and fixture title is strictly absent
    await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
    await expect(page.getByText("Unable to Load Event")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-title']")).not.toBeVisible();
    await expect(
      page.getByText("St. Jude Clinical Research & Medical Ethics Symposium")
    ).not.toBeVisible();

    // 4. Click Retry: verify Firestore error is re-thrown and no fixture data appears
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-title']")).not.toBeVisible();
    await expect(
      page.getByText("St. Jude Clinical Research & Medical Ethics Symposium")
    ).not.toBeVisible();

    // 5. Authenticate as studentC (non-member of apex-ai-club)
    await logout(page);
    await loginAs(page, E2E_USERS.studentC);

    // 6. Navigate to community_only event that exists in fixture definitions (e2e-event-ai-members-only)
    await page.goto("/events/e2e-event-ai-members-only");

    // 7. Verify denied error state rendered and members-only fixture title is strictly absent
    await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
    await expect(page.getByText("Unable to Load Event")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-title']")).not.toBeVisible();
    await expect(
      page.getByText("Apex AI Lab Internal Planning & Hardware Sync")
    ).not.toBeVisible();

    // 8. Click Retry: verify Firestore error is re-thrown and fixture remains strictly inaccessible
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator("[data-testid='event-detail-error']")).toBeVisible();
    await expect(page.locator("[data-testid='event-detail-title']")).not.toBeVisible();
    await expect(
      page.getByText("Apex AI Lab Internal Planning & Hardware Sync")
    ).not.toBeVisible();
  });
});
