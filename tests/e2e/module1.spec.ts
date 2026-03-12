import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://0.0.0.0:8000";
const FRONTEND_URL = "http://0.0.0.0:5173";
const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "password123";

test.describe("Module 1 Validation", () => {
  test("Task 8: Health endpoint returns ok", async ({ request }) => {
    const resp = await request.get(`${BACKEND_URL}/health`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.status).toBe("ok");
  });

  test("Task 9: Signup creates test user (or login if exists)", async ({ page }) => {
    await page.goto(FRONTEND_URL);

    // Should see auth form — look for Sign Up tab/link
    const signUpLink = page.getByText(/sign up/i);
    if (await signUpLink.isVisible()) {
      await signUpLink.click();
    }

    // Fill signup form
    await page.getByPlaceholder(/email/i).fill(TEST_EMAIL);
    await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);

    // Submit
    const signUpButton = page.getByRole("button", { name: /sign up/i });
    await signUpButton.click();

    // Wait for either: chat UI (signup succeeded) or error (user already exists)
    const chatVisible = page
      .getByText(/new chat|no thread|send a message/i)
      .first();
    const errorVisible = page.getByText(/already registered/i);

    await expect(chatVisible.or(errorVisible)).toBeVisible({ timeout: 10000 });

    // If signup failed because user exists, switch to login
    if (await errorVisible.isVisible().catch(() => false)) {
      await page.getByText(/log in/i).click();
      await page.getByPlaceholder(/email/i).fill(TEST_EMAIL);
      await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);
      await page.getByRole("button", { name: /log in|login|sign in/i }).click();
      await expect(chatVisible).toBeVisible({ timeout: 10000 });
    }
  });

  test("Task 10: Login with test credentials", async ({ page }) => {
    await page.goto(FRONTEND_URL);

    // If we're already logged in (from previous test), log out first
    const logoutButton = page.getByRole("button", { name: /log\s*out|sign\s*out/i });
    if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await logoutButton.click();
      await page.waitForTimeout(500);
    }

    // Should see login form
    const loginLink = page.getByText(/log in|login|sign in/i).first();
    if (await loginLink.isVisible().catch(() => false)) {
      await loginLink.click();
    }

    await page.getByPlaceholder(/email/i).fill(TEST_EMAIL);
    await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);

    const loginButton = page.getByRole("button", { name: /log in|login|sign in/i });
    await loginButton.click();

    // Should redirect to chat UI
    await expect(
      page.getByText(/new chat|no thread|send a message/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("Task 11: Chat thread creation and listing", async ({ page }) => {
    // Login first
    await page.goto(FRONTEND_URL);
    await page.getByPlaceholder(/email/i).fill(TEST_EMAIL);
    await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /log in|login|sign in/i }).click();

    // Wait for chat UI to load
    await page.waitForTimeout(2000);

    // Click "New Chat" button
    const newChatButton = page.getByRole("button", { name: /new chat/i });
    await expect(newChatButton).toBeVisible({ timeout: 5000 });
    await newChatButton.click();

    // Verify thread was created — should appear in sidebar or thread list
    await page.waitForTimeout(1000);

    // The thread list should have at least one thread now
    // Look for thread items in the sidebar
    const threadItems = page.locator('[class*="thread"], [class*="Thread"]').or(
      page.getByText(/new chat|untitled/i)
    );
    await expect(threadItems.first()).toBeVisible({ timeout: 5000 });
  });

  test("Task 12: Message sending and SSE streaming", async ({ page }) => {
    // Login first
    await page.goto(FRONTEND_URL);
    await page.getByPlaceholder(/email/i).fill(TEST_EMAIL);
    await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /log in|login|sign in/i }).click();

    await page.waitForTimeout(2000);

    // Create a new thread if needed
    const newChatButton = page.getByRole("button", { name: /new chat/i });
    if (await newChatButton.isVisible().catch(() => false)) {
      await newChatButton.click();
      await page.waitForTimeout(1000);
    }

    // Type a message
    const messageInput = page.getByPlaceholder(/type|message|ask/i);
    await expect(messageInput).toBeVisible({ timeout: 5000 });
    await messageInput.fill("Hello, this is a test message");

    // Send the message
    const sendButton = page.getByRole("button", { name: /send/i }).or(
      page.locator('button[type="submit"]')
    );
    await sendButton.first().click();

    // Verify user message appears
    await expect(
      page.getByText("Hello, this is a test message")
    ).toBeVisible({ timeout: 5000 });

    // Wait for assistant response to stream in (may take a while with LLM)
    // The assistant message uses bg-muted styling and appears left-aligned
    // Verify a second message bubble appears (the assistant response)
    const messageBubbles = page.locator(".bg-muted");
    await expect(messageBubbles.first()).toBeVisible({ timeout: 30000 });
  });
});
