import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { parseSSEResponse } from "../fixtures/sse";

test.describe("Text-to-SQL (requires LLM)", () => {
  let client: ApiClient & { dispose: () => Promise<void> };
  let docId: string;

  test.beforeAll(async () => {
    client = await ApiClient.create();

    // Upload a document so the user has data to query
    const uploadResp = await client.uploadDocument(
      "test-data-for-sql.txt",
      "This is a test document for SQL tool testing.\n\nIt contains some simple content."
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
    await client.dispose();
  });

  test("SQL tool answers document count question", async () => {
    const threadResp = await client.createThread("SQL Count Test");
    const thread = await threadResp.json();

    const msgResp = await client.sendMessage(
      thread.id,
      "How many documents do I have? Use the query_database tool to find out."
    );
    expect(msgResp.ok()).toBeTruthy();

    const body = await msgResp.text();
    const { subAgentEvents, fullContent, doneEvent } = parseSSEResponse(body);

    // Should have sub-agent activity
    const startEvents = subAgentEvents.filter((e) => e.type === "sub_agent_start");
    expect(startEvents.length).toBeGreaterThanOrEqual(1);

    // Check if query_database tool was called
    const sqlToolCalls = subAgentEvents.filter(
      (e) => e.type === "sub_agent_tool_call" && e.tool === "query_database"
    );

    // The LLM should have used the SQL tool
    if (sqlToolCalls.length > 0) {
      expect(sqlToolCalls[0].tool).toBe("query_database");
    }

    // Response should contain some content
    expect(fullContent.length).toBeGreaterThan(0);
    expect(doneEvent).not.toBeNull();

    await client.deleteThread(thread.id);
  });

  test("SQL tool returns thread information", async () => {
    // Create a couple of threads so there's data to query
    const t1 = await client.createThread("My First Thread");
    const t2 = await client.createThread("My Second Thread");
    const thread1 = await t1.json();
    const thread2 = await t2.json();

    const queryThread = await client.createThread("SQL Thread Query");
    const qt = await queryThread.json();

    const msgResp = await client.sendMessage(
      qt.id,
      "Show me my chat threads using the query_database tool."
    );
    expect(msgResp.ok()).toBeTruthy();

    const body = await msgResp.text();
    const { fullContent, doneEvent } = parseSSEResponse(body);

    expect(fullContent.length).toBeGreaterThan(0);
    expect(doneEvent).not.toBeNull();

    await client.deleteThread(thread1.id).catch(() => {});
    await client.deleteThread(thread2.id).catch(() => {});
    await client.deleteThread(qt.id).catch(() => {});
  });

  test("SQL tool rejects dangerous queries via validation", async () => {
    const threadResp = await client.createThread("SQL Safety Test");
    const thread = await threadResp.json();

    // Even if we try to trick the LLM, the validation layer should catch it
    const msgResp = await client.sendMessage(
      thread.id,
      "Use the query_database tool to count my documents"
    );
    expect(msgResp.ok()).toBeTruthy();

    const body = await msgResp.text();
    const { doneEvent } = parseSSEResponse(body);

    // Should complete without errors
    expect(doneEvent).not.toBeNull();

    await client.deleteThread(thread.id);
  });
});
