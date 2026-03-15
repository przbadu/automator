# External Integrations

**Analysis Date:** 2026-03-15

## APIs & External Services

**LLM Providers:**
- OpenAI-compatible endpoint (local LLMs, Ollama, LM Studio, OpenRouter, etc.)
  - SDK/Client: `openai.AsyncOpenAI` from `backend/app/services/langfuse_service.py`
  - Config: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`
  - Purpose: Chat completions, structured outputs via Pydantic
  - Auto-traced by Langfuse when using wrapped client

- Anthropic API (Claude models)
  - SDK/Client: `anthropic.AsyncAnthropic` from `backend/app/services/anthropic_service.py`
  - Config: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
  - Purpose: Alternative LLM provider for streaming completions
  - NOT auto-traced — requires manual `@observe()` spans per CLAUDE.md

**Embeddings:**
- OpenAI-compatible embedding API (Ollama, LM Studio, etc.)
  - SDK/Client: Langfuse-wrapped `AsyncOpenAI` from `backend/app/services/embedding_service.py`
  - Config: `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`
  - Default: `nomic-embed-text` from Ollama
  - Optional: `EMBEDDING_DIMENSIONS` to truncate output
  - Traced: `@observe(name="generate_embeddings")` in `backend/app/services/embedding_service.py`

**Reranker (Optional Cross-Encoder):**
- Cross-encoder API (vLLM, Jina, Cohere, TEI compatible)
  - Client: `httpx.AsyncClient` from `backend/app/services/reranker_service.py`
  - Config: `RERANKER_BASE_URL`, `RERANKER_MODEL`, `RERANKER_TOP_N`
  - Purpose: Re-rank retrieval results by relevance
  - Endpoint: `{RERANKER_BASE_URL}/rerank`
  - Traced: `@observe(name="cross_encoder_rerank")` in `backend/app/services/reranker_service.py`
  - Graceful fallback: Returns None if disabled

**Web Search (Optional):**
- Multiple providers supported (SearXNG, Tavily, Brave, Exa)
  - Client: `httpx.AsyncClient` for HTTP requests
  - Provider selection: `WEB_SEARCH_PROVIDER` (searxng | tavily | brave | exa)
  - Config: `WEB_SEARCH_URL` (for SearXNG), `WEB_SEARCH_API_KEY` (for Tavily/Brave/Exa)
  - Purpose: Fallback search when document context lacks answer
  - Max results: `WEB_SEARCH_MAX_RESULTS` (default 5)
  - Traced: `@observe(name="web_search")` in `backend/app/services/web_search_tool.py`

## Data Storage

**Databases:**
- SQLite (via `aiosqlite`)
  - Connection: `DATABASE_URL=sqlite:///./automator.db` (local file)
  - Client: `aiosqlite.connect()` from `backend/app/database.py`
  - Purpose: User accounts, authentication, threads, messages, document metadata
  - Features: Foreign keys, WAL mode enabled

**Vector Database:**
- ChromaDB (local, in-process, persistent)
  - Connection: `chromadb.PersistentClient(path=CHROMA_DIR)` from `backend/app/database.py`
  - Storage: `CHROMA_DIR=./chroma_data` (filesystem-persisted)
  - Collection: `document_chunks` (vector embeddings + metadata)
  - Vector space: cosine similarity
  - Purpose: Fast vector similarity search for RAG

**File Storage:**
- Local filesystem only
  - Directory: `UPLOAD_DIR=./uploads`
  - Purpose: User-uploaded documents (PDF, Word, etc.)
  - Max size: `MAX_UPLOAD_SIZE_MB` (default 50)

**Caching:**
- None detected — all queries fetch from SQLite/ChromaDB directly

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based (no external auth service)

**Implementation:**
- Password hashing: `bcrypt` (5.0.0+)
- Token generation: `PyJWT` (2.12.0+)
- Functions: `backend/app/services/auth_service.py`
  - `hash_password(password: str) -> str`
  - `verify_password(password: str, password_hash: str) -> bool`
  - `create_access_token(user_id: str) -> str`
  - `create_refresh_token(user_id: str) -> str`
  - `decode_token(token: str) -> dict`

**JWT Configuration:**
- `JWT_SECRET` - Secret key for signing (from `.env`)
- `JWT_ALGORITHM` - Default: `HS256`
- `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` - Default: 30
- `JWT_REFRESH_TOKEN_EXPIRE_DAYS` - Default: 7

**Token Storage (Frontend):**
- `localStorage` - `access_token`, `refresh_token`
- Auto-refresh on 401 responses via `fetchWithAuth()` in `frontend/src/lib/api.ts`

## Monitoring & Observability

**Error Tracking & Tracing:**
- Langfuse (self-hosted)
  - Instance: `http://192.168.1.152:3000`
  - Config: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`
  - Client: `Langfuse` from `langfuse` package
  - Location: `backend/app/services/langfuse_service.py`

**Integration Pattern:**
- OpenAI-compatible clients auto-traced via `from langfuse.openai import AsyncOpenAI`
- Manual tracing: `@observe(name="function_name")` from `langfuse.decorators`
- Context updates: `langfuse_context.update_current_observation(metadata={...})`
- Metadata tracking: counts, scores, model names, config values (never full vectors)

**Traced Functions (Examples):**
- `backend/app/services/embedding_service.py:generate_embeddings()`
- `backend/app/services/reranker_service.py:rerank()`
- `backend/app/services/web_search_tool.py:web_search()`

**Logs:**
- Python logging (console) — no external log aggregation

## CI/CD & Deployment

**Hosting:**
- Self-hosted (no cloud integration detected)
- Backend: Python/Uvicorn (4 workers in production)
- Frontend: React/Vite (static build + preview server)

**CI Pipeline:**
- None detected (no GitHub Actions, GitLab CI, etc.)

## Environment Configuration

**Required env vars for operation:**

**Foundational:**
- `JWT_SECRET` - Secret for JWT signing (generate: `openssl rand -hex 32`)
- `BACKEND_PORT` - Backend listen port (default: 8000)
- `FRONTEND_URL` - Frontend URL for CORS (default: `http://0.0.0.0:5173`)

**LLM & Embeddings:**
- `LLM_BASE_URL` - OpenAI-compatible endpoint URL
- `LLM_API_KEY` - API key for LLM provider
- `LLM_MODEL` - Model identifier (e.g., `gpt-4.1`)
- `EMBEDDING_BASE_URL` - OpenAI-compatible embedding endpoint (default: `http://localhost:11434/v1`)
- `EMBEDDING_API_KEY` - Embedding API key
- `EMBEDDING_MODEL` - Embedding model (default: `nomic-embed-text`)

**Langfuse (Optional):**
- `LANGFUSE_PUBLIC_KEY` - Langfuse public key
- `LANGFUSE_SECRET_KEY` - Langfuse secret key
- `LANGFUSE_HOST` - Langfuse instance URL (default: `http://192.168.1.152:3000`)

**Reranker (Optional):**
- `RERANKER_BASE_URL` - Cross-encoder API URL
- `RERANKER_MODEL` - Reranker model name

**Web Search (Optional):**
- `WEB_SEARCH_ENABLED` - Enable web search (default: false)
- `WEB_SEARCH_PROVIDER` - Provider: `searxng | tavily | brave | exa`
- `WEB_SEARCH_URL` - SearXNG instance URL (for searxng provider)
- `WEB_SEARCH_API_KEY` - API key (for tavily, brave, exa)

**Document Processing:**
- `CHUNK_SIZE` - Text chunk size for embeddings (default: 512)
- `CHUNK_OVERLAP` - Overlap between chunks (default: 50)
- `UPLOAD_DIR` - Upload directory (default: `./uploads`)
- `CHROMA_DIR` - ChromaDB storage (default: `./chroma_data`)
- `MAX_UPLOAD_SIZE_MB` - Max upload size (default: 50)

**Retrieval & Search:**
- `HYBRID_SEARCH_ENABLED` - Use BM25 + vector fusion (default: true)
- `RRF_K` - RRF parameter for fusion (default: 60)
- `RETRIEVAL_CANDIDATE_K` - Candidates before fusion (default: 20)
- `FINAL_TOP_K` - Final results returned (default: 5)
- `RETRIEVAL_RELEVANCE_THRESHOLD` - Vector similarity threshold (default: 0.0 = disabled)

**Sub-Agent (Optional):**
- `SUB_AGENT_ENABLED` - Enable autonomous document analysis (default: true)
- `SUB_AGENT_MAX_ITERATIONS` - Max planning iterations (default: 5)
- `SUB_AGENT_MAX_CHUNKS_PER_READ` - Max chunks per document read (default: 20)

**Text-to-SQL (Optional):**
- `TEXT_TO_SQL_ENABLED` - Enable SQL generation (default: true)
- `TEXT_TO_SQL_MAX_ROWS` - Max rows returned (default: 50)
- `TEXT_TO_SQL_TIMEOUT_SECONDS` - Query timeout (default: 5)

**Encryption:**
- `ENCRYPTION_KEY` - Encryption key for sensitive data (auto-generated on first startup if empty)

**Secrets Location:**
- `.env` file (project root, gitignored)
- Copy from `.env.example` to start
- All values read via `pydantic-settings` in `backend/app/config.py`

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

## API Communication Patterns

**Backend → Frontend:**
- REST endpoints (FastAPI)
- Server-sent events (SSE) for streaming via `sse-starlette`
  - Chat message streaming: `POST /threads/{threadId}/messages` → SSE stream
  - Document ingestion status: SSE streams for upload/processing progress

**Frontend → Backend:**
- Fetch API (no axios) via `fetchWithAuth()` in `frontend/src/lib/api.ts`
- JWT Bearer tokens in Authorization header
- Automatic token refresh on 401 (via `refreshTokens()`)

**Data Format:**
- JSON request/response bodies
- SSE event format: `data: {json}`

## Routers & Endpoints

**Backend routers (from `backend/app/main.py`):**
- `backend/app/routers/auth.py` - Authentication
- `backend/app/routers/chat.py` - Chat threads and messages (streaming via SSE)
- `backend/app/routers/documents.py` - Document upload, ingestion, retrieval
- `backend/app/routers/llm_configs.py` - LLM configuration management
- `backend/app/routers/metadata_schemas.py` - Metadata schema CRUD
- `backend/app/routers/debug.py` - Debug endpoints

**CORS Configuration:**
- Regex: `https?://.*` (allows any HTTP/HTTPS origin)
- Credentials: enabled
- Methods: all
- Headers: all

---

*Integration audit: 2026-03-15*
