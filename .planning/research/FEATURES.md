# Feature Research

**Domain:** AI-powered knowledge base exploration tools (Claude Code-inspired)
**Researched:** 2026-03-15
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = the exploration feels broken and the agent appears crippled.

#### Backend Tools (Agent-Facing)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **`ls` tool** -- list folder contents | Fundamental navigation. Without it, the agent cannot orient itself in the KB. Claude Code, Cursor, Cline all have this as a baseline. | LOW | Returns folder names, document names, file sizes, doc status. Must filter by `user_id`. Output: simple list with type indicators (dir/file). |
| **`tree` tool** -- hierarchical view | Users ask "what do I have?" and the agent needs a structural overview. Claude Code uses tree output constantly for orientation. | MEDIUM | Default depth limit of 3 levels. Truncation with "... N more items" when exceeding limits. Include file counts per folder. Must handle large KBs without blowing context window. |
| **`read` tool** -- read document content | Core operation: agent must read what it found. Analogous to Claude Code's Read tool. Without this, search results are useless. | MEDIUM | Read full extracted markdown or a line range (offset + limit). Return content with line numbers (cat -n format like Claude Code). Must work on extracted markdown, not raw files. |
| **`grep` tool** -- regex content search | Exact text search is irreplaceable for finding specific terms, error codes, names, dates. Claude Code's most-used search tool. | MEDIUM | Regex over extracted markdown stored in SQLite. Return matching document paths with line number previews and context lines (-A/-B/-C). Support case-insensitive flag. Must be fast even across hundreds of documents. |
| **`glob` tool** -- filename pattern matching | Finding documents by name pattern (e.g., `*.pdf`, `reports/**/*.xlsx`). Essential for filtering before deeper exploration. | LOW | Match against document paths within the user's folder hierarchy. Return paths sorted by modification time (matching Claude Code behavior). |
| **Folder hierarchy in backend** | All tools depend on a navigable folder structure. Without folders, ls/tree/glob are meaningless. | MEDIUM | SQLite table: `folders(id, name, parent_id, user_id, path, created_at)`. Real directories under `uploads/{user_id}/`. Path-based lookup for tool operations. |
| **Full extracted markdown storage** | grep and read need the full document text, not just chunks. Reconstructing from chunks is lossy and slow. | MEDIUM | Store complete Docling-extracted markdown in SQLite alongside existing chunk references. Column on documents table or separate `document_content` table. |
| **User-scoped isolation on all tools** | Security fundamental. Users must only see their own folders/documents. Already enforced elsewhere in the app. | LOW | Every tool query includes `user_id` filter. Both SQLite and ChromaDB metadata filters. Non-negotiable. |
| **Error handling with clear messages** | When a path doesn't exist, a document hasn't been ingested yet, or a regex is invalid, the agent needs actionable errors -- not stack traces. | LOW | "Folder not found: /reports/2024" rather than 500 errors. "Document 'invoice.pdf' is still being processed (status: processing)" rather than empty results. |
| **Tool routing in LLM** | The LLM must automatically choose the right tool based on the user's question. This is the whole point -- the agent decides, not the user. | MEDIUM | Extend existing tool-calling framework. Clear tool descriptions so the LLM picks correctly: grep for exact text, semantic search for meaning, ls/tree for navigation, read for content. |

#### Frontend (User-Facing)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Folder tree panel in ingestion UI** | Users need to see and navigate their folder structure visually. Every file manager has this. | MEDIUM | Left sidebar with collapsible tree. Recursive component rendering. Click to navigate. Show document count per folder. |
| **Folder CRUD** | Create, rename, delete folders. Basic file management. | LOW | Create folder dialog, right-click rename, delete with confirmation (warn if not empty). API endpoints: POST/PUT/DELETE `/api/folders`. |
| **Upload to specific folder** | Users must choose where files go. Uploading to a flat list defeats the purpose of folders. | LOW | Folder selector in upload dialog or upload to currently-selected folder. Drag-drop onto folder in tree view. |
| **Move files between folders** | Reorganization is expected. Users will get the structure wrong initially and need to fix it. | MEDIUM | Drag-drop or right-click "Move to..." dialog. Must update filesystem path, SQLite record, and ChromaDB metadata. |

### Differentiators (Competitive Advantage)

Features that set this apart from basic RAG apps. Not required for launch, but provide significant value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Explorer sub-agent** -- autonomous multi-step KB navigation | Unlike basic RAG which does one search, the explorer can chain ls -> grep -> read in a loop to deeply investigate a question. This is the Claude Code superpower applied to knowledge bases. | HIGH | Sub-agent with access to all KB tools (ls, tree, grep, glob, read) plus existing semantic search. Follows existing sub-agent pattern. Can be invoked autonomously by main LLM or directly by user. Needs its own Langfuse trace span. |
| **Dual search layers** -- regex + semantic | Most RAG apps only have semantic search. Adding grep-style exact search gives precision that vector search cannot: exact names, numbers, codes, dates. The LLM picks the right approach per query. | MEDIUM | Grep for exact matching, existing hybrid search (BM25 + vector + reranker) for semantic. Agent learns when to use each. System prompt guidance on tool selection. |
| **Smart context window management** | Tree and ls output automatically adapts to KB size. Large KBs get truncated intelligently rather than blowing context. This is what makes the difference between a demo and a production tool. | MEDIUM | Tree: default 3 levels, configurable. Show "... N more items" on truncation. Grep: limit results with head_limit parameter. Read: line range support (offset + limit). Configurable max output sizes per tool. |
| **Line-number-aware read with range support** | Agent can read lines 50-80 of a document, not just the whole thing. Enables precise follow-up after grep finds a match at line 67. Directly mirrors Claude Code's Read tool behavior. | LOW | `read(path, offset=50, limit=30)` returns lines 50-80 with line numbers. Trivial to implement but powerful for multi-step exploration workflows. |
| **Move folders with contents** | Full subtree reorganization. Most basic file managers support this but many web apps skip it. | MEDIUM | Recursive path update for all children (folders and documents). Must update filesystem, SQLite paths, and ChromaDB metadata for all affected documents. |
| **Grep with output modes** | Like Claude Code's grep: `files_with_matches` (just paths), `content` (matching lines with context), `count` (match counts). Different modes for different agent strategies. | LOW | Three output modes matching ripgrep semantics. Agent uses `files_with_matches` for broad scanning, `content` for detailed investigation, `count` for statistics. |
| **Direct user invocation of explorer** | User can explicitly say "explore my KB for X" and the explorer sub-agent runs visibly, showing its tool calls. Transparency builds trust. | MEDIUM | UI shows explorer steps in real-time via SSE. User sees: "Listing /reports... Found 12 documents. Searching for 'revenue'... Reading /reports/Q4-2024.pdf lines 45-80..." |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Automatic folder sync from local filesystem** | "I want to point it at a directory and have it auto-import" | Adds file watching complexity, permission issues, large-file handling, conflict resolution. Scope creep that delays core features. | Manual upload to specific folders. Can be a Phase II feature after core exploration works. |
| **Real-time collaboration on folders** | "Multiple users should share folders" | Requires access control lists, conflict resolution, permission inheritance. Massive complexity for a single-user-scoped app. | Keep user-scoped isolation. If sharing is needed later, it's a separate project. |
| **Raw file access (bypass extraction)** | "Let the agent read the original PDF/DOCX directly" | PDFs and DOCX aren't readable as text. The whole point of Docling extraction is to convert to searchable markdown. Raw access adds no value and confuses the agent. | All tools operate on extracted markdown. Agent never touches raw uploaded files. |
| **Folder-level permissions** | "Some folders should be read-only or hidden" | Over-engineering for a single-user app. Adds permission-checking overhead to every tool call. | All folders belong to one user. No permissions beyond ownership. |
| **Full-text indexing engine (Elasticsearch/Meilisearch)** | "grep will be slow on large KBs" | Adds infrastructure dependency. SQLite FTS5 or simple LIKE queries handle hundreds of documents fine. Premature optimization. | Start with SQLite-based grep. If performance becomes an issue (1000+ documents), add SQLite FTS5 extension -- no new infrastructure needed. |
| **Recursive grep by default** | "Always search everything" | On large KBs, searching all documents for every query wastes time and context. Agent should be targeted. | Grep accepts a path parameter to scope searches. Default to current folder or root, but agent learns to narrow scope. |
| **Inline file preview in chat** | "Show me the PDF in chat" | Rendering PDFs/images inline in chat is complex UI work with little value -- the agent already extracts and presents the content as text. | Agent reads and quotes relevant content. User can open original file via document list if they need the original format. |
| **Version history for documents** | "Track changes when re-uploading" | Adds versioning complexity to every storage layer (filesystem, SQLite, ChromaDB). The app already handles re-upload with content hash dedup. | Re-upload replaces the document. If users need versions, they should use different filenames or folders (e.g., `/reports/v1/`, `/reports/v2/`). |

## Feature Dependencies

```
Folder hierarchy (SQLite + filesystem)
    |
    +--requires--> ls tool
    +--requires--> tree tool
    +--requires--> glob tool
    +--requires--> Folder tree UI panel
    +--requires--> Folder CRUD UI
    +--requires--> Upload to folder
    +--requires--> Move files between folders
    +--requires--> Move folders with contents

Full extracted markdown storage
    |
    +--requires--> grep tool
    +--requires--> read tool (line-range mode)

grep tool + read tool + ls tool + tree tool + glob tool
    |
    +--requires--> Explorer sub-agent
    +--requires--> Tool routing in LLM

Folder CRUD UI
    +--requires--> Upload to folder

Explorer sub-agent
    +--enhances--> Direct user invocation of explorer
```

### Dependency Notes

- **All tools require folder hierarchy:** Without the folder structure in SQLite and filesystem, ls/tree/glob have nothing to navigate. This is the foundation -- build first.
- **grep and read require full markdown storage:** Currently only chunks are stored in ChromaDB. Full extracted text must be persisted in SQLite for line-based grep and read operations.
- **Explorer sub-agent requires all individual tools:** The sub-agent is the orchestrator that chains tools together. Build and test individual tools first, then compose them into the sub-agent.
- **Tool routing requires tools to exist:** The LLM cannot route to tools that don't exist yet. Build tools, then wire them into the tool-calling framework.
- **Upload to folder requires Folder CRUD:** Users need to create folders before they can upload to them.
- **Direct user invocation enhances explorer:** This is a UI/UX layer on top of the explorer sub-agent. The sub-agent must work first.

## MVP Definition

### Launch With (v1)

Minimum viable exploration -- the agent can navigate and search the knowledge base.

- [ ] **Folder hierarchy** (SQLite model + filesystem directories) -- foundation for everything
- [ ] **Full extracted markdown storage** in SQLite -- enables grep and read
- [ ] **ls tool** -- basic navigation
- [ ] **tree tool** with depth limits -- structural overview
- [ ] **grep tool** with regex and output modes -- exact content search
- [ ] **glob tool** -- filename pattern matching
- [ ] **read tool** with line ranges -- content retrieval
- [ ] **Tool routing in LLM** -- agent automatically picks the right tool
- [ ] **Folder tree UI panel** -- users can see and navigate folders
- [ ] **Folder CRUD** -- create, rename, delete folders
- [ ] **Upload to specific folder** -- files go where users want them
- [ ] **Error handling** -- clear messages for missing paths, processing documents, invalid regex

### Add After Validation (v1.x)

Features to add once core exploration works and users have organized their KBs.

- [ ] **Explorer sub-agent** -- add when individual tools are proven stable and useful
- [ ] **Move files between folders** -- add when users start reorganizing
- [ ] **Move folders with contents** -- add alongside file moving
- [ ] **Direct user invocation of explorer** -- add when sub-agent is reliable
- [ ] **Grep output modes** (files_with_matches, content, count) -- add when basic grep works

### Future Consideration (v2+)

- [ ] **Automatic folder sync** -- only if users consistently request it
- [ ] **SQLite FTS5 for grep** -- only if performance degrades at scale
- [ ] **Folder bookmarks/favorites** -- nice-to-have navigation shortcut
- [ ] **Bulk operations** (move/delete multiple files) -- ergonomic improvement

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Folder hierarchy (backend) | HIGH | MEDIUM | P1 |
| Full markdown storage | HIGH | MEDIUM | P1 |
| ls tool | HIGH | LOW | P1 |
| tree tool | HIGH | MEDIUM | P1 |
| grep tool | HIGH | MEDIUM | P1 |
| glob tool | MEDIUM | LOW | P1 |
| read tool | HIGH | MEDIUM | P1 |
| Tool routing in LLM | HIGH | MEDIUM | P1 |
| Folder tree UI | HIGH | MEDIUM | P1 |
| Folder CRUD UI | HIGH | LOW | P1 |
| Upload to folder | HIGH | LOW | P1 |
| Error handling | MEDIUM | LOW | P1 |
| Explorer sub-agent | HIGH | HIGH | P2 |
| Move files | MEDIUM | MEDIUM | P2 |
| Move folders | MEDIUM | MEDIUM | P2 |
| Direct explorer invocation | MEDIUM | MEDIUM | P2 |
| Grep output modes | LOW | LOW | P2 |
| Smart context management | MEDIUM | MEDIUM | P2 |
| Folder sync | LOW | HIGH | P3 |
| FTS5 indexing | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch -- without these, exploration doesn't work
- P2: Should have, add after core is validated
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Claude Code | Cursor Agent | Cline | Our KB Explorer |
|---------|-------------|--------------|-------|-----------------|
| ls/tree navigation | Built-in LS tool, tree via bash | Implicit via codebase indexing | Via bash commands | `ls` and `tree` tools over folder hierarchy |
| Regex search (grep) | Grep tool (ripgrep-backed) | Codebase search | Via bash grep | `grep` tool over extracted markdown |
| Pattern matching (glob) | Glob tool (fast, sorted by mtime) | File search | Via bash find | `glob` tool over document paths |
| File reading | Read tool (line numbers, ranges, PDF/image support) | Implicit file reading | Via bash cat | `read` tool (line numbers, ranges, markdown only) |
| Semantic search | Not built-in (uses grep/read) | Embeddings-based | Not built-in | Existing hybrid search (BM25 + vector + reranker) |
| Multi-step exploration | Agent tool (sub-agent) | Cascade/Agent mode | Autonomous agent loop | Explorer sub-agent |
| Context management | Smart truncation, head_limit, offset params | Automatic context curation | Token-aware | Depth limits, truncation, line ranges |
| Tool auto-selection | System prompt guides, model decides | Automatic | Automatic | Tool descriptions guide LLM selection |

**Key insight:** Our explorer has a unique advantage -- it combines Claude Code-style exact search tools with semantic search (vector + BM25 + reranker) that Claude Code lacks. This dual-layer approach is the primary differentiator.

## Sources

- [Claude Code tools and system prompt (GitHub Gist)](https://gist.github.com/wong2/e0f34aac66caf890a332f7b6f9e2ba8f) -- HIGH confidence, primary source for tool behavior
- [Claude Code Built-in Tools Reference (vtrivedy)](https://www.vtrivedy.com/posts/claudecode-tools-reference) -- HIGH confidence, detailed parameter documentation
- [Claude Code Tool Search Guide (aifreeapi)](https://www.aifreeapi.com/en/posts/claude-code-tool-search) -- MEDIUM confidence, secondary reference
- [Agentic Knowledge Base Patterns (The New Stack)](https://thenewstack.io/agentic-knowledge-base-patterns/) -- MEDIUM confidence, design patterns
- [Context Window Management Strategies (getmaxim)](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) -- MEDIUM confidence, truncation strategies
- [File Tree React component (MagicUI)](https://magicui.design/docs/components/file-tree) -- MEDIUM confidence, UI patterns
- [MUI Tree View](https://v6.mui.com/x/react-tree-view/) -- MEDIUM confidence, UI patterns

---
*Feature research for: AI-powered knowledge base exploration tools*
*Researched: 2026-03-15*
