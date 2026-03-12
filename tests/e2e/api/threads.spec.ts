import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { BACKEND_URL } from "../fixtures/test-data";

let client: ApiClient & { dispose: () => Promise<void> };
const createdThreadIds: string[] = [];

test.describe("Threads API", () => {
  test.beforeAll(async () => {
    client = await ApiClient.create();
  });

  test.afterAll(async () => {
    for (const id of createdThreadIds) {
      await client.deleteThread(id).catch(() => {});
    }
    createdThreadIds.length = 0;
    await client.dispose();
  });

  test("Create thread returns 201", async () => {
    const resp = await client.createThread("Test Thread Alpha");
    expect(resp.status()).toBe(201);
    const thread = await resp.json();
    createdThreadIds.push(thread.id);
    expect(thread.id).toBeTruthy();
    expect(thread.title).toBe("Test Thread Alpha");
    expect(thread.user_id).toBeTruthy();
    expect(thread.created_at).toBeTruthy();
    expect(thread.updated_at).toBeTruthy();
  });

  test("List threads includes created thread", async () => {
    const createResp = await client.createThread("Findable Thread");
    const created = await createResp.json();
    createdThreadIds.push(created.id);

    const listResp = await client.listThreads();
    expect(listResp.ok()).toBeTruthy();
    const threads = await listResp.json();
    const found = threads.find((t: { id: string }) => t.id === created.id);
    expect(found).toBeTruthy();
    expect(found.title).toBe("Findable Thread");
  });

  test("Get thread by ID returns correct thread", async () => {
    const createResp = await client.createThread("Get Me");
    const created = await createResp.json();
    createdThreadIds.push(created.id);

    const getResp = await client.getThread(created.id);
    expect(getResp.ok()).toBeTruthy();
    const thread = await getResp.json();
    expect(thread.id).toBe(created.id);
    expect(thread.title).toBe("Get Me");
  });

  test("Get nonexistent thread returns 404", async () => {
    const resp = await client.getThread("nonexistent-id-12345");
    expect(resp.status()).toBe(404);
  });

  test("Delete thread returns 204", async () => {
    const createResp = await client.createThread("Delete Me");
    const created = await createResp.json();

    const delResp = await client.deleteThread(created.id);
    expect(delResp.status()).toBe(204);

    const getResp = await client.getThread(created.id);
    expect(getResp.status()).toBe(404);
  });

  test("Delete nonexistent thread returns 404", async () => {
    const resp = await client.deleteThread("nonexistent-id-12345");
    expect(resp.status()).toBe(404);
  });

  test("Threads ordered by updated_at DESC", async () => {
    const resp1 = await client.createThread("First");
    const t1 = await resp1.json();
    createdThreadIds.push(t1.id);

    await new Promise((r) => setTimeout(r, 50));

    const resp2 = await client.createThread("Second");
    const t2 = await resp2.json();
    createdThreadIds.push(t2.id);

    const listResp = await client.listThreads();
    const threads = await listResp.json();

    const idx1 = threads.findIndex((t: { id: string }) => t.id === t1.id);
    const idx2 = threads.findIndex((t: { id: string }) => t.id === t2.id);
    expect(idx2).toBeLessThan(idx1);
  });

  test("Create thread without auth returns 401", async ({ request }) => {
    const resp = await request.post(`${BACKEND_URL}/threads`, {
      data: { title: "No Auth" },
    });
    expect(resp.status()).toBe(401);
  });
});
