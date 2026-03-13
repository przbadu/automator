import fs from "fs";
import path from "path";
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

  test("Upload returns content_hash in response", async () => {
    const resp = await client.uploadDocument(
      "hash-test.txt",
      "Content for hash test."
    );
    expect(resp.status()).toBe(201);
    const doc = await resp.json();
    createdDocIds.push(doc.id);
    expect(doc.content_hash).toBeTruthy();
    expect(doc.content_hash).toHaveLength(64);
  });

  test("Upload duplicate content returns 200 with duplicate flag", async () => {
    const content = "Exact duplicate content for dedup test.";
    const resp1 = await client.uploadDocument("dedup-original.txt", content);
    expect(resp1.status()).toBe(201);
    const doc1 = await resp1.json();
    createdDocIds.push(doc1.id);

    const resp2 = await client.uploadDocument("dedup-original.txt", content);
    expect(resp2.status()).toBe(200);
    const doc2 = await resp2.json();
    expect(doc2.duplicate).toBe(true);
    expect(doc2.id).toBe(doc1.id);
  });

  test("Upload same content with different filename returns duplicate", async () => {
    const content = "Same content different filename dedup test.";
    const resp1 = await client.uploadDocument("dedup-name-a.txt", content);
    expect(resp1.status()).toBe(201);
    const doc1 = await resp1.json();
    createdDocIds.push(doc1.id);

    const resp2 = await client.uploadDocument("dedup-name-b.txt", content);
    expect(resp2.status()).toBe(200);
    const doc2 = await resp2.json();
    expect(doc2.duplicate).toBe(true);
  });

  test("Upload same filename with different content returns updated", async () => {
    const resp1 = await client.uploadDocument(
      "update-test.txt",
      "Original content v1."
    );
    expect(resp1.status()).toBe(201);
    const doc1 = await resp1.json();
    createdDocIds.push(doc1.id);

    // Wait for ingestion to finish so it's not in a processing state
    let status = doc1.status;
    let attempts = 0;
    while (status !== "completed" && status !== "failed" && attempts < 60) {
      await new Promise((r) => setTimeout(r, 1000));
      const resp = await client.getDocument(doc1.id);
      const doc = await resp.json();
      status = doc.status;
      attempts++;
    }
    // If status is still processing (no LLM available), skip this test
    if (status !== "completed" && status !== "failed") {
      test.skip();
      return;
    }

    const resp2 = await client.uploadDocument(
      "update-test.txt",
      "Updated content v2 — different hash."
    );
    expect(resp2.status()).toBe(200);
    const doc2 = await resp2.json();
    expect(doc2.updated).toBe(true);
    expect(doc2.id).toBe(doc1.id);
    expect(doc2.content_hash).not.toBe(doc1.content_hash);
  });

  test("List and get endpoints include content_hash", async () => {
    // Create a document to ensure there's at least one
    const uploadResp = await client.uploadDocument(
      "hash-field-test.txt",
      "Content for hash field test."
    );
    const uploaded = await uploadResp.json();
    createdDocIds.push(uploaded.id);

    const listResp = await client.listDocuments();
    const data = await listResp.json();
    expect(data.documents.length).toBeGreaterThan(0);
    const doc = data.documents.find((d: { id: string }) => d.id === uploaded.id);
    expect(doc).toBeTruthy();
    expect("content_hash" in doc).toBe(true);

    const getResp = await client.getDocument(uploaded.id);
    const fetched = await getResp.json();
    expect("content_hash" in fetched).toBe(true);
    expect(fetched.content_hash).toHaveLength(64);
  });

  test("Upload .pdf file returns 201", async () => {
    const pdfPath = path.join(__dirname, "../fixtures/sample.pdf");
    const buffer = Buffer.from(fs.readFileSync(pdfPath));
    const resp = await client.uploadDocumentBuffer(
      "test-upload.pdf",
      buffer,
      "application/pdf"
    );
    expect(resp.status()).toBe(201);
    const doc = await resp.json();
    createdDocIds.push(doc.id);
    expect(doc.filename).toBe("test-upload.pdf");
    expect(doc.mime_type).toBe("application/pdf");
    expect(doc.status).toBe("pending");
  });

  test("Upload .html file returns 201", async () => {
    const resp = await client.uploadDocument(
      "test-upload.html",
      "<html><body><p>Hello</p></body></html>",
      "text/html"
    );
    expect(resp.status()).toBe(201);
    const doc = await resp.json();
    createdDocIds.push(doc.id);
    expect(doc.filename).toBe("test-upload.html");
  });

  test("Upload .csv file returns 201", async () => {
    const resp = await client.uploadDocument(
      "test-upload.csv",
      "name,age\nAlice,30\nBob,25",
      "text/csv"
    );
    expect(resp.status()).toBe(201);
    const doc = await resp.json();
    createdDocIds.push(doc.id);
    expect(doc.filename).toBe("test-upload.csv");
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
