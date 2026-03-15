---
status: testing
phase: 04-agent-integration
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md]
started: 2026-03-15T11:15:00Z
updated: 2026-03-15T11:15:00Z
---

## Current Test

number: 1
name: KB Tool Definitions Load
expected: |
  The system registers 7 KB tools (kb_ls, kb_tree, kb_grep, kb_glob, kb_read, kb_semantic_search, analyze_document) in both OpenAI and Anthropic formats. You can verify by checking that `get_tool_definitions(include_kb_tools=True)` returns all 7 KB tools alongside existing tools.
awaiting: user response

## Tests

### 1. KB Tool Definitions Load
expected: The system registers 7 KB tools (kb_ls, kb_tree, kb_grep, kb_glob, kb_read, kb_semantic_search, analyze_document) in both OpenAI and Anthropic formats. Calling `get_tool_definitions(include_kb_tools=True)` returns all 7 KB tools.
result: [pending]

### 2. Intent Classification Routes KB Queries
expected: When a user asks a KB exploration question like "what documents do I have?" or "search my knowledge base for X", the intent classifier returns `needs_explorer: true`. Fast-path regex patterns match common browse/search/explore phrases without needing an LLM call.
result: [pending]

### 3. Explorer Sub-Agent Receives KB Queries
expected: When the chat router receives a message with `needs_explorer=true` from intent classification, it routes to `run_sub_agent` with `mode="explorer"` instead of the default mode. The explorer uses its dedicated system prompt and gets `explorer_max_iterations=8`.
result: [pending]

### 4. Explorer Chains KB Tools
expected: When you ask a KB exploration question in the chat (e.g., "what's in my knowledge base?" or "find documents about X"), the explorer sub-agent makes multiple tool calls (e.g., kb_ls to list, then kb_read to examine) and returns a coherent answer about your KB contents. The response streams via SSE.
result: [pending]

### 5. analyze_document Delegation
expected: When the explorer encounters a document that needs deeper analysis, it can call the analyze_document tool which delegates to the existing document analysis sub-agent. The result is collected synchronously (up to 4000 chars) and returned to the explorer for synthesis.
result: [pending]

### 6. Synthesized Natural Language Response
expected: The explorer's final response is a clear, natural language synthesis of findings — not raw tool output or JSON dumps. The system prompt explicitly instructs the LLM to synthesize findings into readable prose.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0

## Gaps

[none yet]
