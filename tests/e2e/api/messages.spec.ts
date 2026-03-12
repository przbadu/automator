import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";

let client: ApiClient & { dispose: () => Promise<void> };
let threadId: string;

test.describe("Messages API", () => {
  test.beforeAll(async () => {
    client = await ApiClient.create();
    const resp = await client.createThread("Messages Test");
    const thread = await resp.json();
    threadId = thread.id;
  });

  test.afterAll(async () => {
    await client.deleteThread(threadId).catch(() => {});
    await client.dispose();
  });

  test("List messages on empty thread returns empty array", async () => {
    const resp = await client.listMessages(threadId);
    expect(resp.ok()).toBeTruthy();
    const messages = await resp.json();
    expect(messages).toEqual([]);
  });

  test("List messages on nonexistent thread returns 404", async () => {
    const resp = await client.listMessages("nonexistent-thread-id");
    expect(resp.status()).toBe(404);
  });
});
