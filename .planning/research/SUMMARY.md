# Project Research Summary

**Project:** Knowledge Base Exploration Tools
**Domain:** Claude Code-inspired filesystem tools (ls, tree, grep, glob, read) for an existing RAG application
**Researched:** 2026-03-15
**Confidence:** HIGH

## Executive Summary

This project adds Claude Code-style exploration tools to an existing RAG application, giving the LLM agent the ability to navigate, search, and read documents within a user-organized folder hierarchy. The approach is unusually clean: no new external dependencies are needed. Everything builds on Python stdlib (fnmatch, re, textwrap) and existing project infrastructure (aiosqlite, ChromaDB, FastAPI). The core technical work is two new SQLite tables (folders with adjacency list + materialized path, and document_content for full extracted markdown), five tool implementations (ls, tree, grep, glob, read), and a folder management UI. The tools register into the existing sub-agent tool-calling loop -- no new agent infrastructure required.

The recommended approach is to treat folder hierarchy and full-text storage as the foundation, build tools on top, then wire them into the existing sub-agent. The architecture research confirms that the existing sub_agent_service.py and sub_agent_tools.py patterns are sufficient -- creating a separate explorer agent service would be an anti-pattern that duplicates the tool-calling loop. The unique competitive advantage is dual-layer search: exact regex search (grep) combined with existing semantic search (BM25 + vector + reranker), which no single competitor offers.

The primary risks are context window overflow from unbounded tool output, SQLite-ChromaDB consistency drift during folder operations, and grep performance degradation on large corpora. All three are preventable with upfront design decisions: hard-cap tool output at 10,000 tokens with actionable truncation messages, avoid storing folder paths in ChromaDB (resolve via SQLite join instead), and run grep in a thread pool with a 5-second timeout. The decision to keep folders as a logical SQLite-only concept (not mirrored on the filesystem) eliminates the most dangerous pitfall: non-atomic folder moves across database and filesystem.

## Key Findings

### Recommended Stack

No new pip dependencies. The entire feature builds on Python stdlib and existing project dependencies. This is the strongest possible position for maintainability.

**Core technologies:**
- **SQLite FTS5** (built-in): Full-text search over extracted markdown -- zero-dependency, BM25 ranking out of the box
- **SQLite Recursive CTEs** (built-in): Folder hierarchy traversal for tree/ls operations -- single query gets full subtree at any depth
- **Python fnmatch** (stdlib): Glob pattern matching against document paths -- shell-style wildcards familiar to users
- **Python re + SQLite REGEXP** (stdlib): Regex search registered as custom SQLite function via create_function -- enables WHERE content REGEXP ? queries
- **aiosqlite** (existing): Async SQLite access for all new queries -- already used throughout the project

### Expected Features

**Must have (table stakes):**
- Folder hierarchy in SQLite (adjacency list + materialized path) -- foundation for all tools
- Full extracted markdown storage in document_content table -- enables grep and read
- Five KB tools: ls, tree (depth-limited), grep (regex), glob (fnmatch), read (line ranges)
- Tool routing in LLM via existing sub-agent framework
- Folder tree UI panel with CRUD operations
- Upload to specific folder
- User-scoped isolation on all tools and queries
- Clear error messages for missing paths, processing documents, invalid regex

**Should have (competitive):**
- Explorer sub-agent that chains tools autonomously (ls -> grep -> read)
- Dual search layers (regex grep + semantic search) -- the primary differentiator
- Move files and folders between locations
- Grep output modes (files_with_matches, content, count)
- Smart context window management with truncation indicators

**Defer (v2+):**
- Automatic folder sync from local filesystem
- SQLite FTS5 for grep optimization (start with regex, add FTS5 if performance degrades)
- Folder bookmarks/favorites
- Bulk operations (move/delete multiple files)

### Architecture Approach

KB tools integrate into the existing sub_agent_tools.py registry as additional tool definitions and dispatch cases. No new agent service, no new streaming infrastructure, no new tool-calling loop. The folder_service.py handles CRUD and path resolution (virtual paths like /reports/2024/q1.pdf to internal IDs). The kb_tools.py implements five read-only tool functions. The ingestion pipeline gets one modification: store full markdown in document_content after Docling conversion, before chunking.

**Major components:**
1. **folder_service.py** (NEW) -- Folder CRUD, path resolution, move operations; pure SQLite + optional filesystem sync
2. **kb_tools.py** (NEW) -- Five exploration tools (kb_ls, kb_tree, kb_grep, kb_glob, kb_read); read-only SQLite queries returning formatted text
3. **sub_agent_tools.py** (MODIFIED) -- Register KB tool definitions and dispatch; conditional include_kb_tools flag
4. **intent_service.py** (MODIFIED) -- Add exploration intent patterns for fast-path routing
5. **folders router** (NEW) -- REST API for folder CRUD (POST/GET/PATCH/DELETE)
6. **Folder Tree Panel** (NEW) -- React component with expand/collapse, context menu, drag-drop

### Critical Pitfalls

1. **Context window overflow from unbounded tool output** -- Hard-cap every tool at 10,000 tokens. Tree: depth=3 max. Grep: 50 matches max. Read: 200 lines max. Always include actionable truncation messages. Must be designed in from Phase 1.

2. **SQLite-ChromaDB consistency drift on folder operations** -- Do NOT store folder paths in ChromaDB metadata. Store only document_id and user_id. Resolve paths via SQLite join at query time. This eliminates the entire class of dual-store sync bugs.

3. **Non-atomic folder move across database and filesystem** -- Keep folders as a logical SQLite-only concept. The filesystem stays flat at uploads/{user_id}/{document_id}/{filename}. Folder hierarchy exists only in the database. This eliminates filesystem move failures entirely.

4. **Grep performance collapse from regex backtracking** -- Run grep in asyncio.to_thread() with asyncio.wait_for(timeout=5). Reject patterns with nested quantifiers. For simple substring searches, use str.find() instead of regex.

5. **Search-ingestion consistency gap** -- Store full markdown during ingestion (between Docling conversion and chunking). Check document status in grep/read tools; return "still processing" for incomplete documents. Use ON DELETE CASCADE for cleanup.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Database Foundation + Folder Service
**Rationale:** Everything depends on the folder hierarchy existing in SQLite. Tools query these tables. UI needs the REST API. This is the load-bearing foundation.
**Delivers:** folders table, document_content table, folder_id on documents, folder_service.py with CRUD and path resolution, migration script, folders REST API endpoints
**Addresses:** Folder hierarchy (P1), full markdown storage (P1), folder CRUD (P1)
**Avoids:** SQLite-ChromaDB drift (by not storing paths in ChromaDB), non-atomic folder moves (by keeping folders logical-only), path traversal attacks (by validating folder names)
**Complexity:** MEDIUM -- straightforward schema design and CRUD, but path resolution logic needs care

### Phase 2: Ingestion Pipeline Modification + Full-Text Storage
**Rationale:** KB tools (grep, read) cannot function without stored full text. Must modify the existing ingestion pipeline before tools are built. Also needs a backfill mechanism for existing documents.
**Delivers:** Modified ingestion_service.py storing full markdown in document_content, backfill script for existing documents, FTS5 virtual table (optional, recommended)
**Addresses:** Full extracted markdown storage (P1), search-ingestion consistency
**Avoids:** Search-ingestion gap (by storing markdown in the same pipeline step as chunking)
**Complexity:** MEDIUM -- the markdown is already extracted by Docling; this just persists it in a new table

### Phase 3: KB Tool Implementations
**Rationale:** Tools are the core value proposition. They need folders and content to query against (Phases 1-2). Each tool is independently testable.
**Delivers:** kb_tools.py with kb_ls, kb_tree, kb_grep, kb_glob, kb_read; output formatting with truncation; grep timeout and thread pool safety
**Addresses:** All five tools (P1), error handling (P1), smart context management (P2)
**Avoids:** Context window overflow (via hard caps), grep performance collapse (via timeout + thread pool), tool output confusion (via structured formatting)
**Complexity:** MEDIUM -- five tools with well-defined inputs/outputs, but grep safety and output formatting need attention

### Phase 4: Tool Registration + Intent Routing
**Rationale:** Registration connects KB tools to the existing sub-agent loop. Intent routing ensures exploration queries reach the tools. This is the integration glue.
**Delivers:** Modified sub_agent_tools.py with KB tool definitions and dispatch, modified intent_service.py with exploration patterns, include_kb_tools flag
**Addresses:** Tool routing in LLM (P1), intent classification for exploration queries
**Avoids:** Intent classifier gap (by adding exploration patterns), tool list bloat (via conditional include_kb_tools flag)
**Complexity:** LOW -- follows existing patterns exactly (add definitions, add elif dispatch, add regex patterns)

### Phase 5: Folder Management UI
**Rationale:** Frontend folder tree and CRUD are independent of the agent using KB tools. Users can start using agent exploration (Phase 4) while folder UI is built. Lower priority because the agent tools work without a UI -- folders can be created via API.
**Delivers:** Folder tree panel component, folder CRUD UI (create/rename/delete), upload-to-folder integration, document move UI (drag-drop or dialog)
**Addresses:** Folder tree UI (P1), upload to folder (P1), move files (P2)
**Avoids:** UX pitfalls (no undo on delete -- use confirmation with document count, optimistic UI for moves)
**Complexity:** MEDIUM -- tree component with expand/collapse, context menu, integration with existing documents page

### Phase Ordering Rationale

- **Phases 1-2 before 3:** Tools query tables that must exist first. Building tools before schema is guaranteed rework.
- **Phase 3 before 4:** Cannot register tools that do not exist yet. Tool implementations must be tested independently before integration.
- **Phase 4 before 5:** Agent exploration is higher value than folder management UI. A user can create folders via API and immediately benefit from agent-powered exploration.
- **Phase 5 last:** UI is important but not blocking. The agent tools work via chat commands without a folder tree panel.
- **Explorer sub-agent deferred to Phase 6 (v1.x):** Individual tools must be proven stable before composing them into an autonomous agent loop. The existing sub-agent already chains tools -- the explorer is an enhancement, not a requirement.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Ingestion Modification):** Need to trace the exact existing ingestion pipeline to find the right insertion point for markdown storage. Backfill of existing documents needs testing.
- **Phase 5 (Folder UI):** React tree component implementation -- evaluate shadcn/ui tree component availability or build custom with recursive rendering.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Database Foundation):** Well-documented SQLite patterns. Adjacency list + materialized path is a solved problem.
- **Phase 3 (KB Tools):** Tool implementations are straightforward SQLite queries with Python formatting. Claude Code's own tool behavior is well-documented.
- **Phase 4 (Tool Registration):** Follows existing codebase patterns exactly. Copy-paste with modifications.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies. All technologies are Python stdlib or existing project deps. Official SQLite docs confirm FTS5, recursive CTE, REGEXP support. |
| Features | HIGH | Feature landscape well-mapped via Claude Code, Cursor, Cline analysis. Clear MVP definition with dependency graph. |
| Architecture | HIGH | Architecture follows existing codebase patterns. No new infrastructure. Integration points clearly identified. |
| Pitfalls | HIGH | Pitfalls grounded in existing CONCERNS.md issues and well-known SQLite/ChromaDB limitations. Prevention strategies are concrete and actionable. |

**Overall confidence:** HIGH

### Gaps to Address

- **Backfill strategy for existing documents:** Existing documents have no full markdown stored. Need to determine whether to re-extract via Docling (expensive) or skip backfill and only store markdown for new uploads. Decide during Phase 2 planning.
- **FTS5 timing:** Research recommends starting with regex grep and adding FTS5 later. But the STACK research also designs the FTS5 schema upfront. Decision: create the FTS5 virtual table in Phase 2 migration (low cost), but only wire it into grep if performance testing in Phase 3 shows regex is too slow.
- **Filesystem layout decision:** Architecture strongly recommends logical-only folders (no filesystem mirroring). This conflicts with the architecture diagram showing `uploads/{user}/{folder_path}/`. Final decision: keep flat filesystem layout. Validate this does not break existing file serving endpoints.
- **ChromaDB folder metadata for semantic search:** The architecture mentions optionally adding folder_path to ChromaDB chunk metadata for filtered semantic search within folders. This contradicts the pitfalls recommendation to NOT store paths in ChromaDB. Resolution: do not add folder paths to ChromaDB. If folder-scoped semantic search is needed, filter by document_id list from SQLite.

## Sources

### Primary (HIGH confidence)
- [SQLite FTS5 Extension](https://www.sqlite.org/fts5.html) -- full-text search capabilities and syntax
- [SQLite Recursive CTEs](https://sqlite.org/lang_with.html) -- hierarchical query patterns
- [SQLite REGEXP](https://www.sqlite.org/lang_expr.html) -- custom function registration
- [Python fnmatch](https://docs.python.org/3/library/fnmatch.html) -- glob pattern matching
- [aiosqlite API](https://aiosqlite.omnilib.dev/en/stable/api.html) -- create_function support
- [Anthropic: Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) -- tool output formatting best practices
- [Claude Code tools reference](https://gist.github.com/wong2/e0f34aac66caf890a332f7b6f9e2ba8f) -- tool behavior and output format conventions
- Existing codebase analysis: sub_agent_service.py, sub_agent_tools.py, intent_service.py, CONCERNS.md

### Secondary (MEDIUM confidence)
- [Agentic KB Patterns (The New Stack)](https://thenewstack.io/agentic-knowledge-base-patterns/) -- design patterns
- [Context Window Management (getmaxim)](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) -- truncation strategies
- [ChromaDB Pros and Cons (AltexSoft)](https://www.altexsoft.com/blog/chroma-pros-and-cons/) -- consistency issues
- [Solving Context Window Overflow (arxiv)](https://arxiv.org/abs/2511.22729) -- agent context management
- [SQLite Hierarchical Queries (GeeksforGeeks)](https://www.geeksforgeeks.org/sqlite/how-to-create-a-sqlite-hierarchical-recursive-query/) -- CTE examples

---
*Research completed: 2026-03-15*
*Ready for roadmap: yes*
