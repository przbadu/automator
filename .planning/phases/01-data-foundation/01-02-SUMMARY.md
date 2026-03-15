---
phase: 01-data-foundation
plan: 02
subsystem: database
tags: [sqlite, backfill, fts5, langfuse, content-extraction]

# Dependency graph
requires:
  - phase: 01-data-foundation
    provides: "document_content table, FTS5 virtual table, conversion_service, storage_service"
provides:
  - "Backfill service to re-extract markdown for existing documents missing from document_content"
  - "POST /documents/admin/backfill-content endpoint for triggering backfill"
  - "ChromaDB chunk reconstruction fallback when source files are missing"
affects: [03-kb-exploration-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ChromaDB chunk reconstruction fallback for missing source files"
    - "Sequential document processing to avoid Docling memory issues"

key-files:
  created:
    - backend/app/services/backfill_service.py
  modified:
    - backend/app/routers/documents.py
    - tests/e2e/api/data-foundation.spec.ts
    - tests/e2e/fixtures/api-client.ts

key-decisions:
  - "Used ChromaDB chunk reconstruction as fallback when source files missing on disk (handles RESEARCH.md Pitfall 3)"
  - "Process documents sequentially (not concurrently) to avoid Docling memory issues"
  - "Used langfuse.observe (not langfuse.decorators) to match project's existing import pattern"

patterns-established:
  - "ChromaDB fallback pattern: reconstruct document content from chunks when source files unavailable"

requirements-completed: [DOC-04]

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 1 Plan 02: Content Backfill Service Summary

**Backfill service with ChromaDB fallback and admin endpoint for re-extracting markdown from existing documents into document_content/FTS5**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T07:55:26Z
- **Completed:** 2026-03-15T07:59:37Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created backfill_service.py that finds completed documents missing from document_content and re-extracts their markdown
- Added ChromaDB chunk reconstruction fallback for documents whose source files are missing from disk
- Added POST /documents/admin/backfill-content endpoint with Langfuse tracing
- Added 2 new e2e tests verifying backfill stats shape and idempotency (total: 8 data-foundation tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create backfill service with Langfuse tracing** - `c1ae947` (feat)
2. **Task 2: Add backfill endpoint and extend tests** - `a97771b` (feat)

## Files Created/Modified
- `backend/app/services/backfill_service.py` - Async backfill_document_content() with ChromaDB fallback and Langfuse @observe
- `backend/app/routers/documents.py` - POST /admin/backfill-content endpoint
- `tests/e2e/api/data-foundation.spec.ts` - 2 new backfill tests (stats shape + idempotency)
- `tests/e2e/fixtures/api-client.ts` - backfillContent() helper method

## Decisions Made
- Used `from langfuse import observe` instead of `from langfuse.decorators import observe` -- the project uses a newer langfuse version where decorators are at the top-level module
- Removed langfuse_context.update_current_observation() call since it's not available in this langfuse version; stats are returned as function result instead
- ChromaDB chunk reconstruction concatenates chunks ordered by chunk_index with double-newline separator

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed langfuse import path**
- **Found during:** Task 1 (Create backfill service)
- **Issue:** Plan specified `from langfuse.decorators import langfuse_context, observe` but project uses newer langfuse where `observe` is at top-level and `langfuse_context` doesn't exist
- **Fix:** Changed to `from langfuse import observe` matching existing codebase pattern; removed langfuse_context.update_current_observation() call
- **Files modified:** backend/app/services/backfill_service.py
- **Verification:** Import succeeds, function decorates properly
- **Committed in:** c1ae947 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Import fix necessary for code to work. No scope creep.

## Issues Encountered
- 4 pre-existing test failures in documents.spec.ts and metadata-schemas.spec.ts (200 vs 201 status codes due to duplicate document detection from prior test runs). Unrelated to changes in this plan, same as documented in Plan 01 Summary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 1 (Data Foundation) is now complete: schema, content storage, FTS5, and backfill all operational
- Ready for Phase 2 (folder CRUD operations) and Phase 3 (KB exploration tools)
- Backfill endpoint can be called after deployment to populate content for pre-existing documents

---
*Phase: 01-data-foundation*
*Completed: 2026-03-15*
