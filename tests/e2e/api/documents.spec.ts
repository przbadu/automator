import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { BACKEND_URL } from "../fixtures/test-data";

let client: ApiClient & { dispose: () => Promise<void> };
const createdDocIds: string[] = [];

test.describe("Documents API", () => {
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

  test("Upload .txt file returns 201 with pending status", async () => {
    const resp = await client.uploadDocument(
      "test-upload.txt",
      "This is test content for upload."
    );
    expect(resp.status()).toBe(201);
    const doc = await resp.json();
    createdDocIds.push(doc.id);
    expect(doc.id).toBeTruthy();
    expect(doc.filename).toBe("test-upload.txt");
    expect(doc.status).toBe("pending");
  });

  test("Upload .md file returns 201", async () => {
    const resp = await client.uploadDocument(
      "test-upload.md",
      "# Markdown\n\nSome content.",
      "text/markdown"
    );
    expect(resp.status()).toBe(201);
    const doc = await resp.json();
    createdDocIds.push(doc.id);
    expect(doc.filename).toBe("test-upload.md");
    expect(doc.status).toBe("pending");
  });

  test("Upload unsupported file type returns 400", async () => {
    const resp = await client.uploadDocument(
      "bad-file.exe",
      "binary content",
      "application/octet-stream"
    );
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.detail).toContain("Unsupported");
  });

  test("List documents includes uploaded file", async () => {
    const uploadResp = await client.uploadDocument(
      "listed-doc.txt",
      "List me."
    );
    const uploaded = await uploadResp.json();
    createdDocIds.push(uploaded.id);

    const listResp = await client.listDocuments();
    expect(listResp.ok()).toBeTruthy();
    const data = await listResp.json();
    const found = data.documents.find(
      (d: { id: string }) => d.id === uploaded.id
    );
    expect(found).toBeTruthy();
    expect(found.filename).toBe("listed-doc.txt");
  });

  test("Get document by ID returns correct document", async () => {
    const uploadResp = await client.uploadDocument(
      "get-me.txt",
      "Get me by ID."
    );
    const uploaded = await uploadResp.json();
    createdDocIds.push(uploaded.id);

    const getResp = await client.getDocument(uploaded.id);
    expect(getResp.ok()).toBeTruthy();
    const doc = await getResp.json();
    expect(doc.id).toBe(uploaded.id);
    expect(doc.filename).toBe("get-me.txt");
  });

  test("Get nonexistent document returns 404", async () => {
    const resp = await client.getDocument("nonexistent-doc-id");
    expect(resp.status()).toBe(404);
  });

  test("Poll document until ingestion completes", async () => {
    const uploadResp = await client.uploadDocument(
      "poll-test.txt",
      "Content for ingestion polling test.\n\nMultiple paragraphs here.\n\nThird paragraph."
    );
    const uploaded = await uploadResp.json();
    createdDocIds.push(uploaded.id);

    let status = uploaded.status;
    let attempts = 0;
    while (status !== "completed" && status !== "failed" && attempts < 60) {
      await new Promise((r) => setTimeout(r, 1000));
      const resp = await client.getDocument(uploaded.id);
      const doc = await resp.json();
      status = doc.status;
      attempts++;
    }
    expect(status).toBe("completed");
  });

  test("Delete document returns 204", async () => {
    const uploadResp = await client.uploadDocument(
      "delete-me.txt",
      "Delete this."
    );
    const uploaded = await uploadResp.json();

    const delResp = await client.deleteDocument(uploaded.id);
    expect(delResp.status()).toBe(204);

    const getResp = await client.getDocument(uploaded.id);
    expect(getResp.status()).toBe(404);
  });

  test("Delete nonexistent document returns 404", async () => {
    const resp = await client.deleteDocument("nonexistent-doc-id");
    expect(resp.status()).toBe(404);
  });

  test("Upload without auth returns 401", async ({ request }) => {
    const resp = await request.post(`${BACKEND_URL}/documents/upload`, {
      multipart: {
        file: {
          name: "no-auth.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("no auth"),
        },
      },
    });
    expect(resp.status()).toBe(401);
  });
});
