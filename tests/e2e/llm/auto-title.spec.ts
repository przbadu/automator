import { test, expect } from "@playwright/test";
import { uiLogin } from "../fixtures/auth";

test.describe("Auto Title Generation (requires LLM)", () => {
  test.beforeEach(async ({ page }) => {
    await uiLogin(page);
  });

  test("First message generates a thread title", async ({ page }) => {
    await page.getByRole("button", { name: "+ New Chat" }).click();
    await page.waitForTimeout(500);

    const input = page.getByPlaceholder("Type a message...");
    await input.fill("What is the capital of France?");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait for streaming to complete (generous timeout for thinking models)
    await expect(
      page.getByRole("button", { name: "Send" })
    ).toBeVisible({ timeout: 90000 });

    // Wait for title to update (happens after streaming done event)
    await page.waitForTimeout(5000);

    // Header should show a generated title, not the raw message
    const header = page.locator("h2");
    const headerText = await header.textContent();
    expect(headerText).toBeTruthy();
    expect(headerText!.trim()).not.toBe("");
    expect(headerText!.trim()).not.toBe("New Chat");
    expect(headerText!.trim()).not.toBe("What is the capital of France?");
  });

  test("Generated title appears in sidebar", async ({ page }) => {
    await page.getByRole("button", { name: "+ New Chat" }).click();
    await page.waitForTimeout(500);

    const input = page.getByPlaceholder("Type a message...");
    await input.fill("Tell me about quantum physics");
    await page.getByRole("button", { name: "Send" }).click();

    // Wait for streaming to complete (generous timeout for thinking models)
    await expect(
      page.getByRole("button", { name: "Send" })
    ).toBeVisible({ timeout: 90000 });

    // Wait for title generation (happens asynchronously after done event)
    await page.waitForTimeout(5000);

    // Sidebar should show a title that isn't "New Chat"
    // Use the active thread (bg-accent) which is the one we just created
    const activeThread = page.locator(".bg-accent .truncate").first();
    const threadText = await activeThread.textContent();
    expect(threadText).toBeTruthy();
    expect(threadText!.trim()).not.toBe("New Chat");
  });
});
