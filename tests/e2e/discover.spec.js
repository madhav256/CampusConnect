import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs } from "./helpers/auth.js";

test.describe("Milestone 17 — Unit 17.2: Discover Search & Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, E2E_USERS.studentA);
  });

  test("Test A: displays initial prompt and respects minimum 2-character query guard", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByRole("heading", { name: "Discover Students" })).toBeVisible();

    // Verify initial empty state prompt (< 2 characters)
    await expect(page.getByRole("heading", { name: "Find Your Classmates" })).toBeVisible();

    // Type 1 character into search box
    const searchInput = page.getByRole("textbox", { name: "Search students" });
    await searchInput.fill("D");

    // Verify prompt remains visible because minimum query length is 2
    await expect(page.getByRole("heading", { name: "Find Your Classmates" })).toBeVisible();
  });

  test("Test B: searches students by department name", async ({ page }) => {
    await page.goto("/discover");

    const searchInput = page.getByRole("textbox", { name: "Search students" });
    await searchInput.fill("Design");

    // Wait for 300ms debounce and Firestore query to render Jordan Taylor's card
    await expect(page.getByRole("heading", { name: "Jordan Taylor" })).toBeVisible();
    await expect(page.getByText("Design", { exact: true })).toBeVisible();
  });

  test("Test C: searches students by specific skill", async ({ page }) => {
    await page.goto("/discover");

    const searchInput = page.getByRole("textbox", { name: "Search students" });
    await searchInput.fill("Figma");

    // Verify Jordan Taylor appears (has skill "Figma")
    await expect(page.getByRole("heading", { name: "Jordan Taylor" })).toBeVisible();
    await expect(page.getByText("Figma", { exact: true })).toBeVisible();
  });

  test("Test D: displays no results state when no student matches query", async ({ page }) => {
    await page.goto("/discover");

    const searchInput = page.getByRole("textbox", { name: "Search students" });
    await searchInput.fill("NonexistentMajorXYZ");

    // Verify "No students found" empty state is displayed
    await expect(page.getByRole("heading", { name: "No students found" })).toBeVisible();
  });

  test("Test E: navigates from search result card to public student profile", async ({ page }) => {
    await page.goto("/discover");

    const searchInput = page.getByRole("textbox", { name: "Search students" });
    await searchInput.fill("Design");

    // Locate Jordan Taylor's card
    const jordanCard = page.locator("div").filter({ has: page.getByRole("heading", { name: "Jordan Taylor" }) }).first();
    await expect(jordanCard).toBeVisible();

    // Click "View Profile" link scoped to Jordan's card
    const viewProfileLink = jordanCard.getByRole("link", { name: "View Profile" });
    await expect(viewProfileLink).toBeVisible();
    await viewProfileLink.click();

    // Verify navigation to Jordan Taylor's public profile
    await page.waitForURL("**/users/e2e-student-b");
    expect(page.url()).toContain("/users/e2e-student-b");
    await expect(page.getByRole("heading", { name: "Jordan Taylor", level: 1 })).toBeVisible();
  });
});
