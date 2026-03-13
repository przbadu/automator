# CLAUDE.md

RAG app with chat (default) and document ingestion interfaces. Config via env vars, no admin UI.

## Stack
- Frontend: React + Vite + Tailwind + shadcn/ui
- Backend: Python + FastAPI
- Database: SQLite (via aiosqlite) — all data stays local
- Vector DB: ChromaDB (local, persistent) — runs in-process alongside SQLite
- Auth: JWT (bcrypt + JWT tokens)
- File Storage: Local filesystem (`uploads/` directory)
- LLM: Any OpenAI-compatible endpoint (local LLMs, OpenRouter, Ollama, LM Studio)
- Observability: Langfuse (self-hosted at http://192.168.1.152:3000)

## Rules
- NEVER hardcode secrets, API keys, passwords, URLs, or personal info in code — all sensitive values go in `.env` (gitignored) and are referenced via env vars
- Python backend uses `uv` with `pyproject.toml` + `uv.lock` — run `uv sync` in `backend/` to install deps
- No LangChain, no LangGraph - raw SDK calls only
- Use Pydantic for structured LLM outputs
- All data is user-scoped — users only see their own data (enforced via user_id filtering in queries and ChromaDB metadata filters)
- Stream chat responses via SSE
- Ingestion status updates via SSE (server-sent events)
- Module 2+ uses stateless completions - store and send chat history yourself
- Ingestion is manual file upload only - no connectors or automated pipelines

## Observability (Langfuse)
- **Every new backend service or pipeline step MUST have Langfuse tracing** — use `@observe(name="descriptive_name")` from `langfuse.decorators`
- Use `langfuse_context.update_current_observation(metadata={...})` to attach structured metrics (counts, scores, config values)
- For any new OpenAI-compatible API call (embeddings, completions), use the Langfuse-wrapped client from `langfuse_service.py` — NOT raw `openai.AsyncOpenAI`
- Anthropic calls are NOT auto-traced by Langfuse — add manual `@observe()` spans
- Keep metadata lightweight: counts, scores, model names, config — never log full embedding vectors or large chunk texts
- Traces should nest naturally: parent `@observe` functions automatically contain child `@observe` calls
- See `backend/app/services/langfuse_service.py` for the Langfuse client and wrapped OpenAI client

## Planning
- Save all plans to `.agent/plans/` folder
- Naming convention: `{sequence}.{plan-name}.md` (e.g., `1.auth-setup.md`, `2.document-ingestion.md`)
- Plans should be detailed enough to execute without ambiguity
- Each task in the plan must include at least one validation test to verify it works
- Assess complexity and single-pass feasibility - can an agent realistically complete this in one go?
- Include a complexity indicator at the top of each plan:
  - ✅ **Simple** - Single-pass executable, low risk
  - ⚠️ **Medium** - May need iteration, some complexity
  - 🔴 **Complex** - Break into sub-plans before executing

## Running the App
- **Dev:** `bin/dev` — runs `uv sync` + `npm install`, starts backend with `--reload` and Vite dev server
- **Prod:** `bin/prod` — runs `uv sync` + `npm install`, builds frontend, starts backend with 4 workers and Vite preview server
- Both scripts require `.env` (copy from `.env.example`), `uv`, and `node` installed
- **Adding Python deps:** `cd backend && uv add <package>` — this updates `pyproject.toml` and `uv.lock` automatically
- Backend: http://localhost:8000 | Frontend: http://localhost:5173 | Health: http://localhost:8000/health

## Development Flow
1. **Plan** - Create a detailed plan and save it to `.agent/plans/`
2. **Build** - Execute the plan to implement the feature
3. **Test** - Run the regression suite and fix any failures: `npm test`
4. **Validate** - Test and verify the implementation works correctly. Use browser testing where applicable via an appropriate MCP
5. **Iterate** - Fix any issues found during validation

## Testing
- **Regression suite**: `tests/e2e/` with 69 Playwright tests across 3 tiers
- **Run commands**:
  - `npm test` — run all tests (API + UI + LLM)
  - `npm run test:fast` — API + UI tests only (no LLM needed, ~15s)
  - `npm run test:api` — API tests only (~3s)
  - `npm run test:ui` — UI tests only (~12s)
  - `npm run test:llm` — LLM-dependent tests only (~2min)
- **Structure**:
  - `tests/e2e/fixtures/` — shared helpers (auth, api-client, SSE parser, cleanup)
  - `tests/e2e/api/` — API-level tests (health, auth, threads, messages, documents, llm-configs)
  - `tests/e2e/ui/` — browser UI tests (auth forms, chat layout, settings page)
  - `tests/e2e/llm/` — tests requiring a live LLM (streaming, auto-title, RAG retrieval)
- **Test credentials**: `test@example.com` / `password123`
- **Servers must be running** (`bin/dev`) before running tests
- **CRITICAL: When building new features or making changes, you MUST**:
  1. Add new tests covering the feature (API tests for new endpoints, UI tests for new pages/components)
  2. Run `npm run test:fast` to verify no regressions before considering the feature complete
  3. If the feature involves LLM behavior, add tests in `tests/e2e/llm/` and run `npm test`
  4. Never merge or commit code that causes existing tests to fail — fix the tests or the code
  5. Use the shared fixtures in `tests/e2e/fixtures/` (ApiClient, uiLogin, cleanup helpers) — don't duplicate patterns

## Validation
- Use Playwright in **headless mode** to validate features after each module
- Backend API: `http://0.0.0.0:8000` | Frontend: `http://0.0.0.0:5173`
- Validate both UI flows (via Playwright browser automation) and API endpoints
- Each module's validation tasks are tracked in PROGRESS.md

## Progress
Check PROGRESS.md for current module status. Update it as you complete tasks.
