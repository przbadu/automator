import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { parseSSEResponse } from "../fixtures/sse";

test.describe("Sub-Agent (requires LLM)", () => {
  let client: ApiClient & { dispose: () => Promise<void> };
  let docId: string;
  let threadId: string;

  test.beforeAll(async () => {
    client = await ApiClient.create();

    // Upload a document with substantial content for sub-agent analysis
    const testContent = [
      "Chapter 1: Introduction to Quantum Computing",
      "Quantum computing leverages quantum mechanical phenomena such as superposition and entanglement.",
      "Unlike classical bits, quantum bits (qubits) can exist in multiple states simultaneously.",
      "",
      "Chapter 2: Key Milestones",
      "In 1981, Richard Feynman proposed the idea of a quantum computer.",
      "In 1994, Peter Shor developed an algorithm for factoring integers on a quantum computer.",
      "In 2019, Google claimed quantum supremacy with their Sycamore processor.",
      "",
      "Chapter 3: Applications",
      "Quantum computers can solve optimization problems exponentially faster.",
      "Drug discovery and molecular simulation are promising applications.",
      "Cryptography will be significantly impacted by quantum computing advances.",
      "",
      "Chapter 4: Challenges",
      "Decoherence remains a major obstacle in building practical quantum computers.",
      "Error correction requires significant overhead in terms of physical qubits.",
      "Current quantum computers operate at near absolute zero temperatures.",
    ].join("\n\n");

    const uploadResp = await client.uploadDocument(
      "quantum-computing-guide.txt",
      testContent
    );
    expect(uploadResp.status()).toBe(201);
    const doc = await uploadResp.json();
    docId = doc.id;

    // Wait for ingestion
    let status = "pending";
    let attempts = 0;
    while (status !== "completed" && status !== "failed" && attempts < 60) {
      await new Promise((r) => setTimeout(r, 1000));
      const resp = await client.getDocument(docId);
      const d = await resp.json();
      status = d.status;
      attempts++;
    }
    expect(status).toBe("completed");
  });

  test.afterAll(async () => {
    if (docId) await client.deleteDocument(docId).catch(() => {});
    if (threadId) await client.deleteThread(threadId).catch(() => {});
    await client.dispose();
  });

  test("Sub-agent activates for full-document queries", async () => {
    const threadResp = await client.createThread("Sub-Agent Test");
    const thread = await threadResp.json();
    threadId = thread.id;

    const msgResp = await client.sendMessage(
      thread.id,
      "Summarize the quantum computing guide document completely"
    );
    expect(msgResp.ok()).toBeTruthy();

    const body = await msgResp.text();
    const { subAgentEvents, fullContent, doneEvent } = parseSSEResponse(body);

    // Should have sub_agent_start and sub_agent_end events
    const startEvents = subAgentEvents.filter(
      (e) => e.type === "sub_agent_start"
    );
    const endEvents = subAgentEvents.filter(
      (e) => e.type === "sub_agent_end"
    );

    expect(startEvents.length).toBeGreaterThanOrEqual(1);
    expect(endEvents.length).toBeGreaterThanOrEqual(1);
    expect(fullContent.length).toBeGreaterThan(0);
    expect(doneEvent).not.toBeNull();
  });

  test("Sub-agent streams tool calls via SSE", async () => {
    const threadResp = await client.createThread("Sub-Agent Tools Test");
    const thread = await threadResp.json();

    const msgResp = await client.sendMessage(
      thread.id,
      "Read and summarize the entire quantum computing guide document"
    );
    expect(msgResp.ok()).toBeTruthy();

    const body = await msgResp.text();
    const { subAgentEvents } = parseSSEResponse(body);

    // Should have tool_call events
    const toolCalls = subAgentEvents.filter(
      (e) => e.type === "sub_agent_tool_call"
    );
    const toolResults = subAgentEvents.filter(
      (e) => e.type === "sub_agent_tool_result"
    );

    // If sub-agent was activated, it should have made at least one tool call
    if (subAgentEvents.some((e) => e.type === "sub_agent_start")) {
      expect(toolCalls.length).toBeGreaterThanOrEqual(1);
      expect(toolResults.length).toBeGreaterThanOrEqual(1);

      // Each tool call should have a tool name
      for (const tc of toolCalls) {
        expect(tc.tool).toBeTruthy();
      }
    }

    await client.deleteThread(thread.id);
  });

  test("Normal queries bypass sub-agent", async () => {
    const threadResp = await client.createThread("Normal Query Test");
    const thread = await threadResp.json();

    const msgResp = await client.sendMessage(
      thread.id,
      "What is 2 + 2?"
    );
    expect(msgResp.ok()).toBeTruthy();

    const body = await msgResp.text();
    const { subAgentEvents, fullContent } = parseSSEResponse(body);

    // Should not have any sub-agent events
    expect(subAgentEvents.length).toBe(0);
    expect(fullContent.length).toBeGreaterThan(0);

    await client.deleteThread(thread.id);
  });

  test("Sub-agent response references document content", async () => {
    const threadResp = await client.createThread("Sub-Agent Content Test");
    const thread = await threadResp.json();

    const msgResp = await client.sendMessage(
      thread.id,
      "What are the key milestones mentioned in the quantum computing guide?"
    );
    expect(msgResp.ok()).toBeTruthy();

    const body = await msgResp.text();
    const { fullContent } = parseSSEResponse(body);

    // Should reference specific content from the document
    const content = fullContent.toLowerCase();
    const hasFeynman = content.includes("feynman");
    const hasShor = content.includes("shor");
    const hasGoogle = content.includes("google");
    const hasQuantum = content.includes("quantum");

    // At least some of the key milestones should be mentioned
    expect(hasQuantum).toBeTruthy();
    expect(hasFeynman || hasShor || hasGoogle).toBeTruthy();

    await client.deleteThread(thread.id);
  });

  test("Stop button works during sub-agent execution", async () => {
    const threadResp = await client.createThread("Sub-Agent Stop Test");
    const thread = await threadResp.json();

    // Send a message that triggers sub-agent, then immediately stop
    const msgPromise = client.sendMessage(
      thread.id,
      "Provide an extremely detailed analysis of every section in the quantum computing guide"
    );

    // Give it a moment to start, then stop
    await new Promise((r) => setTimeout(r, 2000));
    await client.stopGeneration(thread.id);

    const msgResp = await msgPromise;
    expect(msgResp.ok()).toBeTruthy();

    const body = await msgResp.text();
    const { doneEvent } = parseSSEResponse(body);

    // Should have a done event (may or may not be stopped depending on timing)
    expect(doneEvent).not.toBeNull();

    await client.deleteThread(thread.id);
  });
});
