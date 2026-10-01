import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs } from "./helpers/auth.js";
import {
  resetMessagingPairAB,
  resetMessagingPairBC,
  getConnectionId,
} from "./helpers/firestoreState.js";

test.describe("Messaging Regression (Unit 17.3)", () => {
  const convABId = getConnectionId(E2E_USERS.studentA.uid, E2E_USERS.studentB.uid);
  const convBCId = getConnectionId(E2E_USERS.studentB.uid, E2E_USERS.studentC.uid);

  test("C1: Seeded unread message displays badge in Navbar and ConversationList", async ({ page }) => {
    await resetMessagingPairAB();

    await loginAs(page, E2E_USERS.studentA);

    // Verify unread messages badge in Navbar
    const msgBadge = page
      .locator('header nav[aria-label="Main Navigation"]')
      .getByLabel(/unread messages/i);
    await expect(msgBadge).toBeVisible();
    await expect(msgBadge).toHaveText("1");

    // Navigate to Messages page
    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: "Messages", level: 2 })).toBeVisible();

    // Verify conversation item for Jordan Taylor shows unread badge
    const convLink = page.locator(`a[href*="/messages/${convABId}"]`);
    await expect(convLink).toBeVisible();
    await expect(convLink.getByText(E2E_USERS.studentB.displayName)).toBeVisible();
    await expect(convLink.getByLabel(/unread messages/i)).toHaveText("1");
  });

  test("C2: Open conversation, view history, and verify unread badge auto-clears", async ({ page }) => {
    await resetMessagingPairAB();

    await loginAs(page, E2E_USERS.studentA);
    await page.goto("/messages");

    // Click conversation in sidebar to open thread
    const convLink = page.locator(`a[href*="/messages/${convABId}"]`);
    await convLink.click();

    // Verify URL and thread header
    await page.waitForURL(`**/messages/${convABId}`);
    await expect(page.getByRole("heading", { name: E2E_USERS.studentB.displayName })).toBeVisible();
    await expect(page.getByText("Connected")).toBeVisible();

    // Verify seeded message history
    await expect(
      page.getByText("Hey Alex, excited to connect on CampusConnect!")
    ).toBeVisible();

    // Verify unread badge in Navbar auto-clears
    const msgBadge = page
      .locator('header nav[aria-label="Main Navigation"]')
      .getByLabel(/unread messages/i);
    await expect(msgBadge).not.toBeVisible();

    // Verify unread badge in ConversationList also clears
    await expect(convLink.getByLabel(/unread messages/i)).not.toBeVisible();
  });

  test("C3: Send message in active thread and verify real-time bubble rendering", async ({ page }) => {
    await resetMessagingPairAB();

    await loginAs(page, E2E_USERS.studentA);
    await page.goto(`/messages/${convABId}`);

    const composerTextarea = page.locator('textarea[aria-label="Write a message"]');
    await expect(composerTextarea).toBeVisible();
    await expect(composerTextarea).toBeEnabled();

    const uniqueMsg = `E2E automated test message - ${Date.now()}`;
    await composerTextarea.fill(uniqueMsg);

    const sendBtn = page.locator("#btn-send-message");
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Verify new message bubble renders in thread
    await expect(page.getByText(uniqueMsg)).toBeVisible();

    // Verify textarea is cleared
    await expect(composerTextarea).toHaveValue("");
  });

  test("C4: Profile Message CTA deep links into active conversation", async ({ page }) => {
    await resetMessagingPairAB();

    await loginAs(page, E2E_USERS.studentA);
    await page.goto(`/users/${E2E_USERS.studentB.uid}`);

    const profileMsgBtn = page.locator("#btn-message-student");
    await expect(profileMsgBtn).toBeVisible();
    await profileMsgBtn.click();

    // Verify navigation directly to active thread
    await page.waitForURL(`**/messages/${convABId}`);
    await expect(page.getByRole("heading", { name: E2E_USERS.studentB.displayName })).toBeVisible();
    await expect(page.locator('textarea[aria-label="Write a message"]')).toBeEnabled();
  });

  test("C5: Disconnected relationship renders banner and disables composer", async ({ page }) => {
    // Dedicated to pair B <-> C so pair A <-> B remains completely unaffected
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

    // Verify Student C card disappears from active connections
    await expect(confirmRemoveBtn).not.toBeVisible();

    // 2. Navigate to existing conversation with Student C
    await page.goto(`/messages/${convBCId}`);

    // Verify header status reflects "Disconnected"
    await expect(page.getByText("Disconnected")).toBeVisible();

    // Verify Connection Inactive alert banner
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

    // Verify past message history is still preserved
    await expect(page.getByText("Hi Casey, glad we are connected!", { exact: true })).toBeVisible();
  });
});
