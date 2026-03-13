import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { parseSSEResponse } from "../fixtures/sse";

/**
 * Helper: upload a document and wait for ingestion to complete.
 */
async function uploadAndWait(
  client: ApiClient & { dispose: () => Promise<void> },
  filename: string,
  content: string
): Promise<string> {
  const resp = await client.uploadDocument(filename, content);
  expect(resp.status()).toBe(201);
  const doc = await resp.json();

  let status = "pending";
  let attempts = 0;
  while (status !== "completed" && status !== "failed" && attempts < 60) {
    await new Promise((r) => setTimeout(r, 1000));
    const d = await (await client.getDocument(doc.id)).json();
    status = d.status;
    attempts++;
  }
  expect(status).toBe("completed");
  return doc.id;
}

test.describe("Hybrid Search (requires LLM)", () => {
  test("BM25 keyword match for unique term", async () => {
    const client = await ApiClient.create();

    try {
      const content = [
        "The Xyloflux-9000 is a revolutionary quantum processing unit.",
        "It was developed by NovaTech Labs in their Singapore facility.",
        "The Xyloflux-9000 achieves 1.2 petaflops of quantum-accelerated throughput.",
        "Pricing starts at $45,000 per unit for enterprise customers.",
      ].join("\n\n");

      const docId = await uploadAndWait(client, "xyloflux-spec.txt", content);

      const threadResp = await client.createThread("Hybrid BM25 Test");
      const thread = await threadResp.json();

      const msgResp = await client.sendMessage(
        thread.id,
        "What is the Xyloflux-9000?"
      );
      expect(msgResp.ok()).toBeTruthy();

      const body = await msgResp.text();
      const { fullContent } = parseSSEResponse(body);

      // BM25 should nail this exact keyword match
      expect(fullContent.toLowerCase()).toContain("xyloflux");

      await client.deleteDocument(docId);
      await client.deleteThread(thread.id);
    } finally {
      await client.dispose();
    }
  });

  test("Semantic match still works with no keyword overlap", async () => {
    const client = await ApiClient.create();

    try {
      const content = [
        "Meridian Technologies reported fiscal year 2024 revenue of $234 million.",
        "The company's cloud infrastructure division grew by 47% year-over-year.",
        "Operating margins improved to 18.3%, up from 12.1% the previous year.",
        "CEO Sarah Chen attributed growth to enterprise AI adoption trends.",
      ].join("\n\n");

      const docId = await uploadAndWait(client, "meridian-financials.txt", content);

      const threadResp = await client.createThread("Semantic Test");
      const thread = await threadResp.json();

      // Ask without using any exact keywords from the document
      const msgResp = await client.sendMessage(
        thread.id,
        "How much money did the company make and what drove their business growth?"
      );
      expect(msgResp.ok()).toBeTruthy();

      const body = await msgResp.text();
      const { fullContent } = parseSSEResponse(body);

      // Should reference revenue or financial figures
      const lower = fullContent.toLowerCase();
      const hasFinancialInfo =
        lower.includes("234") ||
        lower.includes("million") ||
        lower.includes("meridian") ||
        lower.includes("revenue");
      expect(hasFinancialInfo).toBeTruthy();

      await client.deleteDocument(docId);
      await client.deleteThread(thread.id);
    } finally {
      await client.dispose();
    }
  });

  test("Multi-doc disambiguation returns correct document", async () => {
    const client = await ApiClient.create();

    try {
      const cookingContent = [
        "Chef Marco's Famous Risotto Recipe",
        "Ingredients: arborio rice, parmesan cheese, white wine, chicken broth.",
        "Cook the risotto for exactly 18 minutes, stirring continuously.",
        "Finish with cold butter and freshly grated parmesan.",
      ].join("\n\n");

      const spaceContent = [
        "NASA's Artemis III Mission Overview",
        "Artemis III will land astronauts on the lunar south pole.",
        "The mission uses the SpaceX Starship Human Landing System.",
        "Target launch date is scheduled for late 2026.",
      ].join("\n\n");

      const docId1 = await uploadAndWait(client, "risotto-recipe.txt", cookingContent);
      const docId2 = await uploadAndWait(client, "artemis-mission.txt", spaceContent);

      const threadResp = await client.createThread("Multi-doc Test");
      const thread = await threadResp.json();

      const msgResp = await client.sendMessage(
        thread.id,
        "Tell me about the Artemis III moon mission"
      );
      expect(msgResp.ok()).toBeTruthy();

      const body = await msgResp.text();
      const { fullContent } = parseSSEResponse(body);

      const lower = fullContent.toLowerCase();
      // Should reference space content, not cooking
      const hasSpaceInfo =
        lower.includes("artemis") ||
        lower.includes("lunar") ||
        lower.includes("moon") ||
        lower.includes("spacex");
      expect(hasSpaceInfo).toBeTruthy();
      // Should not confuse with cooking
      expect(lower).not.toContain("risotto");

      await client.deleteDocument(docId1);
      await client.deleteDocument(docId2);
      await client.deleteThread(thread.id);
    } finally {
      await client.dispose();
    }
  });
});
