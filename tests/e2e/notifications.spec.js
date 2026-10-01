import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs } from "./helpers/auth.js";
import {
  resetCleanPair,
  createPendingRequest,
} from "./helpers/firestoreState.js";

test.describe("Notifications Regression (Unit 17.3)", () => {
  test.beforeEach(async () => {
    // Reset clean state between A and C before each test
    await resetCleanPair(E2E_USERS.studentA.uid, E2E_USERS.studentC.uid);
  });

  test("B1: Recipient receives notification badge and request item", async ({ page }) => {
    // Seed pending connection request from Student A to Student C
    await createPendingRequest(E2E_USERS.studentA, E2E_USERS.studentC);

    await loginAs(page, E2E_USERS.studentC);

    // Verify unread badge in Navbar
    const notifBadge = page
      .locator('header nav[aria-label="Main Navigation"]')
      .getByLabel(/unread notifications/i);
    await expect(notifBadge).toBeVisible();
    await expect(notifBadge).toHaveText("1");

    // Navigate to Notifications page
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();

    // Verify incoming connection request notification item
    await expect(page.getByText(E2E_USERS.studentA.displayName)).toBeVisible();
    await expect(page.getByText("sent you a connection request.")).toBeVisible();

    const acceptBtn = page.locator("#notif-btn-accept-req_e2e-student-a_e2e-student-c");
    const declineBtn = page.locator("#notif-btn-decline-req_e2e-student-a_e2e-student-c");
    await expect(acceptBtn).toBeVisible();
    await expect(declineBtn).toBeVisible();
  });

  test("B2: Filter by Unread and mark notification as read", async ({ page }) => {
    await createPendingRequest(E2E_USERS.studentA, E2E_USERS.studentC);

    await loginAs(page, E2E_USERS.studentC);
    await page.goto("/notifications");

    // Filter by Unread tab
    const unreadTab = page.getByRole("button", { name: /unread/i });
    await expect(unreadTab).toBeVisible();
    await unreadTab.click();

    await expect(page.getByText("sent you a connection request.")).toBeVisible();

    // Click "Mark as read"
    const markReadBtn = page.getByRole("button", { name: "Mark as read" });
    await expect(markReadBtn).toBeVisible();
    await markReadBtn.click();

    // In Unread view, it should transition to empty state
    await expect(page.getByText("You're all caught up!")).toBeVisible();

    // Navbar badge should clear
    const notifBadge = page
      .locator('header nav[aria-label="Main Navigation"]')
      .getByLabel(/unread notifications/i);
    await expect(notifBadge).not.toBeVisible();
  });

  test("B3: Accept connection request from Notifications page", async ({ page }) => {
    await createPendingRequest(E2E_USERS.studentA, E2E_USERS.studentC);

    await loginAs(page, E2E_USERS.studentC);
    await page.goto("/notifications");

    const acceptBtn = page.locator("#notif-btn-accept-req_e2e-student-a_e2e-student-c");
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // Verify accepting removes the inline action or notification
    await expect(acceptBtn).not.toBeVisible();

    // Navigate to Connections and verify Student A is now an accepted connection
    await page.goto("/connections");
    await page.locator("#tab-connections").click();

    await expect(page.getByText(E2E_USERS.studentA.displayName)).toBeVisible();
    await expect(page.locator(`#btn-message-${E2E_USERS.studentA.uid}`)).toBeVisible();
  });
});
