import { test, expect } from "@playwright/test";
import { uiLogin } from "../fixtures/auth";
import { apiLogin } from "../fixtures/auth";
import { ApiClient } from "../fixtures/api-client";
import { deleteAllLLMConfigs } from "../fixtures/cleanup";

test.describe("Settings UI", () => {
  test.beforeEach(async ({ page }) => {
    await uiLogin(page);
  });

  test("Gear icon navigates to settings page", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();

    await expect(page.getByText("Settings").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Back to Chat")).toBeVisible();
  });

  test("Back to Chat navigates back to chat", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("Back to Chat")).toBeVisible({ timeout: 5000 });

    await page.getByText("Back to Chat").click();

    await expect(
      page.getByRole("button", { name: "+ New Chat" })
    ).toBeVisible({ timeout: 5000 });
  });

  test("LLM Configurations tab is default", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();

    await expect(
      page.getByText("LLM Configurations").first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("Documents tab shows upload area", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(500);

    // Click Documents tab
    await page.getByRole("button", { name: "Documents" }).click();

    // Should see the drag-drop upload area
    await expect(
      page.getByText(/drag.*drop|browse files/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("Empty LLM config state shows add button", async ({ page, request }) => {
    // Clean up all configs
    const token = await apiLogin(request);
    const client = new ApiClient(request, token);
    await deleteAllLLMConfigs(client);

    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(500);

    await expect(
      page.getByText(/no llm configurations/i)
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("button", { name: "Add Configuration" })
    ).toBeVisible();
  });

  test("Add Configuration shows form", async ({ page, request }) => {
    // Clean up configs first
    const token = await apiLogin(request);
    const client = new ApiClient(request, token);
    await deleteAllLLMConfigs(client);

    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Add Configuration" }).click();

    // Form fields should be visible
    await expect(page.getByPlaceholder("e.g. My OpenAI Key")).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Provider").first()).toBeVisible();
    await expect(page.getByText("API Key").first()).toBeVisible();
    await expect(page.getByText("Model").first()).toBeVisible();
  });

  test("Cancel form returns to list", async ({ page, request }) => {
    const token = await apiLogin(request);
    const client = new ApiClient(request, token);
    await deleteAllLLMConfigs(client);

    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Add Configuration" }).click();
    await expect(page.getByPlaceholder("e.g. My OpenAI Key")).toBeVisible({ timeout: 3000 });

    // Click cancel
    await page.getByRole("button", { name: "Cancel" }).click();

    // Should be back to list with add button
    await expect(
      page.getByRole("button", { name: "Add Configuration" })
    ).toBeVisible({ timeout: 3000 });
  });
});
