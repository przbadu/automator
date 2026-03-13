# Automator

A self-hosted RAG (Retrieval-Augmented Generation) application with a chat interface and document ingestion pipeline. All data stays local — SQLite for storage, ChromaDB for vector search, and local filesystem for uploaded files.

## Feature Roadmap

### Core Platform
- [x] JWT authentication (signup, login, refresh tokens)
- [x] Threaded chat with SSE streaming
- [x] Auto-generated chat titles from first message
- [x] Stop generation (abort stream, save partial response)
- [x] Fixed layout with scrollable message area
- [x] Langfuse observability and tracing

### Document Ingestion & RAG
- [x] Drag-and-drop file upload (.txt, .md)
- [x] Chunking and embedding pipeline (background processing)
- [x] ChromaDB vector storage with user-scoped isolation
- [x] Real-time ingestion status via SSE
- [x] RAG context injection into chat responses
- [x] Record manager with SHA-256 content hashing and deduplication
- [ ] LLM-extracted metadata and filtered retrieval
- [ ] Multi-format support (PDF, DOCX, HTML) via Docling
- [ ] Hybrid search (keyword + vector) with RRF
- [ ] Reranking

### LLM Configuration
- [x] Per-user LLM provider configs (create, update, delete)
- [x] Multi-provider support (OpenAI, Anthropic, Ollama, OpenRouter, Gemini, Grok)
- [x] Encrypted API key storage (Fernet)
- [x] Default config selection
- [x] Settings UI with config management

### Agentic Features
- [ ] Text-to-SQL tool (query structured data)
- [ ] Web search fallback (when documents lack the answer)
- [ ] Sub-agents with isolated context and delegation

### Testing
- [x] Playwright e2e test suite (API, UI, LLM tiers)
- [x] Shared test fixtures and helpers
- [x] npm test scripts for each tier

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Tailwind CSS, shadcn/ui, Vite |
| Backend | Python, FastAPI, Uvicorn |
| Database | SQLite (aiosqlite) |
| Vector DB | ChromaDB (local, persistent) |
| Auth | JWT (bcrypt + HS256) |
| File Storage | Local filesystem |
| LLM | Any OpenAI-compatible API |
| Observability | Langfuse (self-hosted) |

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python package manager)
- An OpenAI-compatible LLM endpoint (e.g. [Ollama](https://ollama.com/), [LM Studio](https://lmstudio.ai/))

## Setup

```bash
git clone https://github.com/przbadu/automator.git
cd automator
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# LLM (any OpenAI-compatible endpoint)
LLM_BASE_URL=http://localhost:11434/v1   # Ollama default
LLM_API_KEY=no
LLM_MODEL=qwen3.5-2b

# Embeddings
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768

# JWT (generate with: openssl rand -hex 32)
JWT_SECRET=your-secret-here

# Langfuse (optional)
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=http://localhost:3000
```

## Running

```bash
# Development (hot-reload)
bin/dev

# Production (optimized build, 4 workers)
bin/prod
```

Both scripts handle virtual environment creation, dependency installation, and starting both servers.

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Health check | http://localhost:8000/health |

## Testing

The project has a Playwright e2e test suite organized into three tiers:

```bash
npm test              # All tests (API + UI + LLM)
npm run test:fast     # API + UI only (~15s, no LLM needed)
npm run test:api      # API tests only (~3s)
npm run test:ui       # UI tests only (~12s)
npm run test:llm      # LLM-dependent tests (~2min)
```

Servers must be running (`bin/dev`) before running tests.

## Project Structure

```
backend/
  app/
    routers/          # API endpoints (auth, threads, messages, documents, llm-configs)
    models/           # Pydantic request/response models
    services/         # Business logic (ingestion, chunking, embedding, record manager)
    middleware/       # JWT auth middleware
  migrations/         # SQL migration files
frontend/
  src/
    components/       # React components (auth, chat, documents, settings, ui)
    hooks/            # Custom hooks (useAuth, useChat, useDocuments, useLLMConfigs)
    types/            # TypeScript interfaces
tests/
  e2e/
    api/              # API-level tests
    ui/               # Browser UI tests
    llm/              # LLM-dependent tests
    fixtures/         # Shared test helpers
```

## License

MIT
