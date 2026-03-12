import { expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { BACKEND_URL, FRONTEND_URL, TEST_EMAIL, TEST_PASSWORD } from "./test-data";

/**
 * Login via API and return the access token.
 */
export async function apiLogin(
  request: APIRequestContext,
  email = TEST_EMAIL,
  password = TEST_PASSWORD
): Promise<string> {
  const resp = await request.post(`${BACKEND_URL}/auth/login`, {
    data: { email, password },
  });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  return body.access_token;
}

/**
 * Login via the browser UI. Waits for chat view to load.
 */
export async function uiLogin(
  page: Page,
  email = TEST_EMAIL,
  password = TEST_PASSWORD
): Promise<void> {
  await page.goto(FRONTEND_URL);

  // If already logged in (e.g. persisted token), return
  const newChatBtn = page.getByRole("button", { name: "+ New Chat" });
  if (await newChatBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }

  // Switch to login form if we're on signup
  const loginLink = page.getByRole("button", { name: "Log in" });
  if (await loginLink.isVisible({ timeout: 1000 }).catch(() => false)) {
    await loginLink.click();
  }

  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Log In" }).click();

  // Wait for chat UI
  await expect(newChatBtn).toBeVisible({ timeout: 10000 });
}
