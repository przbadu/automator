"""KB agent tool definitions (OpenAI + Anthropic formats) and executor wrappers.

Provides tool definitions for the LLM agent to explore the knowledge base,
and executor functions that call Phase 3 service layer functions and format
results as plain text for LLM consumption.
"""

import logging

import aiosqlite
from langfuse import get_client, observe

from app.services import kb_tools_service
from app.services.embedding_service import generate_embeddings
from app.database import get_chroma_collection

logger = logging.getLogger(__name__)

# --- Tool definitions (OpenAI function-calling format) ---

_KB_TOOLS_OPENAI = [
    {
        "type": "function",
        "function": {
            "name": "kb_ls",
            "description": "List files and subfolders at a given path in the knowledge base.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The folder path to list (default: '/')",
                        "default": "/",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "kb_tree",
            "description": "Get a hierarchical tree structure of the knowledge base.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Root path for the tree (default: '/')",
                        "default": "/",
                    },
                    "depth": {
                        "type": "integer",
                        "description": "Maximum depth to traverse (default: 2)",
                        "default": 2,
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of entries to return (default: 50)",
                        "default": 50,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "kb_grep",
            "description": "Search document contents using a regex pattern.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Regex pattern to search for",
                    },
                    "path": {
                        "type": "string",
                        "description": "Optional folder path to scope the search",
                    },
                    "case_insensitive": {
                        "type": "boolean",
                        "description": "Whether to ignore case (default: false)",
                        "default": False,
                    },
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "kb_glob",
            "description": "Match documents by filename pattern (e.g., '*.pdf', 'reports/*.md').",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Glob pattern to match filenames against",
                    },
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "kb_read",
            "description": "Read the content of a document by its path in the knowledge base.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the document (e.g., '/reports/summary.pdf')",
                    },
                    "offset": {
                        "type": "integer",
                        "description": "Line offset to start reading from (0-based)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of lines to read",
                    },
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "kb_semantic_search",
            "description": "Semantic similarity search across all documents in the knowledge base. Use this to find content related to a topic across the entire KB.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to find relevant content",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of results to return (default: 5)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_document",
            "description": "Delegate deep analysis of a specific document to the document analysis sub-agent. Use when you've identified a specific document that needs thorough reading and analysis.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {
                        "type": "string",
                        "description": "The ID of the document to analyze",
                    },
                    "question": {
                        "type": "string",
                        "description": "The question or analysis task for the document",
                    },
                },
                "required": ["document_id", "question"],
            },
        },
    },
]

# --- Tool definitions (Anthropic format) ---

_KB_TOOLS_ANTHROPIC = [
    {
        "name": "kb_ls",
        "description": "List files and subfolders at a given path in the knowledge base.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The folder path to list (default: '/')",
                    "default": "/",
                },
            },
            "required": [],
        },
    },
    {
        "name": "kb_tree",
        "description": "Get a hierarchical tree structure of the knowledge base.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Root path for the tree (default: '/')",
                    "default": "/",
                },
                "depth": {
                    "type": "integer",
                    "description": "Maximum depth to traverse (default: 2)",
                    "default": 2,
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of entries to return (default: 50)",
                    "default": 50,
                },
            },
            "required": [],
        },
    },
    {
        "name": "kb_grep",
        "description": "Search document contents using a regex pattern.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Regex pattern to search for",
                },
                "path": {
                    "type": "string",
                    "description": "Optional folder path to scope the search",
                },
                "case_insensitive": {
                    "type": "boolean",
                    "description": "Whether to ignore case (default: false)",
                    "default": False,
                },
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "kb_glob",
        "description": "Match documents by filename pattern (e.g., '*.pdf', 'reports/*.md').",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to match filenames against",
                },
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "kb_read",
        "description": "Read the content of a document by its path in the knowledge base.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the document (e.g., '/reports/summary.pdf')",
                },
                "offset": {
                    "type": "integer",
                    "description": "Line offset to start reading from (0-based)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of lines to read",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "kb_semantic_search",
        "description": "Semantic similarity search across all documents in the knowledge base. Use this to find content related to a topic across the entire KB.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to find relevant content",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Number of results to return (default: 5)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "analyze_document",
        "description": "Delegate deep analysis of a specific document to the document analysis sub-agent. Use when you've identified a specific document that needs thorough reading and analysis.",
        "input_schema": {
            "type": "object",
            "properties": {
                "document_id": {
                    "type": "string",
                    "description": "The ID of the document to analyze",
                },
                "question": {
                    "type": "string",
                    "description": "The question or analysis task for the document",
                },
            },
            "required": ["document_id", "question"],
        },
    },
]


# --- Executor wrapper functions ---


def _format_size(size: int) -> str:
    """Format file size in human-readable form."""
    if size < 1024:
        return f"{size}B"
    elif size < 1024 * 1024:
        return f"{size / 1024:.1f}KB"
    else:
        return f"{size / (1024 * 1024):.1f}MB"


@observe(name="kb_agent_tool_ls")
async def execute_kb_ls(
    path: str,
    user_id: str,
    db: aiosqlite.Connection,
) -> str:
    """Execute kb_ls and format result as text."""
    result = await kb_tools_service.kb_ls(db, user_id, path)

    if result.error:
        return f"Error: {result.error}. Use kb_tree to explore available folders."

    lines = [f"Contents of {result.path}:"]
    if not result.folders and not result.files:
        lines.append("  (empty)")
    for folder in result.folders:
        lines.append(f"  {folder.name}/")
    for file in result.files:
        lines.append(f"  {file.name}  ({_format_size(file.size)}, {file.status})")

    get_client().update_current_span(
        metadata={
            "path": path,
            "folder_count": len(result.folders),
            "file_count": len(result.files),
        }
    )

    return "\n".join(lines)


@observe(name="kb_agent_tool_tree")
async def execute_kb_tree(
    path: str,
    depth: int,
    limit: int,
    user_id: str,
    db: aiosqlite.Connection,
) -> str:
    """Execute kb_tree and format result as indented text tree."""
    result = await kb_tools_service.kb_tree(db, user_id, path, depth=depth, limit=limit)

    if result.error:
        return f"Error: {result.error}. Use kb_ls at '/' to see top-level folders."

    lines = [f"Tree of {result.root} ({result.total_folders} folders, {result.total_files} files):"]

    def render_node(node, indent: int = 0):
        prefix = "  " * indent
        if node.type == "folder":
            lines.append(f"{prefix}{node.name}/")
            if node.children:
                for child in node.children:
                    render_node(child, indent + 1)
        else:
            lines.append(f"{prefix}{node.name}")

    for node in result.nodes:
        render_node(node, indent=1)

    if result.truncated:
        lines.append(f"  ... (truncated, showing {limit} of {result.total_folders + result.total_files} entries)")

    get_client().update_current_span(
        metadata={
            "path": path,
            "depth": depth,
            "limit": limit,
            "total_folders": result.total_folders,
            "total_files": result.total_files,
            "truncated": result.truncated,
        }
    )

    return "\n".join(lines)


@observe(name="kb_agent_tool_grep")
async def execute_kb_grep(
    pattern: str,
    user_id: str,
    db: aiosqlite.Connection,
    path: str | None = None,
    case_insensitive: bool = False,
) -> str:
    """Execute kb_grep and format result as filename:line_number: text."""
    result = await kb_tools_service.kb_grep(
        db, user_id, pattern, path=path, case_insensitive=case_insensitive, max_matches=10
    )

    if result.error:
        return f"Error: {result.error}"

    if not result.matches:
        scope = f" in {path}" if path else ""
        return f"No matches found for pattern '{pattern}'{scope}."

    lines = []
    for doc_match in result.matches:
        for line_match in doc_match.line_matches:
            lines.append(f"{doc_match.filename}:{line_match.line_number}: {line_match.text}")

    if result.truncated:
        lines.append(f"... (truncated at {result.total} documents, use path to narrow scope)")

    get_client().update_current_span(
        metadata={
            "pattern": pattern,
            "path": path,
            "case_insensitive": case_insensitive,
            "match_count": result.total,
            "truncated": result.truncated,
        }
    )

    return "\n".join(lines)


@observe(name="kb_agent_tool_glob")
async def execute_kb_glob(
    pattern: str,
    user_id: str,
    db: aiosqlite.Connection,
) -> str:
    """Execute kb_glob and format result as list of matching paths."""
    result = await kb_tools_service.kb_glob(db, user_id, pattern)

    if result.error:
        return f"Error: {result.error}"

    if not result.matches:
        return f"No documents matching pattern '{pattern}'."

    lines = [f"Matching documents ({result.total}):"]
    for match in result.matches:
        lines.append(f"  {match.path}  (id: {match.document_id})")

    get_client().update_current_span(
        metadata={
            "pattern": pattern,
            "match_count": result.total,
        }
    )

    return "\n".join(lines)


@observe(name="kb_agent_tool_read")
async def execute_kb_read(
    path: str,
    user_id: str,
    db: aiosqlite.Connection,
    offset: int | None = None,
    limit: int | None = None,
) -> str:
    """Execute kb_read and return document content."""
    # Default limit=100 when offset is provided but limit is not
    if offset is not None and limit is None:
        limit = 100

    result = await kb_tools_service.kb_read(db, user_id, path, offset=offset, limit=limit)

    if result.error:
        return f"Error: {result.error}. Use kb_glob or kb_ls to find available documents."

    header = f"File: {result.path} ({result.line_count} lines, {result.char_count} chars)"
    if result.total_lines is not None:
        header += f" [showing lines {result.offset + 1}-{result.offset + result.line_count} of {result.total_lines}]"

    get_client().update_current_span(
        metadata={
            "path": path,
            "offset": offset,
            "limit": limit,
            "line_count": result.line_count,
            "char_count": result.char_count,
        }
    )

    return f"{header}\n{result.content}"


@observe(name="kb_agent_tool_semantic_search")
async def execute_kb_semantic_search(
    query: str,
    user_id: str,
    top_k: int = 5,
) -> str:
    """Semantic search across all user documents in ChromaDB."""
    collection = get_chroma_collection()

    query_embeddings = await generate_embeddings([query])
    if not query_embeddings:
        return "Failed to generate embeddings for the search query."

    where_filter = {"user_id": user_id}

    try:
        count = collection.count()
        if count == 0:
            return "No documents in the knowledge base."

        results = collection.query(
            query_embeddings=query_embeddings,
            where=where_filter,
            n_results=min(top_k, count),
            include=["documents", "metadatas", "distances"],
        )
    except Exception as e:
        logger.warning("Semantic search failed: %s", e)
        return f"Search error: {e}"

    if not results["documents"] or not results["documents"][0]:
        return "No matching content found."

    lines = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        filename = meta.get("filename", "unknown")
        chunk_idx = meta.get("chunk_index", "?")
        score = round(1.0 - dist, 3)
        preview = doc[:200] + "..." if len(doc) > 200 else doc
        lines.append(f"{filename} (chunk {chunk_idx}, relevance: {score}): {preview}")

    get_client().update_current_span(
        metadata={
            "query": query,
            "top_k": top_k,
            "results_count": len(lines),
        }
    )

    return "\n\n".join(lines)
