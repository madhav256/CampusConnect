/**
 * Milestone 19 — Unit 19.7: Community Feed & Content UI E2E Test Suite
 *
 * Validates community discovery, detail navigation, member-gated posting,
 * and real-time community feed updates.
 */

import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs } from "./helpers/auth.js";

test.describe("Milestone 19 — Unit 19.7: Community Discovery & Feed Interactions", () => {
  test("Active member discovers community, creates a community post, and views it in the community feed", async ({
    page,
  }) => {
    // 1. Log in as studentA (active admin/member of Apex AI club)
    await loginAs(page, E2E_USERS.studentA);

    // 2. Open /communities discovery page
    await page.goto("/communities");
    await expect(page.getByRole("heading", { name: "Campus Communities" })).toBeVisible();

    // 3. Click the Apex AI & Robotics Society card to navigate to detail
    const aiClubCard = page.locator("[data-testid='community-card-apex-ai-club']");
    await expect(aiClubCard).toBeVisible();
    await aiClubCard.click();

    // 4. Verify landing on /communities/apex-ai-club
    await page.waitForURL("**/communities/apex-ai-club");
    await expect(page.locator("[data-testid='community-hero-name']")).toContainText("Apex AI & Robotics Society");

    // 5. Verify active member sees the post composer
    const composerTextarea = page.locator("#community-post-content");
    await expect(composerTextarea).toBeVisible();

    // 6. Submit a unique community post
    const uniqueCommunityPost = `Robotics Autonomous Rover Update - ${Date.now()}`;
    await composerTextarea.fill(uniqueCommunityPost);

    const submitBtn = page.locator("[data-testid='community-post-submit']");
    await submitBtn.click();

    // 7. Verify post appears in the community feed
    const communityFeed = page.locator("[data-testid='community-feed']");
    await expect(communityFeed.getByText(uniqueCommunityPost)).toBeVisible();

    // 8. Verify composer resets to empty
    await expect(page.locator("#community-post-content")).toHaveValue("");
  });

  test("Non-member views community detail without posting capability", async ({ page }) => {
    // 1. Log in as studentC (student at Apex University, but NOT a member of Apex AI club)
    await loginAs(page, E2E_USERS.studentC);

    // 2. Navigate directly to /communities/apex-ai-club
    await page.goto("/communities/apex-ai-club");
    await expect(page.locator("[data-testid='community-hero-name']")).toContainText("Apex AI & Robotics Society");

    // 3. Verify Join Community button is available
    await expect(page.locator("[data-testid='join-community-button']")).toBeVisible();

    // 4. Verify post composer and moderation panel are strictly hidden for non-member
    await expect(page.locator("#community-post-content")).not.toBeVisible();
    await expect(page.locator("[data-testid='community-post-composer']")).not.toBeVisible();
    await expect(page.locator("[data-testid='community-moderation-panel']")).not.toBeVisible();
  });

  test("Admin views community moderation panel and manages member role", async ({ page }) => {
    // 1. Log in as studentA (active admin of Apex AI club)
    await loginAs(page, E2E_USERS.studentA);

    // 2. Navigate to /communities/apex-ai-club
    await page.goto("/communities/apex-ai-club");
    await expect(page.locator("[data-testid='community-hero-name']")).toContainText("Apex AI & Robotics Society");

    // 3. Verify moderation panel is visible with Admin badge
    const modPanel = page.locator("[data-testid='community-moderation-panel']");
    await expect(modPanel).toBeVisible();
    await expect(page.locator("[data-testid='moderation-role-badge']")).toHaveText("Admin");

    // 4. Verify member e2e-student-b is listed
    const memberRow = page.locator("[data-testid='moderation-member-row-e2e-student-b']");
    await expect(memberRow).toBeVisible();

    // 5. Admin promotes student-b to moderator
    const promoteBtn = page.locator("[data-testid='promote-moderator-e2e-student-b']");
    await expect(promoteBtn).toBeVisible();
    await promoteBtn.click();

    // 6. Verify success banner appears and demote button is now shown
    await expect(page.locator("[data-testid='moderation-success']")).toBeVisible();
    const demoteBtn = page.locator("[data-testid='demote-member-e2e-student-b']");
    await expect(demoteBtn).toBeVisible();

    // 7. Admin demotes student-b back to regular member
    await demoteBtn.click();
    await expect(page.locator("[data-testid='moderation-success']")).toBeVisible();
    await expect(page.locator("[data-testid='promote-moderator-e2e-student-b']")).toBeVisible();
  });

  test("Ordinary community member does not see moderation panel or post moderation on others' posts", async ({
    page,
  }) => {
    // 1. Log in as studentB (regular member)
    await loginAs(page, E2E_USERS.studentB);

    // 2. Navigate to /communities/apex-ai-club
    await page.goto("/communities/apex-ai-club");
    await expect(page.locator("[data-testid='community-hero-name']")).toContainText("Apex AI & Robotics Society");

    // 3. Moderation panel is strictly hidden for regular members
    await expect(page.locator("[data-testid='community-moderation-panel']")).not.toBeVisible();

    // 4. Moderate post button is strictly hidden for regular members
    await expect(page.locator("[data-testid='moderate-post-button']")).not.toBeVisible();
  });
});
