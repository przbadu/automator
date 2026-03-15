# Phase 4: Agent Integration - Research

**Researched:** 2026-03-15
**Domain:** LLM tool-calling, agent orchestration, sub-agent delegation
**Confidence:** HIGH

## Summary

Phase 4 wires the KB exploration tools (built in Phase 3) into the existing LLM agent system so the model can automatically select and use them. The codebase already has a mature sub-agent architecture (`sub_agent_service.py`) with a tool-calling loop supporting both OpenAI and Anthropic formats, intent classification (`intent_service.py`), SSE streaming, and Langfuse tracing. The work is primarily integration -- registering new tool definitions, extending intent routing, and building an explorer sub-agent that chains KB tools.

The existing pattern is clear: tools are defined as static dicts in both OpenAI and Anthropic formats, registered in `get_tool_definitions()`, dispatched in `execute_tool()`, and the sub-agent loop handles iterative tool-calling. Phase 4 follows this exact pattern for KB tools, plus adds a new "explorer" mode to the sub-agent that can chain multiple KB tools autonomously.

**Primary recommendation:** Follow the existing tool registration pattern exactly. Add KB tools to `sub_agent_tools.py`, extend `intent_service.py` to route KB exploration queries, and create an `explorer_service.py` sub-agent with its own system prompt and tool set that includes delegation to the document analysis sub-agent.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOL-09 | LLM automatically selects exploration tools based on user's question | Extend `intent_service.py` with KB exploration patterns; add KB tools to `get_tool_definitions()` |
| AGENT-01 | Explorer sub-agent has access to all KB tools plus existing semantic search | New explorer service with tool set combining KB tools (ls, tree, grep, glob, read) + semantic_search |
| AGENT-02 | Explorer sub-agent can invoke document analysis sub-agent for deep analysis | Add `analyze_document` as a meta-tool the explorer can call, delegating to existing `run_sub_agent` with document_id |
| AGENT-03 | Explorer sub-agent returns synthesized findings, not raw tool output | System prompt instructs synthesis; the existing tool-calling loop already handles final text generation |
| AGENT-04 | Explorer can be spawned autonomously by main LLM or invoked directly by user | Intent classification routes to explorer; user can also explicitly request KB exploration |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openai (Python SDK) | existing | Tool-calling API for OpenAI-compatible LLMs | Already in use, handles tool_calls format |
| anthropic (Python SDK) | existing | Tool-calling API for Anthropic models | Already in use, handles tool_use blocks |
| pydantic | existing | Structured outputs, intent classification models | Project rule: use Pydantic for structured LLM outputs |
| langfuse | existing | Observability tracing | Project rule: every new service MUST have Langfuse tracing |
| aiosqlite | existing | Database access for KB tools | Already in use for all DB operations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sse-starlette | existing | Server-sent events for streaming | Already used for chat streaming |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw SDK tool-calling | LangChain/LangGraph | **Explicitly forbidden** by project rules |
| Static tool dicts | Dynamic tool generation | Unnecessary complexity; static dicts are proven in codebase |

**Installation:**
No new dependencies needed. All required libraries are already installed.

## Architecture Patterns

### Recommended Project Structure
```
backend/app/services/
    sub_agent_tools.py       # MODIFY: add KB tool definitions + execute_tool cases
    sub_agent_service.py     # MODIFY: add explorer mode with dedicated system prompt
    intent_service.py        # MODIFY: add KB exploration intent routing
    kb_tools_service.py      # NEW: KB tool executor functions (ls, tree, grep, glob, read, semantic_search)
    explorer_service.py      # NEW: explorer sub-agent orchestration (optional, could be a mode in sub_agent_service)
```

### Pattern 1: Tool Registration (follow existing pattern exactly)
**What:** Define tools as static dicts in OpenAI and Anthropic formats, register in `get_tool_definitions()`, dispatch in `execute_tool()`
**When to use:** For all new KB tools
**Example:**
```python
# In sub_agent_tools.py - following existing web_search_tool.py pattern

_KB_TOOLS_OPENAI = [
    {
        "type": "function",
        "function": {
            "name": "kb_ls",
            "description": "List files and subfolders in a knowledge base folder path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Folder path to list (e.g., '/' for root, '/reports')",
                        "default": "/",
                    },
                },
            },
        },
    },
    # ... tree, grep, glob, read, semantic_search tools
]

# In get_tool_definitions():
if include_kb_tools:
    tools.extend(_KB_TOOLS_OPENIC if format == "openai" else _KB_TOOLS_ANTHROPIC)

# In execute_tool():
elif tool_name == "kb_ls":
    from app.services.kb_tools_service import kb_ls
    return await kb_ls(arguments.get("path", "/"), user_id, db)
```

### Pattern 2: Intent Classification Extension
**What:** Add KB exploration patterns to `intent_service.py` for automatic routing
**When to use:** When the LLM needs to decide if a query requires KB exploration
**Example:**
```python
# New intent category in _build_intent_system_prompt():
# Category: KB Explorer (needs_explorer=true)
# Use when the user wants to explore, browse, search across, or navigate their knowledge base:
# - "what documents do I have about X?"
# - "find all PDFs mentioning Y"
# - "show me the structure of my knowledge base"
# - "search my documents for Z"

# Add to IntentClassification model:
class IntentClassification(BaseModel):
    needs_sub_agent: bool
    needs_explorer: bool = False  # NEW: routes to explorer sub-agent
    target_document_id: str | None = None
    # ...

# Fast-path patterns:
_KB_EXPLORER_PATTERNS = re.compile(
    r"\b("
    r"(find|search|look for|grep) .*(documents?|files?|knowledge base|kb)"
    r"|what (documents?|files?) .*(have|contain|about)"
    r"|(show|list|browse) .*(my )?(documents?|files?|folders?|knowledge base)"
    r"|folder (tree|structure|hierarchy)"
    r")\b",
    re.IGNORECASE,
)
```

### Pattern 3: Explorer Sub-Agent with Tool Chaining
**What:** A dedicated sub-agent mode that has access to KB tools and can chain them (tree -> grep -> read) to answer questions
**When to use:** When intent classification determines KB exploration is needed
**Example:**
```python
EXPLORER_SYSTEM_PROMPT = """\
You are a knowledge base explorer. You can navigate and search the user's document collection.

Available tools:
- kb_ls(path): List files and subfolders at a path
- kb_tree(path, depth): Get hierarchical view of the KB structure
- kb_grep(pattern, path): Search document contents by regex pattern
- kb_glob(pattern): Match documents by filename pattern
- kb_read(path, offset, limit): Read document content (full or line range)
- semantic_search(query): Find semantically similar content across all documents
- analyze_document(document_id, question): Delegate to document analysis sub-agent for deep single-document analysis

Strategy:
1. Start broad (tree/ls) to understand structure
2. Narrow down with grep/glob/semantic_search to find relevant documents
3. Read specific documents for detailed information
4. Use analyze_document for deep analysis of a single document
5. Synthesize findings into a coherent answer

IMPORTANT: Always synthesize your findings into a clear, natural language response. Never return raw tool output as your final answer.
"""
```

### Pattern 4: Document Analysis Delegation (AGENT-02)
**What:** Explorer sub-agent can delegate to the existing document analysis sub-agent
**When to use:** When the explorer identifies a specific document that needs deep analysis
**Example:**
```python
# Add as a meta-tool in the explorer's tool set:
{
    "name": "analyze_document",
    "description": "Delegate deep analysis of a single document to the document analysis sub-agent. Use when you've identified a specific document that needs thorough reading and analysis.",
    "parameters": {
        "type": "object",
        "properties": {
            "document_id": {"type": "string", "description": "Document ID to analyze"},
            "question": {"type": "string", "description": "Specific question about the document"},
        },
        "required": ["document_id", "question"],
    },
}

# In executor:
async def execute_analyze_document(document_id, question, user_id, db, client, model, provider):
    """Run the existing document analysis sub-agent and collect its output."""
    # Look up filename
    cursor = await db.execute(
        "SELECT filename FROM documents WHERE id = ? AND user_id = ?",
        (document_id, user_id)
    )
    row = await cursor.fetchone()
    if not row:
        return "Document not found."

    # Collect sub-agent output (non-streaming for the explorer)
    result_parts = []
    async for event in run_sub_agent(
        user_message=question,
        user_id=user_id,
        chat_history=[],
        document_id=document_id,
        document_filename=row["filename"],
        client=client,
        model=model,
        provider=provider,
        db=db,
    ):
        if event["type"] == "delta":
            result_parts.append(event.get("content", ""))
    return "".join(result_parts)
```

### Anti-Patterns to Avoid
- **Building a separate tool-calling loop:** The existing `_run_openai_loop` / `_run_anthropic_loop` in `sub_agent_service.py` handles everything. Reuse it with a different system prompt and tool set.
- **Nesting SSE streams:** The explorer is called from within the chat SSE handler. It should yield the same event types (`delta`, `sub_agent_tool_call`, `sub_agent_tool_result`) to integrate seamlessly.
- **Returning raw tool output as final response:** The system prompt must instruct synthesis. The existing loop already forces a final text response when max iterations reached.
- **Forgetting user_id scoping:** Every KB tool MUST receive and enforce user_id. This is a project rule.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tool-calling loop | Custom iteration logic | Existing `_run_openai_loop` / `_run_anthropic_loop` | Already handles both providers, fallbacks, streaming, max iterations |
| SSE event format | New event types | Existing event dict pattern (`{"type": "...", ...}`) | Frontend already handles these event types |
| Intent classification | New classifier | Extend existing `intent_service.py` | Already handles fast-path patterns, LLM fallback, document matching |
| Document analysis | New document reader | Existing `run_sub_agent` with document_id | Already handles chunk reading, semantic search, fallback |
| Langfuse tracing | Manual span management | `@observe()` decorator + `get_client().update_current_span()` | Project convention, automatic nesting |

**Key insight:** The entire tool-calling infrastructure already exists. Phase 4 is 80% integration (registering tools, extending routing) and 20% new logic (explorer system prompt, `analyze_document` delegation).

## Common Pitfalls

### Pitfall 1: Tool Name Collisions
**What goes wrong:** KB tool names conflict with existing tools (e.g., `read` vs `read_document_chunks`)
**Why it happens:** Generic tool names like `read`, `search` overlap with existing document tools
**How to avoid:** Prefix all KB tools with `kb_` (e.g., `kb_ls`, `kb_tree`, `kb_grep`, `kb_glob`, `kb_read`). The existing tools use specific names (`read_document_chunks`, `search_within_document`).
**Warning signs:** LLM calls wrong tool, document analysis breaks

### Pitfall 2: Explorer Getting Stuck in Loops
**What goes wrong:** Explorer calls tree -> grep -> tree -> grep repeatedly without converging
**Why it happens:** Small LLMs may not have strong enough reasoning to form an exploration strategy
**How to avoid:** Set `max_iterations` appropriately (5-8 for explorer), include strategy guidance in system prompt, and the existing "max iterations reached" fallback ensures a response is always generated
**Warning signs:** High iteration count in Langfuse traces, timeouts

### Pitfall 3: Oversized Tool Results
**What goes wrong:** KB tools return massive output (e.g., tree of 1000 files, grep matching hundreds of docs) that blows up context window
**Why it happens:** Phase 3 tools may not enforce output limits strictly enough for agent consumption
**How to avoid:** KB tool wrappers for the agent should enforce stricter limits than the raw tools. E.g., tree depth=2 and limit=50 by default, grep max results=10, read max_lines=100. Add truncation indicators.
**Warning signs:** Context window errors, slow responses, high token usage in Langfuse

### Pitfall 4: Intent Overlap Between Explorer and Document Analysis
**What goes wrong:** Questions like "what does my report say about X?" could route to explorer OR document analysis
**Why it happens:** Ambiguity between "search across KB" vs "analyze specific document"
**How to avoid:** Clear priority in intent classification: if user names a specific document -> document analysis sub-agent (existing behavior). If question is about "documents" (plural), "knowledge base", or browsing -> explorer. The explorer can always delegate to document analysis if it finds a specific document is relevant.
**Warning signs:** Wrong sub-agent activated, user doesn't get expected behavior

### Pitfall 5: Forgetting to Pass DB Connection to KB Tools
**What goes wrong:** KB tools need SQLite access for folder/document queries but don't receive the `db` parameter
**Why it happens:** Some tools in the existing system are synchronous and don't need db (e.g., `read_document_chunks` uses ChromaDB directly)
**How to avoid:** Ensure `execute_tool()` passes `db` to all KB tool handlers. The existing signature already accepts `db: aiosqlite.Connection`.
**Warning signs:** RuntimeError, missing db parameter errors

### Pitfall 6: Not Handling Non-Existent Paths Gracefully
**What goes wrong:** Explorer calls `kb_ls("/reports/2024")` but the folder doesn't exist, gets an error
**Why it happens:** LLM guesses paths based on user question
**How to avoid:** KB tools must return friendly error messages ("Folder '/reports/2024' not found. Use kb_tree to explore available folders.") that guide the LLM to self-correct
**Warning signs:** Sub-agent enters error loop, gives up

## Code Examples

### KB Tool Definition Pattern (verified from codebase)
```python
# Follow the exact pattern from web_search_tool.py and sql_tool.py
# Each tool needs: OpenAI format dict, Anthropic format dict, executor function

# kb_tools_service.py
from langfuse import get_client, observe

@observe(name="kb_tool_ls")
async def kb_ls(path: str, user_id: str, db) -> str:
    """List files and subfolders at a path. Calls Phase 3 tool service."""
    from app.services.kb_exploration_service import ls_tool  # Phase 3 service
    result = await ls_tool(path=path, user_id=user_id, db=db)
    get_client().update_current_span(metadata={"path": path, "result_count": len(result)})
    return format_ls_result(result)
```

### Intent Service Extension (verified from codebase pattern)
```python
# Add to _build_intent_system_prompt():
## Category N: KB Explorer (needs_explorer=true)
# Use when the user wants to explore, search across, or navigate their knowledge base:
# - Browse folder structure, list files
# - Search across multiple documents
# - Find documents by name or content pattern
# - Questions about what's in their knowledge base

# Add fast-path to classify_intent():
if _KB_EXPLORER_PATTERNS.search(user_message):
    return IntentClassification(
        needs_sub_agent=True,
        needs_explorer=True,
        reasoning="User message matches KB exploration pattern",
    )
```

### Explorer Sub-Agent Integration in Chat Router (verified from codebase)
```python
# In chat.py send_message():
if intent.needs_explorer:
    # Explorer sub-agent path
    async for event in run_sub_agent(
        user_message=req.content,
        user_id=current_user["id"],
        chat_history=messages,
        client=llm_client,
        model=llm_model,
        provider=llm_provider,
        stop_event=stop_event,
        db=db,
        mode="explorer",  # NEW: tells sub_agent_service to use explorer tools + prompt
    ):
        # Same event handling as existing sub-agent path
        ...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual tool selection by user | LLM auto-selects tools via intent classification | Already in codebase | Phase 4 extends this to KB tools |
| Single-shot RAG only | Sub-agent with iterative tool-calling | Already in codebase | Explorer builds on this pattern |
| Flat document access | Hierarchical folder-based navigation | Phase 2-3 | Explorer navigates folder structure |

**Current codebase decisions that constrain Phase 4:**
- `tool_hint` mechanism: existing system restricts tools to a single hinted tool for small LLMs. Explorer may need all tools available -- consider making this configurable per mode.
- `sub_agent_max_iterations = 5`: may be too low for multi-step KB exploration. Consider an `explorer_max_iterations` setting.
- Provider-specific loops: both OpenAI and Anthropic loops must be maintained for any new tool/mode.

## Open Questions

1. **Should the explorer be a new mode in `sub_agent_service.py` or a separate `explorer_service.py`?**
   - What we know: The existing `run_sub_agent` already accepts `mode` implicitly via `document_id` presence. Adding `mode="explorer"` parameter is natural.
   - What's unclear: Whether the explorer needs fundamentally different loop behavior (e.g., different max iterations, different streaming behavior).
   - Recommendation: Start as a mode in `sub_agent_service.py` with a separate system prompt and tool set. Extract to separate service only if complexity grows.

2. **How should KB tool names map to Phase 3 function names?**
   - What we know: Phase 3 hasn't been built yet, so its service API is undefined.
   - What's unclear: Exact function signatures from Phase 3 tools.
   - Recommendation: Define the KB tool executor functions in `kb_tools_service.py` as thin wrappers around Phase 3 functions. This decouples the tool-calling interface from the implementation.

3. **Should `analyze_document` delegation be synchronous (collect all output) or streamed?**
   - What we know: The explorer runs inside a tool-calling loop that expects string results from tools.
   - What's unclear: Whether the document analysis sub-agent output could be very long.
   - Recommendation: Collect synchronously with a character limit (e.g., 4000 chars). The explorer synthesizes from multiple tool results anyway.

4. **How many KB tools should the explorer have access to simultaneously?**
   - What we know: The existing `tool_hint` mechanism restricts small LLMs to one tool. The explorer needs multiple tools to chain.
   - What's unclear: Whether small/local LLMs can reliably select from 7+ tools.
   - Recommendation: Provide all KB tools to the explorer but consider a `kb_explore` "meta-tool" for the main agent that spawns the explorer, rather than giving the main agent all KB tools directly. This means the main agent only needs to decide "use explorer" vs "use document analysis" vs "normal RAG".

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | curl (API) + agent-browser (UI) |
| Config file | none -- project uses manual validation |
| Quick run command | `curl -s http://0.0.0.0:8000/health \| jq .` |
| Full suite command | Manual validation via curl + agent-browser |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOOL-09 | LLM auto-selects KB tools | integration | `curl -X POST http://0.0.0.0:8000/threads/{id}/messages -H "Authorization: Bearer {token}" -d '{"content":"what documents do I have about machine learning?"}'` -- verify SSE events contain kb tool calls | N/A - curl-based |
| AGENT-01 | Explorer has all KB tools + semantic search | integration | Send message requiring multi-tool chaining, verify tool_call events in SSE stream | N/A - curl-based |
| AGENT-02 | Explorer delegates to document analysis | integration | Send message requiring deep document analysis, verify analyze_document tool call in SSE stream | N/A - curl-based |
| AGENT-03 | Explorer returns synthesized findings | integration | Send exploration query, verify final delta content is natural language (not raw JSON/tool output) | N/A - curl-based |
| AGENT-04 | Explorer spawned autonomously or by user | integration | Test both "search my docs for X" (autonomous) and explicit exploration request | N/A - curl-based |

### Sampling Rate
- **Per task commit:** Manual curl validation of affected endpoint
- **Per wave merge:** Full flow validation with agent-browser
- **Phase gate:** All 5 requirements validated end-to-end

### Wave 0 Gaps
None -- project does not use automated test framework. Validation is curl + agent-browser per project convention.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `backend/app/services/sub_agent_service.py` -- existing tool-calling loop, provider handling, SSE events
- Codebase analysis: `backend/app/services/sub_agent_tools.py` -- tool definition pattern, `get_tool_definitions()`, `execute_tool()`
- Codebase analysis: `backend/app/services/intent_service.py` -- intent classification, fast-path patterns, LLM fallback
- Codebase analysis: `backend/app/routers/chat.py` -- chat flow, sub-agent integration, SSE streaming
- Codebase analysis: `backend/app/config.py` -- sub-agent settings, feature flags
- Codebase analysis: `backend/app/services/web_search_tool.py` -- reference tool implementation pattern
- Codebase analysis: `backend/app/services/sql_tool.py` -- reference tool implementation pattern
- Codebase analysis: `backend/app/services/folder_service.py` -- folder tree, document listing functions available for KB tools

### Secondary (MEDIUM confidence)
- OpenAI function-calling documentation (well-known, stable API)
- Anthropic tool-use documentation (well-known, stable API)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all libraries already in use
- Architecture: HIGH - follows existing patterns exactly, codebase thoroughly analyzed
- Pitfalls: HIGH - derived from direct codebase analysis of existing tool-calling behavior
- Integration approach: HIGH - existing codebase provides clear patterns to follow

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- internal integration, no external API changes)
