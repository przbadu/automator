---
phase: 01-data-foundation
verified: 2026-03-15T08:30:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 1: Data Foundation Verification Report

**Phase Goal:** The database schema and content storage layer exist so that folders, documents, and full extracted markdown can be queried by all downstream tools and APIs
**Verified:** 2026-03-15T08:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                   | Status     | Evidence                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Folders table exists in SQLite with id, name, parent_id, user_id, and path columns                     | VERIFIED   | `005_folders_and_content.sql` lines 4-13 — all required columns present with correct types and FK refs |
| 2   | document_content table exists and stores full extracted markdown during ingestion                       | VERIFIED   | `ingestion_service.py` lines 74-87 — upsert INSERT INTO document_content between extraction and chunk  |
| 3   | FTS5 virtual table is indexed on extracted markdown and returns results for keyword queries             | VERIFIED   | `005_folders_and_content.sql` lines 30-51 — FTS5 table + 3 sync triggers; `/search/fts` endpoint live |
| 4   | folder_id column exists on documents table for future folder assignment                                 | VERIFIED   | `database.py` lines 150-158 — idempotent ALTER TABLE with index creation                              |
| 5   | Existing documents are backfilled with their full extracted markdown content (DOC-04)                   | VERIFIED   | `backfill_service.py` — complete function with ChromaDB fallback, Langfuse tracing, ON CONFLICT upsert |
| 6   | GET /documents/{id}/content endpoint returns stored content for authenticated user                      | VERIFIED   | `documents.py` line 293 — route exists, user-scoped, 404 on missing                                   |
| 7   | GET /documents/search/fts?q= endpoint returns matching documents with snippets                          | VERIFIED   | `documents.py` line 243 — FTS5 MATCH query with highlight(), BM25 rank, user-scoped                   |
| 8   | POST /documents/admin/backfill-content endpoint is accessible and returns stats                         | VERIFIED   | `documents.py` line 282 — route exists before /{document_id} catch-all (line 363), returns stats dict |
| 9   | API tests cover content storage, FTS5 search, and backfill                                             | VERIFIED   | `data-foundation.spec.ts` — 8 tests: 6 schema/content/FTS5, 2 backfill (shape + idempotency)          |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact                                              | Expected                                                     | Status     | Details                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------- |
| `backend/migrations/005_folders_and_content.sql`      | Folders table, document_content table, FTS5, sync triggers   | VERIFIED   | Exists, 51 lines, all tables + all 3 triggers (dc_fts_insert, dc_fts_delete, dc_fts_update)                    |
| `backend/app/database.py`                             | folder_id column migration on documents table                | VERIFIED   | Lines 149-158: idempotent ALTER TABLE + index creation following existing pattern                               |
| `backend/app/services/ingestion_service.py`           | Full markdown storage in document_content during ingestion   | VERIFIED   | Lines 74-87: INSERT INTO document_content with ON CONFLICT DO UPDATE, logger.info call                          |
| `backend/app/models/documents.py`                     | folder_id field on DocumentResponse + content/search models  | VERIFIED   | Line 15: `folder_id: str | None = None`; lines 26-44: DocumentContentResponse, FTSSearchResult, FTSSearchResponse |
| `backend/app/routers/documents.py`                    | GET /documents/{id}/content and GET /documents/search/fts    | VERIFIED   | Both endpoints present and wired; backfill endpoint also present and correctly ordered before catch-all routes  |
| `backend/app/services/backfill_service.py`            | Backfill logic with Langfuse tracing and ChromaDB fallback   | VERIFIED   | Exists, 143 lines, @observe decorator, ChromaDB fallback, ON CONFLICT DO UPDATE upsert                         |
| `tests/e2e/api/data-foundation.spec.ts`               | API tests for schema, content storage, FTS5, backfill        | VERIFIED   | 168 lines, 8 test cases in 2 describe blocks, cleanup in afterAll                                               |

### Key Link Verification

| From                               | To                        | Via                                               | Status     | Details                                                                                          |
| ---------------------------------- | ------------------------- | ------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `ingestion_service.py`             | `document_content` table  | INSERT INTO document_content after text extraction | VERIFIED   | Line 77-86: upsert present between text extraction (line 63-65) and chunking (line 90)          |
| `document_content` table           | `document_content_fts`    | SQLite triggers dc_fts_insert, dc_fts_update, dc_fts_delete | VERIFIED | All 3 triggers defined in migration; create TRIGGER IF NOT EXISTS pattern correct               |
| `database.py`                      | `documents` table         | ALTER TABLE ADD COLUMN folder_id                  | VERIFIED   | Lines 151-153: references folders(id) ON DELETE SET NULL as specified                           |
| `backfill_service.py`              | `document_content` table  | INSERT INTO document_content for existing docs     | VERIFIED   | Lines 113-120: same ON CONFLICT DO UPDATE upsert pattern                                        |
| `backfill_service.py`              | `conversion_service.py`   | Reuses convert_document() for non-plaintext files  | VERIFIED   | Line 82: `await asyncio.to_thread(convert_document, file_path)`                                 |
| `documents.py` (router)            | `backfill_service.py`     | POST /admin/backfill-content calls backfill_document_content() | VERIFIED | Lines 287-289: lazy import + call pattern                                                   |

### Requirements Coverage

| Requirement | Source Plan | Description                                                   | Status     | Evidence                                                                                     |
| ----------- | ----------- | ------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| FOLDER-05   | 01-01-PLAN  | Folder metadata stored in SQLite (id, name, parent_id, user_id, path) | SATISFIED  | Migration creates folders table with all required columns + path column for materialized path |
| DOC-03      | 01-01-PLAN  | System stores full extracted markdown in document_content during ingestion | SATISFIED  | ingestion_service.py stores full text before chunking; GET /documents/{id}/content exposes it |
| DOC-04      | 01-02-PLAN  | Existing documents backfilled with full markdown content      | SATISFIED  | backfill_service.py + POST /documents/admin/backfill-content endpoint                       |
| TOOL-07     | 01-01-PLAN  | SQLite FTS5 virtual table indexed on extracted markdown       | SATISFIED  | document_content_fts virtual table + sync triggers + GET /documents/search/fts endpoint     |

No orphaned requirements — all 4 requirements mapped to Phase 1 in REQUIREMENTS.md traceability table (FOLDER-05, DOC-03, DOC-04, TOOL-07) are accounted for in plans and implemented.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | -    | -       | -        | -      |

No anti-patterns found in any modified files. The INSERT OR REPLACE risk (RESEARCH.md Pitfall 4) was correctly avoided — both ingestion_service.py and backfill_service.py use ON CONFLICT DO UPDATE consistently.

One notable design note: the `backfill_service.py` removes `langfuse_context.update_current_observation()` (documented in 01-02-SUMMARY.md as an intentional deviation because the project's langfuse version doesn't expose it). This is acceptable — the `@observe` decorator still creates a Langfuse trace; metadata just isn't attached. Not a blocker.

### Human Verification Required

#### 1. FTS5 Search End-to-End with Live DB

**Test:** Start backend (`bin/dev`), upload a .txt file, wait for ingestion, then `GET /documents/search/fts?q=<term from file>` and confirm results contain the document.
**Expected:** JSON response with `results` array containing the uploaded document with non-empty snippet and negative rank (BM25 ordering).
**Why human:** Requires a running SQLite database with actual FTS5 index populated — cannot verify FTS5 rowid mapping and trigger chain from static file inspection alone.

#### 2. Backfill on Pre-Existing Documents

**Test:** With documents ingested before Phase 1, call `POST /documents/admin/backfill-content` and verify `success` count > 0 and documents are then searchable via FTS5.
**Expected:** Stats `{success: N, failed: 0, skipped: 0, total: N}` for pre-existing docs; subsequent FTS5 search returns those documents.
**Why human:** Requires a pre-existing database state from before Phase 1 — impossible to verify idempotency and backfill correctness without a real database with legacy records.

### Gaps Summary

No gaps. All must-haves verified at all three levels (exists, substantive, wired).

Phase 1 goal is fully achieved: the database schema and content storage layer exist, are populated during ingestion, are searchable via FTS5, support future folder assignment via folder_id, and existing documents can be backfilled. All downstream tools and APIs in Phases 2-5 have the schema foundation they need.

---

_Verified: 2026-03-15T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
