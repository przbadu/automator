# Codebase Concerns

**Analysis Date:** 2026-03-15

## Security Issues

**CORS Configuration — Overly Permissive:**
- Issue: `allow_origin_regex=r"https?://.*"` accepts all HTTP/HTTPS origins
- Files: `backend/app/main.py` (line 24)
- Impact: Enables CSRF attacks; any website can make authenticated requests to the backend
- Current mitigation: None
- Recommendations:
  - Replace with explicit allowed origins list (e.g., frontend URL from config)
  - At minimum, validate origin against `settings.frontend_url`
  - Example: `allow_origins=[settings.frontend_url]` instead of regex

**Encryption Key Auto-Generation to `.env`:**
- Issue: If encryption key is missing, it's auto-generated and appended to `.env` file in plaintext
- Files: `backend/app/services/encryption_service.py` (lines 18-22)
- Impact: Key material written to disk without atomic safety; potential timing window for race conditions; if `.env` is world-readable, keys are exposed
- Current mitigation: `.env` is gitignored
- Recommendations:
  - Generate key on first startup and fail loudly if missing (don't auto-append)
  - Validate key exists and is valid at startup
  - Document key generation process clearly
  - Ensure `.env` file has restricted permissions (600)

**File Upload Type Validation — MIME Type Mismatch Risk:**
- Issue: MIME type is inferred from file extension, not validated against actual file content
- Files: `backend/app/routers/documents.py` (lines 59-60, 97)
- Impact: Malicious files disguised with safe extensions (e.g., `.exe` as `.txt`) can bypass checks
- Current mitigation: Extension whitelist
- Recommendations:
  - Use `python-magic` library to detect actual MIME type from file content
  - Validate against both extension and detected MIME type
  - Consider additional antivirus scanning for enterprise use

**API Key Decryption on Every Request:**
- Issue: User's default LLM config is decrypted on every chat message, not cached
- Files: `backend/app/routers/chat.py` (lines 192-207), `backend/app/services/metadata_service.py` (lines 92-103)
- Impact: Repeated decryption operations; increased attack surface for key material in memory
- Current mitigation: Fernet encryption (authenticated)
- Recommendations:
  - Cache decrypted keys in memory with short TTL (e.g., 5 minutes)
  - Implement cache invalidation on config update
  - Use context managers to ensure key material is cleared after use
  - Consider environment-based fallbacks for default LLM instead of database lookups

**User Scoping Not Enforced in ChromaDB Queries:**
- Issue: Some vector search operations rely on metadata filtering, but ChromaDB doesn't enforce isolation at the storage layer
- Files: `backend/app/services/retrieval_service.py` (lines 44-53), `backend/app/database.py` (lines 44-50)
- Impact: If ChromaDB indexes are corrupted or metadata is lost, cross-user data leakage could occur during vector search
- Current mitigation: `user_id` metadata filter in every query
- Recommendations:
  - Add application-level assertions before returning any chunks
  - Implement periodic ChromaDB integrity checks (verify all chunks have user_id metadata)
  - Add logging for all retrieval operations (already done via Langfuse)
  - Consider partitioning ChromaDB by user_id at storage level (requires refactor)

---

## Tech Debt

**Database Migrations — Manual Table Recreation for Schema Changes:**
- Issue: SQLite doesn't support ALTER TABLE for CHECK constraints; code recreates entire documents table on startup (lines 98-147 in `database.py`)
- Files: `backend/app/database.py` (lines 93-147)
- Impact:
  - Complex, error-prone migration logic with multiple `if` checks for idempotency
  - Full table rebuild on every startup slows initialization (N/A for typical use, but concerning pattern)
  - Hard to reason about migration order; difficult to add future schema changes
- Fix approach:
  - Migrate to PostgreSQL for production (SQLite suitable only for dev/single-user)
  - Or adopt Alembic for Python schema migrations (generates proper migration files)
  - Extract migration logic into separate migration files rather than inline checks

**Global Mutable State in Router:**
- Issue: `_active_streams` is a module-level dict tracking active SSE connections per thread
- Files: `backend/app/routers/chat.py` (line 42)
- Impact:
  - Not thread-safe in async context (dict mutations between multiple concurrent requests could race)
  - Memory leak if connection drops unexpectedly — entry in dict is orphaned
  - In production with multiple workers, streams started in one worker can't be stopped from another
- Fix approach:
  - Use Redis or in-memory task queue (Celery) for distributed stop signals
  - For single-worker dev, use weakref + asyncio task tracking instead of dict
  - Add cleanup task to prune orphaned entries after 30+ seconds

**Exception Handling — Overly Broad Catches:**
- Issue: Many `except Exception:` blocks without specific handling or context
- Files: Multiple locations — `chat.py` (lines 37, 239, 282, 314, 409, 437), `documents.py` (69, 148, 314), `auth.py` (79), `ingestion_service.py` (66, 78, 100, 108, 140, 163, 167)
- Impact:
  - Errors are silently logged but processing continues (graceful degradation good, but hides bugs)
  - Hard to debug failures; insufficient context in logs
  - Different errors (network, parsing, auth) treated identically
- Fix approach:
  - Catch specific exceptions (HTTPException, asyncio.TimeoutError, json.JSONDecodeError, etc.)
  - Add structured logging with `logger.exception()` including operation name and context
  - Return appropriate HTTP status codes (500 for server errors, 400 for client, 503 for external service failures)

**Langfuse Observability Gaps:**
- Issue: Not all external service calls are traced
- Files: Various service files
- Impact: Blind spots in performance monitoring for external APIs (web search, SQL execution timeouts, reranker latency)
- Current coverage: ✅ Embeddings, ✅ BM25, ✅ Vector search, ✅ Reranker (if enabled), ✅ Sub-agent — but ❌ SQL execution, ❌ Web search tool results (incomplete)
- Fix approach:
  - Add `@observe()` decorator to `sql_tool.execute_sql()`
  - Add `@observe()` decorator to `web_search_tool.search()` with provider-specific metrics
  - Trace reranker timeout/fallback paths

**Metadata Service — Complex Dynamic Model Building:**
- Issue: `_build_dynamic_model()` uses Pydantic's `create_model()` dynamically at runtime
- Files: `backend/app/services/metadata_service.py` (lines 38-59)
- Impact:
  - Hard to validate schema at deploy time (no type checking)
  - Pydantic model creation happens during ingestion (adds latency)
  - If schema JSON is malformed, errors occur mid-pipeline
- Fix approach:
  - Pre-validate schema JSON against a JSON schema definition at startup
  - Cache compiled Pydantic models keyed by schema version
  - Add schema version tracking to metadata_schemas table
  - Consider using Pydantic's TypeAdapter for simpler validation

**Sub-Agent Service — Missing Timeout Enforcement:**
- Issue: Tool-calling loop in `sub_agent_service.py` has `sub_agent_max_iterations` config but no wall-clock timeout
- Files: `backend/app/services/sub_agent_service.py` (lines 71-200+ see full file for loop)
- Impact: Single sub-agent query could hang indefinitely if external tools (SQL, web search) don't timeout
- Current mitigation: `text_to_sql_timeout_seconds` exists but only for SQL tool; web search has no timeout
- Fix approach:
  - Add `sub_agent_timeout_seconds` config (e.g., 30s)
  - Wrap entire loop in `asyncio.timeout()` or `asyncio.wait_for()`
  - Return partial results if timeout hits
  - Log when timeout occurs (Langfuse metadata)

---

## Performance Bottlenecks

**Metadata Extraction Runs on Every Document Ingestion:**
- Issue: `extract_metadata()` calls LLM during ingestion, blocking the pipeline
- Files: `backend/app/services/ingestion_service.py` (lines 86-102)
- Impact: Ingestion takes 2-3x longer; large files can timeout
- Current mitigation: Best-effort (continues on error), but still blocks the critical path
- Improvement path:
  - Move metadata extraction to optional async job (after chunking/embedding completes)
  - Add config flag to disable metadata extraction entirely for faster ingestion
  - Cache extracted metadata by content hash to skip re-extraction on re-upload

**ChromaDB Full Collection Scan on Vector Search:**
- Issue: `collection.count()` scans entire collection on every query (even with user_id filter)
- Files: `backend/app/services/retrieval_service.py` (lines 37-42)
- Impact: Latency increases as collection grows (O(n) per query)
- Improvement path:
  - Maintain per-user chunk count in documents table
  - Query count only if absolutely needed (e.g., for stats, not for every search)
  - Consider caching collection.count() with 60s TTL

**Keyword Search (BM25) Uses Per-User Corpus Cache Without TTL:**
- Issue: `_user_corpus` cache in `keyword_search_service.py` persists indefinitely
- Files: `backend/app/services/keyword_search_service.py` (see implementation for cache)
- Impact: Memory grows unbounded; if user deletes documents, stale BM25 index remains
- Current mitigation: Cache invalidation on document delete/upload
- Improvement path:
  - Add explicit TTL (e.g., 1 hour) to cache entries
  - Implement LRU eviction to cap memory usage
  - Monitor cache size; log warnings if > 100MB

**Message History Loaded Entirely Into Memory:**
- Issue: `get_thread_messages()` fetches all messages in a thread, even if only last 5 needed
- Files: `backend/app/services/llm_service.py` (lines 14-21), `backend/app/routers/chat.py` (line 182)
- Impact: Long-running conversations slow down; memory pressure on large threads
- Improvement path:
  - Limit history fetch to last N messages (config: `max_history_messages`, default 20)
  - Add pagination support if frontend needs full history
  - For context window estimation, count tokens explicitly instead of loading all

---

## Fragile Areas

**Chat Router — Deeply Nested Async Generator:**
- Issue: `event_generator()` function in chat router is 120+ lines, handles multiple failure modes
- Files: `backend/app/routers/chat.py` (lines 323-443)
- Why fragile:
  - Exception handling spans multiple try/except blocks with cleanup in finally
  - SSE event ordering matters; if exceptions occur mid-stream, client may receive malformed events
  - Adding new features (new event types, new sub-agent paths) is high-risk
- Safe modification:
  - Extract sub-agent path into separate helper function
  - Add schema validation for all event types (pydantic models)
  - Test coverage should include edge cases (aborted streams, partial responses, exception paths)
- Test coverage: Covered by `tests/e2e/llm/chat-streaming.spec.ts` and `tests/e2e/llm/sub-agent.spec.ts` but missing:
  - Abort mid-stream → save partial response
  - Network disconnect during streaming
  - LLM provider switching mid-conversation

**Ingestion Service — Sequential Pipeline with Multiple Failure Points:**
- Issue: Ingestion is linear (read → chunk → extract_metadata → embed → store), any step failure marks doc as failed
- Files: `backend/app/services/ingestion_service.py` (lines 50-167)
- Why fragile:
  - If embedding service is down, all documents fail (no graceful degradation)
  - Metadata extraction failure is caught, but continues with null metadata (inconsistent state)
  - Re-ingestion on update deletes old chunks before confirming new ones are stored (brief inconsistency window)
- Safe modification:
  - Add transaction-like semantics: store chunks atomically
  - Implement retry with exponential backoff for embedding failures
  - Add dry-run mode to validate document before committing
- Test coverage gaps:
  - Embedding service timeout → document partially processed
  - ChromaDB upsert failure → orphaned chunks

**Sub-Agent Intent Classification — LLM-Based Routing:**
- Issue: Intent classification is a separate LLM call that can fail or misroute
- Files: `backend/app/services/intent_service.py` (full file, 381 lines)
- Why fragile:
  - Intent misclassification sends user to wrong tool (e.g., document search when web search intended)
  - Fallback to normal RAG is silent; user doesn't know intent was misrouted
  - Config for document list is passed to intent classifier; if documents list is large, prompt becomes huge
- Safe modification:
  - Add confidence score; use normal RAG if confidence < threshold
  - Log intent classification result (already done via Langfuse)
  - Add `/debug/intent-classification` endpoint to test routing on sample queries
- Test coverage: `tests/e2e/llm/sub-agent.spec.ts` covers happy path but not:
  - Misclassification recovery
  - Large document list handling

**Encryption/Decryption — Silent Failures:**
- Issue: `decrypt_value()` in `encryption_service.py` can raise cryptography exceptions if key or ciphertext is corrupted
- Files: `backend/app/services/encryption_service.py` (lines 34-37)
- Why fragile:
  - Called from `chat.py` and `metadata_service.py` without explicit exception handling
  - If decryption fails, entire chat request fails with 500 error
  - User can't recover without admin intervention
- Safe modification:
  - Wrap decrypt calls in try/except, return fallback (e.g., empty key = prompt user to reconfigure)
  - Add `@observe()` tracing to encrypt/decrypt for debugging
  - Validate key format at startup
- Test coverage: Missing test for corrupted encrypted values

---

## Known Limitations & Design Decisions

**SQLite for Production:**
- Current: SQLite with WAL mode (suitable for dev/small deployments)
- Limitation: Single writer; concurrent writes block on each other
- Impact: At scale (100+ concurrent users), write latency increases
- Migration path: PostgreSQL for production deployments
- Decision documented in CLAUDE.md: "all data stays local" — acceptable for single-instance apps

**Stateless LLM Completions:**
- Current: Client maintains chat history; backend is stateless per request
- Limitation: No server-side session state; if client loses history, messages are orphaned
- Impact: Users relying on browser storage (localStorage) could lose messages if cache is cleared
- Mitigation: Full message history is persisted in SQLite; client hydration on load
- Design choice: Simplifies backend; trades off for UI complexity

**Langfuse Self-Hosted Dependency:**
- Current: Observability requires self-hosted Langfuse at `192.168.1.152:3000`
- Limitation: If Langfuse is down, app still works but traces are lost
- Impact: Debugging becomes harder; no visibility into failures during Langfuse outage
- Current fallback: Error messages logged locally
- Recommendation: Add toggle to disable Langfuse if not running

**No Rate Limiting:**
- Current: No rate limit on file uploads or API calls
- Limitation: Malicious user can spam uploads or requests
- Impact: Disk space exhaustion; compute resource abuse
- Recommendation: Add per-user rate limit middleware (e.g., 10 uploads/hour, 100 API calls/minute)

**Manual File Cleanup on Document Delete:**
- Current: File deletion is synchronous in router; ChromaDB cleanup is synchronous
- Limitation: Large documents (50MB) could cause timeout during delete
- Impact: Delete endpoint hangs if file I/O is slow
- Improvement path: Queue delete as background task; implement cleanup task to remove orphaned files

---

## Dependency & Version Risks

**Critical Dependencies Without Pinned Versions:**
- Current: `pyproject.toml` uses semantic versioning ranges (e.g., `pydantic = "^2.x"`)
- Risk: Minor version bumps could introduce breaking changes
- Affected packages: `fastapi`, `aiosqlite`, `chromadb`, `langfuse`
- Recommendation: Audit transitive dependencies; pin critical packages to exact versions for production

**ChromaDB Persistence Format:**
- Risk: ChromaDB persistence format may not be stable across major versions
- Mitigation: Document ChromaDB version compatibility; add migration script if format changes
- Current: No ChromaDB version pinning detected in dependencies

**Deprecated Langfuse Client Pattern:**
- Current: Uses `@observe()` decorator + `get_client().update_current_span()`
- Risk: Langfuse API may deprecate this pattern
- Mitigation: Already using Langfuse's recommended patterns (check Langfuse docs quarterly)

---

## Test Coverage Gaps

**Chat Streaming Edge Cases:**
- What's not tested: Abort mid-stream, network disconnect, LLM provider switching
- Files: `backend/app/routers/chat.py` (event_generator function)
- Risk: Edge case bugs could corrupt message state or leak partial responses
- Priority: High (affects user experience)

**Sub-Agent Tool Execution:**
- What's not tested: Tool timeout, malformed tool results, tool not found
- Files: `backend/app/services/sub_agent_tools.py`
- Risk: Sub-agent could hang or crash ungracefully
- Priority: High (tool-calling is new feature)

**Concurrency & Race Conditions:**
- What's not tested: Simultaneous document upload/delete, concurrent ingestion, password update during session
- Files: `backend/app/routers/documents.py`, `backend/app/services/ingestion_service.py`, `backend/app/routers/auth.py`
- Risk: Data corruption or incorrect state transitions
- Priority: Medium (low user concurrency currently)

**Encryption & Decryption:**
- What's not tested: Corrupted encrypted values, key rotation, missing encryption key
- Files: `backend/app/services/encryption_service.py`
- Risk: Silent failures or unrecoverable state
- Priority: Medium

**Metadata Extraction Failure Paths:**
- What's not tested: LLM timeout, invalid JSON response, schema mismatch
- Files: `backend/app/services/metadata_service.py`
- Risk: Documents marked completed but missing metadata; inconsistent state
- Priority: Medium

---

## Summary of Action Items

**Critical (fix before production):**
1. Fix CORS to use explicit allowed origins (not regex)
2. Validate encryption key exists at startup (don't auto-generate)
3. Add wall-clock timeout to sub-agent loop
4. Add specific exception handling in chat router + logging

**Important (fix in next sprint):**
5. Implement distributed stop-signal storage for multi-worker deployments
6. Add metadata extraction TTL/caching
7. Implement schema validation for dynamic Pydantic models
8. Add `/debug/intent-classification` endpoint for testing routing

**Nice-to-Have (backlog):**
9. Migrate SQLite to PostgreSQL for production
10. Implement per-user rate limiting
11. Add ChromaDB integrity checks
12. Implement BM25 cache eviction policy

---

*Concerns audit: 2026-03-15*
