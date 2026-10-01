import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs } from "./helpers/auth.js";

test.describe("Milestone 17 — Unit 17.1 Smoke Suite", () => {
  test("Test A: redirects unauthenticated visitor from protected route /dashboard to login", async ({ page }) => {
    // 1. Attempt to open /dashboard directly while unauthenticated
    await page.goto("/dashboard");

    // 2. Verify redirect to login root
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "");

    // 3. Verify login UI elements are visible
    await expect(page.getByRole("heading", { name: /sign in to campusconnect/i })).toBeVisible();
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  });

  test("Test B: authenticates deterministic E2E user against emulator and renders dashboard", async ({ page }) => {
    const student = E2E_USERS.studentA;

    // 1. Navigate to login and submit credentials for student A
    await loginAs(page, student);

    // 2. Verify redirect to /dashboard
    expect(page.url()).toContain("/dashboard");

    // 3. Verify authenticated dashboard UI elements
    await expect(
      page.getByRole("heading", { name: `Welcome back, ${student.displayName.split(" ")[0]}!` })
    ).toBeVisible();
    await expect(page.getByText("Here's what's happening on campus today.")).toBeVisible();

    // 4. Verify authenticated navigation bar links exist
    await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Discover", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Messages", exact: true })).toBeVisible();
  });
});
