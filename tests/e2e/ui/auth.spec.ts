import { test, expect } from "@playwright/test";
import { uiLogin } from "../fixtures/auth";
import { FRONTEND_URL, TEST_EMAIL, TEST_PASSWORD } from "../fixtures/test-data";

test.describe("Auth UI", () => {
  test("Login form renders with email and password fields", async ({ page }) => {
    await page.goto(FRONTEND_URL);

    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
  });

  test("Successful login navigates to chat view", async ({ page }) => {
    await uiLogin(page);

    await expect(
      page.getByRole("button", { name: "+ New Chat" })
    ).toBeVisible();
  });

  test("Failed login shows error message", async ({ page }) => {
    await page.goto(FRONTEND_URL);

    await page.getByPlaceholder("Email").fill(TEST_EMAIL);
    await page.getByPlaceholder("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Log In" }).click();

    // Error should appear
    await expect(page.locator(".text-destructive")).toBeVisible({ timeout: 5000 });
  });

  test("Switch between login and signup forms", async ({ page }) => {
    await page.goto(FRONTEND_URL);

    // Should start on login
    await expect(page.getByText("Log In").first()).toBeVisible();

    // Switch to signup
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("Sign Up").first()).toBeVisible();

    // Switch back to login
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Log In").first()).toBeVisible();
  });

  test("Unauthenticated user sees login form", async ({ page }) => {
    // Clear any stored tokens
    await page.goto(FRONTEND_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.getByPlaceholder("Email")).toBeVisible({ timeout: 5000 });
  });

  test("Logout returns to login form", async ({ page }) => {
    await uiLogin(page);

    // Click logout
    await page.getByText(/^Logout/).click();

    // Should see login form again
    await expect(page.getByPlaceholder("Email")).toBeVisible({ timeout: 5000 });
  });
});
