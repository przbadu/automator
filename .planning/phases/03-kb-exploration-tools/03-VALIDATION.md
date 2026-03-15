---
phase: 3
slug: kb-exploration-tools
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio + httpx |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `cd backend && uv run pytest tests/ -x -q` |
| **Full suite command** | `cd backend && uv run pytest tests/ -v` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/test_kb_tools.py -x -q`
- **After every plan wave:** Run `cd backend && uv run pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | ALL | setup | `cd backend && uv run pytest tests/test_kb_tools.py --co -q` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | TOOL-01 | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_ls -x` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | TOOL-02 | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_tree -x` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | TOOL-03 | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_grep -x` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 1 | TOOL-04 | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_glob -x` | ❌ W0 | ⬜ pending |
| 03-01-06 | 01 | 1 | TOOL-05, TOOL-06 | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_read -x` | ❌ W0 | ⬜ pending |
| 03-01-07 | 01 | 1 | TOOL-08 | unit | `cd backend && uv run pytest tests/test_kb_tools.py::test_user_scoping -x` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | ALL | integration | `cd backend && uv run pytest tests/test_kb_tools_api.py -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/conftest.py` — shared fixtures (test DB, test user, sample folders/documents)
- [ ] `backend/tests/test_kb_tools.py` — stubs for TOOL-01 through TOOL-08
- [ ] `backend/tests/test_kb_tools_api.py` — stubs for REST endpoint integration tests
- [ ] Framework install: `cd backend && uv add --dev pytest pytest-asyncio httpx`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| E2E curl validation of all endpoints | ALL | Confirms real server behavior | `curl -s http://0.0.0.0:8000/kb/tools/ls?path=/` with auth token |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
