# Roadmap: Knowledge Base Explorer

## Overview

Transform a flat-document RAG application into a Claude Code-inspired knowledge base with hierarchical folders and exploration tools. The journey starts with database schema and storage foundation, builds folder management operations, implements five KB exploration tools (ls, tree, grep, glob, read), wires them into the LLM agent with an explorer sub-agent, and finishes with a folder management UI.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Data Foundation** - Schema, content storage, ingestion pipeline modification, and FTS5 indexing
- [ ] **Phase 2: Folder Operations API** - REST API for folder CRUD and document management within folders
- [ ] **Phase 3: KB Exploration Tools** - Five exploration tools (ls, tree, grep, glob, read) with user scoping
- [ ] **Phase 4: Agent Integration** - Tool registration, intent routing, and explorer sub-agent
- [ ] **Phase 5: Folder Management UI** - Folder tree panel, CRUD dialogs, upload-to-folder, and drag-drop operations

## Phase Details

### Phase 1: Data Foundation
**Goal**: The database schema and content storage layer exist so that folders, documents, and full extracted markdown can be queried by all downstream tools and APIs
**Depends on**: Nothing (first phase)
**Requirements**: FOLDER-05, DOC-03, DOC-04, TOOL-07
**Success Criteria** (what must be TRUE):
  1. Folders table exists in SQLite with id, name, parent_id, user_id, and path columns, supporting unlimited nesting via recursive CTEs
  2. Full extracted markdown is stored in a document_content table during ingestion alongside existing chunking
  3. Existing documents are backfilled with their full extracted markdown content
  4. FTS5 virtual table is indexed on extracted markdown and returns results for keyword queries
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Folder Operations API
**Goal**: Users can organize their knowledge base into folders and manage documents within them via API endpoints
**Depends on**: Phase 1
**Requirements**: FOLDER-01, FOLDER-02, FOLDER-03, FOLDER-04, DOC-01, DOC-02
**Success Criteria** (what must be TRUE):
  1. User can create folders at any nesting depth and the folder appears in subsequent list/tree queries
  2. User can rename a folder and the new name is reflected in all path-based lookups
  3. User can delete a folder and all contained documents and subfolders are cascade-deleted
  4. User can move a folder to a different parent and all descendants maintain correct paths
  5. User can upload a file targeting a specific folder and the document is associated with that folder after ingestion
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: KB Exploration Tools
**Goal**: The agent has five working exploration tools that can navigate, search, and read the knowledge base with user-scoped isolation
**Depends on**: Phase 1
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-06, TOOL-08
**Success Criteria** (what must be TRUE):
  1. Agent can list files and subfolders in any folder path and the output matches actual folder contents
  2. Agent can get a hierarchical tree view of the KB with configurable depth limit and truncation indicators for large structures
  3. Agent can regex-search extracted markdown and get matching document names with line previews, respecting output size limits
  4. Agent can match documents by filename pattern (e.g., *.pdf, reports/**/*) and get matching paths
  5. Agent can read full document markdown or a specific line range with line numbers
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Agent Integration
**Goal**: The LLM automatically selects KB tools based on user questions and can spawn an explorer sub-agent for multi-step knowledge base navigation
**Depends on**: Phase 2, Phase 3
**Requirements**: TOOL-09, AGENT-01, AGENT-02, AGENT-03, AGENT-04
**Success Criteria** (what must be TRUE):
  1. When a user asks a question about their documents, the LLM selects the appropriate KB tool without the user specifying which tool to use
  2. Explorer sub-agent can chain multiple tools autonomously (e.g., tree then grep then read) to answer a question
  3. Explorer sub-agent returns synthesized findings in natural language, not raw tool output
  4. Explorer sub-agent can delegate to the existing document analysis sub-agent for deep single-document analysis
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Folder Management UI
**Goal**: Users can visually organize their knowledge base through a folder tree interface with drag-drop support
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. Ingestion interface shows a navigable folder tree in the left sidebar with expand/collapse for nested folders
  2. User can create, rename, and delete folders through the UI with confirmation dialogs for destructive actions
  3. User can upload files to the currently selected folder via drag-drop and the file appears in that folder after ingestion
  4. User can move files between folders and move folders with their contents to a different parent via drag-drop or context menu
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5
Note: Phases 2 and 3 both depend only on Phase 1 and could execute in parallel.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 0/0 | Not started | - |
| 2. Folder Operations API | 0/0 | Not started | - |
| 3. KB Exploration Tools | 0/0 | Not started | - |
| 4. Agent Integration | 0/0 | Not started | - |
| 5. Folder Management UI | 0/0 | Not started | - |
