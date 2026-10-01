import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs } from "./helpers/auth.js";
import {
  resetMessagingPairAB,
  resetMessagingPairBC,
  getConnectionId,
} from "./helpers/firestoreState.js";

// File-level mobile viewport override: representative 390x844 (below sm:640, md:768, lg:1024)
test.use({ viewport: { width: 390, height: 844 } });

test.describe("Milestone 17 — Unit 17.4: Mobile Responsive Interactions", () => {
  const convABId = getConnectionId(E2E_USERS.studentA.uid, E2E_USERS.studentB.uid);
  const convBCId = getConnectionId(E2E_USERS.studentB.uid, E2E_USERS.studentC.uid);

  test("M1: mobile hamburger drawer + Discover navigation", async ({ page }) => {
    // M1 tests mobile navigation without messaging state prerequisite
    await loginAs(page, E2E_USERS.studentA);

    // Verify hamburger button exists and is initially collapsed
    const menuBtn = page.getByRole("button", { name: "Toggle navigation menu" });
    await expect(menuBtn).toBeVisible();
    await expect(menuBtn).toHaveAttribute("aria-expanded", "false");

    // Open mobile navigation drawer
    await menuBtn.click();
    await expect(menuBtn).toHaveAttribute("aria-expanded", "true");

    const mobileNav = page.getByRole("navigation", { name: "Mobile Navigation" });
    await expect(mobileNav).toBeVisible();

    // Navigate to Discover via mobile drawer link
    const discoverLink = mobileNav.getByRole("link", { name: "Discover" });
    await expect(discoverLink).toBeVisible();
    await discoverLink.click();

    // Verify successful navigation and drawer closure
    await page.waitForURL("**/discover");
    await expect(page.getByRole("heading", { name: /discover students/i })).toBeVisible();
    await expect(mobileNav).not.toBeVisible();
    await expect(menuBtn).toHaveAttribute("aria-expanded", "false");
  });

  test("M2: mobile unread-message header shortcut", async ({ page }) => {
    await resetMessagingPairAB();

    await loginAs(page, E2E_USERS.studentA);

    // Locate direct mobile message shortcut in header
    const mobileMsgBadge = page.locator('header a[href="/messages"][aria-label*="unread messages"]');
    await expect(mobileMsgBadge).toBeVisible();
    await expect(mobileMsgBadge).toHaveAttribute("aria-label", "1 unread messages");

    // Click direct header shortcut
    await mobileMsgBadge.click();

    // Verify navigation directly to Messages
    await page.waitForURL("**/messages");
    await expect(page.getByRole("heading", { name: "Messages", level: 2 })).toBeVisible();
    await expect(page.locator(`a[href*="/messages/${convABId}"]`)).toBeVisible();
  });

  test("M3: mobile conversation-list → thread transition", async ({ page }) => {
    await resetMessagingPairAB();

    await loginAs(page, E2E_USERS.studentA);
    await page.goto("/messages");

    // On mobile /messages, conversation list is full width and thread pane is hidden
    const convRow = page.locator(`a[href*="/messages/${convABId}"]`);
    await expect(convRow).toBeVisible();

    const backBtn = page.locator('button[aria-label="Back to conversations list"]');
    await expect(backBtn).not.toBeVisible();

    // Click conversation item
    await convRow.click();

    // Verify transition: URL updates, thread loads, list hides, mobile back button becomes visible
    await page.waitForURL(`**/messages/${convABId}`);
    await expect(page.getByRole("heading", { name: E2E_USERS.studentB.displayName })).toBeVisible();
    await expect(page.getByText("Connected")).toBeVisible();
    await expect(backBtn).toBeVisible();

    // Conversation list header is hidden in mobile single-pane thread view
    await expect(page.getByRole("heading", { name: "Messages", level: 2 })).not.toBeVisible();
  });

  test("M4: mobile thread → conversation-list back navigation", async ({ page }) => {
    await resetMessagingPairAB();

    await loginAs(page, E2E_USERS.studentA);

    // Open active thread
    await page.goto(`/messages/${convABId}`);
    await page.waitForURL(`**/messages/${convABId}`);
    await expect(page.getByRole("heading", { name: E2E_USERS.studentB.displayName })).toBeVisible();

    const backBtn = page.locator('button[aria-label="Back to conversations list"]');
    await expect(backBtn).toBeVisible();

    // Click mobile back button
    await backBtn.click();

    // Verify return navigation back to conversation list
    await page.waitForURL("**/messages");
    await expect(page.getByRole("heading", { name: "Messages", level: 2 })).toBeVisible();
    await expect(page.locator(`a[href*="/messages/${convABId}"]`)).toBeVisible();
    await expect(backBtn).not.toBeVisible();
  });

  test("M5: mobile disconnected conversation + back navigation + explicit verification that Casey's conversation remains visible in /messages", async ({ page }) => {
    await resetMessagingPairBC();

    await loginAs(page, E2E_USERS.studentB);

    // 1. Remove connection with Student C
    await page.goto("/connections");
    await page.locator("#tab-connections").click();

    const removeBtn = page.locator(`#btn-remove-${E2E_USERS.studentC.uid}`);
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    const confirmRemoveBtn = page.locator(`#btn-confirm-remove-${E2E_USERS.studentC.uid}`);
    await expect(confirmRemoveBtn).toBeVisible();
    await confirmRemoveBtn.click();

    await expect(page.locator(`#btn-remove-${E2E_USERS.studentC.uid}`)).not.toBeVisible();

    // 2. Navigate to /messages on mobile
    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: "Messages", level: 2 })).toBeVisible();

    const caseyRow = page.locator(`a[href*="/messages/${convBCId}"]`);
    await expect(caseyRow).toBeVisible();
    await caseyRow.click();

    // 3. Verify disconnected thread state on mobile
    await page.waitForURL(`**/messages/${convBCId}`);
    await expect(page.getByRole("heading", { name: E2E_USERS.studentC.displayName })).toBeVisible();
    await expect(page.getByText("Disconnected")).toBeVisible();

    const alertBanner = page.locator('[role="alert"]').filter({ hasText: "Connection Inactive" });
    await expect(alertBanner).toBeVisible();
    await expect(page.locator('textarea[aria-label="Write a message"]')).toBeDisabled();

    // 4. Click mobile back button
    const backBtn = page.locator('button[aria-label="Back to conversations list"]');
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // 5. Verify return to /messages and explicitly assert Casey's conversation remains preserved
    await page.waitForURL("**/messages");
    await expect(page.getByRole("heading", { name: "Messages", level: 2 })).toBeVisible();
    await expect(caseyRow).toBeVisible();
    await expect(caseyRow.getByText(E2E_USERS.studentC.displayName)).toBeVisible();
    await expect(caseyRow.getByText("Hi Casey, glad we are connected!")).toBeVisible();
  });
});
