---
phase: 03-kb-exploration-tools
plan: 01
subsystem: api
tags: [sqlite, pydantic, langfuse, regex, fnmatch, async, tdd]

# Dependency graph
requires:
  - phase: 01-data-foundation
    provides: "folders table, document_content table, FTS5 virtual table"
provides:
  - "5 KB exploration tool functions (kb_ls, kb_tree, kb_grep, kb_glob, kb_read)"
  - "Pydantic response models for all tool outputs"
  - "Test fixtures with in-memory SQLite DB"
affects: [03-02-PLAN, phase-4-agent-integration]

# Tech tracking
tech-stack:
  added: [pytest, pytest-asyncio, httpx]
  patterns: [tdd-red-green, async-service-functions, recursive-cte, langfuse-observe]

key-files:
  created:
    - backend/app/models/kb_tools.py
    - backend/app/services/kb_tools_service.py
    - backend/tests/conftest.py
    - backend/tests/test_kb_tools.py
    - backend/tests/__init__.py
  modified:
    - backend/pyproject.toml

key-decisions:
  - "Used Python re module for grep (not FTS5) -- regex support required, FTS5 is keyword-only"
  - "fnmatch matches against both full virtual path and filename for patterns without '/'"
  - "Tree uses recursive CTE with entry counting for truncation"

patterns-established:
  - "KB tool function signature: async fn(db, user_id, ...) -> PydanticModel with @observe()"
  - "Path resolution: resolve_folder_id for folders, resolve_document for docs (last segment = filename)"
  - "Root convention: folder_id IS NULL for documents, parent_id IS NULL for folders"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-06, TOOL-08]

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 3 Plan 01: KB Tools Service Layer Summary

**Five async KB exploration tools (ls, tree, grep, glob, read) with recursive CTE tree traversal, regex grep, and user-scoped SQLite queries**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T10:17:40Z
- **Completed:** 2026-03-15T10:22:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- All 5 KB exploration tools implemented as async service functions with Pydantic response models
- 20 unit tests passing covering all tools, edge cases, and user scoping
- TDD workflow: RED (failing tests) then GREEN (implementation) for both tasks
- Every tool function has @observe() Langfuse tracing and user_id-scoped SQL queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Pydantic models and test fixtures** - `30c625f` (feat)
2. **Task 1 (TDD RED): Failing tests for all 5 tools** - `c19256f` (test)
3. **Task 2 (TDD GREEN): Implement service functions** - `fa1e34c` (feat)

_TDD tasks have RED/GREEN commit pairs_

## Files Created/Modified
- `backend/app/models/kb_tools.py` - Pydantic models: LsResult, TreeResult, GrepResult, GlobResult, ReadResult + supporting types
- `backend/app/services/kb_tools_service.py` - All 5 tool functions with path resolution helpers
- `backend/tests/conftest.py` - In-memory SQLite fixture with 2 users, 3 folders, 4 documents
- `backend/tests/test_kb_tools.py` - 20 unit tests covering all tools and user scoping
- `backend/tests/__init__.py` - Package init
- `backend/pyproject.toml` - Added test deps and pytest-asyncio config

## Decisions Made
- Used Python `re` module for grep instead of FTS5 -- FTS5 does keyword matching, not regex
- `fnmatch.fnmatch()` matches against both full virtual path and just filename for patterns without "/"
- Tree built using recursive CTE for folder hierarchy, then Python-side tree construction with entry counting for truncation
- Root convention: `folder_id IS NULL` for unfiled documents, `parent_id IS NULL` for top-level folders
- `resolve_document()` splits path: last segment is filename, rest is folder path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Service layer complete and tested, ready for Plan 02 REST endpoint exposure
- Phase 4 agent integration can import these functions directly
- Test fixtures reusable for Plan 02 integration tests

---
*Phase: 03-kb-exploration-tools*
*Completed: 2026-03-15*

## Self-Check: PASSED

All 5 created files verified present. All 3 commit hashes verified in git log.
