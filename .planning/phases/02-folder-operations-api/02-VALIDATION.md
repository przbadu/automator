---
phase: 2
slug: folder-operations-api
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 2 — Validation Strategy

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
| 02-01-01 | 01 | 1 | FOLDER-01 | API | `npm run test:api` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | FOLDER-02 | API | `npm run test:api` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | FOLDER-03 | API | `npm run test:api` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | FOLDER-04 | API | `npm run test:api` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | DOC-01 | API | `npm run test:api` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | DOC-02 | API | `npm run test:api` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/api/folders.spec.ts` — test stubs for FOLDER-01 through FOLDER-04, DOC-01, DOC-02
- [ ] `tests/e2e/fixtures/api-client.ts` — add folder helper methods (createFolder, listFolders, getFolderTree, renameFolder, moveFolder, deleteFolder, moveDocument)
- [ ] No new framework install needed

*Existing infrastructure covers framework requirements.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
