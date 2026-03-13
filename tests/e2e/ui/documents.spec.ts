import { test, expect } from "@playwright/test";
import { uiLogin } from "../fixtures/auth";
import { ApiClient } from "../fixtures/api-client";

let client: ApiClient & { dispose: () => Promise<void> };
const createdDocIds: string[] = [];

test.describe("Documents UI", () => {
  test.beforeAll(async () => {
    client = await ApiClient.create();
  });

  test.afterAll(async () => {
    for (const id of createdDocIds) {
      await client.deleteDocument(id).catch(() => {});
    }
    createdDocIds.length = 0;
    await client.dispose();
  });

  test("Upload duplicate file shows info message", async ({ page }) => {
    await uiLogin(page);

    // Navigate to settings > documents
    await page.getByTitle("Settings").click();
    await page.getByText("Documents").click();

    const content = "Duplicate UI test content " + Date.now();

    // Upload first time via API to have a doc in place
    const resp = await client.uploadDocument("ui-dup-test.txt", content);
    const doc = await resp.json();
    createdDocIds.push(doc.id);

    // Upload same content via UI
    const fileInput = page.locator('input[type="file"]');
    const buffer = Buffer.from(content);
    await fileInput.setInputFiles({
      name: "ui-dup-test.txt",
      mimeType: "text/plain",
      buffer,
    });

    // Should show the duplicate info message
    const message = page.getByTestId("upload-message");
    await expect(message).toBeVisible({ timeout: 10000 });
    await expect(message).toContainText("already exists");
  });
});
