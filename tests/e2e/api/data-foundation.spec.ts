import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { BACKEND_URL } from "../fixtures/test-data";

let client: ApiClient & { dispose: () => Promise<void> };
const createdDocIds: string[] = [];

/**
 * Helper: upload a document and poll until ingestion completes (or fails).
 * Returns the final document object.
 */
async function uploadAndWaitForIngestion(
  client: ApiClient & { dispose: () => Promise<void> },
  filename: string,
  content: string,
  maxAttempts = 60
): Promise<{ id: string; status: string; [key: string]: unknown }> {
  const resp = await client.uploadDocument(filename, content);
  const doc = await resp.json();
  createdDocIds.push(doc.id);

  let status = doc.status;
  let attempts = 0;
  while (status !== "completed" && status !== "failed" && attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 1000));
    const getResp = await client.getDocument(doc.id);
    const updated = await getResp.json();
    status = updated.status;
    attempts++;
  }
  const finalResp = await client.getDocument(doc.id);
  return finalResp.json();
}

test.describe("Data Foundation - Schema and Content Storage", () => {
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

  test("health check confirms migration ran", async () => {
    const resp = await client.getDocumentContent("nonexistent-id");
    // 404 means the endpoint exists (migration ran, route registered)
    // If tables didn't exist, we'd get a 500
    expect(resp.status()).toBe(404);
  });

  test("uploaded document content is stored in document_content", async () => {
    const content = "The quick brown fox jumps over the lazy dog";
    const doc = await uploadAndWaitForIngestion(client, "fts-test-content.txt", content);
    expect(doc.status).toBe("completed");

    // Verify content was stored
    const contentResp = await client.getDocumentContent(doc.id);
    expect(contentResp.ok()).toBeTruthy();
    const body = await contentResp.json();
    expect(body.document_id).toBe(doc.id);
    expect(body.content).toBe(content);
    expect(body.line_count).toBe(1);
    expect(body.char_count).toBe(content.length);
  });

  test("FTS5 search returns results for uploaded content", async () => {
    // Upload a document with known content
    const content = "Artificial intelligence and machine learning are transforming industries worldwide";
    const doc = await uploadAndWaitForIngestion(client, "fts-search-test.txt", content);
    expect(doc.status).toBe("completed");

    // Search for terms in the document
    const searchResp = await client.searchFTS("artificial intelligence");
    expect(searchResp.ok()).toBeTruthy();
    const searchBody = await searchResp.json();
    expect(searchBody.query).toBe("artificial intelligence");
    expect(searchBody.results.length).toBeGreaterThan(0);

    const match = searchBody.results.find(
      (r: { document_id: string }) => r.document_id === doc.id
    );
    expect(match).toBeTruthy();
    expect(match.filename).toBe("fts-search-test.txt");
    expect(match.snippet).toBeTruthy();
  });

  test("FTS5 search returns empty results for nonexistent terms", async () => {
    const searchResp = await client.searchFTS("xyznonexistentterm123");
    expect(searchResp.ok()).toBeTruthy();
    const body = await searchResp.json();
    expect(body.results).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  test("document content endpoint returns 404 for non-ingested document", async () => {
    const resp = await client.getDocumentContent("nonexistent-doc-id");
    expect(resp.status()).toBe(404);
  });

  test("document re-ingestion updates content via upsert", async () => {
    const content1 = "Original content for upsert test document version one";
    const doc1 = await uploadAndWaitForIngestion(client, "upsert-test.txt", content1);
    expect(doc1.status).toBe("completed");

    // Verify original content
    const contentResp1 = await client.getDocumentContent(doc1.id);
    const body1 = await contentResp1.json();
    expect(body1.content).toBe(content1);

    // Upload same filename with different content (triggers update flow)
    const content2 = "Updated content for upsert test document version two with more words";
    const doc2 = await uploadAndWaitForIngestion(client, "upsert-test.txt", content2);
    expect(doc2.status).toBe("completed");
    expect(doc2.id).toBe(doc1.id); // Same document ID (update, not new)

    // Verify content was updated
    const contentResp2 = await client.getDocumentContent(doc2.id);
    const body2 = await contentResp2.json();
    expect(body2.content).toBe(content2);
    expect(body2.char_count).toBe(content2.length);
  });
});
