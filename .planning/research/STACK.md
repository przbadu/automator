# Stack Research

**Domain:** Knowledge Base Exploration Tools (ls, tree, grep, glob, read) for RAG Application
**Researched:** 2026-03-15
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

No new frameworks or external dependencies are needed. This feature is built entirely on top of the existing stack (SQLite/aiosqlite, ChromaDB, Python stdlib) with targeted schema additions and new service modules.

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| SQLite FTS5 (via aiosqlite) | Built into SQLite 3.9+ / Python stdlib | Full-text search over extracted markdown | Zero-dependency, ships with Python's sqlite3 module. Supports boolean queries (AND/OR/NOT), phrase search, prefix search, and BM25 ranking out of the box. Already using aiosqlite in the project. |
| SQLite Recursive CTEs | Built into SQLite 3.8.3+ | Folder hierarchy traversal (tree, ls, path resolution) | WITH RECURSIVE is native SQL -- no ORM or library needed. Perfect for adjacency list (parent_id) folder trees. Single query gets full subtree at any depth. |
| Python `fnmatch` | stdlib (Python 3.13+) | Glob pattern matching against document paths | Standard library, zero dependencies. `fnmatch.filter()` matches shell-style wildcards (*, ?, []) against path lists. `fnmatch.translate()` converts glob patterns to regex for SQL LIKE/REGEXP fallback. |
| Python `re` module + SQLite REGEXP | stdlib | Regex search over stored markdown content | Register `re.search` as SQLite custom function via `create_function("REGEXP", 2, ...)` on the aiosqlite connection. Enables `WHERE content REGEXP ?` queries directly in SQL. |

### Supporting Libraries

No new pip dependencies required. Everything uses Python stdlib + existing project deps.

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `aiosqlite` | 0.22.1+ (existing) | Async SQLite access for all folder/document queries | All KB exploration tool implementations. Use `create_function` on the connection to register REGEXP. |
| `langfuse` | 4.0.0+ (existing) | Tracing for all new tool executions | Every tool handler gets `@observe()` decorator per project convention. |
| `fnmatch` | stdlib | Glob pattern matching | `glob` tool implementation -- fetch paths from SQLite, filter with `fnmatch.filter()`. |
| `re` | stdlib | Regex compilation and matching | `grep` tool -- either in-Python regex matching or registered as SQLite REGEXP function. |
| `textwrap` | stdlib | Truncating tree/ls output for context window safety | Tree tool output formatting with depth limits and "... N more" indicators. |

### Development Tools

No new dev tooling needed. Existing Playwright test infrastructure covers new API endpoints.

| Tool | Purpose | Notes |
|------|---------|-------|
| Playwright (existing) | E2E testing of new folder CRUD + exploration API endpoints | Add tests in `tests/e2e/api/` for folder operations and tool endpoints |
| aiosqlite migrations | Schema additions for folders table and document_content table | Follow existing pattern in `backend/migrations/` with sequential numbering |

## Schema Design (New Tables)

This is the core stack decision -- how to model folders and full-text content in SQLite.

### Folders Table (Adjacency List)

```sql
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    path TEXT NOT NULL,  -- materialized path e.g. "/reports/2024/q1"
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, path)
);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(user_id, path);
```

**Why adjacency list + materialized path (hybrid):**
- `parent_id` enables recursive CTE for tree traversal (get all descendants)
- `path` column enables fast prefix matching for ls (`WHERE path LIKE '/reports/%'`), glob operations, and human-readable display
- Both are maintained together -- path is derived from parent chain, updated on folder move
- Adjacency list is the simplest model and SQLite recursive CTEs handle it efficiently for knowledge base scale (thousands of folders, not millions)

### Document Content Table (Full Markdown Storage)

```sql
CREATE TABLE IF NOT EXISTS document_content (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,  -- full extracted markdown
    line_count INTEGER NOT NULL DEFAULT 0,
    char_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_document_content_user_id ON document_content(user_id);
```

**Why a separate table (not a column on documents):**
- Full markdown can be megabytes -- keeping it separate avoids bloating common document list queries
- Clean separation: `documents` table for metadata, `document_content` for full text
- Can be populated during ingestion alongside chunking with zero additional processing cost (the text is already extracted by Docling)

### FTS5 Virtual Table (For grep)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS document_content_fts USING fts5(
    content,
    content='document_content',
    content_rowid='rowid',
    tokenize='unicode61'
);
```

**Why FTS5 over in-Python regex:**
- For keyword/phrase search: FTS5 is orders of magnitude faster than scanning all documents with Python regex
- For regex search: Fall back to Python `re` module via SQLite REGEXP custom function (FTS5 does not support regex)
- Two-tier approach: FTS5 for fast keyword grep, REGEXP for pattern grep

### Add folder_id to Documents

```sql
ALTER TABLE documents ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id);
```

**Why SET NULL on delete:** If a folder is deleted, documents become "unfiled" rather than being deleted. Safer default.

## Key Implementation Patterns

### REGEXP Registration on aiosqlite Connection

```python
import re
import aiosqlite

async def get_db_with_regexp() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    await db.execute("PRAGMA foreign_keys = ON")

    def regexp_func(pattern: str, text: str) -> bool:
        if text is None:
            return False
        try:
            return re.search(pattern, text, re.IGNORECASE) is not None
        except re.error:
            return False

    await db.create_function("REGEXP", 2, regexp_func)
    return db
```

**Confidence:** HIGH -- aiosqlite wraps sqlite3 and exposes `create_function` as an async method. This is the standard pattern for adding REGEXP support to SQLite in Python.

### Recursive CTE for Tree

```sql
WITH RECURSIVE folder_tree AS (
    SELECT id, name, parent_id, path, 0 AS depth
    FROM folders
    WHERE user_id = ? AND parent_id IS NULL

    UNION ALL

    SELECT f.id, f.name, f.parent_id, f.path, ft.depth + 1
    FROM folders f
    INNER JOIN folder_tree ft ON f.parent_id = ft.id
    WHERE ft.depth < ?  -- depth limit parameter
)
SELECT * FROM folder_tree ORDER BY path;
```

**Confidence:** HIGH -- SQLite has supported recursive CTEs since 3.8.3 (2014). This is the standard approach for hierarchical data.

### Glob via fnmatch

```python
import fnmatch

async def glob_documents(pattern: str, user_id: str, db) -> list[dict]:
    """Match document paths against a glob pattern."""
    # Fetch all document paths for user
    cursor = await db.execute(
        """SELECT d.id, d.filename, COALESCE(f.path || '/', '/') || d.filename AS full_path
           FROM documents d
           LEFT JOIN folders f ON d.folder_id = f.id
           WHERE d.user_id = ? AND d.status = 'completed'""",
        (user_id,)
    )
    rows = await cursor.fetchall()

    # Filter with fnmatch
    return [
        {"id": row[0], "filename": row[1], "path": row[2]}
        for row in rows
        if fnmatch.fnmatch(row[2], pattern)
    ]
```

**Confidence:** HIGH -- fnmatch is stdlib and handles *, ?, ** patterns. For knowledge base scale (hundreds to low thousands of documents per user), in-memory filtering after SQL fetch is efficient enough. No need for complex SQL pattern translation.

## Installation

```bash
# No new dependencies needed
# All capabilities come from Python stdlib + existing project dependencies

# The only changes are:
# 1. New SQLite migration files in backend/migrations/
# 2. New service modules in backend/app/services/
# 3. New router module in backend/app/routers/
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| SQLite FTS5 for keyword grep | Whoosh (pure Python search library) | Never for this project. FTS5 is built-in, zero-dependency, and faster. Whoosh is unmaintained since 2015. |
| Adjacency list + materialized path | Nested set model | Only if reads vastly outnumber writes AND hierarchy is deep (100+ levels). Nested sets are complex to maintain on inserts/moves. Adjacency list with CTEs is simpler and fast enough for KB scale. |
| Adjacency list + materialized path | Closure table | Only if you need arbitrary ancestor/descendant queries without recursive CTEs. Adds a separate table with O(n^2) rows. Overkill for folder trees. |
| fnmatch for glob matching | SQL LIKE/GLOB operator | Only for simple prefix matching. SQL GLOB lacks ** (recursive wildcard). fnmatch is more expressive and familiar to users who know shell patterns. |
| Python re via create_function | sqlean REGEXP extension (C-based) | Only if regex performance on millions of rows is critical. Adds a native extension dependency. For KB scale with hundreds of documents, Python re is fast enough. |
| Separate document_content table | Store full markdown as column on documents | Only if you never list documents without their content. Separate table keeps document listing fast. |
| FTS5 content sync table | Standalone FTS5 table (duplicate content) | Never. Content sync (`content='document_content'`) avoids storing text twice. Uses triggers to keep FTS index in sync with the content table. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Whoosh | Unmaintained since 2015, adds a dependency for something SQLite does natively | SQLite FTS5 |
| Elasticsearch / Meilisearch / Typesense | Massive overkill for single-user knowledge base. Adds infrastructure complexity. Project constraint: all data stays local, no external services. | SQLite FTS5 + REGEXP |
| SQLAlchemy ORM | Project uses raw aiosqlite queries throughout. Adding an ORM for just folders would be inconsistent and add dependency weight. | Raw SQL via aiosqlite (consistent with existing codebase) |
| LangChain document loaders | Explicitly prohibited by project rules ("No LangChain"). Docling is already handling conversion. | Existing Docling pipeline + direct SQLite storage |
| pathlib/os for "virtual" file operations | The folder hierarchy is a database abstraction, not a real filesystem. Don't use os.walk or pathlib.glob on the actual uploads/ directory for tool operations. | SQLite queries over folders/documents tables |
| Nested sets or MPTT | Over-engineered for folder trees with low-hundreds of nodes. Complex insert/move logic. | Adjacency list + materialized path + recursive CTEs |

## Stack Patterns by Variant

**If grep is keyword/phrase search:**
- Use FTS5 MATCH queries (`WHERE document_content_fts MATCH ?`)
- Returns ranked results with BM25 scoring
- Supports AND/OR/NOT/phrase syntax out of the box

**If grep is regex pattern search:**
- Use Python `re` via SQLite REGEXP custom function
- Query: `WHERE content REGEXP ?`
- Slower than FTS5 but handles arbitrary regex patterns
- Pre-filter by folder path to reduce scan scope

**If knowledge base exceeds ~10,000 documents per user:**
- Consider standalone FTS5 table (duplicate content) for better write performance
- Add pagination to glob results (currently fetches all paths into memory)
- This is unlikely for a personal knowledge base tool

**If folder hierarchy exceeds ~5 levels deep:**
- Current approach still works (recursive CTEs handle arbitrary depth)
- Tree tool already has depth limit parameter (default 3)
- No architecture change needed

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| aiosqlite 0.22+ | Python 3.13+, SQLite 3.35+ | FTS5 available since SQLite 3.9 (2015). Recursive CTEs since 3.8.3 (2014). REGEXP via create_function always available. |
| fnmatch (stdlib) | Python 3.13+ | Stable API, no compatibility concerns. |
| re (stdlib) | Python 3.13+ | Stable API. Use `re.search` not `re.match` for REGEXP (match anchors to start). |
| chromadb 1.5+ | Existing metadata filter patterns | No changes needed to ChromaDB usage. Folder metadata can be added to chunk metadata for filtered semantic search within folders. |

## Performance Considerations

| Operation | Expected Scale | Approach | Notes |
|-----------|---------------|----------|-------|
| `ls` (list folder) | 10-100 items per folder | Single indexed SQL query | O(1) via folder_id index |
| `tree` (hierarchy) | 100-1000 total folders | Recursive CTE with depth limit | Single query, depth-limited to 3 by default |
| `grep` keyword | 100-10,000 documents | FTS5 MATCH | Sub-millisecond for inverted index lookup |
| `grep` regex | 100-10,000 documents | REGEXP scan over document_content | ~10-100ms for scanning hundreds of documents. Pre-filter by folder to reduce scope. |
| `glob` | 100-10,000 paths | SQL fetch + fnmatch.filter() | Fetch all paths (small data), filter in Python. Fast. |
| `read` | Single document | Primary key lookup on document_content | O(1) |

## Sources

- [SQLite FTS5 Extension](https://www.sqlite.org/fts5.html) -- official SQLite documentation for FTS5 (HIGH confidence)
- [SQLite WITH Clause (Recursive CTEs)](https://sqlite.org/lang_with.html) -- official SQLite documentation for recursive queries (HIGH confidence)
- [SQLite Language Expressions (REGEXP)](https://www.sqlite.org/lang_expr.html) -- official docs on REGEXP operator requiring user-defined function (HIGH confidence)
- [Python fnmatch module](https://docs.python.org/3/library/fnmatch.html) -- stdlib documentation for Unix filename pattern matching (HIGH confidence)
- [Python glob module](https://docs.python.org/3/library/glob.html) -- stdlib documentation for pathname pattern expansion (HIGH confidence)
- [aiosqlite API Reference](https://aiosqlite.omnilib.dev/en/stable/api.html) -- confirms create_function support (HIGH confidence)
- [aiosqlite GitHub](https://github.com/omnilib/aiosqlite) -- async bridge to sqlite3 module (HIGH confidence)
- [GeeksforGeeks: SQLite Hierarchical Recursive Query](https://www.geeksforgeeks.org/sqlite/how-to-create-a-sqlite-hierarchical-recursive-query/) -- adjacency list + CTE examples (MEDIUM confidence)

---
*Stack research for: Knowledge Base Exploration Tools*
*Researched: 2026-03-15*
