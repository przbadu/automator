# Codebase Structure

**Analysis Date:** 2026-03-15

## Directory Layout

```
Automator/
├── backend/                    # Python FastAPI backend
│   ├── app/                   # Main application package
│   │   ├── main.py            # FastAPI app initialization, routers, lifespan
│   │   ├── config.py          # Settings (env vars, defaults)
│   │   ├── database.py        # SQLite + ChromaDB initialization
│   │   ├── models/            # Pydantic response/request models
│   │   ├── routers/           # API endpoint handlers
│   │   ├── services/          # Business logic (40+ services)
│   │   └── middleware/        # JWT auth, CORS
│   ├── migrations/            # SQL migration files (*.sql)
│   ├── uploads/               # User-uploaded files (user_id/doc_id/filename structure)
│   ├── pyproject.toml         # Python dependencies (uv)
│   ├── uv.lock                # Locked dependency versions
│   └── .env                   # Environment variables (gitignored)
│
├── frontend/                  # React + Vite + Tailwind frontend
│   ├── src/
│   │   ├── main.tsx           # React root entry point
│   │   ├── App.tsx            # Root component, auth guard, route switching
│   │   ├── components/        # React components
│   │   │   ├── auth/          # LoginForm, SignUpForm, AuthGuard
│   │   │   ├── chat/          # ChatLayout, MessageList, MessageInput, ThreadList
│   │   │   ├── documents/     # DocumentUpload, DocumentList, DocumentStatusBadge
│   │   │   ├── settings/      # SettingsPage, LLMConfigPanel, MetadataSchemaPanel
│   │   │   ├── layout/        # AppSidebar
│   │   │   └── ui/            # shadcn/ui components (Button, Card, Dialog, etc.)
│   │   ├── hooks/             # Custom React hooks
│   │   │   ├── useAuth.ts     # Login/signup/logout, token management
│   │   │   ├── useChat.ts     # Thread/message CRUD operations
│   │   │   ├── useDocuments.ts # Document list, upload, delete
│   │   │   ├── useLLMConfigs.ts # LLM config CRUD
│   │   │   ├── useSSE.ts      # Server-sent event subscription
│   │   │   └── useTheme.tsx   # Dark/light mode toggle, localStorage persistence
│   │   ├── lib/               # Utilities
│   │   │   ├── api.ts         # fetchWithAuth, token refresh, API URL
│   │   │   └── utils.ts       # Helper functions
│   │   ├── types/             # TypeScript interfaces
│   │   │   └── index.ts       # User, Thread, Message, Document, LLMConfig, etc.
│   │   ├── assets/            # Static images/icons
│   │   └── index.css          # Global Tailwind styles
│   ├── public/                # Static assets served directly
│   ├── vite.config.ts         # Vite bundler config
│   ├── tsconfig.json          # TypeScript config
│   ├── tailwind.config.js     # Tailwind CSS config
│   └── package.json           # Node dependencies
│
├── tests/                     # Playwright e2e test suite
│   └── e2e/
│       ├── api/               # API-level tests (health, auth, chat, documents)
│       ├── ui/                # Browser UI tests (forms, pages)
│       ├── llm/               # Tests requiring live LLM (streaming, RAG)
│       └── fixtures/          # Shared test helpers (ApiClient, cleanup)
│
├── bin/                       # Startup scripts
│   ├── dev                    # Runs uv sync + npm install, starts backend + Vite
│   └── prod                   # Runs uv sync + npm install, builds frontend, starts backend
│
├── .planning/                 # Planning and analysis documents
│   └── codebase/              # Codebase mapping outputs (ARCHITECTURE.md, STRUCTURE.md, etc.)
│
├── .agent/                    # GSD (Getting Shit Done) planning
│   └── plans/                 # Numbered plan documents
│
├── .claude/                   # Claude-specific state
│   └── projects/*/memory/     # Auto-persisted memory documents
│
├── .env.example               # Environment variable template (source control)
├── CLAUDE.md                  # Project instructions (overrides defaults)
├── PROGRESS.md                # Current module status tracker
├── PRD.md                     # Product requirements document
├── README.md                  # Quick start guide
└── playwright.config.ts       # Playwright test config

```

## Directory Purposes

**`backend/app/`:**
- Purpose: Core application logic
- Contains: FastAPI app, models, routers, services, middleware
- Key files: `main.py` (app setup), `config.py` (env var parsing), `database.py` (DB/Chroma init)

**`backend/app/models/`:**
- Purpose: Pydantic request/response schemas
- Contains: auth.py (SignUpRequest, LoginRequest), chat.py (ThreadCreate, MessageResponse), documents.py (DocumentResponse), llm_config.py, metadata_schema.py
- Pattern: Models are immutable dataclasses, used for validation + serialization

**`backend/app/routers/`:**
- Purpose: HTTP endpoint handlers, organized by domain
- Contains: auth.py, chat.py, documents.py, llm_configs.py, metadata_schemas.py, debug.py
- Pattern: Each router is a FastAPI APIRouter, imported and included in main.py

**`backend/app/services/`:**
- Purpose: Reusable business logic, async-first design
- Contains: 40+ services for chat, document processing, retrieval, LLM integration, tools
- Key services:
  - `ingestion_service.py` — document reading, chunking, embedding, ChromaDB upsert
  - `retrieval_service.py` — vector + keyword search, reciprocal rank fusion, reranking
  - `llm_service.py` — chat completion streaming, thread title generation
  - `sub_agent_service.py` — tool-calling agent loop for autonomous document analysis
  - `embedding_service.py` — wrapper around embedding API (OpenAI-compatible)
  - `query_service.py` — contextualizes user queries before retrieval
  - `intent_service.py` — classifies user intent (RAG vs. document-specific vs. tools)
  - `langfuse_service.py` — Langfuse tracing integration + wrapped OpenAI client
  - `anthropic_service.py` — Anthropic-specific streaming, title generation
  - `sub_agent_tools.py` — tool definitions and execution (read_document_chunks, search_within_document, execute_sql, web_search)
- Pattern: Services are stateless, dependency-injected, use @observe() decorators for tracing

**`backend/app/middleware/`:**
- Purpose: Cross-cutting concerns
- Contains: auth.py — JWT validation, token refresh, user extraction via FastAPI Depends()

**`backend/migrations/`:**
- Purpose: Database schema initialization
- Contains: 001_initial_schema.sql, 002_documents_schema.sql, 003_llm_configs_schema.sql, 004_metadata_schemas.sql
- Pattern: Sequential SQL files executed on app startup; migrations are idempotent (CREATE TABLE IF NOT EXISTS, ALTER TABLE error suppression)

**`backend/uploads/`:**
- Purpose: Local file storage for uploaded documents
- Structure: `uploads/{user_id}/{document_id}/{filename}`
- Pattern: Generated at upload time, deleted when document is deleted

**`frontend/src/components/`:**
- Purpose: React components organized by feature domain
- Subdirectories:
  - `auth/` — AuthGuard, LoginForm, SignUpForm
  - `chat/` — ChatLayout, MessageList, MessageInput, ThreadList, SourceCitations, StreamingMessage, SubAgentActivity
  - `documents/` — DocumentUpload, DocumentList, DocumentStatusBadge, DocumentsLayout
  - `settings/` — SettingsPage, LLMConfigForm, LLMConfigPanel, MetadataSchemaPanel
  - `layout/` — AppSidebar (navigation)
  - `ui/` — shadcn/ui primitives (Button, Card, Dialog, Input, etc.)
- Pattern: Each component is a functional component with hooks, no class components

**`frontend/src/hooks/`:**
- Purpose: Reusable stateful logic extracted from components
- Contains: useAuth (login/signup/logout), useChat (thread/message CRUD), useDocuments, useLLMConfigs, useMetadataSchema, useSSE (server-sent events), useTheme
- Pattern: Custom hooks abstract API calls + state management; components consume hooks

**`frontend/src/lib/`:**
- Purpose: Utility functions and API client
- `api.ts` — fetchWithAuth (token refresh, auth header injection), API_URL, token helpers
- `utils.ts` — General-purpose utilities

**`frontend/src/types/`:**
- Purpose: TypeScript type definitions
- `index.ts` — All shared types (User, Thread, Message, Document, LLMConfig, SourceCitation, etc.)
- Pattern: Single source of truth for frontend types; matches Pydantic models on backend

**`tests/e2e/fixtures/`:**
- Purpose: Shared test helpers, fixtures, setup/teardown
- Contains: ApiClient (REST call wrapper with auth), SSE event parser, cleanup utilities, login helper (uiLogin)
- Pattern: Imported and reused by tests; reduces boilerplate

**`tests/e2e/api/`:**
- Purpose: API-level tests (no browser, no LLM)
- Contains: health.spec.ts, auth.spec.ts, chat.spec.ts, documents.spec.ts, llm_configs.spec.ts
- Pattern: Uses ApiClient fixture, validates HTTP status + response structure

**`tests/e2e/ui/`:**
- Purpose: Browser UI tests via Playwright
- Contains: login.spec.ts, chat.spec.ts, settings.spec.ts
- Pattern: Uses page.goto, page.fill, page.click; validates DOM state

**`tests/e2e/llm/`:**
- Purpose: Tests requiring a live LLM endpoint
- Contains: streaming.spec.ts, auto_title.spec.ts, rag_retrieval.spec.ts
- Pattern: Skipped if LLM not available; validates chat response content + streamed format

## Key File Locations

**Entry Points:**
- `backend/app/main.py` — FastAPI app initialization, router registration, lifespan hooks
- `frontend/src/main.tsx` — React root render, ThemeProvider wrapper
- `frontend/src/App.tsx` — Auth guard, route switching (chat vs. settings)
- `bin/dev` — Development server launcher (uv sync + npm install + uvicorn + vite)
- `bin/prod` — Production launcher (uv sync + npm install + build + uvicorn + vite preview)

**Configuration:**
- `.env.example` — Template for required environment variables (API keys, URLs, ports)
- `.env` — Actual env vars (gitignored, created by user from .env.example)
- `backend/app/config.py` — Settings parsed from env vars using Pydantic
- `frontend/vite.config.ts` — Vite bundler config (dev/prod settings, aliases)
- `playwright.config.ts` — Test runner config (browsers, timeouts, API_URL)

**Core Logic:**
- `backend/app/routers/chat.py` — Chat endpoint (POST /threads/{id}/messages with SSE streaming)
- `backend/app/routers/documents.py` — Document upload, list, delete endpoints
- `backend/app/services/ingestion_service.py` — Document processing pipeline (read → chunk → embed → store)
- `backend/app/services/retrieval_service.py` — Hybrid search + reranking
- `backend/app/services/llm_service.py` — Chat completion streaming (OpenAI-compatible + Anthropic)
- `backend/app/services/sub_agent_service.py` — Autonomous tool-calling agent
- `frontend/src/components/chat/ChatLayout.tsx` — Main chat UI orchestrator
- `frontend/src/hooks/useChat.ts` — Thread/message state management
- `frontend/src/hooks/useSSE.ts` — Server-sent event subscription for streaming

**Testing:**
- `tests/e2e/fixtures/api-client.ts` — Reusable REST client with auth
- `tests/e2e/fixtures/cleanup.ts` — Database reset helpers
- `tests/e2e/api/chat.spec.ts` — Chat API tests
- `tests/e2e/ui/chat.spec.ts` — Chat UI tests
- `tests/e2e/llm/rag_retrieval.spec.ts` — RAG behavior tests

## Naming Conventions

**Files:**
- Python: `snake_case.py` (e.g., `llm_service.py`, `ingestion_service.py`)
- TypeScript: `camelCase.ts` or `PascalCase.tsx` for components (e.g., `ChatLayout.tsx`, `useAuth.ts`)
- SQL migrations: `NNN_snake_case.sql` where NNN is sequence number (e.g., `001_initial_schema.sql`)
- Test files: `*.spec.ts` (e.g., `chat.spec.ts`)

**Directories:**
- Python packages: `snake_case/` (e.g., `backend/app/services/`)
- React feature domains: `kebab-case/` (e.g., `components/chat/`, `hooks/`)
- Feature branches: `feature/kebab-case` (e.g., `feature/document-analysis`)

**Functions/Methods:**
- Python: `snake_case()` (e.g., `async def ingest_document()`, `def _vector_search()`)
- TypeScript: `camelCase()` (e.g., `async function useChat()`, `const fetchWithAuth = ()`)
- React hooks: `useCamelCase` (e.g., `useAuth`, `useChat`, `useSSE`)
- Private functions: Prefix with `_` (e.g., `_vector_search`, `_update_status`)

**Variables:**
- Python: `snake_case` (e.g., `current_user`, `chunk_count`)
- TypeScript: `camelCase` (e.g., `currentThread`, `streamingContent`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `ALLOWED_EXTENSIONS`, `API_URL`)

**Types:**
- Python: PascalCase for Pydantic models (e.g., `ThreadResponse`, `DocumentResponse`)
- TypeScript: PascalCase for interfaces/types (e.g., `User`, `Thread`, `Message`)

## Where to Add New Code

**New Feature (Chat-Related):**
- Route handler: `backend/app/routers/chat.py` (add endpoint function)
- Service logic: Create or extend service in `backend/app/services/` (e.g., `new_feature_service.py`)
- Model: Add Pydantic model to `backend/app/models/chat.py` if needed
- Frontend component: `frontend/src/components/chat/` (e.g., NewChatFeature.tsx)
- Frontend hook: `frontend/src/hooks/` if state logic is complex (e.g., useNewFeature.ts)
- Tests: `tests/e2e/api/chat.spec.ts` for API; `tests/e2e/ui/chat.spec.ts` for UI

**New Document Processing Step:**
- Service: `backend/app/services/` (create new service or extend ingestion_service.py)
- Status enum: Update Document model status field if new status needed
- Migration: Add SQL migration to `backend/migrations/` if new table columns required
- Tests: `tests/e2e/api/documents.spec.ts`

**New Settings Panel:**
- Component: `frontend/src/components/settings/NewSettingsPanel.tsx`
- Hook: `frontend/src/hooks/useNewSettings.ts` if CRUD operations needed
- Route: `backend/app/routers/new_settings.py` (e.g., new_settings.py)
- Model: `backend/app/models/new_settings.py`
- Tests: `tests/e2e/ui/settings.spec.ts`

**New Tool (for Sub-Agent):**
- Tool definition + execution: `backend/app/services/sub_agent_tools.py` (add to get_tool_definitions(), implement execute_tool() branch)
- Service: Create dedicated service if tool has complex logic (e.g., `web_search_tool.py`, `sql_tool.py`)
- Tests: `tests/e2e/llm/sub_agent.spec.ts`

**Utilities:**
- Shared helpers: `frontend/src/lib/utils.ts` (TypeScript utilities) or `backend/app/services/` (Python utilities)
- API-related: `frontend/src/lib/api.ts` (add fetch wrapper function)

## Special Directories

**`.planning/codebase/`:**
- Purpose: Codebase mapping outputs generated by `/gsd:map-codebase` command
- Generated: Yes (by GSD mapper)
- Committed: Yes
- Contents: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md

**`.agent/plans/`:**
- Purpose: Numbered implementation plans created before building features
- Generated: Yes (by `/gsd:plan-phase` command)
- Committed: Yes
- Naming: `{sequence}.{plan-name}.md` (e.g., `1.auth-setup.md`, `2.document-ingestion.md`)

**`.claude/projects/*/memory/`:**
- Purpose: Auto-persisted memory documents (user development environment, test credentials, project conventions)
- Generated: Yes (by Claude, auto-saved)
- Committed: No
- Contents: MEMORY.md and linked memory files

**`backend/uploads/`:**
- Purpose: Local filesystem storage for user-uploaded documents
- Generated: Yes (at upload time)
- Committed: No (in .gitignore)
- Structure: `uploads/{user_id}/{document_id}/{original_filename}`

**`frontend/dist/`:**
- Purpose: Build output from `npm run build`
- Generated: Yes (by Vite)
- Committed: No (in .gitignore)
- Contents: Bundled JS, CSS, HTML for production

**`node_modules/` and `backend/.venv/`:**
- Purpose: Installed dependencies
- Generated: Yes (by npm install / uv sync)
- Committed: No (in .gitignore)
- Installation: Run `bin/dev` or `bin/prod` to auto-install

---

*Structure analysis: 2026-03-15*
