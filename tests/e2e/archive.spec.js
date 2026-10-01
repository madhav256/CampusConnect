import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs } from "./helpers/auth.js";
import {
  resetMessagingPairBC,
  getConnectionId,
} from "./helpers/firestoreState.js";

test.describe("Milestone 17 — Unit 17.4: Disconnected Conversation Preservation", () => {
  const convBCId = getConnectionId(E2E_USERS.studentB.uid, E2E_USERS.studentC.uid);

  test("D1: disconnected conversation remains visible in /messages", async ({ page }) => {
    await resetMessagingPairBC();

    await loginAs(page, E2E_USERS.studentB);

    // Remove accepted connection with Student C
    await page.goto("/connections");
    await page.locator("#tab-connections").click();

    const removeBtn = page.locator(`#btn-remove-${E2E_USERS.studentC.uid}`);
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    const confirmRemoveBtn = page.locator(`#btn-confirm-remove-${E2E_USERS.studentC.uid}`);
    await expect(confirmRemoveBtn).toBeVisible();
    await confirmRemoveBtn.click();

    await expect(page.locator(`#btn-remove-${E2E_USERS.studentC.uid}`)).not.toBeVisible();

    // Navigate to /messages (main conversation list view)
    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: "Messages", level: 2 })).toBeVisible();

    // Verify conversation row for Casey Morgan remains visible and preserved in list
    const convRow = page.locator(`a[href*="/messages/${convBCId}"]`);
    await expect(convRow).toBeVisible();
    await expect(convRow.getByText(E2E_USERS.studentC.displayName)).toBeVisible();
    await expect(convRow.getByText("Hi Casey, glad we are connected!")).toBeVisible();
  });

  test("D2: disconnected conversation can be opened from the list and renders the preserved read-only thread state", async ({ page }) => {
    await resetMessagingPairBC();

    await loginAs(page, E2E_USERS.studentB);

    // Remove accepted connection with Student C
    await page.goto("/connections");
    await page.locator("#tab-connections").click();

    const removeBtn = page.locator(`#btn-remove-${E2E_USERS.studentC.uid}`);
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    const confirmRemoveBtn = page.locator(`#btn-confirm-remove-${E2E_USERS.studentC.uid}`);
    await expect(confirmRemoveBtn).toBeVisible();
    await confirmRemoveBtn.click();

    await expect(page.locator(`#btn-remove-${E2E_USERS.studentC.uid}`)).not.toBeVisible();

    // Navigate to /messages and open Casey Morgan's conversation from the list
    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: "Messages", level: 2 })).toBeVisible();

    const convRow = page.locator(`a[href*="/messages/${convBCId}"]`);
    await expect(convRow).toBeVisible();
    await convRow.click();

    // Verify active thread loads preserved read-only state
    await page.waitForURL(`**/messages/${convBCId}`);
    await expect(page.getByRole("heading", { name: E2E_USERS.studentC.displayName })).toBeVisible();
    await expect(page.getByText("Disconnected")).toBeVisible();

    // Verify Connection Inactive banner
    const alertBanner = page.locator('[role="alert"]').filter({ hasText: "Connection Inactive" });
    await expect(alertBanner).toBeVisible();
    await expect(
      page.getByText("Past messages are preserved, but new messages cannot be sent.")
    ).toBeVisible();

    // Verify message composer is completely disabled
    const composerTextarea = page.locator('textarea[aria-label="Write a message"]');
    await expect(composerTextarea).toBeDisabled();
    await expect(composerTextarea).toHaveAttribute(
      "placeholder",
      "Messaging is disabled for disconnected users."
    );
    await expect(page.locator("#btn-send-message")).toBeDisabled();

    // Verify past message history is preserved
    await expect(page.getByText("Hi Casey, glad we are connected!", { exact: true })).toBeVisible();
  });
});
