import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { parseSSEResponse } from "../fixtures/sse";

test.describe("RAG Retrieval (requires LLM)", () => {
  test("Upload doc, ask about content, response references it", async () => {
    const client = await ApiClient.create();

    try {
      // Upload a document with unique facts
      const testContent = [
        "Zephyr Dynamics was founded in 2021 by Dr. Elena Vasquez.",
        "The company headquarters is located in Boulder, Colorado.",
        "Zephyr specializes in quantum computing hardware.",
        "Their flagship product is the QuantumCore X9 processor.",
        "In 2024, Zephyr reported revenue of $87 million.",
      ].join("\n\n");

      const uploadResp = await client.uploadDocument("zephyr-facts.txt", testContent);
      expect(uploadResp.status()).toBe(201);
      const doc = await uploadResp.json();

      // Poll until completed
      let status = "pending";
      let attempts = 0;
      while (status !== "completed" && status !== "failed" && attempts < 60) {
        await new Promise((r) => setTimeout(r, 1000));
        const resp = await client.getDocument(doc.id);
        const d = await resp.json();
        status = d.status;
        attempts++;
      }
      expect(status).toBe("completed");

      // Create a thread and ask about the document
      const threadResp = await client.createThread("RAG Test");
      const thread = await threadResp.json();

      const msgResp = await client.sendMessage(
        thread.id,
        "What is Zephyr Dynamics' flagship product?"
      );
      expect(msgResp.ok()).toBeTruthy();

      const body = await msgResp.text();
      const { fullContent } = parseSSEResponse(body);

      // Response should reference the QuantumCore X9
      expect(fullContent.toLowerCase()).toContain("quantumcore");

      // Cleanup
      await client.deleteDocument(doc.id);
      await client.deleteThread(thread.id);
    } finally {
      await client.dispose();
    }
  });
});
