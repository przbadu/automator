# Pitfalls Research

**Domain:** Knowledge base exploration tools (Claude Code-like filesystem tools on SQLite + ChromaDB RAG app)
**Researched:** 2026-03-15
**Confidence:** HIGH (based on existing codebase analysis, known ChromaDB issues, Anthropic's own tool-building guidelines)

## Critical Pitfalls

### Pitfall 1: Context Window Overflow from Unbounded Tool Output

**What goes wrong:**
The `tree`, `ls`, `grep`, and `read` tools return text that goes directly into the LLM context. A user with 500 documents across 50 folders calls `tree /` and the entire hierarchy (filenames, sizes, metadata) consumes 15,000+ tokens. The agent then calls `grep` on a broad pattern and gets 200 matching lines. Combined with conversation history and system prompt, the context is exhausted or the model's attention degrades on the actually important information.

**Why it happens:**
Developers test with 5-10 documents and never see the problem. The tools "work" at small scale. There is no feedback loop telling the developer that tool output is too large -- the LLM silently degrades, hallucinating or ignoring earlier context. Claude Code itself caps tool responses at 25,000 tokens with truncation messages that steer toward more targeted queries.

**How to avoid:**
- Hard-cap every tool's output at a configurable token limit (default: 10,000 tokens per tool call). Count characters as a proxy (1 token ~ 4 chars).
- `tree`: Default depth=3, max depth=5. Show "... N more items" truncation indicators. Never expand all levels by default.
- `grep`: Return max 50 matches by default. Show "N more matches, refine your pattern" message.
- `read`: Return max 200 lines per call. Support line-range parameters (`start_line`, `end_line`).
- `ls`: Paginate at 100 entries. Show total count and "use glob to filter" hint.
- Truncation messages must be actionable: "50 of 347 matches shown. Use `grep --glob '*.pdf' pattern` to narrow results."

**Warning signs:**
- Agent responses become vague or miss details after tool calls on large folders
- Token usage spikes on specific queries
- Langfuse traces show tool output > 5,000 tokens
- Agent calls the same tool repeatedly with identical parameters (confused by truncated context)

**Phase to address:**
Phase 1 (Tool Implementation) -- bake limits into every tool from day one. Retrofitting truncation is painful because existing agent prompts assume full output.

---

### Pitfall 2: SQLite-ChromaDB Dual-Store Consistency Drift

**What goes wrong:**
Documents exist in two stores: SQLite (metadata, full markdown, folder paths) and ChromaDB (chunks + embeddings). When you add folder operations -- move, rename, delete folder -- you must update both stores atomically. A folder rename updates the `path` column in SQLite but the ChromaDB chunk metadata still has the old path. Now `grep` (which searches SQLite markdown) returns results with the new path, but semantic search (ChromaDB) returns results with stale paths. The agent sees conflicting information.

This is already a known concern: the CONCERNS.md flags that "ChromaDB metadata filtering relies on user_id metadata" and that "if ChromaDB indexes are corrupted or metadata is lost, cross-user data leakage could occur." Adding folder paths to this metadata multiplies the surface area for drift.

**Why it happens:**
SQLite and ChromaDB are independent stores with no shared transaction boundary. ChromaDB has no transaction support -- you cannot roll back a ChromaDB upsert if the subsequent SQLite commit fails. The existing codebase already has this pattern: ingestion deletes old chunks before confirming new ones are stored (noted in CONCERNS.md as "brief inconsistency window").

**How to avoid:**
- Do NOT store folder paths in ChromaDB metadata. Store only `document_id` and `user_id` in ChromaDB. Resolve paths by joining through SQLite at query time.
- For folder moves: update only SQLite (folder table `path` column + documents table `folder_id`). ChromaDB chunks don't change at all because they reference `document_id`, not paths.
- For folder deletes: delete SQLite folder row, then delete all ChromaDB chunks for affected document_ids. If ChromaDB delete fails, queue a cleanup job rather than leaving SQLite in a half-deleted state.
- Add a periodic integrity check: query all `document_id` values in ChromaDB, verify each exists in SQLite. Log orphans.

**Warning signs:**
- Search results show documents in folders that don't exist
- `ls /reports/` shows a file but `grep` can't find content in it
- Langfuse traces show different document counts between SQLite and ChromaDB queries

**Phase to address:**
Phase 1 (Folder Schema Design) -- the schema decision of what goes where is foundational. Wrong choice here causes a rewrite.

---

### Pitfall 3: Folder Move/Rename as Non-Atomic Multi-Step Operation

**What goes wrong:**
Moving a folder with 50 documents and 3 subfolders requires: (1) update parent_id on the folder row, (2) update `path` on the folder and all descendant folders, (3) update `folder_id` or path references on all documents in those folders, (4) move actual files on the filesystem from `uploads/{user_id}/old_path/` to `uploads/{user_id}/new_path/`. If step 3 succeeds but step 4 fails (disk full, permission error), the database says files are at the new location but the filesystem has them at the old location. Ingested documents become unreadable.

**Why it happens:**
SQLite transactions protect database consistency but cannot wrap filesystem operations. Developers implement the happy path and assume `os.rename()` won't fail. The existing codebase stores files at `uploads/{user_id}/{document_id}/{filename}` -- if folder paths are added to the filesystem layout, every move operation touches the filesystem.

**How to avoid:**
- Keep filesystem storage flat: `uploads/{user_id}/{document_id}/{filename}`. Folder hierarchy is a SQLite-only concept. The filesystem never reflects folder structure. This eliminates filesystem moves entirely.
- If physical folder layout is required (rejected recommendation): use a two-phase approach. Create new directory, copy files (not move), update SQLite, verify copy checksums, delete old directory. Never use `os.rename()` across directories.
- Use SQLite's `WITH RECURSIVE` CTE for descendant folder queries so you update all descendants in a single SQL transaction.
- Recursive CTE example for updating all descendant paths:
  ```sql
  WITH RECURSIVE descendants AS (
    SELECT id, parent_id, name FROM folders WHERE id = :moved_folder_id
    UNION ALL
    SELECT f.id, f.parent_id, f.name FROM folders f JOIN descendants d ON f.parent_id = d.id
  )
  UPDATE folders SET path = ... WHERE id IN (SELECT id FROM descendants);
  ```

**Warning signs:**
- Files return 404 after folder moves
- Document status shows "completed" but content is unreachable
- Move operations on large folders take > 5 seconds
- Partial moves leave documents in both old and new locations

**Phase to address:**
Phase 1 (Schema Design) -- decide now whether folders are logical (SQLite-only) or physical (filesystem mirrors SQLite). Strongly recommend logical-only.

---

### Pitfall 4: Grep Performance Collapse on Large Corpora

**What goes wrong:**
The `grep` tool runs regex over stored markdown content. A user has 200 documents totaling 500,000 lines of extracted text. A broad pattern like `.*error.*` with case-insensitive matching takes 3+ seconds. A pathological regex like `(a+)+b` on crafted input causes catastrophic backtracking and hangs the async event loop, blocking all other requests.

**Why it happens:**
Python's `re` module uses a backtracking NFA engine. Certain patterns have exponential time complexity. Developers test with small documents and simple patterns. The existing codebase already has no wall-clock timeout on sub-agent tools (noted in CONCERNS.md: "Single sub-agent query could hang indefinitely").

**How to avoid:**
- Wrap every grep execution in `asyncio.wait_for()` with a 5-second timeout. Return partial results if timeout hits.
- Pre-compile patterns with `re.compile()` and cache compiled patterns (LRU cache, max 100 patterns).
- Sanitize user/agent-provided patterns: reject patterns with nested quantifiers `(a+)+`, limit pattern length to 500 chars, disallow lookaheads/lookbehinds.
- Run grep in a thread pool (`asyncio.to_thread()`) so backtracking doesn't block the event loop.
- For simple substring searches (no regex metacharacters), use Python's `str.find()` or `str.count()` instead of regex -- 10x faster.
- Index: store extracted markdown in SQLite with FTS5 full-text search for common cases. Fall back to regex only when FTS5 can't express the query.

**Warning signs:**
- Grep calls taking > 2 seconds in Langfuse traces
- Backend CPU spikes correlated with grep tool calls
- Agent retries after grep timeouts (amplification problem)

**Phase to address:**
Phase 2 (Tool Implementation) -- implement grep with timeout and thread pool from the start. Add FTS5 indexing as an optimization in a later phase if grep latency becomes a problem.

---

### Pitfall 5: Tool Output Formatting That Confuses LLMs

**What goes wrong:**
Tool results are returned as unstructured strings. The `ls` tool returns "file1.pdf\nfile2.docx\nfolder1/\nfolder2/" and the LLM can't reliably distinguish files from folders. The `grep` tool returns matching lines without file context: "Line 42: revenue increased by 15%" but doesn't include which document or folder the match is from. The LLM hallucinates document names or attributes results to wrong files.

Anthropic's own engineering guidelines state: "return only high-signal information" and "use semantic identifiers over cryptic ones." The current sub-agent tools already format output as plain strings (e.g., `f"[Chunk {idx}]\n{doc}"`) which works for simple cases but breaks down with hierarchical filesystem data.

**Why it happens:**
Developers format tool output for human readability (like terminal output) rather than LLM parsability. LLMs parse structured formats (markdown tables, indented trees, labeled fields) much more reliably than raw text.

**How to avoid:**
- Use consistent, structured output format for all tools. Markdown is the best format for LLM consumption (matches training data).
- `ls` output: Use typed indicators and metadata.
  ```
  /reports/
    [DIR]  quarterly/        (3 items)
    [DIR]  annual/           (1 item)
    [FILE] summary.pdf       (45 KB, 12 chunks)
    [FILE] notes.md          (2 KB, 1 chunk)
  Total: 2 directories, 2 files
  ```
- `grep` output: Always include document path and line number context.
  ```
  /reports/quarterly/Q1-2025.pdf:42: revenue increased by 15%
  /reports/quarterly/Q1-2025.pdf:43: compared to previous quarter
  /notes/meeting.md:7: discussed revenue targets
  3 matches in 2 files (showing 3 of 3)
  ```
- `tree` output: Use indented tree with metadata.
  ```
  /
  +-- reports/              (2 subdirs, 5 files)
  |   +-- quarterly/        (4 files)
  |   +-- annual/           (1 file)
  +-- notes/                (3 files)
  2 directories, 8 files (showing depth 2 of 4)
  ```
- Always include a summary line with counts. LLMs use these to decide whether to explore further.
- Return document IDs alongside names for tools that need follow-up (so the agent can call `read` without guessing IDs).

**Warning signs:**
- Agent asks "which document was that from?" after grep results
- Agent calls `ls` then `get_document_info` on every file (because ls didn't include enough info)
- Agent confuses folders with files
- Multiple unnecessary tool calls per user query

**Phase to address:**
Phase 2 (Tool Implementation) -- define output format spec before writing any tool. All tools should follow the same formatting conventions.

---

### Pitfall 6: Search vs. Ingestion Consistency Gap

**What goes wrong:**
A user uploads a document, sees "ingestion complete" in the UI, then asks the agent "search my new document." The grep tool searches SQLite markdown content, but the markdown hasn't been stored yet because the ingestion pipeline stores chunks in ChromaDB but doesn't store the full extracted markdown in SQLite (this is a new requirement per PROJECT.md). The agent reports "no content found" for a document the user just uploaded. Alternatively, a user deletes a document, but the full markdown remains in SQLite because deletion only cleaned up ChromaDB chunks and the documents table row -- not the new markdown table.

**Why it happens:**
The ingestion pipeline was designed before the grep/read tools existed. Adding full markdown storage to the pipeline requires modifying the ingestion service, and every code path that creates, updates, or deletes documents must also handle the markdown table. The existing pipeline already has "multiple failure points" (per CONCERNS.md) and adding another step increases fragility.

**How to avoid:**
- Add full markdown storage as a step in the existing ingestion pipeline, between conversion and chunking. The markdown is already extracted by Docling -- you're just storing it in a new column/table.
- Use a single SQLite table for full markdown (add `extracted_text` column to documents table, or a separate `document_content` table with `document_id` FK). Don't use a separate storage mechanism.
- Delete path: when a document is deleted, the existing `DELETE FROM documents WHERE id = ?` cascade should handle it (if using FK with ON DELETE CASCADE to the content table).
- Add a status check: the `grep` and `read` tools should check document status. If status != 'completed', return "Document is still being processed" rather than silently returning empty results.
- Re-ingestion (update): delete old markdown before storing new markdown, in the same transaction as the document status update.

**Warning signs:**
- Users report "I just uploaded this but the agent can't find it"
- `grep` returns results for deleted documents
- Document count mismatch between `ls` output and `grep` searchable corpus
- Langfuse traces show grep queries with 0 results on documents with status='completed'

**Phase to address:**
Phase 1 (Schema + Ingestion Pipeline Modification) -- full markdown storage must be added to the pipeline before any tools can use it.

---

### Pitfall 7: Explorer Sub-Agent Infinite Loop / Token Burn

**What goes wrong:**
The explorer sub-agent has access to `ls`, `tree`, `grep`, `glob`, `read`, plus the existing tools (`search_within_document`, `web_search`, `query_database`). Given a vague query like "tell me everything about our quarterly reports," the agent calls `tree /` to see structure, then `ls /reports/quarterly/` to list files, then `read` on each file sequentially, burning through the context window and making 15+ tool calls before producing an answer. Each tool call round-trip adds latency (LLM inference + tool execution). A single user query takes 30+ seconds and costs $2 in API calls.

**Why it happens:**
The existing sub-agent already has iteration limits (`sub_agent_max_iterations`) but no wall-clock timeout (noted in CONCERNS.md). Adding more tools increases the combinatorial space of possible tool-call sequences. Without cost/iteration guardrails, the agent explores exhaustively rather than strategically.

**How to avoid:**
- Set a wall-clock timeout: `asyncio.wait_for(agent_loop(), timeout=30)`. Return partial results on timeout.
- Set max tool calls per query (not just iterations): 10 tool calls max by default. Each tool call in the loop counts toward this limit.
- Track cumulative token usage across tool calls. If total tool output exceeds 20,000 tokens, stop and summarize what was found.
- System prompt guidance: instruct the agent to "search strategically -- use grep before read, use glob before ls." Tell it to summarize findings after 3-5 tool calls rather than exploring exhaustively.
- Provide a `search_kb` meta-tool that does semantic search (existing hybrid search) as the default. The exploration tools (`ls`, `tree`, `grep`) are for when semantic search doesn't find what's needed.

**Warning signs:**
- Average tool calls per query > 5
- P95 response time > 20 seconds for explorer queries
- Langfuse traces show sequential `read` calls on multiple documents
- API costs spike after explorer deployment

**Phase to address:**
Phase 3 (Explorer Sub-Agent) -- implement guardrails from the first version. The existing sub-agent's missing timeout (CONCERNS.md) should be fixed as a prerequisite.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store folder paths as strings instead of normalized table | Simpler queries, no joins | Path updates require string manipulation on every row; typos break hierarchy | Never -- use `folders` table with `parent_id` from the start |
| Skip FTS5 indexing, use raw regex on markdown text | Faster to implement, no schema changes | Grep becomes unusably slow at 1,000+ documents | MVP only -- add FTS5 by Phase 2 |
| Return all tool output without truncation | Simpler tool code, no pagination logic | Context overflow, degraded agent quality | Never -- truncation is a core requirement |
| Single ChromaDB collection for all users | Simpler setup, existing pattern | `collection.count()` is O(n) across all users (already flagged in CONCERNS.md) | Acceptable until 50+ users, then partition |
| Inline folder operations in document router | Fewer files, less boilerplate | Router becomes 500+ lines, folder logic tangled with upload logic | Never -- create separate `folders.py` router |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ChromaDB metadata updates on folder move | Updating path metadata on every chunk (hundreds of upserts) | Don't store paths in ChromaDB; resolve via SQLite join |
| SQLite recursive CTE for folder trees | Not setting `LIMIT` on recursive CTEs, allowing infinite recursion on circular references | Always add `LIMIT 1000` to recursive CTEs; validate no circular `parent_id` references on insert |
| Docling markdown extraction | Assuming extraction output is clean, consistent markdown | Normalize whitespace, strip binary artifacts, validate encoding (UTF-8). Some PDFs produce garbage markdown. |
| BM25 keyword search cache | Forgetting to invalidate when documents move between folders | Invalidate BM25 cache on folder move (not just document create/delete) |
| Existing intent classifier | Not updating intent classification to know about exploration tools | Add exploration intent category; without it, the agent will never route to explorer tools |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-text regex grep over all user documents on every call | Response time > 3s, CPU spikes | FTS5 index for common searches, regex only for complex patterns | > 200 documents or > 100MB total markdown |
| Loading full markdown into memory for `read` tool | Memory spikes on large documents (50MB PDFs produce 500KB+ markdown) | Stream from SQLite with `SUBSTR()` or line-range queries | Documents > 1MB extracted text |
| `tree` traversal via N+1 SQLite queries (one per folder) | Latency scales linearly with folder count | Single recursive CTE query for entire tree, then format in Python | > 100 folders |
| ChromaDB `collection.count()` on every tool call | Already flagged in CONCERNS.md as O(n) | Cache count per-user in SQLite, refresh on document create/delete | > 10,000 total chunks across all users |
| Recomputing folder paths on every `ls`/`grep` call | String concatenation of parent paths is O(depth * breadth) | Store materialized `path` column on folders table, update on move/rename only | > 5 levels of nesting |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Grep pattern injection -- user passes regex that reads across user boundaries | Data leakage if grep somehow bypasses user_id filter | Always apply `WHERE user_id = ?` in SQL queries; never construct regex that matches metadata across users |
| Path traversal in folder names -- user creates folder named `../../etc` | If paths are reflected to filesystem, could escape uploads directory | Validate folder names: alphanumeric + spaces + hyphens + underscores only. Reject `/`, `..`, `\` |
| Folder names used in SQL without parameterization | SQL injection via folder name | Always use parameterized queries. Never f-string folder names into SQL. |
| Agent tool output includes sensitive metadata from other users' documents | Cross-user data exposure via tool output | Every tool function must accept and filter by `user_id`. Add assertion: `assert all(r['user_id'] == user_id for r in results)` |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Folder CRUD without undo | User accidentally deletes folder with 50 documents, no recovery | Soft-delete with 30-day retention, or confirmation modal with document count |
| No visual feedback during folder moves | User drags folder, nothing happens for 3 seconds, clicks again | Optimistic UI update with rollback on error; show spinner for moves > 1s |
| Agent says "no results" when documents are still ingesting | User thinks upload failed | Check document status in tool; return "Document X is still being processed (status: embedding)" |
| Tree view shows IDs instead of names | Users can't navigate; copy-pasting UUIDs is hostile | Always show human-readable names; include IDs only in debug mode or as data attributes |
| Grep returns line numbers but user can't navigate to them | "Found on line 42" is meaningless without a document viewer | Include surrounding context (2 lines before/after match) in grep output |

## "Looks Done But Isn't" Checklist

- [ ] **Folder tree:** Often missing handling for empty folders -- verify empty folders appear in `ls` and `tree` output
- [ ] **Grep tool:** Often missing case-insensitive default -- verify `grep "error"` matches "Error" and "ERROR"
- [ ] **Move folder:** Often missing descendant path updates -- verify moving `/a/b/` to `/c/b/` updates paths of `/a/b/d/` to `/c/b/d/`
- [ ] **Delete folder:** Often missing ChromaDB cleanup for nested documents -- verify deleting a folder also deletes chunks for documents in subfolders
- [ ] **Read tool:** Often missing line-range support -- verify `read file.pdf --lines 10-20` works and doesn't load entire markdown into memory
- [ ] **User isolation:** Often missing in new tools -- verify every new tool function has `user_id` parameter and filters by it in every query
- [ ] **Ingestion pipeline:** Often missing full markdown storage -- verify `extracted_text` is populated for newly ingested documents
- [ ] **Explorer sub-agent:** Often missing timeout -- verify agent loop terminates after 30 seconds even if tools keep returning results
- [ ] **Intent classifier:** Often missing exploration intent -- verify "list my documents" and "search for X in my files" route to explorer, not RAG

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SQLite-ChromaDB path drift | MEDIUM | Run integrity check script: query all document_ids in ChromaDB, verify each exists in SQLite. Delete orphaned chunks. Rebuild path metadata from SQLite source of truth. |
| Context window overflow from tool output | LOW | Add truncation limits to tool functions. No data migration needed -- just code changes. |
| Regex catastrophic backtracking | LOW | Add `asyncio.wait_for()` timeout wrapper. Kill and restart the specific tool call. No data impact. |
| Failed folder move (partial state) | HIGH | If using filesystem folders: manual file relocation + SQLite path correction. If using logical-only folders: just fix the SQLite `parent_id` -- no filesystem to repair. |
| Missing full markdown for older documents | MEDIUM | Run backfill script: re-extract markdown from original files in `uploads/` via Docling. Queue as background jobs. |
| Explorer agent token burn | LOW | Add `max_tool_calls` config. Immediate effect on next query. No data migration. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Context window overflow | Phase 1 (Tool Design) | Langfuse: verify no tool output exceeds 10,000 tokens. Test with 500-document KB. |
| SQLite-ChromaDB drift | Phase 1 (Schema Design) | Integration test: move folder, verify ChromaDB queries still return correct paths via SQLite join |
| Folder move atomicity | Phase 1 (Schema Design) | Decision: logical-only folders. Test: move folder, verify no filesystem operations needed. |
| Grep performance | Phase 2 (Grep Tool) | Load test: 200 documents, 100MB markdown. Grep must complete in < 2 seconds. |
| Tool output formatting | Phase 2 (All Tools) | Agent test: ask "what's in my reports folder?" -- agent should not need follow-up tool calls for basic info |
| Search-ingestion consistency | Phase 1 (Pipeline Modification) | E2E test: upload document, wait for completion, immediately grep for known content. Must find it. |
| Explorer infinite loop | Phase 3 (Sub-Agent) | Test: vague query on large KB. Verify < 10 tool calls and < 30 seconds total. |
| Path traversal in folder names | Phase 1 (Folder CRUD) | Security test: create folder named `../../etc`, verify rejection with 400 error |
| Intent classifier gap | Phase 3 (Integration) | Test: "list my documents" must route to explorer, not generic RAG |

## Sources

- [Anthropic Engineering: Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) -- tool output formatting, pagination defaults, error handling (HIGH confidence)
- [Arxiv: Solving Context Window Overflow in AI Agents](https://arxiv.org/abs/2511.22729) -- context management strategies (MEDIUM confidence)
- [AltexSoft: The Good and Bad of ChromaDB for RAG](https://www.altexsoft.com/blog/chroma-pros-and-cons/) -- ChromaDB consistency issues, stale data (HIGH confidence)
- [ChromaDB Issue #2143: Upsert causes SQLite DB growth](https://github.com/chroma-core/chroma/issues/2143) -- ChromaDB metadata update performance (HIGH confidence)
- [Factory.ai: The Context Window Problem](https://factory.ai/news/context-window-problem) -- scaling agents beyond token limits (MEDIUM confidence)
- [GeeksforGeeks: SQLite Hierarchical Recursive Query](https://www.geeksforgeeks.org/sqlite/how-to-create-a-sqlite-hierarchical-recursive-query/) -- recursive CTE patterns (HIGH confidence)
- [MoldStud: Strategies for Managing Hierarchical Data in SQLite](https://moldstud.com/articles/p-strategies-for-managing-hierarchical-data-structures-in-sqlite) -- adjacency list vs nested set tradeoffs (MEDIUM confidence)
- [Python Bug #35915: re.search extreme slowness](https://bugs.python.org/issue35915) -- regex catastrophic backtracking (HIGH confidence)
- [FreeCodeCamp: Regex was taking 5 days](https://www.freecodecamp.org/news/regex-was-taking-5-days-flashtext-does-it-in-15-minutes-55f04411025f) -- regex vs alternatives for large corpora (MEDIUM confidence)
- Existing codebase: `CONCERNS.md` analysis, `sub_agent_tools.py`, `database.py`, `documents.py` (HIGH confidence)

---
*Pitfalls research for: Knowledge base exploration tools (Claude Code-like filesystem tools)*
*Researched: 2026-03-15*
