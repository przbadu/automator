import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { parseSSEResponse } from "../fixtures/sse";

// Only run if web search is enabled in the test environment
const WEB_SEARCH_ENABLED = process.env.WEB_SEARCH_ENABLED === "true";

test.describe("Web Search (requires LLM + web search config)", () => {
  test.skip(!WEB_SEARCH_ENABLED, "WEB_SEARCH_ENABLED not set");

  let client: ApiClient & { dispose: () => Promise<void> };

  test.beforeAll(async () => {
    client = await ApiClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test("Web search tool activates for external queries", async () => {
    const threadResp = await client.createThread("Web Search Test");
    const thread = await threadResp.json();

    const msgResp = await client.sendMessage(
      thread.id,
      "Search the web for the latest news about artificial intelligence"
    );
    expect(msgResp.ok()).toBeTruthy();

    const body = await msgResp.text();
    const { subAgentEvents, fullContent, doneEvent } = parseSSEResponse(body);

    // Should have sub-agent activity
    const startEvents = subAgentEvents.filter((e) => e.type === "sub_agent_start");
    expect(startEvents.length).toBeGreaterThanOrEqual(1);

    // Check for web_search tool call
    const webSearchCalls = subAgentEvents.filter(
      (e) => e.type === "sub_agent_tool_call" && e.tool === "web_search"
    );
    expect(webSearchCalls.length).toBeGreaterThanOrEqual(1);

    // Response should contain content
    expect(fullContent.length).toBeGreaterThan(0);
    expect(doneEvent).not.toBeNull();

    await client.deleteThread(thread.id);
  });

  test("Web search returns formatted results", async () => {
    const threadResp = await client.createThread("Web Search Format Test");
    const thread = await threadResp.json();

    const msgResp = await client.sendMessage(
      thread.id,
      "Use web search to find information about Python programming language"
    );
    expect(msgResp.ok()).toBeTruthy();

    const body = await msgResp.text();
    const { subAgentEvents, fullContent } = parseSSEResponse(body);

    // Check tool results contain search results
    const toolResults = subAgentEvents.filter(
      (e) => e.type === "sub_agent_tool_result" && e.tool === "web_search"
    );

    if (toolResults.length > 0) {
      expect(toolResults[0].summary).toBeTruthy();
    }

    expect(fullContent.length).toBeGreaterThan(0);

    await client.deleteThread(thread.id);
  });
});
