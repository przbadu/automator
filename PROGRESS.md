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
- [ ] Task 10: Validation — Backend starts, migration runs, llm_configs table exists
- [ ] Task 11: Validation — CRUD API works with encrypted keys
- [ ] Task 12: Validation — Settings UI accessible via gear icon, LLM configs and Documents tabs work
- [ ] Task 13: Validation — No regressions on existing chat/document features
