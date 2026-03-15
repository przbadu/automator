---
phase: 4
slug: agent-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | curl (API) + agent-browser (UI) |
| **Config file** | none — project uses manual validation |
| **Quick run command** | `curl -s http://0.0.0.0:8000/health \| jq .` |
| **Full suite command** | Manual validation via curl + agent-browser |
| **Estimated runtime** | ~60 seconds (manual flow) |

---

## Sampling Rate

- **After every task commit:** Manual curl validation of affected endpoint
- **After every plan wave:** Full flow validation with agent-browser
- **Before `/gsd:verify-work`:** All 5 requirements validated end-to-end
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | TOOL-09 | integration | `curl -X POST http://0.0.0.0:8000/threads/{id}/messages -H "Authorization: Bearer {token}" -d '{"content":"what documents do I have?"}'` — verify SSE contains kb tool calls | N/A - curl | ⬜ pending |
| 04-01-02 | 01 | 1 | AGENT-01 | integration | Send multi-tool query, verify tool_call events in SSE stream | N/A - curl | ⬜ pending |
| 04-02-01 | 02 | 2 | AGENT-02 | integration | Send deep analysis query, verify analyze_document tool call in SSE | N/A - curl | ⬜ pending |
| 04-02-02 | 02 | 2 | AGENT-03 | integration | Send exploration query, verify final response is natural language | N/A - curl | ⬜ pending |
| 04-02-03 | 02 | 2 | AGENT-04 | integration | Test both autonomous routing and explicit exploration request | N/A - curl | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* No new test framework needed — project uses curl + agent-browser per convention.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM auto-selects KB tool | TOOL-09 | Requires LLM inference + SSE inspection | Send chat message about documents, inspect SSE events for kb_* tool calls |
| Explorer chains tools | AGENT-01 | Multi-step agent behavior | Send question requiring tree→grep→read, verify tool chain in SSE events |
| Explorer delegates to doc analysis | AGENT-02 | Sub-agent delegation | Ask deep question about specific doc found by explorer, verify analyze_document call |
| Explorer synthesizes findings | AGENT-03 | Natural language quality | Send exploration query, verify response is coherent summary not raw JSON |
| Explorer spawned autonomously | AGENT-04 | Intent routing | Test "search my docs for X" vs explicit "explore my knowledge base" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
