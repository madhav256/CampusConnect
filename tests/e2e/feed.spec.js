import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs } from "./helpers/auth.js";

const SEEDED_POST_CONTENT = "Welcome to the CampusConnect E2E test environment!";

test.describe("Milestone 17 — Unit 17.2: Feed Interactions", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, E2E_USERS.studentA);
  });

  test("Test A: loads and displays seeded post with initial metadata", async ({ page }) => {
    await page.goto("/dashboard");

    // Scope to the seeded post card
    const postCard = page.locator(".mb-4").filter({ hasText: SEEDED_POST_CONTENT }).first();
    await expect(postCard).toBeVisible();

    // Verify author name and content
    await expect(postCard.getByRole("heading", { name: "Alex Chen" })).toBeVisible();
    await expect(postCard.getByText(SEEDED_POST_CONTENT)).toBeVisible();

    // Verify initial like button state (Like post, 0 count)
    const likeBtn = postCard.getByRole("button", { name: "Like post" });
    await expect(likeBtn).toBeVisible();
    await expect(likeBtn).toContainText("0");

    // Verify initial comment button state (0 Comments)
    const commentToggle = postCard.getByRole("button", { name: /0 comments?/i });
    await expect(commentToggle).toBeVisible();
  });

  test("Test B: creates a new post and renders it via real-time listener", async ({ page }) => {
    await page.goto("/dashboard");

    const uniquePostContent = `E2E Post - ${Date.now()}`;

    // Fill post content in the composer
    const composerTextarea = page.locator("#post-content");
    await composerTextarea.fill(uniquePostContent);

    // Click the composer's Post button (scoped within the composer form)
    const composerForm = page.locator("form").filter({ has: composerTextarea });
    await composerForm.getByRole("button", { name: "Post", exact: true }).click();

    // Wait for the new post to appear through the Firestore real-time listener
    const createdPostCard = page.locator(".mb-4").filter({ hasText: uniquePostContent }).first();
    await expect(createdPostCard).toBeVisible();
    await expect(createdPostCard.getByText(uniquePostContent)).toBeVisible();

    // Verify the new post is associated with Alex Chen
    await expect(createdPostCard.getByRole("heading", { name: "Alex Chen" })).toBeVisible();
  });

  test("Test C: toggles like and unlike on seeded post with immediate counter update", async ({ page }) => {
    await page.goto("/dashboard");

    // Scope strictly to the seeded post card
    const postCard = page.locator(".mb-4").filter({ hasText: SEEDED_POST_CONTENT }).first();
    await expect(postCard).toBeVisible();

    // 1. Initial state: "Like post", count 0
    const likeBtn = postCard.getByRole("button", { name: "Like post" });
    await expect(likeBtn).toBeVisible();
    await expect(likeBtn).toContainText("0");

    // 2. Click like
    await likeBtn.click();

    // 3. State transitions to "Unlike post", count 1
    const unlikeBtn = postCard.getByRole("button", { name: "Unlike post" });
    await expect(unlikeBtn).toBeVisible();
    await expect(unlikeBtn).toContainText("1");

    // 4. Click unlike
    await unlikeBtn.click();

    // 5. State transitions back to "Like post", count 0
    await expect(postCard.getByRole("button", { name: "Like post" })).toBeVisible();
    await expect(postCard.getByRole("button", { name: "Like post" })).toContainText("0");
  });

  test("Test D: expands comment section and adds a new comment to seeded post", async ({ page }) => {
    await page.goto("/dashboard");

    // Scope strictly to the seeded post card
    const postCard = page.locator(".mb-4").filter({ hasText: SEEDED_POST_CONTENT }).first();
    await expect(postCard).toBeVisible();

    // 1. Open the comments section
    const commentToggle = postCard.getByRole("button", { name: /comments?/i });
    await commentToggle.click();

    // 2. Locate the comment composer textarea scoped inside this post card
    const commentTextarea = postCard.getByPlaceholder("Write a comment...");
    await expect(commentTextarea).toBeVisible();

    // 3. Enter unique comment content
    const uniqueCommentText = `E2E Comment - ${Date.now()}`;
    await commentTextarea.fill(uniqueCommentText);

    // 4. Submit comment via the comment composer's Post button scoped to post card
    const commentSubmitBtn = postCard.getByRole("button", { name: "Post", exact: true });
    await expect(commentSubmitBtn).toBeVisible();
    await commentSubmitBtn.click();

    // 5. Verify the comment appears in the comment thread with author Alex Chen
    const renderedComment = postCard.locator(".whitespace-pre-wrap").filter({ hasText: uniqueCommentText });
    await expect(renderedComment).toBeVisible();
    await expect(postCard.getByRole("heading", { name: "Alex Chen" }).last()).toBeVisible();
  });
});
