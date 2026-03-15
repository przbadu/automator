# Architecture Research

**Domain:** Knowledge Base exploration tools for RAG application
**Researched:** 2026-03-15
**Confidence:** HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐     │
│  │ Chat Panel   │  │ Documents    │  │ Folder Tree Panel     │     │
│  │ (existing)   │  │ (existing)   │  │ (NEW)                 │     │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘     │
├─────────┴──────────────────┴─────────────────────┴─────────────────┤
│                      API Layer (FastAPI)                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ chat.py  │  │ docs.py  │  │ folders  │  │ explorer.py      │   │
│  │(existing)│  │(existing)│  │ (NEW)    │  │ (NEW - optional) │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
├───────┴──────────────┴─────────────┴─────────────────┴─────────────┤
│                     Service Layer (async Python)                    │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ intent_svc  │ │ sub_agent_svc│ │ folder_svc   │ │ kb_tools   │ │
│  │ (MODIFIED)  │ │ (existing)   │ │ (NEW)        │ │ (NEW)      │ │
│  └──────┬──────┘ └──────┬───────┘ └──────┬───────┘ └──────┬─────┘ │
│         │               │                │                │       │
│  ┌──────┴───────────────┴────────────────┴────────────────┴─────┐ │
│  │               sub_agent_tools.py (MODIFIED)                   │ │
│  │  register: ls, tree, grep, glob, read alongside existing tools│ │
│  └───────────────────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────────┤
│                       Data Layer                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ SQLite       │  │ ChromaDB     │  │ Filesystem             │   │
│  │ + folders    │  │ (existing)   │  │ uploads/{user}/         │   │
│  │ + full_text  │  │              │  │  {folder_path}/         │   │
│  │ (MODIFIED)   │  │              │  │   {doc_id}/{file}       │   │
│  └──────────────┘  └──────────────┘  └────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **folder_service.py** (NEW) | Folder CRUD: create, rename, move, delete folders; move documents between folders; resolve virtual paths to folder IDs | Pure SQLite operations + filesystem sync. All queries filter by user_id. |
| **kb_tools.py** (NEW) | Five exploration tools: `kb_ls`, `kb_tree`, `kb_grep`, `kb_glob`, `kb_read` | Each tool is a standalone async function that queries SQLite (folders table, documents table, document_content table). Returns formatted text strings for LLM consumption. |
| **sub_agent_tools.py** (MODIFIED) | Tool registry and dispatcher | Add KB tool definitions (OpenAI + Anthropic formats) to `get_tool_definitions()`. Add KB tool dispatch to `execute_tool()`. |
| **intent_service.py** (MODIFIED) | Intent classification with new "kb_exploration" category | Add regex fast-path patterns for exploration queries ("list my files", "find documents about X", "what's in the reports folder"). Add `tool_hint="kb_explore"` for explorer routing. |
| **folders router** (NEW) | REST endpoints for folder CRUD | `POST /folders`, `GET /folders/tree`, `PATCH /folders/{id}`, `DELETE /folders/{id}`, `POST /folders/{id}/move-document` |
| **Folder Tree Panel** (NEW) | Left sidebar in documents page showing folder hierarchy | React component with expand/collapse, drag-drop for move operations, context menu for rename/delete |

## Recommended Project Structure

### Backend additions

```
backend/app/
├── routers/
│   └── folders.py              # NEW: folder CRUD REST endpoints
├── models/
│   └── folders.py              # NEW: Pydantic models (FolderCreate, FolderResponse, FolderTree)
├── services/
│   ├── folder_service.py       # NEW: folder CRUD logic, path resolution, move operations
│   ├── kb_tools.py             # NEW: ls, tree, grep, glob, read tool implementations
│   ├── sub_agent_tools.py      # MODIFIED: register KB tools in registry
│   └── intent_service.py       # MODIFIED: add exploration intent patterns
├── migrations/
│   └── 005_folders.sql         # NEW: folders table, document_content table, folder_id on documents
```

### Frontend additions

```
frontend/src/
├── components/
│   └── documents/
│       ├── FolderTree.tsx       # NEW: tree panel with expand/collapse
│       ├── FolderContextMenu.tsx # NEW: right-click menu (rename, delete, new subfolder)
│       ├── DocumentsLayout.tsx  # MODIFIED: add left panel for folder tree
│       └── DocumentUpload.tsx   # MODIFIED: upload to selected folder
├── hooks/
│   └── useFolders.ts           # NEW: folder CRUD API calls
├── types/
│   └── index.ts                # MODIFIED: add Folder type
```

### Structure Rationale

- **kb_tools.py separate from sub_agent_tools.py:** The tool registry (`sub_agent_tools.py`) handles format conversion and dispatch. Tool implementations live in their own module. This follows the existing pattern where `web_search_tool.py` and `sql_tool.py` are separate from the registry.
- **folder_service.py separate from kb_tools.py:** Folder CRUD (used by REST API and UI) is a different concern from exploration tools (used by LLM agent). The folder service manages state; KB tools are read-only queries.
- **No separate explorer_service.py:** The existing `sub_agent_service.py` already handles the tool-calling loop generically. KB tools just register into the same loop. No new agent service needed.

## Architectural Patterns

### Pattern 1: Tool Registry with Conditional Registration

**What:** Tools register into `get_tool_definitions()` based on feature flags and context. The LLM receives only the tools relevant to the current request.
**When to use:** Always. This is the existing pattern and KB tools follow it.
**Trade-offs:** Simple and proven. Downside: tool list grows as features add up, consuming context window. Mitigated by conditional inclusion.

**Example:**
```python
# In sub_agent_tools.py — extend existing get_tool_definitions()
def get_tool_definitions(
    format: str = "openai",
    include_document_tools: bool = True,
    include_kb_tools: bool = False,  # NEW parameter
) -> list[dict]:
    tools: list[dict] = []
    if include_document_tools:
        tools.extend(_DOCUMENT_TOOLS[format])
    if include_kb_tools:
        from app.services.kb_tools import KB_TOOLS_OPENAI, KB_TOOLS_ANTHROPIC
        tools.extend(KB_TOOLS_ANTHROPIC if format == "anthropic" else KB_TOOLS_OPENAI)
    if settings.text_to_sql_enabled:
        # ... existing
    return tools
```

### Pattern 2: Virtual Path Resolution (Path-to-ID Mapping)

**What:** Users and LLMs interact with human-readable paths like `/reports/2024/quarterly.pdf`. The folder service resolves these to internal IDs (folder_id, document_id) for database queries. All DB operations use IDs; paths are a presentation layer.
**When to use:** Every KB tool call that accepts a `path` parameter.
**Trade-offs:** Clean UX for the LLM (paths feel natural). Cost: one extra DB lookup per path resolution, but this is a simple indexed query.

**Example:**
```python
# In folder_service.py
async def resolve_path(path: str, user_id: str, db: aiosqlite.Connection) -> tuple[str | None, str | None]:
    """Resolve a virtual path to (folder_id, document_id).

    Returns:
        (folder_id, None) if path points to a folder
        (folder_id, document_id) if path points to a document
        (None, None) if path doesn't exist
    """
    parts = [p for p in path.strip("/").split("/") if p]
    if not parts:
        return (None, None)  # root folder (user's top-level)

    current_folder_id = None  # None = root
    for i, part in enumerate(parts):
        if i == len(parts) - 1:
            # Last segment: could be folder or document
            doc = await _find_document_in_folder(part, current_folder_id, user_id, db)
            if doc:
                return (current_folder_id, doc["id"])
        folder = await _find_subfolder(part, current_folder_id, user_id, db)
        if not folder:
            return (None, None)
        current_folder_id = folder["id"]

    return (current_folder_id, None)
```

### Pattern 3: Full-Text Storage for Grep/Read (Markdown Alongside Chunks)

**What:** During ingestion, store the complete extracted markdown in a `document_content` table alongside the existing chunk-based storage in ChromaDB. Grep and read tools query this full text. Semantic search continues to use ChromaDB chunks.
**When to use:** For `kb_grep` and `kb_read` tools. These need full document text, not chunk fragments.
**Trade-offs:** Duplicates content (full text in SQLite + chunks in ChromaDB). Worth it because: (1) reconstructing text from chunks loses formatting and creates overlap artifacts, (2) grep needs contiguous text with line numbers, (3) SQLite full-text is fast for regex, (4) storage cost is minimal for a local app.

**Implementation:**
```sql
-- New table in migration
CREATE TABLE IF NOT EXISTS document_content (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,  -- full extracted markdown
    line_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doc_content_user ON document_content(user_id);
```

```python
# During ingestion (ingestion_service.py modification)
# After Docling converts document to markdown, before chunking:
await db.execute(
    "INSERT OR REPLACE INTO document_content (document_id, user_id, content, line_count) VALUES (?, ?, ?, ?)",
    (document_id, user_id, full_markdown, full_markdown.count("\n") + 1),
)
```

### Pattern 4: Context-Window-Safe Output Formatting

**What:** All KB tools enforce output size limits with smart truncation. Tree shows `... N more items` indicators. Grep limits matches. Read supports line ranges.
**When to use:** Every tool output returned to the LLM.
**Trade-offs:** Prevents context overflow. LLM can request more detail via follow-up tool calls (e.g., `read` with specific line range after `grep` finds a match).

**Example:**
```python
# In kb_tools.py
MAX_TREE_DEPTH = 3
MAX_TREE_ITEMS = 50
MAX_GREP_MATCHES = 20
MAX_READ_LINES = 200

def format_tree(folders, documents, depth=0, max_depth=MAX_TREE_DEPTH) -> str:
    if depth >= max_depth:
        remaining = len(folders) + len(documents)
        if remaining:
            return f"  {'  ' * depth}... {remaining} more items\n"
        return ""
    # ... recursive formatting
```

## Data Flow

### KB Tool Call Flow (via existing sub-agent loop)

```
User asks: "find all reports mentioning revenue"
    |
    v
intent_service.classify_intent()
    |-- pattern match or LLM classifies as needs_sub_agent=true
    |-- tool_hint=None (let LLM choose tools)
    v
sub_agent_service.run_sub_agent()
    |-- include_kb_tools=True in get_tool_definitions()
    |-- LLM receives: kb_ls, kb_tree, kb_grep, kb_glob, kb_read + existing tools
    v
LLM decides: kb_grep(pattern="revenue", path="/reports")
    |
    v
sub_agent_tools.execute_tool("kb_grep", args, user_id, db)
    |
    v
kb_tools.kb_grep(pattern="revenue", path="/reports", user_id, db)
    |-- folder_service.resolve_path("/reports", user_id, db) --> folder_id
    |-- Query document_content WHERE folder matches, regex search on content
    |-- Return formatted matches with filenames and line previews
    v
Result returned to LLM in sub-agent loop
    |
    v
LLM decides: kb_read(path="/reports/q4-earnings.pdf", lines="45-60")
    |-- Reads specific line range from document_content
    v
LLM generates final response with citations
    |
    v
Streamed to frontend via SSE (existing pattern)
```

### Folder CRUD Flow (REST API)

```
User creates folder via UI: POST /folders
    |
    v
folders router validates request, calls folder_service.create_folder()
    |
    v
folder_service:
    1. INSERT INTO folders (id, name, parent_id, user_id, path)
    2. mkdir uploads/{user_id}/{folder_path}/  (filesystem sync)
    |
    v
Response: FolderResponse(id, name, path, parent_id, children_count, document_count)


User uploads file to folder via UI: POST /documents/upload?folder_id=xxx
    |
    v
documents router (MODIFIED):
    1. Save file to uploads/{user_id}/{folder_path}/{doc_id}/{filename}
    2. INSERT document with folder_id
    3. Background ingestion (existing) + store full markdown in document_content
```

### Document Move Flow

```
User drags document to new folder in UI
    |
    v
PATCH /documents/{doc_id}/move  { folder_id: "new-folder-id" }
    |
    v
folder_service.move_document(doc_id, new_folder_id, user_id, db)
    1. Validate ownership of both document and target folder
    2. UPDATE documents SET folder_id = ? WHERE id = ? AND user_id = ?
    3. Move physical file: shutil.move(old_path, new_path)
    4. Update ChromaDB metadata (folder_path) for all chunks of this document
```

### Key Data Flows

1. **Exploration flow:** User message --> intent classification --> sub-agent with KB tools --> tool calls query SQLite (folders, document_content) --> formatted results fed back to LLM --> streamed response to frontend. This uses the **existing** sub-agent loop with no new streaming infrastructure.

2. **Ingestion flow (modified):** File upload --> Docling conversion --> **store full markdown in document_content** --> chunking --> embedding --> ChromaDB. The only change is inserting `document_content` after conversion and before chunking.

3. **Folder management flow:** UI interactions --> REST API --> folder_service --> SQLite + filesystem. Standard CRUD, independent of the agent loop.

## Database Schema Changes

### New Tables

```sql
-- Folders table (adjacency list for hierarchy)
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    path TEXT NOT NULL,           -- materialized path: "reports/2024/q4"
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, parent_id, name)  -- no duplicate names in same folder
);
CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(user_id, path);

-- Full document content for grep/read
CREATE TABLE IF NOT EXISTS document_content (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    line_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doc_content_user ON document_content(user_id);
```

### Modified Tables

```sql
-- Add folder_id to documents (nullable for backward compat with existing docs)
ALTER TABLE documents ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
```

### Why Adjacency List + Materialized Path

The `folders` table uses **adjacency list** (parent_id) for tree operations and **materialized path** (path column) for fast prefix queries. This hybrid approach is ideal because:

- **Adjacency list:** Simple CRUD. Moving a folder = update parent_id + update path for subtree.
- **Materialized path:** Fast "list all contents under /reports/" via `WHERE path LIKE 'reports/%'`. Essential for tree/ls operations.
- **Not nested sets or closure table:** Overkill for this use case. Folder hierarchies are narrow and shallow (rarely > 5 levels deep). Adjacency list with path is the simplest correct solution.

## KB Tool Specifications

| Tool | Input | SQLite Query Strategy | Output Format |
|------|-------|----------------------|---------------|
| `kb_ls` | `path` (default: "/") | Query folders WHERE parent_id = resolved_folder_id AND user_id; Query documents WHERE folder_id = resolved_folder_id AND user_id | Formatted listing: `[DIR] reports/`, `[FILE] notes.pdf (23 chunks, 145KB)` |
| `kb_tree` | `path`, `depth` (default: 3) | Recursive CTE or iterative query with depth limit | Indented tree with `... N more` truncation |
| `kb_grep` | `pattern` (regex), `path` (optional scope), `case_sensitive` | Query document_content, apply Python `re.search` on content | `filename:line_num: matching line` (like ripgrep output) |
| `kb_glob` | `pattern` (glob like `*.pdf`, `reports/**/*.xlsx`) | Query documents + folders, apply `fnmatch` on path | List of matching file paths |
| `kb_read` | `path`, `offset` (line), `limit` (lines, default: 200) | Query document_content by resolved document_id | Numbered lines like `cat -n` output |

## Integration with Existing Sub-Agent

The critical architectural decision: **KB tools integrate into the existing `sub_agent_tools.py` registry, not as a separate agent.** This is correct because:

1. The existing sub-agent loop in `sub_agent_service.py` already handles multi-turn tool calling with both OpenAI and Anthropic formats.
2. The existing `execute_tool()` dispatcher is a simple if/elif chain that's easy to extend.
3. The intent service already supports `tool_hint` for guiding small LLMs to the right tool.
4. No new streaming infrastructure needed -- KB tool results flow through the same SSE events.

**What changes in sub_agent_tools.py:**

```python
# Add to execute_tool()
elif tool_name == "kb_ls":
    from app.services.kb_tools import kb_ls
    return await kb_ls(arguments.get("path", "/"), user_id, db)
elif tool_name == "kb_tree":
    from app.services.kb_tools import kb_tree
    return await kb_tree(arguments.get("path", "/"), user_id, db, depth=arguments.get("depth", 3))
elif tool_name == "kb_grep":
    from app.services.kb_tools import kb_grep
    return await kb_grep(arguments["pattern"], user_id, db, path=arguments.get("path"), case_sensitive=arguments.get("case_sensitive", False))
elif tool_name == "kb_glob":
    from app.services.kb_tools import kb_glob
    return await kb_glob(arguments["pattern"], user_id, db)
elif tool_name == "kb_read":
    from app.services.kb_tools import kb_read
    return await kb_read(arguments["path"], user_id, db, offset=arguments.get("offset", 0), limit=arguments.get("limit", 200))
```

**What changes in intent_service.py:**

```python
# Add KB exploration patterns for fast-path routing
_KB_EXPLORE_PATTERNS = re.compile(
    r"\b("
    r"list (all )?(my )?(files?|documents?|folders?) (in|under|at)"
    r"|what('?s| is) in (the |my )?\w+ folder"
    r"|show (me )?(the )?folder (structure|tree|hierarchy)"
    r"|find (files?|documents?) (named|matching|like|called)"
    r"|search (for|my) (files?|documents?) (containing|with|about)"
    r"|read (the )?(file|document|content)"
    r"|grep|glob|tree"
    r")\b",
    re.IGNORECASE,
)
```

## Build Order (Dependencies)

This ordering reflects hard dependencies -- each phase requires the one before it.

### Phase 1: Database Foundation + Folder Service
**Build:** folders table, document_content table, folder_id on documents, folder_service.py, migration script
**Why first:** Everything else depends on the folder hierarchy existing in the database. KB tools query these tables. UI needs the REST API.
**Depends on:** Nothing new (existing SQLite infrastructure)

### Phase 2: Full-Text Content Storage (Ingestion Modification)
**Build:** Modify ingestion_service.py to store full markdown in document_content. Backfill existing documents.
**Why second:** KB tools (grep, read) cannot work without stored full text. Must happen before tools are built.
**Depends on:** Phase 1 (document_content table exists)

### Phase 3: KB Tool Implementations
**Build:** kb_tools.py with all five tools (ls, tree, grep, glob, read). Unit test each tool independently.
**Why third:** Tools are the core value. They need folders and content to query against.
**Depends on:** Phase 1 (folders), Phase 2 (document_content)

### Phase 4: Tool Registration + Intent Routing
**Build:** Modify sub_agent_tools.py to register KB tools. Modify intent_service.py to detect exploration queries. Add `include_kb_tools` flag to tool definitions.
**Why fourth:** Registration is the glue between KB tools and the existing agent loop.
**Depends on:** Phase 3 (tools exist to register)

### Phase 5: Folder CRUD REST API + UI
**Build:** folders router, Pydantic models, folder tree panel in UI, upload-to-folder, move operations.
**Why last:** The UI for folder management is independent of the agent using KB tools. Users can start using agent exploration (Phase 4) while folder UI is still being built.
**Depends on:** Phase 1 (folder_service)

## Anti-Patterns

### Anti-Pattern 1: Separate Explorer Agent Service

**What people do:** Create a new `explorer_agent_service.py` with its own tool-calling loop, separate from the existing sub-agent.
**Why it's wrong:** Duplicates the entire tool-calling loop (OpenAI format, Anthropic format, streaming, error handling, max iterations). Two loops to maintain. The existing sub-agent is already generic.
**Do this instead:** Register KB tools into the existing `sub_agent_tools.py` registry. The sub-agent loop handles everything.

### Anti-Pattern 2: Querying ChromaDB for Grep/Read

**What people do:** Try to implement grep by searching ChromaDB chunks and reconstructing text.
**Why it's wrong:** Chunks have overlapping content, arbitrary split points, and no line numbers. Regex across chunk boundaries fails silently. Reconstructed text has duplicated content from overlap.
**Do this instead:** Store full extracted markdown in `document_content` table. Grep and read operate on contiguous text with proper line numbering.

### Anti-Pattern 3: Real Filesystem Paths as Primary Keys

**What people do:** Use the actual filesystem path (`uploads/user123/reports/file.pdf`) as the canonical identifier, deriving folder structure from the filesystem.
**Why it's wrong:** Filesystem operations are not atomic with database operations. Moving files creates race conditions. Path changes break references. OS-level path limits vary.
**Do this instead:** Use SQLite folder IDs as canonical identifiers. Materialized path column for display. Filesystem mirrors the structure but is not the source of truth.

### Anti-Pattern 4: Loading All Content into LLM Context

**What people do:** When the LLM calls `kb_grep`, load all matching document content into the response.
**Why it's wrong:** A single grep across 100 documents could return megabytes of text, blowing the context window.
**Do this instead:** Return summaries: `filename:line_num: matching_line` (like ripgrep). The LLM can then `kb_read` specific files/ranges it finds interesting. This mirrors Claude Code's own behavior.

### Anti-Pattern 5: Folder Hierarchy via Tags/Labels

**What people do:** Implement "folders" as tags or labels on documents, with path-like tag values.
**Why it's wrong:** Cannot enforce unique names within a parent. Cannot efficiently list "children of folder X". Move operations require string manipulation on all document tags. No cascading delete.
**Do this instead:** Proper `folders` table with parent_id foreign key. Standard adjacency list. Documents have a single `folder_id`.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-500 documents | Current approach is fine. Python regex for grep, simple SQL queries. |
| 500-5000 documents | Add SQLite FTS5 virtual table for full-text search as alternative to regex grep. Index document_content for faster pattern matching. |
| 5000+ documents | Consider caching folder tree structure in memory (invalidated on CRUD). Paginate grep results. Background indexing for FTS. |

### Scaling Priorities

1. **First bottleneck: Grep over many documents.** Python regex over all document content is O(n) in total text size. For 1000+ documents, this gets slow. Mitigation: scope grep to specific folder paths (WHERE path LIKE 'reports/%'). Later: add FTS5 index.
2. **Second bottleneck: Tree rendering for deep/wide hierarchies.** Recursive CTE with many folders could be slow. Mitigated by depth limits (default 3) and item count limits (50 items max). For production: cache the tree per user.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| KB tools <-> folder_service | Direct function calls | kb_tools imports folder_service.resolve_path() for path-to-ID conversion |
| KB tools <-> sub_agent_tools | Tool registry pattern | KB tools register definitions; dispatcher calls implementations |
| Folder CRUD <-> ingestion | folder_id parameter on upload | Documents link to folders via foreign key |
| Folder CRUD <-> ChromaDB | Metadata update on move | When a document moves folders, update chunk metadata (folder_path) in ChromaDB for potential filtered semantic search |
| Folder CRUD <-> storage_service | Filesystem sync | Create/move/delete directories mirrors folder operations |

### Existing Services (No Changes Needed)

| Service | Why Untouched |
|---------|---------------|
| retrieval_service.py | Semantic search stays in ChromaDB. KB tools are a separate search layer. |
| llm_service.py | Chat completion logic unchanged. KB tools run inside existing sub-agent loop. |
| embedding_service.py | Embeddings still generated during ingestion. KB tools don't need embeddings. |
| chunking_service.py | Chunking still happens for ChromaDB. Full text stored separately in document_content. |

## Sources

- Existing codebase analysis (HIGH confidence): `sub_agent_service.py`, `sub_agent_tools.py`, `intent_service.py`, `storage_service.py`, `database.py`
- SQLite adjacency list + materialized path pattern: well-established pattern for hierarchical data in SQL (HIGH confidence)
- Claude Code tool design patterns: ls/tree/grep/glob/read output formatting conventions (HIGH confidence, directly observable)

---
*Architecture research for: Knowledge Base Explorer tools*
*Researched: 2026-03-15*
