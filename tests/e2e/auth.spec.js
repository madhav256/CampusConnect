import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./fixtures/testUsers.js";
import { loginAs } from "./helpers/auth.js";

test.describe("Milestone 17 — Unit 17.2: Authentication & Route Protection", () => {
  test("Test A: redirects unauthenticated visitor from protected routes to login", async ({ page }) => {
    const protectedRoutes = ["/dashboard", "/discover", "/users/e2e-student-b", "/settings"];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForURL((url) => url.pathname === "/" || url.pathname === "");

      await expect(page.getByRole("heading", { name: /sign in to campusconnect/i })).toBeVisible();
      await expect(page.locator("#login-email")).toBeVisible();
      await expect(page.locator("#login-password")).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
    }
  });

  test("Test B: displays error message and blocks access on invalid credentials", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /sign in to campusconnect/i })).toBeVisible();

    await page.locator("#login-email").fill(E2E_USERS.studentA.email);
    await page.locator("#login-password").fill("InvalidPasswordXYZ999!");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    // Verify error banner is rendered and user remains on login route
    await expect(page.locator(".border-rose-200")).toBeVisible();
    expect(page.url()).not.toContain("/dashboard");
    await expect(page.getByRole("heading", { name: /sign in to campusconnect/i })).toBeVisible();
  });

  test("Test C: successfully signs out through settings and clears authenticated session", async ({ page }) => {
    // 1. Authenticate as student A
    await loginAs(page, E2E_USERS.studentA);
    expect(page.url()).toContain("/dashboard");

    // 2. Navigate to Settings page
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    // 3. Click the Sign Out button
    const signOutBtn = page.locator("#btn-settings-signout");
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    // 4. Verify redirected to login and login UI is visible
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "");
    await expect(page.getByRole("heading", { name: /sign in to campusconnect/i })).toBeVisible();

    // 5. Verify session is cleared by attempting to navigate back to /dashboard
    await page.goto("/dashboard");
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "");
    await expect(page.getByRole("heading", { name: /sign in to campusconnect/i })).toBeVisible();
  });
});
