---
phase: 1
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.x (existing) |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `npm run test:api` |
| **Full suite command** | `npm run test:fast` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:fast`
- **After every plan wave:** Run `npm run test:fast`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | FOLDER-05 | API | `npm run test:api` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | DOC-03 | API | `npm run test:api` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | DOC-04 | API | `npm run test:api` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | TOOL-07 | API | `npm run test:api` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/api/data-foundation.spec.ts` — covers FOLDER-05, DOC-03, DOC-04, TOOL-07
  - Test that folders table accepts inserts with all required columns
  - Test that document upload stores content in document_content table
  - Test that FTS5 search returns results for uploaded document keywords
  - Test that backfill endpoint populates content for previously ingested documents
- [ ] No new framework install needed — existing Playwright infrastructure covers all tests

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Recursive CTE traversal returns correct nested folders | FOLDER-05 | Edge case depth testing | Create 5+ level nested folders, verify query returns full path |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
