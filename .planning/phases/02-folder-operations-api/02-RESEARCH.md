# Phase 2: Folder Operations API - Research

**Researched:** 2026-03-15
**Domain:** REST API design for hierarchical folder CRUD, document-folder association, SQLite recursive CTEs
**Confidence:** HIGH

## Summary

Phase 2 builds REST API endpoints for folder CRUD operations (create, rename, delete, move) and document management within folders (upload-to-folder, move-between-folders). It depends on the Phase 1 foundation: the `folders` table (adjacency list + materialized path), the `folder_id` column on `documents`, and the `document_content` table.

The existing codebase follows a clear pattern: FastAPI routers with Pydantic models, `aiosqlite` for database access, `get_current_user` dependency for auth, and user-scoped data isolation. Phase 2 adds a new `folders` router and a `folder_service` module. All folder operations are SQLite-only (no filesystem changes per STATE.md decision). The key technical challenges are: (1) maintaining materialized path consistency when folders are moved/renamed, (2) preventing circular references when moving folders, (3) handling the NULL parent_id uniqueness issue for root-level folders, and (4) cascade deletion of subfolders, documents, and their associated ChromaDB chunks.

No new Python dependencies are needed. All capabilities use existing aiosqlite, FastAPI, and Pydantic. The upload endpoint modification is minimal -- adding an optional `folder_id` form field to the existing `POST /documents/upload`.

**Primary recommendation:** Create a dedicated `folders` router (`backend/app/routers/folders.py`) with a supporting `folder_service` (`backend/app/services/folder_service.py`) that handles path computation, cycle detection, and cascade operations. Modify the existing upload endpoint to accept an optional `folder_id`. Add a `PATCH /documents/{id}/move` endpoint for moving documents between folders.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOLDER-01 | User can create folders with unlimited nesting depth | Create folder endpoint with parent_id, materialized path computation via recursive CTE or parent lookup, UNIQUE constraint enforcement |
| FOLDER-02 | User can rename existing folders | Rename endpoint updates folder name and recursively updates materialized paths for all descendants |
| FOLDER-03 | User can delete folders (cascades to contents) | Delete endpoint uses ON DELETE CASCADE for subfolders, must also clean up documents' ChromaDB chunks and document_content rows |
| FOLDER-04 | User can move folders to a different parent folder | Move endpoint validates no circular reference, updates parent_id, recomputes materialized paths for moved folder and all descendants |
| DOC-01 | User can upload files into a specific folder | Modify existing upload endpoint to accept optional folder_id form field, set folder_id on INSERT |
| DOC-02 | User can move files between folders | New endpoint to update document's folder_id (simple column update) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | Existing | REST API framework for all folder endpoints | Already used for all routers in the project |
| aiosqlite | Existing | Async SQLite for folder CRUD, recursive CTEs, path updates | Already used throughout the project for all DB operations |
| Pydantic | Existing | Request/response models for folder operations | Already used for all API models |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid (stdlib) | Python 3.13 | Generate folder IDs | Same pattern as document IDs |
| langfuse | Existing | @observe() tracing on folder service functions | Per CLAUDE.md: every new service must have Langfuse tracing |
| datetime (stdlib) | Python 3.13 | Timestamps for created_at/updated_at | Same pattern as existing code |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Materialized path updates via recursive CTE | Closure table | Closure table is more efficient for reads but far more complex for writes. Materialized path is simpler and sufficient for folder trees of reasonable size. |
| Application-level cascade delete | SQLite ON DELETE CASCADE only | SQLite CASCADE handles subfolders but NOT ChromaDB chunks. Application code must delete ChromaDB chunks before SQLite delete. |
| Separate folder_service.py | Inline logic in router | Service layer keeps router thin, enables reuse from future phases (UI, agent tools). Follows project separation pattern. |

**Installation:**
```bash
# No new dependencies needed
# All capabilities use existing project deps
```

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)
```
backend/
├── app/
│   ├── routers/
│   │   ├── folders.py            # NEW: Folder CRUD endpoints
│   │   └── documents.py          # MODIFIED: add folder_id to upload, add move endpoint
│   ├── services/
│   │   └── folder_service.py     # NEW: Folder business logic (path computation, cycle detection, cascade)
│   ├── models/
│   │   ├── folders.py            # NEW: Pydantic models for folder requests/responses
│   │   └── documents.py          # MODIFIED: (already has folder_id from Phase 1)
│   └── main.py                   # MODIFIED: register folders router
tests/
└── e2e/
    └── api/
        └── folders.spec.ts       # NEW: Folder operations API tests
```

### Pattern 1: Folder Router Structure
**What:** RESTful CRUD router following the existing project pattern (prefix, tags, dependencies).
**When to use:** All folder endpoints.

```python
# backend/app/routers/folders.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
import aiosqlite
from app.database import get_db
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/folders", tags=["folders"])

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_folder(
    req: CreateFolderRequest,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    ...
```

### Pattern 2: Materialized Path Computation
**What:** Compute the `path` column value when creating or moving a folder. The path is the concatenation of ancestor names separated by `/`.
**When to use:** Every folder create and move operation.
**Why materialized path:** Enables fast prefix queries (e.g., "all folders under /reports") and human-readable display. The trade-off is that renames and moves require updating descendant paths, but folder trees are small enough that this is acceptable.

```python
# Compute path for a new folder
async def compute_folder_path(db, parent_id: str | None, folder_name: str, user_id: str) -> str:
    if parent_id is None:
        return f"/{folder_name}"
    cursor = await db.execute(
        "SELECT path FROM folders WHERE id = ? AND user_id = ?",
        (parent_id, user_id),
    )
    row = await cursor.fetchone()
    if not row:
        raise ValueError("Parent folder not found")
    return f"{row[0]}/{folder_name}"
```

### Pattern 3: Recursive Descendant Path Update
**What:** When a folder is renamed or moved, all descendant folders must have their `path` column updated.
**When to use:** Folder rename and move operations.

```python
# Update all descendant paths after a rename or move
# Uses recursive CTE to find all descendants, then batch updates
async def update_descendant_paths(db, folder_id: str, old_path: str, new_path: str):
    """Replace old_path prefix with new_path for all descendants."""
    await db.execute(
        """UPDATE folders
           SET path = ? || substr(path, ? + 1),
               updated_at = datetime('now')
           WHERE user_id = (SELECT user_id FROM folders WHERE id = ?)
             AND path LIKE ? || '/%'""",
        (new_path, len(old_path), folder_id, old_path),
    )
```

### Pattern 4: Cycle Detection for Move
**What:** Before moving folder A under folder B, verify that B is not a descendant of A (which would create a cycle).
**When to use:** Every folder move operation.

```python
# Check if target_parent_id is a descendant of folder_id
async def would_create_cycle(db, folder_id: str, target_parent_id: str | None, user_id: str) -> bool:
    if target_parent_id is None:
        return False  # Moving to root never creates a cycle
    if target_parent_id == folder_id:
        return True  # Can't be your own parent
    # Walk up from target_parent_id to root, checking if we hit folder_id
    cursor = await db.execute(
        """WITH RECURSIVE ancestors(id, parent_id) AS (
               SELECT id, parent_id FROM folders WHERE id = ? AND user_id = ?
               UNION ALL
               SELECT f.id, f.parent_id FROM folders f
               JOIN ancestors a ON f.id = a.parent_id
           )
           SELECT 1 FROM ancestors WHERE id = ?""",
        (target_parent_id, user_id, folder_id),
    )
    return await cursor.fetchone() is not None
```

### Pattern 5: Cascade Delete with ChromaDB Cleanup
**What:** When deleting a folder, SQLite CASCADE handles subfolder and document_content deletion. But ChromaDB chunks and disk files must be cleaned up separately via application code BEFORE the SQL delete.
**When to use:** Every folder delete operation.

```python
async def delete_folder_cascade(db, folder_id: str, user_id: str):
    """Delete folder and clean up all associated resources."""
    # 1. Find all documents in this folder and its subfolders
    cursor = await db.execute(
        """WITH RECURSIVE subtree(id) AS (
               SELECT id FROM folders WHERE id = ? AND user_id = ?
               UNION ALL
               SELECT f.id FROM folders f
               JOIN subtree s ON f.parent_id = s.id
           )
           SELECT d.id, d.user_id FROM documents d
           WHERE d.folder_id IN (SELECT id FROM subtree)""",
        (folder_id, user_id),
    )
    doc_rows = await cursor.fetchall()

    # 2. Delete ChromaDB chunks and disk files for each document
    collection = get_chroma_collection()
    for doc_id, doc_user_id in doc_rows:
        try:
            collection.delete(where={"document_id": doc_id})
        except Exception:
            pass
        delete_file(doc_user_id, doc_id)

    # 3. Delete the folder (CASCADE handles subfolders + document FK SET NULL)
    await db.execute("DELETE FROM folders WHERE id = ? AND user_id = ?", (folder_id, user_id))
    # 4. Also delete the documents (since ON DELETE SET NULL only NULLs the folder_id)
    for doc_id, _ in doc_rows:
        await db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    await db.commit()
```

### Pattern 6: Root-Level Duplicate Name Prevention
**What:** Application-level check for duplicate folder names at root level, since SQLite UNIQUE constraint with NULL parent_id does not prevent duplicates.
**When to use:** Every folder create and rename at root level.

```python
# Before creating/renaming a root folder, check for name conflicts
async def check_name_conflict(db, user_id: str, parent_id: str | None, name: str, exclude_id: str | None = None):
    if parent_id is None:
        query = "SELECT id FROM folders WHERE user_id = ? AND parent_id IS NULL AND name = ?"
        params = [user_id, name]
    else:
        query = "SELECT id FROM folders WHERE user_id = ? AND parent_id = ? AND name = ?"
        params = [user_id, parent_id, name]

    if exclude_id:
        query += " AND id != ?"
        params.append(exclude_id)

    cursor = await db.execute(query, params)
    if await cursor.fetchone():
        raise HTTPException(status_code=409, detail="A folder with this name already exists in the target location")
```

### Anti-Patterns to Avoid
- **Creating filesystem directories for folders:** STATE.md decision -- folders are SQLite-only. Filesystem stays flat `uploads/{user_id}/{document_id}/{filename}`.
- **Storing folder paths in ChromaDB:** STATE.md decision -- resolve via SQLite join to avoid consistency drift.
- **Trusting ON DELETE CASCADE alone for cleanup:** CASCADE only handles SQLite FK relationships. ChromaDB chunks and disk files require explicit application-level cleanup.
- **Computing paths at query time instead of materializing:** Recursive CTE for every path lookup is wasteful. Materialize paths on write, update on rename/move.
- **Moving a folder without cycle detection:** Creates infinite loops in recursive queries. Always check ancestors before move.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tree traversal queries | Recursive Python loops with N+1 queries | SQLite WITH RECURSIVE CTEs | Single query gets full subtree. Recursive Python loops cause N+1 and miss edge cases. |
| Path string manipulation | Custom regex/split path parsers | Materialized path column with simple string operations | Path is stored pre-computed. Updates use `substr()` and `LIKE` prefix matching. |
| Cycle detection | DFS/BFS graph traversal in Python | Recursive CTE ancestor walk | Database does the traversal in a single query. More efficient and correct. |
| Folder tree serialization | Custom recursive tree builder | Iterative parent_id grouping or recursive CTE with depth | Build tree from flat list using parent_id lookup. Avoids N+1 queries. |

**Key insight:** SQLite recursive CTEs handle all tree operations (ancestor walks, descendant enumeration, subtree queries) in a single query. Never do tree traversal in Python with multiple queries.

## Common Pitfalls

### Pitfall 1: Root-Level Duplicate Folder Names
**What goes wrong:** Two folders named "reports" at root for the same user.
**Why it happens:** SQLite UNIQUE(user_id, parent_id, name) with NULL parent_id -- NULL != NULL in SQL.
**How to avoid:** Application-level check before insert/rename. See Pattern 6 above.
**Warning signs:** 409 errors not firing, duplicate folders visible in list.

### Pitfall 2: Orphaned ChromaDB Chunks After Folder Delete
**What goes wrong:** Folder deleted via SQLite CASCADE, but ChromaDB still has chunks for documents that were in the folder.
**Why it happens:** ON DELETE CASCADE for the folder FK only NULLs folder_id on documents (ON DELETE SET NULL). Documents table CASCADE to document_content happens only if documents are explicitly deleted. ChromaDB has no FK relationship at all.
**How to avoid:** Before deleting the folder, enumerate all documents in the subtree, delete their ChromaDB chunks and disk files, delete the documents, then delete the folder. Or: delete documents first (which triggers document_content CASCADE), then delete folder.
**Warning signs:** ChromaDB grows unboundedly. Semantic search returns results for deleted documents.

### Pitfall 3: Stale Materialized Paths After Move/Rename
**What goes wrong:** A folder is renamed or moved but its descendants still have the old path prefix.
**Why it happens:** Developer updates only the moved/renamed folder's path, forgetting descendants.
**How to avoid:** Always update descendants in the same transaction. Use `UPDATE ... SET path = new_path || substr(path, len(old_path) + 1) WHERE path LIKE old_path || '/%'`.
**Warning signs:** `ls` or `tree` queries return incorrect paths for deeply nested folders.

### Pitfall 4: Moving Folder Into Its Own Subtree (Cycle)
**What goes wrong:** Folder A is moved to be a child of folder B, where B is already a descendant of A. This creates an infinite loop.
**Why it happens:** No cycle detection before the move.
**How to avoid:** Walk ancestors from target_parent_id to root using recursive CTE. If folder_id is found in the ancestor chain, reject the move with 400.
**Warning signs:** Recursive queries hang or hit SQLite recursion depth limit.

### Pitfall 5: Upload Endpoint Breaks with folder_id Form Field
**What goes wrong:** Adding a Query or Body parameter alongside an UploadFile in FastAPI causes 422 Validation Errors.
**Why it happens:** FastAPI file uploads use multipart form data. Additional parameters must also be Form() fields, not Query() or JSON body.
**How to avoid:** Use `folder_id: str | None = Form(default=None)` alongside the UploadFile parameter.
**Warning signs:** 422 errors on upload when folder_id is provided.

### Pitfall 6: List/Tree Endpoint Returns Other Users' Folders
**What goes wrong:** Forgetting to filter by user_id in folder queries exposes other users' data.
**Why it happens:** Copy-paste error or missing WHERE clause.
**How to avoid:** Every folder query MUST include `WHERE user_id = ?` with the authenticated user's ID. Use the service layer to enforce this.
**Warning signs:** Test with two different users sees shared folders.

## API Design

### Endpoints

| Method | Path | Purpose | Request Body | Response |
|--------|------|---------|-------------|----------|
| POST | /folders | Create folder | `{name, parent_id?}` | 201 + FolderResponse |
| GET | /folders | List all folders (flat) | - | FolderListResponse |
| GET | /folders/tree | Get folder tree (hierarchical) | `?root_id=` | FolderTreeResponse |
| GET | /folders/{id} | Get single folder | - | FolderResponse |
| PATCH | /folders/{id} | Rename folder | `{name}` | FolderResponse |
| PATCH | /folders/{id}/move | Move folder | `{parent_id}` | FolderResponse |
| DELETE | /folders/{id} | Delete folder + cascade | - | 204 |
| GET | /folders/{id}/documents | List documents in folder | - | DocumentListResponse |
| PATCH | /documents/{id}/move | Move document to folder | `{folder_id}` | DocumentResponse |

### Pydantic Models

```python
# backend/app/models/folders.py

from pydantic import BaseModel, Field

class CreateFolderRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: str | None = None

class RenameFolderRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)

class MoveFolderRequest(BaseModel):
    parent_id: str | None = None  # None = move to root

class MoveDocumentRequest(BaseModel):
    folder_id: str | None = None  # None = move to unfiled

class FolderResponse(BaseModel):
    id: str
    user_id: str
    name: str
    parent_id: str | None
    path: str
    created_at: str
    updated_at: str

class FolderListResponse(BaseModel):
    folders: list[FolderResponse]

class FolderTreeNode(BaseModel):
    id: str
    name: str
    path: str
    children: list["FolderTreeNode"] = []
    document_count: int = 0

class FolderTreeResponse(BaseModel):
    tree: list[FolderTreeNode]
```

### Upload Endpoint Modification

```python
# In documents.py upload_document, add folder_id as Form parameter:
from fastapi import Form

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    folder_id: str | None = Form(default=None),  # NEW
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    # Validate folder exists and belongs to user (if provided)
    if folder_id:
        cursor = await db.execute(
            "SELECT id FROM folders WHERE id = ? AND user_id = ?",
            (folder_id, current_user["id"]),
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Folder not found")

    # ... existing upload logic ...
    # Add folder_id to INSERT statement
```

## Code Examples

### Building a Folder Tree from Flat List

```python
# Source: Standard algorithm for parent_id tree construction
def build_tree(folders: list[dict]) -> list[dict]:
    """Convert flat folder list to nested tree structure."""
    by_id = {f["id"]: {**f, "children": []} for f in folders}
    roots = []
    for f in by_id.values():
        if f["parent_id"] and f["parent_id"] in by_id:
            by_id[f["parent_id"]]["children"].append(f)
        else:
            roots.append(f)
    return roots
```

### Recursive CTE: Get All Descendants

```sql
-- Source: SQLite WITH clause documentation
WITH RECURSIVE subtree(id, name, path, depth) AS (
    SELECT id, name, path, 0 FROM folders
    WHERE id = ? AND user_id = ?
    UNION ALL
    SELECT f.id, f.name, f.path, s.depth + 1
    FROM folders f
    JOIN subtree s ON f.parent_id = s.id
)
SELECT * FROM subtree ORDER BY path;
```

### Recursive CTE: Get All Ancestors (for cycle detection)

```sql
-- Source: SQLite WITH clause documentation
WITH RECURSIVE ancestors(id, parent_id) AS (
    SELECT id, parent_id FROM folders WHERE id = ? AND user_id = ?
    UNION ALL
    SELECT f.id, f.parent_id FROM folders f
    JOIN ancestors a ON f.id = a.parent_id
)
SELECT id FROM ancestors;
```

### Folder Name Validation

```python
# Disallow path separators and dangerous characters in folder names
import re

INVALID_FOLDER_NAME = re.compile(r'[/\\<>:"|?*\x00-\x1f]')

def validate_folder_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty")
    if INVALID_FOLDER_NAME.search(name):
        raise HTTPException(status_code=400, detail="Folder name contains invalid characters")
    if name in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid folder name")
    return name
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat document list, no organization | Folder hierarchy with materialized paths | This phase | Users can organize documents logically |
| Upload to flat storage | Upload targeting specific folder | This phase | Documents have organizational context from creation |
| No document movement | Document move between folders | This phase | Users can reorganize after upload |

## Open Questions

1. **Folder delete behavior for documents**
   - What we know: ON DELETE SET NULL makes documents "unfiled" rather than deleted when folder is removed
   - What's unclear: Should folder delete also delete the documents within it, or just un-file them?
   - Recommendation: Delete documents too (per requirement FOLDER-03 "cascades to contents"). The API should find all documents in the subtree, delete their ChromaDB chunks and disk files, delete the documents from SQLite, then delete the folder. The ON DELETE SET NULL is a safety net, not the primary mechanism.

2. **Folder listing with document counts**
   - What we know: The tree endpoint should show how many documents are in each folder
   - What's unclear: Whether to include recursive counts (documents in subfolders) or just direct children
   - Recommendation: Direct count only (simpler query, avoids recursive counting). The tree structure already shows nesting.

3. **Maximum nesting depth**
   - What we know: Requirement says "unlimited nesting depth"
   - What's unclear: Whether to enforce a practical limit to prevent abuse
   - Recommendation: No hardcoded limit. SQLite recursive CTEs handle arbitrary depth. If performance becomes an issue (unlikely for folder trees), add a configurable limit later.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.x (existing) |
| Config file | `playwright.config.ts` (existing) |
| Quick run command | `npm run test:api` |
| Full suite command | `npm run test:fast` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOLDER-01 | Create folders at any nesting depth, appears in list/tree | API | `npm run test:api` | No -- Wave 0 |
| FOLDER-02 | Rename folder, new name reflected in path-based lookups | API | `npm run test:api` | No -- Wave 0 |
| FOLDER-03 | Delete folder, cascade deletes subfolders and documents | API | `npm run test:api` | No -- Wave 0 |
| FOLDER-04 | Move folder to different parent, descendants maintain correct paths | API | `npm run test:api` | No -- Wave 0 |
| DOC-01 | Upload file targeting specific folder, document associated with folder | API | `npm run test:api` | No -- Wave 0 |
| DOC-02 | Move file between folders | API | `npm run test:api` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:fast`
- **Per wave merge:** `npm run test:fast`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e/api/folders.spec.ts` -- covers FOLDER-01 through FOLDER-04, DOC-01, DOC-02
  - Create root folder, create nested folder, verify in list and tree
  - Rename folder, verify path updated for folder and descendants
  - Delete folder with subfolders and documents, verify cascade
  - Move folder, verify no cycle allowed, verify paths updated
  - Upload with folder_id, verify document associated
  - Move document between folders, verify folder_id updated
  - User isolation: second user cannot see first user's folders
- [ ] `tests/e2e/fixtures/api-client.ts` -- add folder helper methods (createFolder, listFolders, getFolderTree, renameFolder, moveFolder, deleteFolder, moveDocument)
- [ ] No new framework install needed

## Sources

### Primary (HIGH confidence)
- SQLite WITH clause (recursive CTEs): https://sqlite.org/lang_with.html -- ancestor/descendant queries, cycle detection
- SQLite UPSERT: https://www.sqlite.org/lang_upsert.html -- safe path updates
- Existing codebase: `database.py`, `documents.py` router, `auth.py` router, `ingestion_service.py`, `storage_service.py` -- established patterns for routers, models, services, auth
- Phase 1 migration: `005_folders_and_content.sql` -- exact folders table schema

### Secondary (MEDIUM confidence)
- Phase 1 research: `.planning/phases/01-data-foundation/01-RESEARCH.md` -- schema design decisions, NULL UNIQUE pitfall, materialized path rationale
- STATE.md decisions: folders are SQLite-only, no filesystem directories, no ChromaDB folder paths
- FastAPI documentation: Form() parameters alongside UploadFile for multipart uploads

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All existing deps, no new libraries needed.
- Architecture: HIGH -- Follows established project patterns (routers, services, Pydantic models). Recursive CTEs verified on SQLite 3.46.1.
- Pitfalls: HIGH -- Based on Phase 1 research (NULL UNIQUE, path consistency) and standard tree operation concerns (cycles, cascade cleanup).

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- no external dependencies changing)
