# Phase 1: Data Foundation - Research

**Researched:** 2026-03-15
**Domain:** SQLite schema design, FTS5 full-text search, document ingestion pipeline modification
**Confidence:** HIGH

## Summary

Phase 1 establishes the database schema and content storage layer that all downstream features depend on. It creates three new database objects (folders table, document_content table, FTS5 virtual table), modifies the ingestion pipeline to store full extracted markdown alongside existing chunking, adds a backfill mechanism for existing documents, and adds a folder_id column to the documents table.

The existing codebase uses aiosqlite with raw SQL migrations (sorted `.sql` files in `backend/migrations/`), a flat filesystem layout (`uploads/{user_id}/{document_id}/{filename}`), and inline ALTER TABLE migrations in `database.py:init_db()`. All new schema changes follow these established patterns. No new Python dependencies are needed -- FTS5 is built into SQLite 3.46.1 (verified on this system), and all other capabilities come from Python stdlib.

**Primary recommendation:** Create a single migration file (`005_folders_and_content.sql`) for the folders table, document_content table, FTS5 virtual table with sync triggers, and the folder_id column on documents. Modify `ingestion_service.py` to store full markdown between conversion and chunking. Build a backfill script that re-extracts markdown from existing uploaded files.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOLDER-05 | Folder metadata stored in SQLite (id, name, parent_id, user_id, path) with real filesystem directories under uploads/ | Folders table schema with adjacency list + materialized path. Note: STATE.md decision says folders are SQLite-only logical concept -- flat filesystem preserved. No real filesystem directories. |
| DOC-03 | System stores full extracted markdown in `document_content` SQLite table during ingestion | document_content table schema + ingestion pipeline modification point identified (between conversion and chunking in `ingest_document()`) |
| DOC-04 | Existing documents backfilled with full markdown content | Backfill strategy using existing uploaded files + Docling re-extraction or plain text read |
| TOOL-07 | SQLite FTS5 virtual table indexed on extracted markdown for fast keyword search | FTS5 virtual table with content sync triggers, verified working with TEXT primary keys and SQLite 3.46.1 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| aiosqlite | 0.22+ (existing) | Async SQLite for all schema operations, queries, migrations | Already in use throughout the project. No new dependency. |
| SQLite FTS5 | Built into SQLite 3.46.1 | Full-text search over extracted markdown | Verified available on this system. Zero-dependency, ships with Python's sqlite3. Supports BM25 ranking, boolean queries, phrase search, prefix search, highlight(). |
| SQLite Recursive CTEs | Built into SQLite 3.46.1 | Folder hierarchy traversal (future phases) | WITH RECURSIVE is native SQL. Needed for tree operations in Phase 3. Schema must support it from day one. |
| Docling | Existing | Document-to-markdown conversion for backfill | Already used in `conversion_service.py`. Backfill reuses `convert_document()` for non-plaintext files. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| langfuse | Existing | Tracing for new ingestion steps and backfill | Per CLAUDE.md: every new service/pipeline step MUST have @observe() tracing |
| uuid (stdlib) | Python 3.13 | Generate folder IDs | Same pattern as document IDs in existing code |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FTS5 content sync table | Standalone FTS5 (duplicate content) | Content sync avoids double storage. Uses triggers to keep index in sync. Preferred. |
| Adjacency list + materialized path | Nested sets / Closure table | Overkill for folder trees. Adjacency list with recursive CTEs handles unlimited nesting simply. |
| Separate document_content table | Column on documents table | Full markdown can be megabytes. Separate table keeps document listing queries fast. Preferred. |

**Installation:**
```bash
# No new dependencies needed
# All capabilities use Python stdlib + existing project deps
```

## Architecture Patterns

### Recommended Project Structure (Phase 1 additions)
```
backend/
├── migrations/
│   └── 005_folders_and_content.sql    # NEW: folders, document_content, FTS5, folder_id
├── app/
│   ├── database.py                     # MODIFIED: no changes needed (init_db runs all .sql migrations)
│   ├── services/
│   │   ├── ingestion_service.py        # MODIFIED: store full markdown in document_content
│   │   └── backfill_service.py         # NEW: re-extract markdown for existing documents
│   └── models/
│       └── documents.py                # MODIFIED: add folder_id to DocumentResponse
```

### Pattern 1: Migration as Single SQL File
**What:** All Phase 1 schema changes go in one migration file (`005_folders_and_content.sql`) using `CREATE TABLE IF NOT EXISTS` and `CREATE TRIGGER IF NOT EXISTS` for idempotency.
**When to use:** Always for this project. The existing `init_db()` runs all `.sql` files sorted alphabetically on every startup.
**Why:** The project has no migration framework (no Alembic, no versioning table). Migrations must be idempotent -- `IF NOT EXISTS` everywhere.

```sql
-- 005_folders_and_content.sql

-- Folders table (adjacency list + materialized path)
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    path TEXT NOT NULL,  -- materialized path e.g. "/reports/2024/q1"
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, parent_id, name)  -- no duplicate folder names in same parent
);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(user_id, path);

-- Full document content for grep/read tools
CREATE TABLE IF NOT EXISTS document_content (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    line_count INTEGER NOT NULL DEFAULT 0,
    char_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_document_content_user_id ON document_content(user_id);

-- FTS5 virtual table with content sync
CREATE VIRTUAL TABLE IF NOT EXISTS document_content_fts USING fts5(
    content,
    content='document_content',
    content_rowid='rowid',
    tokenize='unicode61'
);
```

**Important:** FTS5 content sync triggers cannot use `IF NOT EXISTS`. They must be created separately -- either via `CREATE TRIGGER IF NOT EXISTS` (supported in SQLite 3.35+, verified on 3.46.1) or in the idempotent Python migration block in `init_db()`.

### Pattern 2: FTS5 Content Sync Triggers
**What:** Three triggers keep the FTS5 index automatically in sync with the document_content table. Insert, update, and delete on document_content automatically update the FTS5 index.
**When to use:** Always. Without triggers, FTS5 content sync tables return stale/wrong results.
**Verified:** Tested on this system with TEXT primary keys and implicit rowid. Works correctly.

```sql
-- Sync triggers (must exist for content sync to work)
CREATE TRIGGER IF NOT EXISTS dc_fts_insert AFTER INSERT ON document_content BEGIN
    INSERT INTO document_content_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS dc_fts_delete AFTER DELETE ON document_content BEGIN
    INSERT INTO document_content_fts(document_content_fts, rowid, content)
        VALUES('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS dc_fts_update AFTER UPDATE ON document_content BEGIN
    INSERT INTO document_content_fts(document_content_fts, rowid, content)
        VALUES('delete', old.rowid, old.content);
    INSERT INTO document_content_fts(rowid, content) VALUES (new.rowid, new.content);
END;
```

### Pattern 3: Ingestion Pipeline Modification Point
**What:** Store full markdown in document_content between conversion and chunking in `ingest_document()`.
**When to use:** Every ingestion run (new uploads and re-ingestions).
**Why here:** The `text` variable contains the complete extracted markdown at this point. After chunking, only fragments remain.

```python
# In ingestion_service.py, after text extraction (line ~69), before chunking (line ~75):
# Store full extracted markdown
line_count = text.count("\n") + 1
char_count = len(text)
await db.execute(
    """INSERT OR REPLACE INTO document_content
       (document_id, user_id, content, line_count, char_count)
       VALUES (?, ?, ?, ?, ?)""",
    (doc_id, user_id, text, line_count, char_count),
)
await db.commit()
```

### Pattern 4: folder_id Column Addition via init_db()
**What:** Add folder_id to documents table using the same idempotent ALTER TABLE pattern already used in `database.py:init_db()` for content_hash and metadata columns.
**When to use:** Follow the existing pattern -- try ALTER, catch exception if column exists.

```python
# In database.py init_db(), after existing ALTER TABLE blocks:
try:
    await db.execute(
        "ALTER TABLE documents ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL"
    )
except Exception:
    pass  # Column already exists
await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id)"
)
```

**Why ON DELETE SET NULL:** If a folder is deleted, documents become "unfiled" rather than deleted. Safer default per ARCHITECTURE.md research.

### Anti-Patterns to Avoid
- **Storing folder paths in ChromaDB metadata:** STATE.md explicitly decided against this. Resolve paths via SQLite join to avoid consistency drift.
- **Creating real filesystem directories for folders:** STATE.md decided folders are SQLite-only logical concept. Keep flat `uploads/{user_id}/{document_id}/{filename}` layout.
- **Using Alembic or any migration framework:** Project uses raw SQL files. Don't introduce a migration tool.
- **Standalone FTS5 table (duplicating content):** Use content sync (`content='document_content'`) to avoid storing text twice.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text keyword search | Custom inverted index or in-Python text scanning | SQLite FTS5 with content sync | FTS5 handles tokenization, BM25 ranking, boolean queries, phrase search, highlight(). Building this manually is 1000+ lines of fragile code. |
| Folder hierarchy queries | Recursive Python loops with N+1 queries | SQLite WITH RECURSIVE CTEs | Single query gets full subtree. Recursive Python causes N+1 problem and is error-prone for cycle detection. |
| Content sync between tables | Manual application-level sync code | SQLite triggers on document_content | Triggers execute atomically within the same transaction. Application code can forget to sync. |
| Document text extraction | Custom PDF/DOCX parsers | Existing Docling pipeline (convert_document) | Already handles PDF, DOCX, PPTX, HTML, XLSX, CSV. Reuse for backfill. |

## Common Pitfalls

### Pitfall 1: FTS5 Triggers Not Created
**What goes wrong:** FTS5 content sync table is created but triggers are not. Inserts into document_content succeed but FTS5 index stays empty. Keyword searches return zero results.
**Why it happens:** FTS5 documentation mentions content sync but the trigger requirement is buried. Developers test with manual INSERT INTO document_content_fts and assume content sync is automatic.
**How to avoid:** Always create all three triggers (insert, update, delete) in the same migration as the FTS5 table. Test by inserting into document_content and querying FTS5 -- if results are empty, triggers are missing.
**Warning signs:** `SELECT count(*) FROM document_content` returns N but `SELECT count(*) FROM document_content_fts` returns 0.

### Pitfall 2: UNIQUE Constraint on Folders Allows Root-Level Duplicates
**What goes wrong:** `UNIQUE(user_id, parent_id, name)` does not prevent duplicate root-level folder names because NULL parent_id values are considered distinct by SQLite's UNIQUE constraint.
**Why it happens:** SQL standard: NULL != NULL, so `UNIQUE(user_id, NULL, 'reports')` and `UNIQUE(user_id, NULL, 'reports')` are both allowed.
**How to avoid:** Use a sentinel value for root folders (e.g., `parent_id = '__root__'`) OR add application-level validation that checks for duplicate names at root before insert. The sentinel approach is cleaner but requires handling it in all queries. Application validation is simpler.
**Warning signs:** Two folders named "reports" at the root level for the same user.

### Pitfall 3: Backfill Fails on Deleted Source Files
**What goes wrong:** Backfill script queries all documents with status='completed' but some have had their source files deleted from disk (manual cleanup, disk issues). The script crashes or silently skips documents.
**How to avoid:** Wrap each document's backfill in try/except. Log failures with document_id. Report summary at end (X succeeded, Y failed, Z already had content). For documents whose source files are missing, attempt to reconstruct from ChromaDB chunks as a fallback (imperfect but better than nothing).
**Warning signs:** Backfill reports fewer documents processed than exist in the database.

### Pitfall 4: INSERT OR REPLACE on document_content Breaks FTS5 Rowid
**What goes wrong:** `INSERT OR REPLACE` deletes the old row and inserts a new one, which gets a new rowid. The FTS5 delete trigger fires for the old rowid, but the insert trigger fires for the new rowid. If there's a bug in trigger ordering, FTS5 can have orphaned entries.
**Why it happens:** SQLite's `INSERT OR REPLACE` is semantically DELETE + INSERT, not UPDATE.
**How to avoid:** Use `INSERT ... ON CONFLICT(document_id) DO UPDATE SET content=excluded.content, ...` (upsert syntax, available since SQLite 3.24). This fires the UPDATE trigger, not DELETE+INSERT. Alternatively, DELETE then INSERT in a single transaction.
**Warning signs:** FTS5 returns results for documents that have been re-ingested with different content.

### Pitfall 5: Backfill Runs Docling in the Main Event Loop
**What goes wrong:** Docling conversion is CPU-intensive and synchronous. Running it for 100+ existing documents in the main event loop blocks all other requests for minutes.
**Why it happens:** The existing ingestion pipeline already runs Docling in a thread executor (`loop.run_in_executor(None, convert_document, file_path)`), but a naive backfill script might call it directly.
**How to avoid:** Run backfill as a background task or CLI script, not during app startup. Use `asyncio.to_thread()` or `run_in_executor()` for each Docling conversion. Process documents sequentially to avoid memory issues (Docling is memory-hungry).
**Warning signs:** App startup takes minutes when there are existing documents.

## Code Examples

### Migration File (005_folders_and_content.sql)
```sql
-- Source: Verified against SQLite 3.46.1 on this system

-- Folders table
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, parent_id, name)
);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(user_id, path);

-- Document content table
CREATE TABLE IF NOT EXISTS document_content (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    line_count INTEGER NOT NULL DEFAULT 0,
    char_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_document_content_user_id ON document_content(user_id);

-- FTS5 virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS document_content_fts USING fts5(
    content,
    content='document_content',
    content_rowid='rowid',
    tokenize='unicode61'
);
```

### FTS5 Triggers (in init_db() or SQL migration)
```sql
-- Source: Verified working on SQLite 3.46.1 with TEXT PKs

CREATE TRIGGER IF NOT EXISTS dc_fts_insert AFTER INSERT ON document_content BEGIN
    INSERT INTO document_content_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS dc_fts_delete AFTER DELETE ON document_content BEGIN
    INSERT INTO document_content_fts(document_content_fts, rowid, content)
        VALUES('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS dc_fts_update AFTER UPDATE ON document_content BEGIN
    INSERT INTO document_content_fts(document_content_fts, rowid, content)
        VALUES('delete', old.rowid, old.content);
    INSERT INTO document_content_fts(rowid, content) VALUES (new.rowid, new.content);
END;
```

### Ingestion Pipeline Modification
```python
# Source: Based on existing ingestion_service.py pattern

# Insert after text extraction (line ~69), before chunking (line ~75):
# Store full extracted markdown for grep/read tools
line_count = text.count("\n") + 1
char_count = len(text)
await db.execute(
    """INSERT INTO document_content (document_id, user_id, content, line_count, char_count)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(document_id) DO UPDATE SET
           content = excluded.content,
           line_count = excluded.line_count,
           char_count = excluded.char_count""",
    (doc_id, user_id, text, line_count, char_count),
)
await db.commit()
```

### Backfill Script Pattern
```python
# Source: Based on existing storage_service.py and conversion_service.py patterns

async def backfill_document_content() -> dict:
    """Re-extract markdown for existing documents missing from document_content."""
    db = await aiosqlite.connect(DB_PATH)
    stats = {"success": 0, "failed": 0, "skipped": 0}
    try:
        # Find completed documents without content
        cursor = await db.execute("""
            SELECT d.id, d.user_id, d.filename
            FROM documents d
            LEFT JOIN document_content dc ON d.id = dc.document_id
            WHERE d.status = 'completed' AND dc.document_id IS NULL
        """)
        rows = await cursor.fetchall()

        for doc_id, user_id, filename in rows:
            try:
                if needs_conversion(filename):
                    file_path = get_upload_path(user_id, doc_id, filename)
                    if not file_path.exists():
                        stats["failed"] += 1
                        continue
                    loop = asyncio.get_event_loop()
                    text = await loop.run_in_executor(None, convert_document, file_path)
                else:
                    text = read_file_text(user_id, doc_id, filename)

                line_count = text.count("\n") + 1
                char_count = len(text)
                await db.execute(
                    """INSERT OR REPLACE INTO document_content
                       (document_id, user_id, content, line_count, char_count)
                       VALUES (?, ?, ?, ?, ?)""",
                    (doc_id, user_id, text, line_count, char_count),
                )
                await db.commit()
                stats["success"] += 1
            except Exception as e:
                logger.warning("Backfill failed for %s: %s", doc_id, e)
                stats["failed"] += 1

        return stats
    finally:
        await db.close()
```

### FTS5 Search Query (for future grep tool)
```python
# Source: Verified on SQLite 3.46.1

# Keyword search with BM25 ranking and highlighting
async def fts_search(query: str, user_id: str, db) -> list[dict]:
    cursor = await db.execute("""
        SELECT dc.document_id, d.filename,
               highlight(document_content_fts, 0, '[', ']') as snippet,
               rank
        FROM document_content_fts
        JOIN document_content dc ON dc.rowid = document_content_fts.rowid
        JOIN documents d ON d.id = dc.document_id
        WHERE document_content_fts MATCH ?
          AND dc.user_id = ?
        ORDER BY rank
        LIMIT 50
    """, (query, user_id))
    return await cursor.fetchall()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Reconstruct text from ChromaDB chunks | Store full markdown in dedicated table | This phase | Eliminates chunk overlap artifacts, enables line-numbered grep/read |
| No folder concept | Adjacency list folders in SQLite | This phase | Enables hierarchical organization without filesystem complexity |
| Keyword search via BM25 on chunks only | FTS5 on full document markdown | This phase | Enables phrase search, boolean queries, prefix matching on complete documents |

## Open Questions

1. **Root-level folder duplicate names**
   - What we know: SQLite UNIQUE constraint with NULL parent_id allows duplicates (NULL != NULL in SQL)
   - What's unclear: Whether to use sentinel value or application-level validation
   - Recommendation: Use application-level validation (check before insert). Simpler, avoids sentinel handling in all queries. Document this in the folder service.

2. **Backfill trigger: startup vs. manual**
   - What we know: Running Docling on many documents during app startup would block for minutes
   - What's unclear: Whether to auto-backfill on startup or require manual trigger
   - Recommendation: Add a one-time backfill endpoint (`POST /admin/backfill-content`) or CLI command. Do NOT run on startup. Log progress via Langfuse.

3. **FTS5 tokenizer choice**
   - What we know: `unicode61` is the default tokenizer, handles Unicode well. `porter` adds stemming (search for "running" finds "run").
   - What's unclear: Whether stemming is desired for this use case
   - Recommendation: Start with `unicode61` (no stemming). Stemming can be added later by rebuilding the FTS5 table. For a knowledge base, exact matching is usually preferred.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Tool | `agent-browser` CLI + `curl` |
| API validation | `curl` against http://0.0.0.0:8000 |
| Quick run command | `npm run test:api` |
| Full suite command | `npm run test:fast` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOLDER-05 | Folders table exists with correct columns and constraints | API | `npm run test:api` | No -- Wave 0 |
| DOC-03 | Full markdown stored in document_content during ingestion | API | `npm run test:api` | No -- Wave 0 |
| DOC-04 | Existing documents backfilled with markdown content | API | `npm run test:api` | No -- Wave 0 |
| TOOL-07 | FTS5 virtual table returns results for keyword queries | API | `npm run test:api` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:fast`
- **Per wave merge:** `npm run test:fast`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e/api/data-foundation.spec.ts` -- covers FOLDER-05, DOC-03, DOC-04, TOOL-07
  - Test that folders table accepts inserts with all required columns
  - Test that document upload stores content in document_content table
  - Test that FTS5 search returns results for uploaded document keywords
  - Test that backfill endpoint populates content for previously ingested documents
- [ ] No new framework install needed -- agent-browser CLI is already installed system-wide

## Sources

### Primary (HIGH confidence)
- SQLite FTS5 Extension: https://www.sqlite.org/fts5.html -- content sync, triggers, tokenizers, BM25 ranking
- SQLite WITH Clause (Recursive CTEs): https://sqlite.org/lang_with.html -- adjacency list traversal
- SQLite UPSERT (ON CONFLICT): https://www.sqlite.org/lang_upsert.html -- safe content replacement
- Verified on system: SQLite 3.46.1, FTS5 available, content sync triggers working, TEXT PK + rowid join verified

### Secondary (MEDIUM confidence)
- Existing codebase analysis: `database.py`, `ingestion_service.py`, `storage_service.py`, `conversion_service.py`, `documents.py` router
- Stack research: `.planning/research/STACK.md` -- schema design, alternatives analysis
- Architecture research: `.planning/research/ARCHITECTURE.md` -- build order, integration patterns
- Pitfalls research: `.planning/research/PITFALLS.md` -- consistency, performance, security concerns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All stdlib/existing deps. FTS5 verified on this system.
- Architecture: HIGH -- Schema follows established project patterns (raw SQL migrations, aiosqlite, idempotent DDL).
- Pitfalls: HIGH -- Based on verified SQLite behavior (NULL UNIQUE, INSERT OR REPLACE semantics) and existing codebase analysis.

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- SQLite and Python stdlib do not change frequently)
