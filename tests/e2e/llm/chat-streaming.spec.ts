import { test, expect } from "@playwright/test";
import { uiLogin } from "../fixtures/auth";

test.describe("Chat Streaming (requires LLM)", () => {
  test.beforeEach(async ({ page }) => {
    await uiLogin(page);
    // Create a fresh thread
    await page.getByRole("button", { name: "+ New Chat" }).click();
    await page.waitForTimeout(500);
  });

  test("Thinking indicator appears after sending message", async ({ page }) => {
    const input = page.getByPlaceholder("Type a message...");
    await input.fill("Say hello");
    await page.getByRole("button", { name: "Send" }).click();

    // The thinking indicator uses a specific bouncing dots animation
    // Look for the thinking indicator element specifically (not text content from LLM)
    const thinkingIndicator = page.locator(".animate-bounce").first();
    await expect(thinkingIndicator).toBeVisible({ timeout: 10000 });

    // Wait for streaming to complete
    await expect(
      page.getByRole("button", { name: "Send" })
    ).toBeVisible({ timeout: 30000 });
  });

  test("Streaming renders assistant message", async ({ page }) => {
    const input = page.getByPlaceholder("Type a message...");
    await input.fill("Say hello briefly");
    await page.getByRole("button", { name: "Send" }).click();

    // Assistant message bubble should appear
    const assistantMsg = page.locator(".bg-muted");
    await expect(assistantMsg.first()).toBeVisible({ timeout: 30000 });
  });

  test("Stop button appears during streaming", async ({ page }) => {
    const input = page.getByPlaceholder("Type a message...");
    await input.fill("Write a very long detailed essay about the history of computing from 1800 to 2020");
    await page.getByRole("button", { name: "Send" }).click();

    // Stop button should appear during streaming
    await expect(
      page.getByRole("button", { name: "Stop" })
    ).toBeVisible({ timeout: 15000 });
  });

  test("Clicking Stop saves partial response", async ({ page }) => {
    const input = page.getByPlaceholder("Type a message...");
    await input.fill("Write a very long detailed essay about the history of computing from 1800 to 2020");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait for stop button
    const stopBtn = page.getByRole("button", { name: "Stop" });
    await expect(stopBtn).toBeVisible({ timeout: 15000 });

    // Let some content stream in
    await page.waitForTimeout(3000);
    await stopBtn.click();

    // Send button should return
    await expect(
      page.getByRole("button", { name: "Send" })
    ).toBeVisible({ timeout: 10000 });

    // Partial assistant response should have content
    const assistantMsg = page.locator(".bg-muted").first();
    await expect(assistantMsg).toBeVisible({ timeout: 5000 });
    const text = await assistantMsg.textContent();
    expect(text!.trim().length).toBeGreaterThan(0);
  });

  test("Send button returns after streaming completes", async ({ page }) => {
    const input = page.getByPlaceholder("Type a message...");
    await input.fill("Say hello in one word");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait for streaming to complete — Send button reappears
    // Some models produce long thinking output, so allow a generous timeout
    await expect(
      page.getByRole("button", { name: "Send" })
    ).toBeVisible({ timeout: 90000 });
  });
});
