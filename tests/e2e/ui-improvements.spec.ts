import { test, expect } from "@playwright/test";

const FRONTEND_URL = "http://0.0.0.0:5173";
const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "password123";

async function login(page: import("@playwright/test").Page) {
  await page.goto(FRONTEND_URL);

  // If already logged in, return
  const logoutBtn = page.getByRole("button", { name: /log\s*out/i });
  if (await logoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }

  // Switch to login form if needed
  const loginLink = page.getByText(/log in|login|sign in/i).first();
  if (await loginLink.isVisible().catch(() => false)) {
    await loginLink.click();
  }

  await page.getByPlaceholder(/email/i).fill(TEST_EMAIL);
  await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /log in|login|sign in/i }).click();

  // Wait for chat UI
  await expect(
    page.getByRole("button", { name: /new chat/i })
  ).toBeVisible({ timeout: 10000 });
}

test.describe("UI Improvements Validation", () => {
  test("Task 5: Loading indicator appears while waiting for response", async ({ page }) => {
    await login(page);

    // Create a new chat
    await page.getByRole("button", { name: /new chat/i }).click();
    await page.waitForTimeout(500);

    // Send a message
    const input = page.getByPlaceholder(/type|message/i);
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill("Say hello");
    await page.getByRole("button", { name: /send/i }).first().click();

    // The thinking indicator should appear (bouncing dots)
    const thinkingIndicator = page.getByText("Thinking");
    await expect(thinkingIndicator).toBeVisible({ timeout: 5000 });

    // Eventually it should disappear as streaming starts
    await expect(thinkingIndicator).not.toBeVisible({ timeout: 30000 });

    // And the send button should show a spinner while streaming
    // After streaming completes, send button should say "Send" again
    await expect(
      page.getByRole("button", { name: /send/i })
    ).toBeVisible({ timeout: 30000 });
  });

  test("Task 6: Chat title auto-generated from first message", async ({ page }) => {
    await login(page);

    // Create a new chat
    await page.getByRole("button", { name: /new chat/i }).click();
    await page.waitForTimeout(500);

    // Send a message about a specific topic
    const input = page.getByPlaceholder(/type|message/i);
    await input.fill("What is the capital of France?");
    await page.getByRole("button", { name: /send/i }).first().click();

    // Wait for the response to complete
    await page.waitForTimeout(15000);

    // The sidebar should now show a generated title (not "New Chat")
    // Check that the thread title in the sidebar has changed
    const sidebar = page.locator(".w-64");

    // The title should NOT be the default truncated first message
    // It should be an LLM-generated title related to the topic
    // Wait for title to update
    await page.waitForTimeout(5000);

    // Check the header shows a meaningful title (not "New Chat" or just the first 50 chars)
    const header = page.locator("h2");
    const headerText = await header.textContent();
    expect(headerText).toBeTruthy();
    // The title should not be empty or just "New Chat"
    expect(headerText!.trim()).not.toBe("");
    // It should be a generated title, not exactly the raw message
    expect(headerText!.trim()).not.toBe("What is the capital of France?");
  });

  test("Task 7: Fixed layout - only messages scroll", async ({ page }) => {
    await login(page);

    // Create a chat and send messages
    await page.getByRole("button", { name: /new chat/i }).click();
    await page.waitForTimeout(500);

    const input = page.getByPlaceholder(/type|message/i);
    await input.fill("Tell me a long story about a dragon. Make it at least 500 words.");
    await page.getByRole("button", { name: /send/i }).first().click();

    // Wait for response to complete
    await page.waitForTimeout(20000);

    // Check that the sidebar is still visible (not scrolled away)
    const sidebar = page.locator(".w-64");
    await expect(sidebar).toBeVisible();

    // Check that the input is still visible at the bottom (not scrolled away)
    const messageInput = page.getByPlaceholder(/type|message/i);
    await expect(messageInput).toBeVisible();

    // Check that the header is still visible
    const header = page.locator("h2");
    await expect(header).toBeVisible();

    // Verify the layout uses overflow-hidden on the outer container
    const outerContainer = page.locator(".overflow-hidden").first();
    await expect(outerContainer).toBeVisible();
  });

  test("Task 8: Auto-scroll to bottom on new messages", async ({ page }) => {
    await login(page);

    // Create a chat
    await page.getByRole("button", { name: /new chat/i }).click();
    await page.waitForTimeout(500);

    // Send a message that will generate a long response
    const input = page.getByPlaceholder(/type|message/i);
    await input.fill("Count from 1 to 50, each number on a new line");
    await page.getByRole("button", { name: /send/i }).first().click();

    // Wait for response
    await page.waitForTimeout(20000);

    // The scroll container should be scrolled to the bottom
    const scrollContainer = page.locator(".overflow-y-auto").first();
    const isAtBottom = await scrollContainer.evaluate((el) => {
      return Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 50;
    });
    expect(isAtBottom).toBeTruthy();
  });

  test("Task 10: Stop button appears during streaming, aborts and saves partial content", async ({ page }) => {
    await login(page);

    // Create a new chat
    await page.getByRole("button", { name: /new chat/i }).click();
    await page.waitForTimeout(500);

    // Send a message that will generate a long response
    const input = page.getByPlaceholder(/type|message/i);
    await input.fill("Write a very long detailed essay about the history of computing from 1800 to 2020");
    await page.getByRole("button", { name: /send/i }).first().click();

    // Wait for streaming to start - the Stop button should appear
    const stopButton = page.getByRole("button", { name: /stop/i });
    await expect(stopButton).toBeVisible({ timeout: 15000 });

    // Let some content stream in
    await page.waitForTimeout(3000);

    // Click the stop button
    await stopButton.click();

    // The stop button should disappear and Send button should return
    await expect(
      page.getByRole("button", { name: /send/i })
    ).toBeVisible({ timeout: 10000 });

    // There should be a partial assistant response saved in the chat
    const assistantMessages = page.locator(".bg-muted");
    await expect(assistantMessages.first()).toBeVisible({ timeout: 5000 });

    // The partial response should have some content (not empty)
    const responseText = await assistantMessages.first().textContent();
    expect(responseText!.trim().length).toBeGreaterThan(0);
  });
});
