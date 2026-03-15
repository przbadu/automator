---
phase: 02-folder-operations-api
verified: 2026-03-15T11:00:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
gaps: []
---

# Phase 2: Folder Operations API Verification Report

**Phase Goal:** Folder CRUD API and document-folder linking — backend only, no UI
**Verified:** 2026-03-15
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | User can create a folder at root level and it appears in folder list | VERIFIED | `POST /folders` in `routers/folders.py:45`, `list_folders` in service, test "Create root folder returns 201 with correct path" |
| 2  | User can create nested folders at any depth and they appear in tree queries | VERIFIED | `compute_folder_path` recursion in `folder_service.py:36`, tree CTE in `get_folder_tree`, test "Create deeply nested folder (3+ levels)" |
| 3  | User can rename a folder and descendant paths are updated | VERIFIED | `rename_folder` in `folder_service.py:110`, bulk UPDATE with `substr` at line 134, test "Rename folder updates descendant paths" |
| 4  | User can delete a folder and all subfolders, documents, and ChromaDB chunks are cascade-deleted | VERIFIED | `delete_folder` with recursive CTE subtree walk in `folder_service.py:209`, Chroma delete + disk delete + SQLite delete, tests "Delete folder cascades to subfolders" |
| 5  | User can move a folder to a different parent and paths are recomputed | VERIFIED | `move_folder` in `folder_service.py:165`, descendant path UPDATE at line 199, test "Move folder updates descendant paths" |
| 6  | Moving a folder into its own subtree is rejected with 400 | VERIFIED | `would_create_cycle` recursive CTE in `folder_service.py:143`, HTTPException(400) in `move_folder`, tests "Move folder into own subtree returns 400" and "Move folder to itself returns 400" |
| 7  | Duplicate folder names in the same parent are rejected with 409 | VERIFIED | `check_name_conflict` in `folder_service.py:52`, NULL parent handled separately, test "Rename to duplicate name in same parent returns 409" |
| 8  | User A cannot see or modify User B's folders | VERIFIED | All service functions filter by `user_id`, tests "User cannot see other user's folders" and "User cannot delete other user's folder" |
| 9  | User can upload a file targeting a specific folder and the document's folder_id is set | VERIFIED | `folder_id: str | None = Form(default=None)` in `documents.py:78`, folder validation query at line 100, INSERT includes `folder_id` at line 188, test "Upload document with folder_id associates document with folder" |
| 10 | User can upload a file without specifying a folder (backward compatible) | VERIFIED | `Form(default=None)` makes folder_id optional, test "Upload document without folder_id remains unfiled" |
| 11 | User can move a document to a different folder | VERIFIED | `PATCH /{document_id}/move` in `documents.py:309`, `UPDATE documents SET folder_id` at line 338, test "Move document to a folder" |
| 12 | User can move a document to unfiled (folder_id=null) | VERIFIED | `req.folder_id` can be None/null, test "Move document to unfiled (null folder_id)" |
| 13 | Upload with nonexistent folder_id is rejected with 404 | VERIFIED | Folder ownership check in `documents.py:100-105`, test "Upload with nonexistent folder_id returns 404" |
| 14 | User cannot move a document to another user's folder | VERIFIED | Folder query filters by `user_id` in `documents.py:329-334`, test "Cannot move document to another user's folder" |

**Score:** 14/14 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/models/folders.py` | Pydantic request/response models for folder CRUD | VERIFIED | 47 lines, exports all 7 required models: CreateFolderRequest, RenameFolderRequest, MoveFolderRequest, FolderResponse, FolderListResponse, FolderTreeNode, FolderTreeResponse, plus MoveDocumentRequest |
| `backend/app/services/folder_service.py` | Folder business logic: path computation, cycle detection, cascade delete, tree building | VERIFIED | 346 lines, all 8 required service functions present with real implementations |
| `backend/app/routers/folders.py` | REST API endpoints for folder CRUD operations | VERIFIED | 156 lines, all 8 endpoints registered, `router = APIRouter(prefix="/folders")` at line 31 |
| `backend/app/main.py` | Folders router registered in app | VERIFIED | `from app.routers import ... folders ...` at line 8, `app.include_router(folders.router)` at line 35 |
| `tests/e2e/api/folders.spec.ts` | API tests for folder CRUD, cascade delete, move with cycle detection, user isolation | VERIFIED | 648 lines, 33 test cases across 5 describe blocks covering FOLDER-01/02/03/04 and DOC-01/02 |
| `tests/e2e/fixtures/api-client.ts` | Folder helper methods on ApiClient | VERIFIED | All 8 folder methods present (createFolder, listFolders, getFolderTree, getFolder, renameFolder, moveFolder, deleteFolder, getFolderDocuments), plus moveDocument and folderId param on uploadDocument |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/app/routers/folders.py` | `backend/app/services/folder_service.py` | import and call service functions | WIRED | `from app.services.folder_service import create_folder, delete_folder, ...` at line 18; all 8 service functions imported and called |
| `backend/app/services/folder_service.py` | folders table | aiosqlite queries with recursive CTEs | WIRED | `WITH RECURSIVE` used in `would_create_cycle` (line 152) and `delete_folder` (line 219); standard queries in all other functions |
| `backend/app/main.py` | `backend/app/routers/folders.py` | app.include_router(folders.router) | WIRED | `app.include_router(folders.router)` at line 35, `folders` imported at line 8 |
| `backend/app/routers/documents.py (upload)` | folders table | folder_id validation query before INSERT | WIRED | `SELECT id FROM folders WHERE id = ? AND user_id = ?` at lines 100-105, INSERT with folder_id at line 188 |
| `backend/app/routers/documents.py (move)` | documents table | UPDATE documents SET folder_id | WIRED | `UPDATE documents SET folder_id = ?, updated_at = ?` at line 338-341 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FOLDER-01 | 02-01-PLAN.md | User can create folders with unlimited nesting depth | SATISFIED | `create_folder` with path computation, 6 tests covering root/nested/deep folder creation |
| FOLDER-02 | 02-01-PLAN.md | User can rename existing folders | SATISFIED | `rename_folder` with descendant path update, 3 tests including descendant path propagation and 409 on duplicate |
| FOLDER-03 | 02-01-PLAN.md | User can delete folders (cascades to contents) | SATISFIED | `delete_folder` with recursive CTE cascade to subfolders + documents + ChromaDB + disk, 3 tests |
| FOLDER-04 | 02-01-PLAN.md | User can move folders to a different parent folder | SATISFIED | `move_folder` with cycle detection and descendant path recompute, 5 tests including cycle/self-move rejection |
| DOC-01 | 02-02-PLAN.md | User can upload files into a specific folder | SATISFIED | `folder_id: Form(default=None)` on upload endpoint with ownership validation, 3 tests |
| DOC-02 | 02-02-PLAN.md | User can move files between folders | SATISFIED | `PATCH /documents/{id}/move` endpoint, 5 tests plus 1 cross-user isolation test |

**Orphaned requirements check:** All 6 Phase 2 requirements from REQUIREMENTS.md traceability table are claimed by plans 02-01 and 02-02. No orphaned requirements.

---

## Additional Correctness Notes

### Langfuse Tracing
All mutating folder service functions have `@observe()` decorators: `create_folder` (line 79), `rename_folder` (line 110), `move_folder` (line 165), `delete_folder` (line 209), and `get_folder_tree` (line 276). Import uses `from langfuse import observe` matching project convention.

### Row Factory
`get_db()` in `database.py` sets `db.row_factory = aiosqlite.Row` (line 168), making `dict(row)` in folder service work correctly.

### Route Ordering
`GET /folders/tree` is registered before `GET /folders/{folder_id}` (lines 64 and 85 of `routers/folders.py`), preventing FastAPI from matching "tree" as a folder_id path parameter.

### NULL parent_id Duplicate Detection
`check_name_conflict` uses `parent_id IS NULL` (not `parent_id = NULL`) for root-level folders, correctly handling SQLite's NULL comparison semantics.

### User Isolation on Move Document
The `PATCH /documents/{id}/move` endpoint queries the target folder with `WHERE id = ? AND user_id = ?`, ensuring cross-user folder targeting returns 404.

---

## Anti-Patterns Found

None. No TODOs, FIXMEs, placeholders, empty implementations, or stub return values found in any phase 2 files.

---

## Human Verification Required

None. All truths are verifiable programmatically via the codebase structure and test coverage.

---

## Gaps Summary

No gaps. All 14 observable truths are verified, all 6 artifacts are substantive and wired, all 5 key links are confirmed, all 6 requirements have implementation evidence, no anti-patterns found.

The phase goal "Folder CRUD API and document-folder linking — backend only, no UI" is fully achieved. The 33 test cases in `tests/e2e/api/folders.spec.ts` provide comprehensive coverage of the success criteria specified in both plans.

---

_Verified: 2026-03-15T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
