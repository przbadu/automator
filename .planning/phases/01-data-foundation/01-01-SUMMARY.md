---
phase: 01-data-foundation
plan: 01
subsystem: database
tags: [sqlite, fts5, migration, ingestion, full-text-search]

# Dependency graph
requires: []
provides:
  - "Folders table (adjacency list + materialized path) for hierarchical folder structure"
  - "document_content table storing full extracted markdown per document"
  - "FTS5 virtual table with content sync triggers for full-text search"
  - "folder_id column on documents table for future folder assignment"
  - "GET /documents/{id}/content endpoint for full content retrieval"
  - "GET /documents/search/fts?q= endpoint for FTS5 keyword search"
  - "Ingestion pipeline stores full markdown alongside chunking"
affects: [01-data-foundation, 02-folder-operations, 03-kb-exploration-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FTS5 content sync via triggers (dc_fts_insert, dc_fts_delete, dc_fts_update)"
    - "Upsert pattern (ON CONFLICT DO UPDATE) for document_content to preserve FTS5 rowid mapping"
    - "Idempotent ALTER TABLE migration pattern in init_db() for schema evolution"

key-files:
  created:
    - backend/migrations/005_folders_and_content.sql
    - tests/e2e/api/data-foundation.spec.ts
  modified:
    - backend/app/database.py
    - backend/app/services/ingestion_service.py
    - backend/app/models/documents.py
    - backend/app/routers/documents.py
    - tests/e2e/fixtures/api-client.ts

key-decisions:
  - "Used ON CONFLICT DO UPDATE (not INSERT OR REPLACE) for document_content upsert to avoid breaking FTS5 rowid mapping"
  - "Used ON DELETE SET NULL for folder_id foreign key so deleting a folder makes documents unfiled rather than deleted"
  - "Added content/search endpoints in Plan 01 since Phase 3 tools will need them anyway"

patterns-established:
  - "FTS5 content sync triggers pattern for automatic index maintenance"
  - "Document content upsert pattern for re-ingestion idempotency"

requirements-completed: [FOLDER-05, DOC-03, TOOL-07]

# Metrics
duration: 12min
completed: 2026-03-15
---

# Phase 1 Plan 01: Schema Migration and Content Storage Summary

**SQLite schema foundation with folders table, document_content + FTS5 for full-text search, ingestion pipeline storing full markdown, and content/search API endpoints**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-15T07:37:37Z
- **Completed:** 2026-03-15T07:50:24Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created migration 005 with folders table (adjacency list + materialized path), document_content table, FTS5 virtual table, and content sync triggers
- Modified ingestion pipeline to store full extracted markdown between text extraction and chunking with upsert semantics
- Added two new API endpoints: GET /documents/{id}/content and GET /documents/search/fts with FTS5 highlight() snippets
- Added 6 passing e2e API tests covering content storage, FTS5 search, empty results, 404 handling, and upsert re-ingestion

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration file and update database.py for folder_id column** - `493e3ca` (feat)
2. **Task 2: Modify ingestion pipeline, add content/search endpoints, and API tests** - `d6dc9eb` (feat)

## Files Created/Modified
- `backend/migrations/005_folders_and_content.sql` - Folders table, document_content table, FTS5 virtual table, sync triggers
- `backend/app/database.py` - Idempotent folder_id column migration in init_db()
- `backend/app/services/ingestion_service.py` - Full markdown storage between extraction and chunking
- `backend/app/models/documents.py` - folder_id field on DocumentResponse, new content/search response models
- `backend/app/routers/documents.py` - GET /documents/{id}/content and GET /documents/search/fts endpoints
- `tests/e2e/api/data-foundation.spec.ts` - 6 API tests for schema, content storage, and FTS5 search
- `tests/e2e/fixtures/api-client.ts` - getDocumentContent() and searchFTS() methods

## Decisions Made
- Used ON CONFLICT DO UPDATE (not INSERT OR REPLACE) for document_content upsert -- INSERT OR REPLACE fires DELETE+INSERT triggers which breaks FTS5 rowid mapping (per RESEARCH.md Pitfall 4)
- Used ON DELETE SET NULL for folder_id FK -- deleting a folder makes documents "unfiled" rather than cascade-deleting them
- Added content/search endpoints in this plan rather than deferring to Phase 3 -- they serve as test validation and are needed by downstream tools anyway

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- 4 pre-existing test failures in documents.spec.ts and metadata-schemas.spec.ts (200 vs 201 status codes due to duplicate document detection from prior test runs). These are unrelated to changes made in this plan and exist on the base commit as well.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Schema foundation complete: folders, document_content, and FTS5 tables exist
- Ingestion pipeline stores full markdown for all new uploads
- Ready for Plan 02 (backfill service for existing documents)
- Ready for Phase 2 (folder CRUD operations) and Phase 3 (KB exploration tools)

---
*Phase: 01-data-foundation*
*Completed: 2026-03-15*
