import { expect } from "@playwright/test";

/**
 * Deterministically authenticates a user through the CampusConnect login form.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ email: string, password: string, displayName?: string }} user
 */
export async function loginAs(page, user) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in to campusconnect/i })).toBeVisible();

  await page.locator("#login-email").fill(user.email);
  await page.locator("#login-password").fill(user.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
}

/**
 * Signs out the current user via the Settings page.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function logout(page) {
  await page.goto("/settings");
  await page.locator("#btn-settings-signout").click();
  await page.waitForURL("**/");
  await expect(page.getByRole("heading", { name: /sign in to campusconnect/i })).toBeVisible();
}
