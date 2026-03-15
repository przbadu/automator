# Knowledge Base Explorer

## What This Is

A Claude Code-inspired exploration layer for a RAG application. Gives the AI agent filesystem-like tools to navigate, search, and read a hierarchical knowledge base. Users organize documents into nested folders via the ingestion UI, and the agent can explore this structure using ls, tree, grep, glob, and read tools — just like Claude Code explores codebases.

## Core Value

The agent can explore the knowledge base the same way Claude Code explores codebases — navigating folders, pattern-matching filenames, searching content, and reading specific documents.

## Requirements

### Validated

- ✓ Chat interface with SSE streaming — existing
- ✓ Document ingestion via Docling (PDF, DOCX, PPTX, XLSX, CSV, HTML, MD, TXT) — existing
- ✓ Hybrid search (BM25 keyword + vector similarity with RRF fusion) — existing
- ✓ Cross-encoder reranker for retrieval — existing
- ✓ Document analysis sub-agent with tool-calling loop — existing
- ✓ Tool calling framework (get_document_info, read_document_chunks, search_within_document) — existing
- ✓ User-scoped data isolation via user_id filtering in SQL and ChromaDB metadata — existing
- ✓ JWT auth with bcrypt password hashing and token refresh — existing
- ✓ Thread and message management — existing
- ✓ Real-time ingestion status via SSE — existing
- ✓ Web search tool (SearXNG, Tavily, Brave, Exa) — existing
- ✓ Text-to-SQL tool for structured queries — existing
- ✓ Langfuse observability with @observe() tracing — existing

### Active

- [ ] Nested folder structure in filesystem with real directories under uploads/
- [ ] Folder metadata in SQLite (id, name, parent_id, user_id, path)
- [ ] Store full extracted markdown alongside chunks for grep/read operations
- [ ] `ls` tool — list files and subfolders in a given folder path
- [ ] `tree` tool — hierarchical view with smart depth limits (default 3 levels) and truncation
- [ ] `grep` tool — regex search over extracted markdown content, returns matching document names with line previews
- [ ] `glob` tool — file pattern matching against document names/paths (e.g., `*.md`, `reports/**/*.pdf`)
- [ ] `read` tool — read full document markdown or specific line range
- [ ] Explorer sub-agent — autonomous multi-step search using all KB tools, can also be invoked directly by user
- [ ] Folder CRUD in ingestion UI (create, rename, delete folders)
- [ ] Upload files to selected folder via drag-drop
- [ ] Move files between folders
- [ ] Move folders (with contents)
- [ ] File tree panel in ingestion UI (left panel showing folder hierarchy)
- [ ] LLM automatically decides which tools to use based on user's question

### Out of Scope

- Automatic local folder scanning/import — Phase II feature, adds complexity
- Team-based folder sharing with access controls — Keep it simple: user-scoped only
- Real-time collaboration on folders — Not needed for current use case
- Folder-level permissions beyond user ownership — Not needed

## Context

**Existing Architecture**: React/Vite frontend + Python FastAPI backend + SQLite (aiosqlite) + ChromaDB (local persistent). Documents are ingested via Docling, chunked, embedded, and stored in ChromaDB with metadata. Currently no folder hierarchy — documents are flat per-user, stored at `uploads/{user_id}/{document_id}/{filename}`.

**Key Difference from Claude Code**: Claude Code greps/globs raw source files. This knowledge base has PDFs, DOCX, XLSX that need extraction first via Docling. The tools search *extracted markdown content* stored in SQLite, not raw files. ChromaDB is used for semantic search (already in place).

**Two Search Layers**: Markdown for full-text/regex search (grep, read), ChromaDB for semantic search (existing hybrid retrieval). The LLM picks the right approach.

**Storage Model**: Original files stored in filesystem under `uploads/`. Metadata in SQLite. Chunks + embeddings in ChromaDB. New: full extracted markdown stored in SQLite alongside chunk references for efficient grep/read without needing to reconstruct from chunks.

**Sub-agent Pattern**: Existing sub-agent loads full document content into isolated context with tools (get_document_info, read_document_chunks, search_within_document). Explorer sub-agent will follow similar pattern but with access to all KB navigation tools.

## Constraints

- **Tech stack**: SQLite + ChromaDB + local filesystem — no external databases or cloud storage
- **Context window**: Tree/ls output must respect context limits — smart defaults with depth limits and truncation ("... N more" indicators)
- **User isolation**: All tools must filter by user_id — users only see their own folders/documents
- **Ingestion dependency**: grep/glob/read only work on ingested content (extracted markdown), not raw uploaded files
- **No LangChain/LangGraph**: Raw SDK calls only, per project rules
- **Observability**: All new services must have Langfuse @observe() tracing

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Real filesystem folders under uploads/ | Mirrors actual directory structure, simpler mental model | — Pending |
| Store full markdown alongside chunks in SQLite | Enables efficient grep/read without chunk reconstruction | — Pending |
| Smart depth defaults for tree (3 levels) | Protects context window for large KBs while being useful | — Pending |
| LLM decides tool usage automatically | Like Claude Code — agent picks the right tool for the question | — Pending |
| Two search layers (markdown + ChromaDB) | grep/glob for exact search, semantic for meaning-based search | — Pending |
| Explorer sub-agent with dual invocation | Can be spawned autonomously by LLM or invoked directly by user | — Pending |

---
*Last updated: 2026-03-15 after initialization*
