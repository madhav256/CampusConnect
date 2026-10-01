import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs } from "./helpers/auth.js";
import {
  resetCleanPair,
  resetMessagingPairAB,
} from "./helpers/firestoreState.js";

test.describe("Connections & Relationships Regression (Unit 17.3)", () => {
  test.beforeEach(async () => {
    // Ensure clean state between A and C before each test in this suite
    await resetCleanPair(E2E_USERS.studentA.uid, E2E_USERS.studentC.uid);
  });

  test("A1: Send connection request from student profile", async ({ page }) => {
    await loginAs(page, E2E_USERS.studentA);

    await page.goto(`/users/${E2E_USERS.studentC.uid}`);
    await expect(page.getByRole("heading", { name: E2E_USERS.studentC.displayName })).toBeVisible();

    const connectBtn = page.locator("#btn-connect");
    await expect(connectBtn).toBeVisible();
    await expect(connectBtn).toHaveText("Connect");

    await connectBtn.click();

    // Verify transition to pending request state
    await expect(page.getByText("Request Sent")).toBeVisible();
    await expect(page.locator("#btn-cancel-request")).toBeVisible();
    await expect(connectBtn).not.toBeVisible();
  });

  test("A2: View pending outgoing request in Connections page", async ({ page }) => {
    await loginAs(page, E2E_USERS.studentA);

    // Send request to Student C first
    await page.goto(`/users/${E2E_USERS.studentC.uid}`);
    await page.locator("#btn-connect").click();
    await expect(page.getByText("Request Sent")).toBeVisible();

    // Navigate to Connections page
    await page.goto("/connections");
    await expect(page.getByRole("heading", { name: "Connections", exact: true })).toBeVisible();

    // Switch to Requests tab
    await page.locator("#tab-requests").click();

    // Outgoing request to Casey Morgan should be listed
    await expect(page.getByRole("heading", { name: /sent \(1\)/i })).toBeVisible();
    await expect(page.getByText(E2E_USERS.studentC.displayName)).toBeVisible();
    await expect(page.locator(`#btn-cancel-${E2E_USERS.studentC.uid}`)).toBeVisible();
  });

  test("A3: Cancel pending outgoing request from Connections page", async ({ page }) => {
    await loginAs(page, E2E_USERS.studentA);

    // Send request to Student C first
    await page.goto(`/users/${E2E_USERS.studentC.uid}`);
    await page.locator("#btn-connect").click();
    await expect(page.getByText("Request Sent")).toBeVisible();

    // Navigate to Connections page
    await page.goto("/connections");
    await page.locator("#tab-requests").click();

    const cancelBtn = page.locator(`#btn-cancel-${E2E_USERS.studentC.uid}`);
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    const confirmCancelBtn = page.locator(`#btn-confirm-cancel-${E2E_USERS.studentC.uid}`);
    await expect(confirmCancelBtn).toBeVisible();
    await confirmCancelBtn.click();

    // Should now show empty sent requests state
    await expect(page.getByText("No sent requests")).toBeVisible();
    await expect(page.getByRole("heading", { name: /sent \(0\)/i })).toBeVisible();
  });

  test("A4: View accepted connection and message link", async ({ page }) => {
    // Restore deterministic A-B accepted connection
    await resetMessagingPairAB();

    await loginAs(page, E2E_USERS.studentA);

    // Verify in Connections page
    await page.goto("/connections");
    await page.locator("#tab-connections").click();

    await expect(page.getByText(E2E_USERS.studentB.displayName)).toBeVisible();
    const messageLink = page.locator(`#btn-message-${E2E_USERS.studentB.uid}`);
    await expect(messageLink).toBeVisible();
    await expect(messageLink).toHaveAttribute(
      "href",
      `/messages/${E2E_USERS.studentA.uid}_${E2E_USERS.studentB.uid}`
    );

    // Verify on Jordan Taylor's public profile
    await page.goto(`/users/${E2E_USERS.studentB.uid}`);
    await expect(page.getByText("Connected")).toBeVisible();
    const profileMessageBtn = page.locator("#btn-message-student");
    await expect(profileMessageBtn).toBeVisible();
    await expect(profileMessageBtn).toHaveAttribute(
      "href",
      `/messages/${E2E_USERS.studentA.uid}_${E2E_USERS.studentB.uid}`
    );
  });
});
