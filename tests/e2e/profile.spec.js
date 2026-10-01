import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs } from "./helpers/auth.js";

test.describe("Milestone 17 — Unit 17.2: Public Profile Display & Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, E2E_USERS.studentA);
  });

  test("Test A: loads and displays complete public profile information for seeded student", async ({ page }) => {
    const targetStudent = E2E_USERS.studentB;
    await page.goto(`/users/${targetStudent.uid}`);

    // Verify main heading with student display name
    await expect(page.getByRole("heading", { name: targetStudent.displayName, level: 1 })).toBeVisible();

    // Verify department and academic year badges
    await expect(page.getByText(targetStudent.department, { exact: true })).toBeVisible();
    await expect(page.getByText(targetStudent.year, { exact: true })).toBeVisible();

    // Verify bio content in About section
    await expect(page.getByText(targetStudent.bio)).toBeVisible();

    // Verify seeded skills (UI/UX, Figma, Tailwind)
    for (const skill of targetStudent.skills) {
      await expect(page.getByText(skill, { exact: true })).toBeVisible();
    }
  });

  test("Test B: displays student not found state for nonexistent profile identifier", async ({ page }) => {
    await page.goto("/users/nonexistent-user-999");

    // Verify "Student not found" heading and explanatory message
    await expect(page.getByRole("heading", { name: "Student not found" })).toBeVisible();
    await expect(page.getByText(/this student profile does not exist or has been removed/i)).toBeVisible();

    // Verify recovery link back to Discover is available
    await expect(page.getByRole("link", { name: /back to discover/i })).toBeVisible();
  });

  test("Test C: navigates back to Discover via profile header link", async ({ page }) => {
    await page.goto(`/users/${E2E_USERS.studentB.uid}`);
    await expect(page.getByRole("heading", { name: E2E_USERS.studentB.displayName, level: 1 })).toBeVisible();

    // Click "← Back to Discover" link
    const backLink = page.getByRole("link", { name: /back to discover/i });
    await expect(backLink).toBeVisible();
    await backLink.click();

    // Verify returned to /discover route
    await page.waitForURL("**/discover");
    expect(page.url()).toContain("/discover");
    await expect(page.getByRole("heading", { name: "Discover Students" })).toBeVisible();
  });
});
