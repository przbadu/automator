# Requirements: Knowledge Base Explorer

**Defined:** 2026-03-15
**Core Value:** The agent can explore the knowledge base the same way Claude Code explores codebases

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Folder Structure

- [ ] **FOLDER-01**: User can create folders with unlimited nesting depth
- [ ] **FOLDER-02**: User can rename existing folders
- [ ] **FOLDER-03**: User can delete folders (cascades to contents)
- [ ] **FOLDER-04**: User can move folders to a different parent folder
- [x] **FOLDER-05**: Folder metadata stored in SQLite (id, name, parent_id, user_id, path) with real filesystem directories under uploads/

### Document Management

- [ ] **DOC-01**: User can upload files into a specific folder
- [ ] **DOC-02**: User can move files between folders
- [x] **DOC-03**: System stores full extracted markdown in `document_content` SQLite table during ingestion
- [x] **DOC-04**: Existing documents backfilled with full markdown content

### KB Exploration Tools

- [ ] **TOOL-01**: Agent can use `ls(path)` to list files and subfolders in a folder
- [ ] **TOOL-02**: Agent can use `tree(path, depth?, limit?)` to get hierarchical structure with depth limit (default 3) and truncation
- [ ] **TOOL-03**: Agent can use `grep(pattern, path?, case_insensitive?)` to regex search extracted markdown, returns matching document names with line previews
- [ ] **TOOL-04**: Agent can use `glob(pattern)` to match filenames by pattern (e.g., `*.pdf`, `reports/**/*`)
- [ ] **TOOL-05**: Agent can use `read(path)` to read full document markdown content
- [ ] **TOOL-06**: Agent can use `read(path, offset, limit)` to read specific line range with line numbers
- [x] **TOOL-07**: SQLite FTS5 virtual table indexed on extracted markdown for fast keyword search in grep
- [ ] **TOOL-08**: All tools enforce user_id scoping — users only see their own content
- [ ] **TOOL-09**: LLM automatically selects exploration tools based on user's question

### Explorer Sub-Agent

- [ ] **AGENT-01**: Explorer sub-agent has access to all KB tools (ls, tree, grep, glob, read) plus existing semantic search
- [ ] **AGENT-02**: Explorer sub-agent can invoke document analysis sub-agent for deep document analysis
- [ ] **AGENT-03**: Explorer sub-agent returns synthesized findings, not raw tool output
- [ ] **AGENT-04**: Explorer can be spawned autonomously by main LLM or invoked directly by user

### Ingestion Interface

- [ ] **UI-01**: Ingestion interface displays folder tree with navigable hierarchy (left sidebar)
- [ ] **UI-02**: User can create, rename, and delete folders via UI with confirmation dialogs
- [ ] **UI-03**: File upload targets the currently selected folder via drag-drop
- [ ] **UI-04**: User can move files between folders via drag-drop or context menu
- [ ] **UI-05**: User can move folders with contents to a different parent

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Document Management

- **DOC-05**: User can bulk-move multiple files at once
- **DOC-06**: User can copy files to another folder (not just move)

### Enhanced KB Tools

- **TOOL-10**: `grep` supports output modes (files_with_matches, content, count)
- **TOOL-11**: `ls` includes content preview for each file

### Enhanced Explorer

- **AGENT-05**: Explorer sub-agent caches exploration state across calls

### Enhanced UI

- **UI-06**: User can search within the folder tree
- **UI-07**: User can navigate folder tree with keyboard shortcuts
- **UI-08**: Folder tree visually distinguishes file types with icons

### Automatic Import

- **IMPORT-01**: User can select a local folder for automatic import
- **IMPORT-02**: System recursively imports all files from local folder maintaining structure

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Automatic local folder scanning | Phase II feature, adds significant complexity |
| Team-based folder sharing | Adds permission complexity; user-scoped isolation sufficient for v1 |
| Folder-level permissions | All folders belong to one user — no permissions beyond ownership |
| Real-time collaboration on folders | Not needed for current use case |
| Searching raw uploaded files | Only extracted markdown is searchable (Docling pipeline required) |
| Elasticsearch/Meilisearch | SQLite FTS5 sufficient; no external search infrastructure needed |
| Version history for documents | Re-upload replaces; use folders for versioning if needed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOLDER-01 | Phase 2 | Pending |
| FOLDER-02 | Phase 2 | Pending |
| FOLDER-03 | Phase 2 | Pending |
| FOLDER-04 | Phase 2 | Pending |
| FOLDER-05 | Phase 1 | Complete |
| DOC-01 | Phase 2 | Pending |
| DOC-02 | Phase 2 | Pending |
| DOC-03 | Phase 1 | Complete |
| DOC-04 | Phase 1 | Complete |
| TOOL-01 | Phase 3 | Pending |
| TOOL-02 | Phase 3 | Pending |
| TOOL-03 | Phase 3 | Pending |
| TOOL-04 | Phase 3 | Pending |
| TOOL-05 | Phase 3 | Pending |
| TOOL-06 | Phase 3 | Pending |
| TOOL-07 | Phase 1 | Complete |
| TOOL-08 | Phase 3 | Pending |
| TOOL-09 | Phase 4 | Pending |
| AGENT-01 | Phase 4 | Pending |
| AGENT-02 | Phase 4 | Pending |
| AGENT-03 | Phase 4 | Pending |
| AGENT-04 | Phase 4 | Pending |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |
| UI-04 | Phase 5 | Pending |
| UI-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after roadmap creation*
