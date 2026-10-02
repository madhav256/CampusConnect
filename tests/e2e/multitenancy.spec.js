import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs, logout } from "./helpers/auth.js";

test.describe("Milestone 18 — Unit 18.5: Multi-Tenancy & Campus Isolation E2E Suite", () => {
  test("Test 1: Registration flow captures selected campus and renders campus identity in Navbar and Profile", async ({
    page,
  }) => {
    const uniqueEmail = `e2e.registered.${Date.now()}@campusconnect.test`;

    // 1. Navigate to registration
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /join campusconnect/i })).toBeVisible();

    // 2. Verify campus dropdown is pre-populated with seeded campuses
    const campusSelect = page.locator("#register-campus");
    await expect(campusSelect).toBeVisible();
    await expect(campusSelect).toHaveValue("apex-university");

    // 3. Fill in registration details
    await page.locator("#register-name").fill("Devendra Joshi");
    await page.locator("#register-email").fill(uniqueEmail);
    await page.locator("#register-password").fill("StrongPass123!");

    // 4. Submit registration
    await page.getByRole("button", { name: /create account/i }).click();

    // 5. Land on dashboard and verify Navbar campus indicator
    await page.waitForURL("**/dashboard");
    const navbarBadge = page.locator("#navbar-campus-badge");
    await expect(navbarBadge).toBeVisible();
    await expect(navbarBadge).toContainText("Apex Tech");

    // 6. Navigate to profile and verify Profile campus badge
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Devendra Joshi", level: 1 })).toBeVisible();
    const profileBadge = page.locator("#profile-campus-badge");
    await expect(profileBadge).toBeVisible();
    await expect(profileBadge).toContainText("Apex Tech");
  });

  test("Test 2: Real-time feed enforces multi-tenant boundary (Apex vs. St. Jude)", async ({ page }) => {
    // 1. Authenticate as Apex student A
    await loginAs(page, E2E_USERS.studentA);
    await page.goto("/dashboard");

    // 2. Verify Apex Tech post is visible
    await expect(page.getByText("Welcome to the CampusConnect E2E test environment!")).toBeVisible();

    // 3. Verify cross-tenant St. Jude post is strictly NOT visible
    await expect(page.getByText("Welcome to the St. Jude University community feed!")).not.toBeVisible();

    // 4. Sign out
    await logout(page);

    // 5. Authenticate as St. Jude student
    await loginAs(page, E2E_USERS.studentStJude);
    await page.goto("/dashboard");

    // 6. Verify St. Jude post is visible
    await expect(page.getByText("Welcome to the St. Jude University community feed!")).toBeVisible();

    // 7. Verify Apex post is NOT visible to St. Jude student
    await expect(page.getByText("Welcome to the CampusConnect E2E test environment!")).not.toBeVisible();

    // 8. Verify St. Jude Navbar badge
    const navbarBadge = page.locator("#navbar-campus-badge");
    await expect(navbarBadge).toBeVisible();
    await expect(navbarBadge).toContainText("St. Jude");
  });

  test("Test 3: Discover student directory isolates search results by campus tenant", async ({ page }) => {
    // 1. Authenticate as Apex student A
    await loginAs(page, E2E_USERS.studentA);
    await page.goto("/discover");

    // 2. Verify Discover header shows campus badge and scoped description
    const discoverBadge = page.locator("#discover-campus-badge");
    await expect(discoverBadge).toBeVisible();
    await expect(page.getByText(/Apex Institute of Technology/)).toBeVisible();

    // 3. Search for Jordan Taylor (Apex student) -> found
    const searchInput = page.getByRole("textbox", { name: "Search students" });
    await searchInput.fill("Jordan");
    await expect(page.getByRole("heading", { name: "Jordan Taylor" })).toBeVisible();

    // 4. Search for Rohan Varma (St. Jude student) -> NOT found (tenant isolated)
    await searchInput.fill("Rohan");
    await expect(page.getByRole("heading", { name: "No students found" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rohan Varma" })).not.toBeVisible();

    // 5. Sign out and log in as St. Jude student
    await logout(page);
    await loginAs(page, E2E_USERS.studentStJude);
    await page.goto("/discover");

    // 6. Search for Rohan Varma (St. Jude student) -> found
    const stJudeSearchInput = page.getByRole("textbox", { name: "Search students" });
    await stJudeSearchInput.fill("Rohan");
    await expect(page.getByRole("heading", { name: "Rohan Varma" })).toBeVisible();

    // 7. Search for Jordan Taylor (Apex student) -> NOT found for St. Jude student
    await stJudeSearchInput.fill("Jordan");
    await expect(page.getByRole("heading", { name: "No students found" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Jordan Taylor" })).not.toBeVisible();
  });

  test("Test 4: Public profile displays campus badge of target student", async ({ page }) => {
    await loginAs(page, E2E_USERS.studentA);

    // Visit Jordan Taylor's public profile (Apex student)
    await page.goto(`/users/${E2E_USERS.studentB.uid}`);
    await expect(page.getByRole("heading", { name: "Jordan Taylor", level: 1 })).toBeVisible();

    const publicBadge = page.locator("#public-profile-campus-badge");
    await expect(publicBadge).toBeVisible();
    await expect(publicBadge).toContainText("Apex Tech");
  });
});
