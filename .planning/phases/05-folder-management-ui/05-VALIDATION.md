---
phase: 5
slug: folder-management-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | agent-browser CLI + curl |
| **Config file** | none (CLI tool, no config needed) |
| **Quick run command** | `curl -s http://0.0.0.0:8000/health \| jq .` |
| **Full suite command** | Manual validation via agent-browser |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Verify with curl (API) + `agent-browser snapshot -i` (UI)
- **After every plan wave:** Full e2e validation: login, navigate to documents, create folders, upload files, move items, verify tree
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | UI-01 | e2e | `agent-browser open http://0.0.0.0:5173 && agent-browser snapshot -i` | No - Wave 0 | ⬜ pending |
| 05-01-02 | 01 | 1 | UI-02 | e2e | `agent-browser snapshot -i` + interact with dialogs | No - Wave 0 | ⬜ pending |
| 05-02-01 | 02 | 1 | UI-03 | integration | `curl -X POST http://0.0.0.0:8000/documents/upload -F file=@test.txt -F folder_id=<id>` | No - Wave 0 | ⬜ pending |
| 05-02-02 | 02 | 2 | UI-04 | integration + e2e | `curl -X PATCH http://0.0.0.0:8000/documents/<id>/move -d '{"folder_id":"<id>"}'` | No - Wave 0 | ⬜ pending |
| 05-02-03 | 02 | 2 | UI-05 | integration + e2e | `curl -X PATCH http://0.0.0.0:8000/folders/<id>/move -d '{"parent_id":"<id>"}'` | No - Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- No automated test infrastructure needed -- validation is manual via agent-browser and curl
- Backend APIs already exist and were validated in Phase 2
- Frontend validation requires running dev server (`bin/dev`)

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Folder tree expand/collapse | UI-01 | Visual interaction | Open documents page, verify tree renders, click chevrons to expand/collapse |
| Drag-drop file to folder | UI-03 | DnD interaction | Drag a file from list onto a folder in tree, verify it moves |
| Drag-drop folder reorder | UI-05 | DnD interaction | Drag a folder onto another folder, verify parent changes |
| Delete confirmation dialog | UI-02 | Modal interaction | Right-click folder, select delete, verify confirmation dialog appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
