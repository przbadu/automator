# CLAUDE.md

RAG app with chat (default) and document ingestion interfaces. Config via env vars, no admin UI.

## Stack
- Frontend: React + Vite + Tailwind + shadcn/ui
- Backend: Python + FastAPI
- Database: Supabase (Postgres, pgvector, Auth, Storage, Realtime)
- LLM: OpenAI (Module 1), OpenRouter (Module 2+)
- Observability: Langfuse (self-hosted at http://192.168.1.152:3000)

## Rules
- NEVER hardcode secrets, API keys, passwords, URLs, or personal info in code — all sensitive values go in `.env` (gitignored) and are referenced via env vars
- Python backend must use a `venv` virtual environment
- No LangChain, no LangGraph - raw SDK calls only
- Use Pydantic for structured LLM outputs
- All tables need Row-Level Security - users only see their own data
- Stream chat responses via SSE
- Use Supabase Realtime for ingestion status updates
- Module 2+ uses stateless completions - store and send chat history yourself
- Ingestion is manual file upload only - no connectors or automated pipelines

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
- **Dev:** `bin/dev` — installs deps (uv for Python, npm for frontend), starts backend with `--reload` and Vite dev server
- **Prod:** `bin/prod` — installs deps, builds frontend, starts backend with 4 workers and Vite preview server
- Both scripts require `.env` (copy from `.env.example`), `uv`, and `node` installed
- Backend: http://localhost:8000 | Frontend: http://localhost:5173 | Health: http://localhost:8000/health

## Development Flow
1. **Plan** - Create a detailed plan and save it to `.agent/plans/`
2. **Build** - Execute the plan to implement the feature
3. **Validate** - Test and verify the implementation works correctly. Use browser testing where applicable via an appropriate MCP
4. **Iterate** - Fix any issues found during validation

## Validation
- Use Playwright in **headless mode** to validate features after each module
- Test credentials: `test@example.com` / `password123` — create once during Module 1 validation, reuse for all future modules
- Servers must be running (`bin/dev`) before validation
- Backend API: `http://0.0.0.0:8000` | Frontend: `http://0.0.0.0:5173`
- Validate both UI flows (via Playwright browser automation) and API endpoints
- Each module's validation tasks are tracked in PROGRESS.md

## Progress
Check PROGRESS.md for current module status. Update it as you complete tasks.
