import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { parseSSEResponse } from "../fixtures/sse";

test.describe("Citations & Conversation-Aware RAG (requires LLM)", () => {
  test("SSE stream includes sources event when documents exist", async () => {
    const client = await ApiClient.create();

    try {
      // Upload a document with unique facts
      const testContent = [
        "NovaTech Industries was founded in 2022 by Dr. James Chen.",
        "The company headquarters is located in Austin, Texas.",
        "NovaTech specializes in autonomous drone delivery systems.",
        "Their flagship product is the SkyRunner D7 delivery drone.",
        "In 2025, NovaTech reported revenue of $156 million.",
      ].join("\n\n");

      const uploadResp = await client.uploadDocument("novatech-facts.txt", testContent);
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
      const threadResp = await client.createThread("Citation SSE Test");
      const thread = await threadResp.json();

      const msgResp = await client.sendMessage(
        thread.id,
        "What is NovaTech Industries' flagship product?"
      );
      expect(msgResp.ok()).toBeTruthy();

      const body = await msgResp.text();
      const { fullContent, sourcesEvent } = parseSSEResponse(body);

      // Response should reference the SkyRunner D7
      expect(fullContent.toLowerCase()).toContain("skyrunner");

      // Sources event should be present
      expect(sourcesEvent).not.toBeNull();
      expect(sourcesEvent!.sources).toBeDefined();
      const sources = sourcesEvent!.sources as Array<Record<string, unknown>>;
      expect(sources.length).toBeGreaterThan(0);

      // Each source should have required fields
      for (const source of sources) {
        expect(source).toHaveProperty("filename");
        expect(source).toHaveProperty("chunk_index");
        expect(source).toHaveProperty("preview");
        expect(source).toHaveProperty("relevance_score");
        expect(source.relevance_score).toBeGreaterThan(0);
        expect(source.relevance_score).toBeLessThanOrEqual(1);
      }

      // Cleanup
      await client.deleteDocument(doc.id);
      await client.deleteThread(thread.id);
    } finally {
      await client.dispose();
    }
  });

  test("Historical messages retain stored sources", async () => {
    const client = await ApiClient.create();

    try {
      // Upload a document
      const testContent = [
        "Meridian Labs is a biotech startup focused on gene therapy.",
        "Founded in 2023 by Dr. Sarah Kim in San Francisco.",
        "Their lead product candidate is MRD-X100 for treating rare diseases.",
        "Meridian Labs raised $45 million in Series A funding.",
      ].join("\n\n");

      const uploadResp = await client.uploadDocument("meridian-info.txt", testContent);
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

      // Create thread and send message
      const threadResp = await client.createThread("Citation Persistence Test");
      const thread = await threadResp.json();

      const msgResp = await client.sendMessage(
        thread.id,
        "Tell me about Meridian Labs"
      );
      expect(msgResp.ok()).toBeTruthy();
      await msgResp.text(); // consume the SSE stream

      // Wait for message to be saved
      await new Promise((r) => setTimeout(r, 1000));

      // Now list messages and check that sources are persisted
      const listResp = await client.listMessages(thread.id);
      expect(listResp.ok()).toBeTruthy();
      const messages = await listResp.json();

      const assistantMsg = messages.find((m: { role: string }) => m.role === "assistant");
      expect(assistantMsg).toBeTruthy();
      expect(assistantMsg.metadata).not.toBeNull();
      expect(assistantMsg.metadata.sources).toBeDefined();
      expect(assistantMsg.metadata.sources.length).toBeGreaterThan(0);

      // Verify source fields persist
      const source = assistantMsg.metadata.sources[0];
      expect(source.filename).toBe("meridian-info.txt");
      expect(typeof source.chunk_index).toBe("number");
      expect(typeof source.preview).toBe("string");
      expect(source.preview.length).toBeGreaterThan(0);
      expect(typeof source.relevance_score).toBe("number");

      // Cleanup
      await client.deleteDocument(doc.id);
      await client.deleteThread(thread.id);
    } finally {
      await client.dispose();
    }
  });

  test("Contextualized query improves follow-up retrieval", async () => {
    const client = await ApiClient.create();

    try {
      // Upload a document with specific facts
      const testContent = [
        "Quantum Dynamics Corp makes the QD-9000 supercomputer.",
        "The QD-9000 costs $2.5 million per unit.",
        "It can perform 500 petaflops of computation.",
        "The QD-9000 uses liquid nitrogen cooling.",
        "Quantum Dynamics is headquartered in Seattle, Washington.",
      ].join("\n\n");

      const uploadResp = await client.uploadDocument("quantum-dynamics.txt", testContent);
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

      // Create thread - first message about the document
      const threadResp = await client.createThread("Contextual Query Test");
      const thread = await threadResp.json();

      // First message - establish context
      const msg1Resp = await client.sendMessage(
        thread.id,
        "Tell me about the QD-9000 supercomputer from Quantum Dynamics"
      );
      expect(msg1Resp.ok()).toBeTruthy();
      const body1 = await msg1Resp.text();
      const { fullContent: content1 } = parseSSEResponse(body1);
      expect(content1.toLowerCase()).toContain("qd-9000");

      // Second message - vague follow-up that needs contextualization
      const msg2Resp = await client.sendMessage(
        thread.id,
        "How much does it cost?"
      );
      expect(msg2Resp.ok()).toBeTruthy();
      const body2 = await msg2Resp.text();
      const { fullContent: content2, sourcesEvent } = parseSSEResponse(body2);

      // The response should mention the price, which means contextualization worked
      // (without context, "how much does it cost?" would not find relevant chunks)
      expect(
        content2.toLowerCase().includes("2.5 million") ||
        content2.toLowerCase().includes("$2.5") ||
        content2.toLowerCase().includes("2,500,000") ||
        content2.toLowerCase().includes("2.5m")
      ).toBeTruthy();

      // Sources should be present for the follow-up too
      expect(sourcesEvent).not.toBeNull();

      // Cleanup
      await client.deleteDocument(doc.id);
      await client.deleteThread(thread.id);
    } finally {
      await client.dispose();
    }
  });
});
