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
3. **Test** - Validate API endpoints with `curl` or similar HTTP tools
4. **Validate** - Test and verify the implementation works correctly using `agent-browser` for UI validation
5. **Iterate** - Fix any issues found during validation

## Testing & Validation (agent-browser)
- **Tool**: `agent-browser` CLI — a browser automation tool for AI agents (replaces Playwright)
- **Test credentials**: `test@example.com` / `password123`
- **Servers must be running** (`bin/dev`) before testing
- **Backend API**: `http://0.0.0.0:8000` | **Frontend**: `http://0.0.0.0:5173`

### How to validate with agent-browser
1. **Navigate**: `agent-browser open http://0.0.0.0:5173`
2. **Snapshot**: `agent-browser snapshot -i` (get interactive element refs like `@e1`, `@e2`)
3. **Interact**: Use refs to click, fill, select (e.g., `agent-browser fill @e1 "test@example.com"`)
4. **Re-snapshot**: After navigation or DOM changes, run `agent-browser snapshot -i` again for fresh refs
5. **Verify**: Use `agent-browser get text @e1`, `agent-browser get url`, `agent-browser screenshot` to check results

### Validation workflow
```bash
# Example: validate login flow
agent-browser open http://0.0.0.0:5173
agent-browser snapshot -i
agent-browser fill @e1 "test@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # Verify chat view loaded
agent-browser screenshot   # Capture for visual verification
```

### API testing
- Use `curl` or `agent-browser` network features to test API endpoints directly
- Example: `curl -s http://0.0.0.0:8000/health | jq .`

### CRITICAL: When building new features or making changes, you MUST:
1. Validate new API endpoints with curl/HTTP requests
2. Validate new UI features with `agent-browser` (open page, interact, verify state)
3. Take screenshots (`agent-browser screenshot`) to confirm visual correctness
4. Test both happy path and error scenarios
5. Never skip validation — always verify features work end-to-end before declaring complete

## Progress
Check PROGRESS.md for current module status. Update it as you complete tasks.
