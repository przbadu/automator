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
| **Tool** | `agent-browser` CLI + `curl` |
| **API validation** | `curl` against http://0.0.0.0:8000 |
| **UI validation** | `agent-browser open http://0.0.0.0:5173` |
| **Estimated runtime** | ~30 seconds per validation |

---

## Sampling Rate

- **After every task commit:** Validate API endpoints with curl, UI with agent-browser
- **After every plan wave:** Full validation pass (API + UI)
- **Before `/gsd:verify-work`:** All validations must pass
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | FOLDER-05 | API | `curl` API validation | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | DOC-03 | API | `curl` API validation | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | DOC-04 | API | `curl` API validation | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | TOOL-07 | API | `curl` API validation | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Validate FOLDER-05: `curl` POST to create folder, GET to verify columns
- [ ] Validate DOC-03: Upload document via `curl`, query document_content table
- [ ] Validate DOC-04: Trigger backfill via `curl`, verify content populated
- [ ] Validate TOOL-07: `curl` FTS5 search endpoint, verify keyword results
- [ ] UI validation via `agent-browser` for any frontend-facing features

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
