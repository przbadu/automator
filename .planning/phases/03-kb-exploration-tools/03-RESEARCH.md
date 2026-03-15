# Phase 3: KB Exploration Tools - Research

**Researched:** 2026-03-15
**Domain:** Python/FastAPI backend service layer -- five KB exploration tools operating on SQLite data
**Confidence:** HIGH

## Summary

Phase 3 builds five exploration tools (ls, tree, grep, glob, read) as a Python service layer with corresponding FastAPI endpoints. All tools operate on **virtual folder paths** stored in the SQLite `folders` table and **full extracted markdown** stored in the `document_content` table. No filesystem traversal is needed -- everything is database-driven with user_id scoping.

The foundation from Phase 1 is solid: `folders` table with materialized paths, `document_content` table with line/char counts, FTS5 virtual table with sync triggers, and existing content/FTS endpoints. The tools are pure query logic -- no new dependencies required. The main complexity is building correct recursive SQL for tree traversal and implementing regex search with line-number tracking on stored markdown content.

**Primary recommendation:** Implement all five tools as pure async functions in a single `kb_tools_service.py`, expose them via a `/kb/tools` FastAPI router, and keep each tool function self-contained with Langfuse `@observe()` tracing. Tools return Pydantic models, not raw strings -- this makes them directly usable by both REST endpoints and the Phase 4 agent integration.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOL-01 | `ls(path)` lists files and subfolders in a folder | SQLite query on `folders` + `documents` tables with parent_id/folder_id filtering; virtual path resolution via `folders.path` column |
| TOOL-02 | `tree(path, depth?, limit?)` hierarchical structure with depth limit and truncation | Recursive CTE on `folders` table with depth counter; join documents at leaf level; truncation via row counting |
| TOOL-03 | `grep(pattern, path?, case_insensitive?)` regex search on extracted markdown | Python `re` module on `document_content.content`; FTS5 for keyword pre-filtering optimization; line-number extraction from stored text |
| TOOL-04 | `glob(pattern)` match filenames by pattern | `fnmatch.fnmatch()` on virtual paths (folder path + filename); SQL pre-filter with LIKE for common patterns |
| TOOL-05 | `read(path)` full document markdown content | Direct query on `document_content` table; resolve document by folder path + filename |
| TOOL-06 | `read(path, offset, limit)` specific line range with line numbers | Split stored content by newlines, slice by offset/limit, prepend line numbers |
| TOOL-08 | All tools enforce user_id scoping | Every SQL query includes `WHERE user_id = ?` parameter; enforced at service layer, not just router |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | (existing) | REST endpoints for tools | Already in stack |
| aiosqlite | (existing) | Async SQLite queries | Already in stack |
| Pydantic | (existing) | Response models for tool outputs | Already in stack |
| langfuse | (existing) | `@observe()` tracing on every tool | Required by CLAUDE.md |

### Supporting (stdlib -- no new deps)
| Library | Module | Purpose | When to Use |
|---------|--------|---------|-------------|
| `re` | stdlib | Regex pattern matching for grep | TOOL-03 regex search |
| `fnmatch` | stdlib | Glob pattern matching | TOOL-04 filename matching |

### No New Dependencies Needed
All five tools are implemented with existing project dependencies plus Python stdlib. No `pip install` required.

## Architecture Patterns

### Recommended Project Structure
```
backend/app/
  services/
    kb_tools_service.py    # All 5 tool functions (ls, tree, grep, glob, read)
  routers/
    kb_tools.py            # FastAPI router exposing tools as REST endpoints
  models/
    kb_tools.py            # Pydantic request/response models
```

### Pattern 1: Virtual Path Resolution
**What:** Tools accept human-readable folder paths (e.g., `/reports/2024`) and resolve them to folder IDs via the `folders.path` column. Documents are identified by `{folder_path}/{filename}`.
**When to use:** Every tool that accepts a `path` parameter.
**Example:**
```python
async def resolve_folder_id(db: aiosqlite.Connection, user_id: str, path: str) -> str | None:
    """Resolve a virtual path like '/reports/2024' to a folder ID."""
    if path in ("", "/"):
        return None  # Root folder (no folder_id -- documents with folder_id=NULL)

    normalized = path.strip("/")
    cursor = await db.execute(
        "SELECT id FROM folders WHERE user_id = ? AND path = ?",
        (user_id, f"/{normalized}"),
    )
    row = await cursor.fetchone()
    return row[0] if row else None


async def resolve_document(
    db: aiosqlite.Connection, user_id: str, path: str
) -> tuple[str, str] | None:
    """Resolve '/reports/2024/summary.pdf' to (document_id, filename).

    Last path segment is filename, rest is folder path.
    """
    parts = path.strip("/").rsplit("/", 1)
    if len(parts) == 1:
        # Root-level document
        filename = parts[0]
        folder_id = None
    else:
        folder_path, filename = parts
        folder_id = await resolve_folder_id(db, user_id, f"/{folder_path}")
        if folder_id is None:
            return None

    if folder_id is None:
        cursor = await db.execute(
            "SELECT id FROM documents WHERE user_id = ? AND filename = ? AND folder_id IS NULL",
            (user_id, filename),
        )
    else:
        cursor = await db.execute(
            "SELECT id FROM documents WHERE user_id = ? AND filename = ? AND folder_id = ?",
            (user_id, filename, folder_id),
        )
    row = await cursor.fetchone()
    return (row[0], filename) if row else None
```

### Pattern 2: Recursive CTE for Tree
**What:** Use SQLite recursive CTEs to traverse the folder hierarchy with depth limiting.
**When to use:** TOOL-02 (tree) and any operation needing folder descendants.
**Example:**
```python
TREE_QUERY = """
WITH RECURSIVE folder_tree AS (
    -- Base case: target folder's children (or root folders if no target)
    SELECT id, name, parent_id, path, 1 as depth
    FROM folders
    WHERE user_id = ? AND parent_id IS ?

    UNION ALL

    -- Recursive: children of current level
    SELECT f.id, f.name, f.parent_id, f.path, ft.depth + 1
    FROM folders f
    JOIN folder_tree ft ON f.parent_id = ft.id
    WHERE ft.depth < ?  -- depth limit parameter
)
SELECT id, name, parent_id, path, depth FROM folder_tree
ORDER BY path
"""
```

### Pattern 3: Line-Oriented Content Operations
**What:** Stored markdown content is split by newlines for line-number operations (read with offset/limit, grep with line previews).
**When to use:** TOOL-03 (grep line previews), TOOL-06 (read with range).
**Example:**
```python
def extract_line_range(content: str, offset: int = 0, limit: int | None = None) -> str:
    """Extract lines with line numbers, like `cat -n`."""
    lines = content.split("\n")
    total = len(lines)

    end = min(offset + limit, total) if limit else total
    selected = lines[offset:end]

    # Format with line numbers (1-indexed)
    width = len(str(end))
    numbered = [f"{i + offset + 1:>{width}}  {line}" for i, line in enumerate(selected)]
    return "\n".join(numbered)
```

### Pattern 4: Tool Function Signature Convention
**What:** Every tool function is async, takes `db` + `user_id` as first params, returns a Pydantic model, and has `@observe()`.
**When to use:** All five tools.
**Example:**
```python
@observe(name="kb_tool_ls")
async def kb_ls(
    db: aiosqlite.Connection,
    user_id: str,
    path: str = "/",
) -> LsResult:
    ...
```

### Anti-Patterns to Avoid
- **Filesystem traversal:** Never read the `uploads/` directory directly. All data comes from SQLite. The filesystem layout (`uploads/{user_id}/{document_id}/{filename}`) does NOT match the virtual folder structure.
- **Unscoped queries:** Never run a query without `WHERE user_id = ?`. Even in helper functions.
- **Loading full content for grep:** For large KBs, don't load all document content into memory at once. Query document by document or use FTS5 pre-filtering.
- **Returning raw SQL rows:** Always map to Pydantic models. Phase 4 agent integration needs structured output.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Glob matching | Custom wildcard parser | `fnmatch.fnmatch()` | Handles `*`, `?`, `[seq]`, `**` patterns correctly |
| Regex search | Custom string scanner | `re.compile()` + `re.IGNORECASE` | Handles all regex edge cases, pre-compilation for performance |
| Recursive folder traversal | Python loops with repeated queries | SQLite recursive CTEs | Single query, handled by SQLite optimizer |
| Full-text keyword search | Manual string matching | FTS5 `MATCH` queries | Already indexed, handles tokenization and ranking |
| Path normalization | Custom string manipulation | Consistent convention: always store/compare with leading `/`, strip trailing `/` | Avoids off-by-one path matching bugs |

## Common Pitfalls

### Pitfall 1: Root Folder Ambiguity
**What goes wrong:** Unclear whether "root" means `folder_id IS NULL` or a specific root folder record.
**Why it happens:** Documents without a folder assignment have `folder_id = NULL`. The "root" in `ls("/")` means "unfiled documents + top-level folders."
**How to avoid:** Define root as: `folder_id IS NULL` for documents, `parent_id IS NULL` for folders. Document this convention explicitly. `ls("/")` returns top-level folders + unfiled documents.
**Warning signs:** Tests pass for nested paths but fail for root path.

### Pitfall 2: FTS5 vs Regex Mismatch in Grep
**What goes wrong:** Using FTS5 MATCH syntax where the user expects regex, or vice versa.
**Why it happens:** TOOL-03 specifies regex search, but FTS5 uses its own query syntax (not regex). FTS5 is useful for keyword pre-filtering but cannot do regex.
**How to avoid:** Implement grep as: (1) query `document_content` rows for the user, (2) apply Python `re.search()` line by line, (3) optionally use FTS5 as a pre-filter for simple keyword patterns to reduce the scan set.
**Warning signs:** Patterns like `error\d+` return no results even though content has "error123".

### Pitfall 3: Large Output Blowup
**What goes wrong:** Tree of 1000+ folders or grep matching 500 documents returns megabytes of text.
**Why it happens:** No output size limits.
**How to avoid:** Every tool needs output limits: `tree` has `limit` parameter for max entries, `grep` has max matches and max line previews per document, `ls` paginates, `read` has offset/limit. Add truncation indicators like `... and 47 more items`.
**Warning signs:** API responses take seconds, agent context fills up.

### Pitfall 4: Empty KB Edge Case
**What goes wrong:** Tools crash or return confusing errors when user has no folders or documents.
**Why it happens:** SQL queries return empty results, code assumes at least one row.
**How to avoid:** Handle empty results gracefully: `ls("/")` on empty KB returns `{folders: [], files: []}`, tree returns `(empty)`, grep returns `{matches: [], total: 0}`.

### Pitfall 5: Path Injection / Traversal
**What goes wrong:** User passes `../../etc/passwd` as a path parameter.
**Why it happens:** Path is used in SQL query, but if any code accidentally touches filesystem.
**How to avoid:** Since tools only query SQLite (never filesystem), path traversal is neutralized. But still validate: paths must start with `/`, contain no `..` segments. This is defense-in-depth.

### Pitfall 6: Documents Not Yet in Folders
**What goes wrong:** Existing documents have `folder_id = NULL` because Phase 2 (folder operations) hasn't run yet.
**Why it happens:** Phase 3 depends on Phase 1, not Phase 2. Documents were uploaded before folders existed.
**How to avoid:** All tools must handle `folder_id = NULL` gracefully. `ls("/")` shows these as root-level files. `glob("*.pdf")` must match them. `read` must work for unfiled documents.

## Code Examples

### ls Tool Implementation Sketch
```python
@observe(name="kb_tool_ls")
async def kb_ls(
    db: aiosqlite.Connection,
    user_id: str,
    path: str = "/",
) -> LsResult:
    """List files and subfolders at the given path."""
    folder_id = await resolve_folder_id(db, user_id, path) if path != "/" else None

    if path != "/" and folder_id is None:
        return LsResult(path=path, folders=[], files=[], error="Folder not found")

    # Get subfolders
    if folder_id is None:
        cursor = await db.execute(
            "SELECT id, name, path FROM folders WHERE user_id = ? AND parent_id IS NULL ORDER BY name",
            (user_id,),
        )
    else:
        cursor = await db.execute(
            "SELECT id, name, path FROM folders WHERE user_id = ? AND parent_id = ? ORDER BY name",
            (user_id, folder_id),
        )
    folder_rows = await cursor.fetchall()

    # Get files in this folder
    if folder_id is None:
        cursor = await db.execute(
            "SELECT id, filename, file_size, mime_type, status FROM documents WHERE user_id = ? AND folder_id IS NULL ORDER BY filename",
            (user_id,),
        )
    else:
        cursor = await db.execute(
            "SELECT id, filename, file_size, mime_type, status FROM documents WHERE user_id = ? AND folder_id = ? ORDER BY filename",
            (user_id, folder_id),
        )
    file_rows = await cursor.fetchall()

    return LsResult(
        path=path,
        folders=[FolderEntry(id=r[0], name=r[1], path=r[2]) for r in folder_rows],
        files=[FileEntry(id=r[0], name=r[1], size=r[2], mime_type=r[3], status=r[4]) for r in file_rows],
    )
```

### grep Tool Implementation Sketch
```python
@observe(name="kb_tool_grep")
async def kb_grep(
    db: aiosqlite.Connection,
    user_id: str,
    pattern: str,
    path: str | None = None,
    case_insensitive: bool = False,
    max_matches: int = 50,
    context_lines: int = 0,
) -> GrepResult:
    """Regex search across extracted markdown content."""
    flags = re.IGNORECASE if case_insensitive else 0
    try:
        compiled = re.compile(pattern, flags)
    except re.error as e:
        return GrepResult(pattern=pattern, matches=[], total=0, error=f"Invalid regex: {e}")

    # Build query with optional path scoping
    query = """
        SELECT dc.document_id, d.filename, d.folder_id, dc.content
        FROM document_content dc
        JOIN documents d ON d.id = dc.document_id
        WHERE dc.user_id = ?
    """
    params: list = [user_id]

    if path:
        folder_id = await resolve_folder_id(db, user_id, path)
        if folder_id:
            # Include documents in this folder and all subfolders
            query += " AND (d.folder_id = ? OR d.folder_id IN (SELECT id FROM folders WHERE user_id = ? AND path LIKE ?))"
            params.extend([folder_id, user_id, f"{path}/%"])

    cursor = await db.execute(query, params)

    matches = []
    for row in await cursor.fetchall():
        doc_id, filename, folder_id_val, content = row
        lines = content.split("\n")
        doc_matches = []
        for line_num, line in enumerate(lines, 1):
            if compiled.search(line):
                doc_matches.append(GrepLineMatch(line_number=line_num, text=line.strip()[:200]))
                if len(doc_matches) >= 5:  # Max previews per doc
                    break
        if doc_matches:
            matches.append(GrepDocMatch(
                document_id=doc_id,
                filename=filename,
                line_matches=doc_matches,
            ))
            if len(matches) >= max_matches:
                break

    return GrepResult(pattern=pattern, matches=matches, total=len(matches), truncated=len(matches) >= max_matches)
```

### Pydantic Response Models Sketch
```python
from pydantic import BaseModel

class FolderEntry(BaseModel):
    id: str
    name: str
    path: str

class FileEntry(BaseModel):
    id: str
    name: str
    size: int
    mime_type: str
    status: str

class LsResult(BaseModel):
    path: str
    folders: list[FolderEntry]
    files: list[FileEntry]
    error: str | None = None

class TreeNode(BaseModel):
    name: str
    type: str  # "folder" or "file"
    path: str
    children: list["TreeNode"] | None = None

class TreeResult(BaseModel):
    root: str
    nodes: list[TreeNode]
    total_folders: int
    total_files: int
    truncated: bool = False

class GrepLineMatch(BaseModel):
    line_number: int
    text: str

class GrepDocMatch(BaseModel):
    document_id: str
    filename: str
    line_matches: list[GrepLineMatch]

class GrepResult(BaseModel):
    pattern: str
    matches: list[GrepDocMatch]
    total: int
    truncated: bool = False
    error: str | None = None

class GlobMatch(BaseModel):
    document_id: str
    filename: str
    path: str

class GlobResult(BaseModel):
    pattern: str
    matches: list[GlobMatch]
    total: int

class ReadResult(BaseModel):
    path: str
    content: str
    line_count: int
    char_count: int
    offset: int | None = None
    limit: int | None = None
    total_lines: int | None = None
    error: str | None = None
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chunk-based reading (ChromaDB) | Full markdown from `document_content` | Phase 1 (2026-03-15) | Tools read full text, not chunks |
| Flat document list | Folders with materialized paths | Phase 1 schema | Tools can navigate hierarchy |
| No full-text search | FTS5 virtual table | Phase 1 migration 005 | grep can use FTS5 pre-filtering |

**Key decision from STATE.md:** "Keep folders as logical SQLite-only concept -- flat filesystem layout preserved." This means tools MUST NOT traverse `uploads/` directory. All operations are database queries.

## Open Questions

1. **Folder path format convention**
   - What we know: Migration stores `path` as e.g., `/reports/2024/q1`
   - What's unclear: Whether root is represented as `/` or empty string in queries
   - Recommendation: Use `/` as root, all stored paths start with `/`, normalize on input

2. **Phase 2 not yet complete -- how do tools handle missing folder structure?**
   - What we know: Documents exist with `folder_id = NULL`. Phase 2 adds folder CRUD.
   - What's unclear: Whether any folders exist in the DB yet
   - Recommendation: Tools work correctly with zero folders. `ls("/")` shows all documents as root-level. `tree("/")` shows flat list. Tools become more useful as folders are created in Phase 2.

3. **grep performance on large KBs**
   - What we know: FTS5 does keyword search fast, but TOOL-03 requires regex
   - What's unclear: Performance of scanning all `document_content` rows with Python regex for a user with 1000+ documents
   - Recommendation: For v1, scan all user documents with Python regex. If slow, add FTS5 pre-filtering for simple patterns. Document this as a future optimization path (TOOL-10 in v2).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio + httpx (for FastAPI test client) |
| Config file | None -- Wave 0 gap |
| Quick run command | `cd backend && uv run pytest tests/ -x -q` |
| Full suite command | `cd backend && uv run pytest tests/ -v` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOOL-01 | ls lists files and subfolders | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_ls -x` | No -- Wave 0 |
| TOOL-02 | tree returns hierarchy with depth limit | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_tree -x` | No -- Wave 0 |
| TOOL-03 | grep regex search with line previews | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_grep -x` | No -- Wave 0 |
| TOOL-04 | glob matches filename patterns | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_glob -x` | No -- Wave 0 |
| TOOL-05 | read returns full document content | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_read_full -x` | No -- Wave 0 |
| TOOL-06 | read with offset/limit returns line range | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_read_range -x` | No -- Wave 0 |
| TOOL-08 | user scoping -- user A cannot see user B data | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_user_scoping -x` | No -- Wave 0 |
| ALL | REST endpoints return correct responses | integration | `cd backend && uv run pytest tests/test_kb_tools_api.py -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/test_kb_tools.py -x -q`
- **Per wave merge:** `cd backend && uv run pytest tests/ -v`
- **Phase gate:** Full suite green + curl validation of all 5 endpoints

### Wave 0 Gaps
- [ ] `backend/tests/conftest.py` -- shared fixtures (test DB, test user, sample folders/documents)
- [ ] `backend/tests/test_kb_tools.py` -- unit tests for service functions
- [ ] `backend/tests/test_kb_tools_api.py` -- integration tests for REST endpoints
- [ ] Framework install: `cd backend && uv add --dev pytest pytest-asyncio httpx`

## Sources

### Primary (HIGH confidence)
- Existing codebase: `backend/migrations/005_folders_and_content.sql` -- schema for folders, document_content, FTS5
- Existing codebase: `backend/app/services/sub_agent_tools.py` -- tool definition pattern (OpenAI + Anthropic formats)
- Existing codebase: `backend/app/routers/documents.py` -- existing FTS search endpoint, content endpoint
- Existing codebase: `backend/app/database.py` -- DB connection pattern, migration runner
- SQLite FTS5 documentation -- tokenize, MATCH, highlight, rank
- Python stdlib: `re` module, `fnmatch` module -- verified behavior with local tests

### Secondary (MEDIUM confidence)
- `fnmatch.fnmatch()` behavior with `**` patterns -- verified via local Python execution: handles `**` as "match anything including `/`", but `**/*` requires at least one extra segment

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing patterns
- Architecture: HIGH - clear database schema, established patterns in codebase
- Pitfalls: HIGH - derived from schema analysis and tool requirements
- Validation: MEDIUM - no existing test infrastructure, needs Wave 0 setup

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- no external dependencies changing)
