# Progress

Track your progress through the masterclass. Update this file as you complete modules - Claude Code reads this to understand where you are in the project.

## Convention
- `[ ]` = Not started
- `[-]` = In progress
- `[x]` = Completed

## Modules

### Module 1: App Shell + Observability
- [x] Task 1: Backend Scaffolding (FastAPI, config, health check, CORS, uv venv)
- [x] Task 2: Frontend Scaffolding (Vite + React + TS + Tailwind + shadcn/ui)
- [x] Task 3: Database Schema (SQLite migration — users, threads, messages)
- [x] Task 4: Auth (JWT signup/login/refresh/me + frontend forms + AuthGuard)
- [x] Task 5: LangSmith Observability (wrap_openai setup)
- [x] Task 6: Chat Completions API + SSE Streaming (thread CRUD + message streaming)
- [x] Task 7: Chat UI (ChatLayout, ThreadList, MessageList, MessageInput, streaming)
- [x] Task 8: Validation — Health endpoint responds with `{"status": "ok"}`
- [x] Task 9: Validation — Signup flow creates test user (test@example.com / password123)
- [x] Task 10: Validation — Login flow with test credentials
- [x] Task 11: Validation — Chat thread creation and listing
- [x] Task 12: Validation — Message sending with SSE streaming

### UI Improvements
- [x] Task 1: Loading indicator while waiting for LLM/server response
- [x] Task 2: Auto-generate chat title from user's first message (instead of "New Chat")
- [x] Task 3: Fixed layout — sidebar, header, footer pinned; only messages scroll
- [x] Task 4: Auto-scroll to bottom on long chats
- [x] Task 5: Validation — Loading indicator appears while waiting for response
- [x] Task 6: Validation — Chat title auto-generated from first message
- [x] Task 7: Validation — Layout is fixed, only messages scroll
- [x] Task 8: Validation — Chat auto-scrolls to bottom
- [x] Task 9: Stop generation button — abort SSE stream and save partial response
- [x] Task 10: Validation — Stop button appears during streaming, aborts and saves partial content

### Module 2: Document Ingestion & BYO Retrieval
- [x] Task 1: Dependencies and Configuration (chromadb, tiktoken, python-multipart, config settings)
- [x] Task 2: Database Schema Extension (Migration 002 — documents table)
- [x] Task 3: ChromaDB Initialization (persistent client, document_chunks collection)
- [x] Task 4: File Upload Storage and Document API (CRUD endpoints, storage service)
- [x] Task 5: Chunking Service (recursive text splitting with token-based sizing)
- [x] Task 6: Embedding Service (OpenAI-compatible async embeddings)
- [x] Task 7: Ingestion Pipeline Service (background task: read → chunk → embed → store)
- [x] Task 8: Retrieval Service (query embedding + ChromaDB similarity search)
- [x] Task 9: Integrate Retrieval into Chat (RAG context injection via system prompt)
- [x] Task 10: Ingestion Status SSE Endpoint (real-time status updates)
- [x] Task 11: Ingestion UI — Frontend (view toggle, upload, document list, status badges)
- [x] Task 12: End-to-End Validation (6/6 Playwright tests passing)

### Module 2.1: Settings Page with LLM Configurations
- [x] Task 1: Database migration (003_llm_configs_schema.sql)
- [x] Task 2: Encryption service + config update (cryptography Fernet, auto-gen key)
- [x] Task 3: Pydantic models for LLM configs (create/update/response, provider map)
- [x] Task 4: CRUD router for /llm-configs (list, create, update, delete, default)
- [x] Task 5: Provider-aware LLM client (Anthropic service, modify llm_service, chat router)
- [x] Task 6: Frontend types & hook (LLMConfig types, useLLMConfigs hook)
- [x] Task 7: Add shadcn components (select, label, switch)
- [x] Task 8: Settings page & LLM config UI (SettingsPage, LLMConfigPanel, LLMConfigForm)
- [x] Task 9: Restructure navigation (remove tab bar, add gear icon in sidebar)
- [x] Task 10: Validation — Backend starts, migration runs, llm_configs table exists
- [x] Task 11: Validation — CRUD API works with encrypted keys
- [x] Task 12: Validation — Settings UI accessible via gear icon, LLM configs and Documents tabs work
- [x] Task 13: Validation — No regressions on existing chat/document features

### Regression Test Suite
- [x] Task 1: Shared fixtures (test-data, auth, api-client, SSE parser, cleanup)
- [x] Task 2: API tests — health, auth, threads, messages, documents, llm-configs (41 tests)
- [x] Task 3: UI tests — auth forms, chat layout, settings page (20 tests)
- [x] Task 4: LLM tests — streaming, auto-title, RAG retrieval (8 tests)
- [x] Task 5: Playwright config with 3 projects (api, ui, llm)
- [x] Task 6: npm test scripts (test, test:fast, test:api, test:ui, test:llm)
- [x] Task 7: CLAUDE.md updated with testing instructions for future agents
- [x] Full suite: 69/69 passing

### Module 6: Hybrid Search & Reranking
- [x] Task 1: Add `rank-bm25` dependency
- [x] Task 2: Configuration settings (hybrid search + reranker)
- [x] Task 3: BM25 keyword search service with per-user cache
- [x] Task 4: Reciprocal Rank Fusion (RRF) merging
- [x] Task 5: Cross-encoder reranker service (optional, via API)
- [x] Task 6: Refactor retrieval service as hybrid orchestrator
- [x] Task 7: Cache invalidation hooks (ingestion + deletion)
- [x] Task 8: Update `.env.example` with new config vars
- [x] Task 9: Hybrid search LLM integration tests (3 tests)
- [x] Task 10: Update PROGRESS.md
- [x] Regression suite: 89/89 passing (no regressions)

### Module 6.1: Langfuse Retrieval Pipeline Observability
- [x] Task 1: Add Langfuse client + embedding client wrapper to `langfuse_service.py`
- [x] Task 2: Wrap embedding service with `@observe` + Langfuse-wrapped client
- [x] Task 3: Trace vector search with `@observe` + metadata (result count, distances, collection size)
- [x] Task 4: Trace BM25 keyword search with `@observe` + metadata (cache hit, corpus size, scores)
- [x] Task 5: Trace RRF fusion with `@observe` + metadata (input/output counts, overlap, scores)
- [x] Task 6: Trace reranker with `@observe` + metadata (model, scores, counts)
- [x] Task 7: Trace full retrieval pipeline orchestrator with `@observe` (parent span)
- [x] Task 8: Add trace context to chat router (top-level `chat_message` span)
- [x] Task 9: Add `/debug/retrieval-config` endpoint
- [x] Task 10: Tests for debug endpoint (4 tests)
- [x] Task 11: Updated PROGRESS.md, all imports verified

### Module 7: Conversation-Aware RAG & Source Citations
- [x] Task 1: Query contextualization service (`query_service.py`)
- [x] Task 2: Relevance threshold configuration (`retrieval_relevance_threshold`)
- [x] Task 3: Relevance filtering in retrieval service + `relevance_score` field
- [x] Task 4: Store citations in message metadata + SSE `sources` event
- [x] Task 5: Wire query contextualization into chat router
- [x] Task 6: Update message model (`SourceCitation`, `MessageMetadata`)
- [x] Task 7: Frontend types update (`SourceCitation`, `MessageMetadata`, `Message`)
- [x] Task 8: SSE handler — parse `sources` event in `useSSE`
- [x] Task 9: Citations UI component (`SourceCitations.tsx`) — collapsible panel
- [x] Task 10: Integrate citations into `MessageBubble`, `MessageList`, `StreamingMessage`
- [x] Task 11: SSE parser fixture updated for `sourcesEvent`
- [x] Task 12: LLM tests — SSE sources event, historical sources, contextualized follow-ups (3 tests)
- [x] Task 13: Update PROGRESS.md
- [x] Regression suite: 97/97 pass (API + UI)

### Module 8: Sub-Agents
- [x] Task 1: Configuration — `sub_agent_enabled`, `sub_agent_max_iterations`, `sub_agent_max_chunks_per_read`
- [x] Task 2: Sub-Agent Tool Definitions — `read_document_chunks`, `search_within_document`, `get_document_info`
- [x] Task 3: Intent Classification Service — LLM-based routing to sub-agent or normal RAG
- [x] Task 4: Sub-Agent Service — Tool-calling loop with OpenAI + Anthropic + fallback paths
- [x] Task 5: Integrate Sub-Agent into Chat Router — intent gate + sub-agent branch in SSE generator
- [x] Task 6: Frontend Types & SSE Handler — `SubAgentActivity`, new SSE event types
- [x] Task 7: Sub-Agent Activity UI Component — collapsible panel with tool call visualization
- [x] Task 8: Integrate Sub-Agent Activity into Chat Components — ChatLayout, MessageList, StreamingMessage, MessageBubble
- [x] Task 9: Langfuse Observability — `@observe()` on all new services and tools
- [x] Task 10: Tests — LLM tests (5) + UI tests (2) + SSE fixture extension
- [x] Task 11: Update PROGRESS.md & Regression — 97/97 fast tests pass
