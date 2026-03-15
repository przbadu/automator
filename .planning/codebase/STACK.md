# Technology Stack

**Analysis Date:** 2026-03-15

## Languages

**Primary:**
- TypeScript 5.9.3 - Frontend (React + Vite)
- Python 3.13+ - Backend (FastAPI)

**Secondary:**
- JavaScript - Build configuration (Vite, ESLint)

## Runtime

**Environment:**
- Node.js (frontend development and build)
- Python 3.13+ (backend)

**Package Managers:**
- `npm` (frontend)
- `uv` (Python dependency manager for backend) with `pyproject.toml` + `uv.lock`

## Frameworks

**Frontend:**
- React 19.2.0 - UI library
- Vite 7.3.1 - Build tool and dev server
- Tailwind CSS 4.2.1 - Styling framework
- TailwindCSS Vite plugin 4.2.1 - PostCSS integration
- shadcn/ui (via `@base-ui/react` 1.2.0) - Component library for form, dialog, etc.
- Lucide React 0.577.0 - Icon library

**Backend:**
- FastAPI 0.135.1+ - Web framework
- Uvicorn 0.41.0+ - ASGI server
- Starlette SSE 3.3.2 - Server-sent events for streaming

**Build/Dev:**
- TypeScript compiler (tsc) - Type checking (frontend)
- ESLint 9.39.1 - Linting
- ESLint TypeScript plugin 8.48.0 - TypeScript support in linting
- ESLint React Hooks plugin 7.0.1 - React Hooks linting
- ESLint React Refresh plugin 0.4.24 - Fast refresh support

## Key Dependencies

**Critical (Backend):**
- `chromadb` 1.5.5+ - Vector database for embeddings (in-process, persistent)
- `aiosqlite` 0.22.1+ - Async SQLite driver
- `openai` 2.26.0+ - OpenAI-compatible API client
- `anthropic` 0.84.0+ - Anthropic API client for Claude models
- `langfuse` 4.0.0+ - LLM observability platform client

**Infrastructure (Backend):**
- `pydantic` 2.12.5+ with email - Data validation and settings management
- `pydantic-settings` 2.13.1+ - Environment configuration
- `python-dotenv` 1.2.2+ - `.env` file loading
- `jwt` (PyJWT) 2.12.0+ - JWT token handling
- `bcrypt` 5.0.0+ - Password hashing
- `cryptography` 46.0.5+ - Encryption utilities
- `docling` 2.79.0+ - Document conversion/parsing
- `opencv-python-headless` 4.13.0.92+ - Computer vision (used by docling)

**Retrieval & Search:**
- `rank-bm25` 0.2.2+ - BM25 keyword search algorithm
- `httpx` 0.28.1+ - Async HTTP client (for reranker, web search APIs)

**Utilities:**
- `python-multipart` 0.0.22+ - Multipart form data parsing
- `tiktoken` 0.12.0+ - Token counting for OpenAI models

**Frontend:**
- `zod` 3.25.76+ - Runtime type validation
- `class-variance-authority` 0.7.1+ - Component variant management
- `clsx` 2.1.1+ - Conditional CSS class composition
- `cmdk` 1.1.1+ - Command palette component
- `tailwind-merge` 3.5.0+ - Merge Tailwind classes
- `@babel/types` 7.29.0+ - Babel AST type definitions
- `@fontsource-variable/geist` 5.2.8+ - Geist variable font

## Configuration

**Environment:**
- `.env` file (gitignored) in project root
- `VITE_` prefix required for frontend environment variables (exposed to browser)
- Python backend reads from `.env` via `pydantic-settings`
- Vite config reads from parent directory: `envDir: path.resolve(__dirname, "..")`

**Build:**
- `backend/pyproject.toml` - Python project configuration with dependencies
- `backend/uv.lock` - Pinned dependency versions (managed by uv)
- `frontend/package.json` - Node.js project manifest
- `frontend/vite.config.ts` - Vite build configuration
- `frontend/tsconfig.json` - TypeScript base configuration with path aliases (`@/*` → `./src/*`)
- `frontend/tsconfig.app.json` - Application TypeScript config
- `frontend/tsconfig.node.json` - Build tools TypeScript config
- `frontend/eslint.config.js` - ESLint flat config (new format)
- `playwright.config.ts` - Legacy test config (deprecated — use agent-browser CLI)

## Platform Requirements

**Development:**
- Node.js (recent version supporting ES modules)
- Python 3.13+
- `uv` package manager
- `.env` file (copy from `.env.example`)
- Services must bind to `0.0.0.0` (remote development server support)

**Production:**
- Backend: HTTP/HTTPS server (Uvicorn with 4 workers)
- Frontend: Static file serving + Vite preview server
- SQLite database (local file)
- ChromaDB persistent storage directory

## Startup & Build Commands

**Development:**
```bash
bin/dev                    # Runs uv sync + npm install, starts backend with --reload and Vite dev server
```

**Production:**
```bash
bin/prod                   # Runs uv sync + npm install, builds frontend, starts backend with 4 workers and Vite preview server
```

**Backend:**
- Default: `http://0.0.0.0:8000`
- Health check: `GET /health`

**Frontend:**
- Development: `http://0.0.0.0:5173`
- Production preview: Served via Vite preview server

## Data Persistence

**Databases:**
- SQLite (via `aiosqlite`) - User accounts, threads, messages, documents metadata
- ChromaDB (local persistent) - Vector embeddings and document chunks

**File Storage:**
- Local filesystem (`uploads/` directory) - User-uploaded documents
- ChromaDB data directory (`chroma_data/`) - Vector index persistence

**Environment Configuration for Storage:**
- `DATABASE_URL=sqlite:///./automator.db`
- `CHROMA_DIR=./chroma_data`
- `UPLOAD_DIR=./uploads`

---

*Stack analysis: 2026-03-15*
