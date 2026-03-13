import { test, expect } from "@playwright/test";
import { uiLogin, apiLogin } from "../fixtures/auth";
import { ApiClient } from "../fixtures/api-client";

test.describe("Metadata Schema UI", () => {
  test.beforeEach(async ({ page, request }) => {
    // Reset schema to defaults
    const token = await apiLogin(request);
    const client = new ApiClient(request, token);
    await client.deleteMetadataSchema();

    await uiLogin(page);
  });

  test("Settings page shows Metadata Schema tab", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(500);

    await expect(
      page.getByRole("button", { name: "Metadata Schema" })
    ).toBeVisible({ timeout: 5000 });
  });

  test("Metadata Schema tab displays default fields", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Metadata Schema" }).click();
    await page.waitForTimeout(500);

    // Should see the default field names in inputs
    await expect(page.locator('input[value="title"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[value="summary"]').first()).toBeVisible();
    await expect(page.locator('input[value="document_type"]').first()).toBeVisible();
    await expect(page.locator('input[value="language"]').first()).toBeVisible();
  });

  test("Can add a new field", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Metadata Schema" }).click();
    await page.waitForTimeout(500);

    // Wait for fields to load
    await expect(page.locator('input[value="title"]').first()).toBeVisible({ timeout: 5000 });

    // Count initial Remove buttons (one per field)
    const initialCount = await page.getByRole("button", { name: "Remove" }).count();

    // Click add field
    await page.getByRole("button", { name: "+ Add Field" }).click();

    // Should have one more Remove button
    const newCount = await page.getByRole("button", { name: "Remove" }).count();
    expect(newCount).toBe(initialCount + 1);
  });

  test("Can remove a field", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Metadata Schema" }).click();
    await page.waitForTimeout(500);

    // Wait for fields to load
    await expect(page.locator('input[value="title"]').first()).toBeVisible({ timeout: 5000 });

    // Count initial Remove buttons
    const removeButtons = page.getByRole("button", { name: "Remove" });
    const initialCount = await removeButtons.count();
    expect(initialCount).toBeGreaterThan(0);

    // Click the first Remove button
    await removeButtons.first().click();

    // Should have one fewer
    const newCount = await removeButtons.count();
    expect(newCount).toBe(initialCount - 1);
  });

  test("Can reset to defaults", async ({ page, request }) => {
    // First, save a custom schema via API
    const token = await apiLogin(request);
    const client = new ApiClient(request, token);
    await client.saveMetadataSchema([
      {
        name: "custom_only",
        display_label: "Custom Only",
        data_type: "string",
        required: false,
        description: "A custom field",
      },
    ]);

    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Metadata Schema" }).click();
    await page.waitForTimeout(500);

    // Should see custom field
    await expect(page.locator('input[value="custom_only"]').first()).toBeVisible({ timeout: 5000 });

    // Click reset
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reset to Defaults" }).click();
    await page.waitForTimeout(1000);

    // Should see default fields again
    await expect(page.locator('input[value="title"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[value="summary"]').first()).toBeVisible();
  });
});
