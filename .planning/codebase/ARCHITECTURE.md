# Architecture

**Analysis Date:** 2026-03-15

## Pattern Overview

**Overall:** Layered architecture with frontend/backend separation, async processing pipelines, and real-time streaming.

**Key Characteristics:**
- Stateless HTTP REST API with JWT authentication and token refresh
- Event-driven document ingestion pipeline with background task processing
- Real-time streaming responses via Server-Sent Events (SSE) for both chat and document status updates
- Hybrid retrieval (vector + keyword search with reciprocal rank fusion)
- Tool-calling agent loop for autonomous document analysis and multi-tool task execution
- User-scoped data isolation enforced at database query level and vector store metadata filters

## Layers

**Frontend (React + Vite + Tailwind):**
- Purpose: SPA for chat interface, document upload, and settings management
- Location: `frontend/src/`
- Contains: React components, hooks, type definitions, API client
- Depends on: Backend REST API for all data operations, Vite for bundling
- Used by: Browser clients (0.0.0.0:5173 in dev)

**API Layer (FastAPI):**
- Purpose: HTTP REST endpoints, request validation, middleware (CORS, auth)
- Location: `backend/app/routers/` — auth, chat, documents, llm_configs, metadata_schemas
- Contains: Route handlers, dependency injection (get_current_user, get_db), response models
- Depends on: Services, database, vector store, LLM clients
- Used by: Frontend, test suites

**Service Layer (async Python):**
- Purpose: Core business logic — document processing, chat completions, retrieval, intent classification
- Location: `backend/app/services/`
- Contains: 40+ services including ingestion_service, retrieval_service, embedding_service, llm_service, sub_agent_service
- Depends on: Database (aiosqlite), vector store (ChromaDB), LLM clients (OpenAI async SDK, Anthropic), utilities
- Used by: Route handlers, background tasks, other services

**Data Layer (SQLite + ChromaDB):**
- Purpose: Persistent storage and vector retrieval
- Location: SQLite at `database.db`, ChromaDB at `.chroma/` (configurable via env)
- Contains: Users, threads, messages, documents, LLM configs, metadata schemas (SQL); document chunks and embeddings (vector)
- Depends on: aiosqlite for async query execution, chromadb for vector operations
- Used by: Service layer, migrations on app startup

**Middleware Layer:**
- Purpose: Cross-cutting concerns — authentication, CORS, error handling
- Location: `backend/app/middleware/auth.py`
- Contains: JWT validation, token refresh, current user extraction via Depends()
- Used by: All protected routes via FastAPI dependency injection

## Data Flow

**Chat/Completion Flow:**

1. Frontend sends user message to `POST /threads/{thread_id}/messages`
2. Route handler validates user, creates temporary message record
3. Service layer calls `retrieve_relevant_chunks()` — queries embeddings + keyword search, fuses results
4. `build_rag_system_message()` contextualizes retrieved chunks into system prompt
5. `stream_chat_completion()` yields deltas from OpenAI-compatible or Anthropic API
6. Route handler captures deltas, publishes source citations via SSE, saves final message to DB
7. Frontend receives streamed content, renders citations inline

**Document Ingestion Flow:**

1. Frontend uploads file to `POST /documents/upload`
2. Route handler validates extension, stores file to `backend/uploads/{user_id}/{doc_id}/`
3. Background task `ingest_document()` begins async processing:
   - **Read**: Convert non-plaintext files (PDF, DOCX, PPTX) via Docling to plain text
   - **Chunk**: Split text using recursive character splitter (configurable chunk_size, overlap)
   - **Metadata Extract**: Call LLM to extract structured fields per user's metadata schema
   - **Embed**: Generate embeddings for each chunk via embedding_service
   - **Store**: Upsert chunks to ChromaDB with metadata (user_id, document_type, filename, chunk_index)
4. Status updates broadcast to frontend via SSE: pending → processing → converting → chunking → extracting_metadata → embedding → completed
5. Duplicate detection: content_hash computed, checked against user's prior uploads

**Sub-Agent (Tool-Calling) Flow:**

1. Frontend sends message with `intent="autonomous_analysis"` or `target_document=doc_id`
2. Service layer calls `run_sub_agent()` with tool definitions (get_document_info, read_document_chunks, search_within_document)
3. Sub-agent loop: LLM generates tool calls → service layer executes tools → feeds results back to LLM
4. Each tool call + result published to frontend via SSE (sub_agent_tool_call, sub_agent_tool_result events)
5. Sub-agent completes when LLM returns final response (no more tool calls)
6. Message saved with tool_calls and tool_results in metadata

**State Management:**

- **Frontend**: React hooks (useChat, useAuth, useSSE) manage thread list, current thread, messages, streaming state
- **Backend**: Stateless — all state stored in SQLite; SSE streams broadcast to single connected client
- **User Isolation**: Every query filters by `user_id` (SQL WHERE user_id = ?); ChromaDB metadata filters include user_id
- **Thread/Message**: Messages are immutable once created; threads updated only for title/timestamps

## Key Abstractions

**Thread (Conversation Container):**
- Purpose: Groups messages into logical conversations
- Examples: `backend/app/models/chat.py:ThreadResponse`, `frontend/src/types/index.ts:Thread`
- Pattern: ID-based keying, user-scoped, updated_at tracks last message timestamp

**Message (Chat Turn):**
- Purpose: Single user or assistant message with optional metadata
- Examples: `backend/app/models/chat.py:MessageResponse`, `frontend/src/types/index.ts:Message`
- Pattern: Immutable after creation, metadata optionally holds sources/tool_calls/tool_results

**Document (Uploaded File):**
- Purpose: Container for file + ingestion status + extracted metadata
- Examples: `backend/app/models/documents.py:DocumentResponse`, `frontend/src/types/index.ts:Document`
- Pattern: Status transitions (pending → processing → completed/failed), chunk_count tracks chunk splitting progress

**Chunk (Document Fragment):**
- Purpose: Indexed segment of document text for retrieval
- Pattern: Stored in ChromaDB with embedding vector, metadata (user_id, filename, chunk_index, document_type, content_hash)
- Retrieval: Queried via vector similarity + optional keyword search

**SourceCitation (Retrieved Reference):**
- Purpose: Metadata about a chunk returned during retrieval
- Examples: `backend/app/models/chat.py:SourceCitation`, `frontend/src/types/index.ts:SourceCitation`
- Pattern: Includes filename, chunk_index, preview, relevance_score; displayed inline in messages

## Entry Points

**Backend:**
- Location: `backend/app/main.py`
- Triggers: `uvicorn` process start (dev: `bin/dev`, prod: `bin/prod`)
- Responsibilities:
  - Lifespan startup: calls `init_db()` to run migrations, resets stuck documents
  - Registers routers: auth, chat, debug, documents, llm_configs, metadata_schemas
  - CORS middleware for cross-origin requests from frontend
  - Health check endpoint at GET /health

**Frontend:**
- Location: `frontend/src/main.tsx`
- Triggers: Browser load or `npm run dev`
- Responsibilities:
  - Renders ThemeProvider (dark/light mode state)
  - Mounts App component which handles auth flow and route switching

**Chat Route:**
- Location: `backend/app/routers/chat.py` — `POST /threads/{thread_id}/messages`
- Triggers: User sends message via frontend input
- Responsibilities: Validate thread ownership, invoke LLM completion, stream response via SSE, save message

**Document Ingestion Entry:**
- Location: `backend/app/routers/documents.py` — `POST /documents/upload`
- Triggers: User uploads file via frontend
- Responsibilities: Validate file, save to disk, queue background ingestion task, return document record

## Error Handling

**Strategy:** Try-catch in service layer, HTTP exceptions (400/401/403/500) at route level, graceful degradation where possible.

**Patterns:**

- **Auth Errors**: 401 Unauthorized if JWT missing/invalid; 403 Forbidden if user_id mismatch
- **Validation Errors**: 400 Bad Request with detail message (unsupported file type, invalid email, etc.)
- **Not Found**: 404 if thread/document/message belongs to different user or doesn't exist
- **Ingestion Failures**: Document status set to "failed" with error_message, broadcast via SSE (non-blocking)
- **LLM Errors**: Caught in streaming loop; streamed error message to frontend or fallback response
- **Database Errors**: 500 Internal Server Error; logged but not exposed to client

## Cross-Cutting Concerns

**Logging:** Uses Python logging module, configured at module level (e.g., `logger = logging.getLogger(__name__)` in each service)

**Validation:**
- Pydantic models for request bodies (MessageCreate, ThreadCreate, DocumentResponse)
- Extension validation for uploaded files (allowed_extensions = {.txt, .md, .pdf, .docx, .pptx, .html, .xlsx, .csv})
- Email validation via pydantic EmailStr

**Authentication:**
- JWT tokens (access + refresh) stored in localStorage
- Access token in Authorization header (Bearer <token>)
- Refresh endpoint auto-renews both tokens; 401 triggers refresh attempt
- Password hashing via bcrypt (auth_service.py)

**Observability:**
- Langfuse integration via @observe() decorators for tracing key services
- Metadata logging: retrieval counts, scores, model names, config values
- SSE broadcasts both chat deltas and document status events to frontend

---

*Architecture analysis: 2026-03-15*
