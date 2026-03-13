"""Sub-agent tool definitions and executors for autonomous document analysis."""

import logging

import aiosqlite
from langfuse import get_client, observe

from app.config import settings
from app.database import get_chroma_collection
from app.services.embedding_service import generate_embeddings

logger = logging.getLogger(__name__)

# OpenAI function-calling tool definitions
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "read_document_chunks",
            "description": "Read chunks from a document. Use this to read the full content of a document by reading its chunks sequentially.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {
                        "type": "string",
                        "description": "The ID of the document to read",
                    },
                    "start_chunk": {
                        "type": "integer",
                        "description": "The chunk index to start reading from (default: 0)",
                        "default": 0,
                    },
                    "max_chunks": {
                        "type": "integer",
                        "description": f"Maximum number of chunks to read (default: {settings.sub_agent_max_chunks_per_read})",
                    },
                },
                "required": ["document_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_within_document",
            "description": "Perform semantic search within a specific document to find relevant sections.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {
                        "type": "string",
                        "description": "The ID of the document to search within",
                    },
                    "query": {
                        "type": "string",
                        "description": "The search query to find relevant sections",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of results to return (default: 5)",
                        "default": 5,
                    },
                },
                "required": ["document_id", "query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_document_info",
            "description": "Get metadata and statistics about a document, including filename, size, chunk count, and status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {
                        "type": "string",
                        "description": "The ID of the document",
                    },
                },
                "required": ["document_id"],
            },
        },
    },
]

# Anthropic tool format
ANTHROPIC_TOOL_DEFINITIONS = [
    {
        "name": "read_document_chunks",
        "description": "Read chunks from a document. Use this to read the full content of a document by reading its chunks sequentially.",
        "input_schema": {
            "type": "object",
            "properties": {
                "document_id": {
                    "type": "string",
                    "description": "The ID of the document to read",
                },
                "start_chunk": {
                    "type": "integer",
                    "description": "The chunk index to start reading from (default: 0)",
                    "default": 0,
                },
                "max_chunks": {
                    "type": "integer",
                    "description": f"Maximum number of chunks to read (default: {settings.sub_agent_max_chunks_per_read})",
                },
            },
            "required": ["document_id"],
        },
    },
    {
        "name": "search_within_document",
        "description": "Perform semantic search within a specific document to find relevant sections.",
        "input_schema": {
            "type": "object",
            "properties": {
                "document_id": {
                    "type": "string",
                    "description": "The ID of the document to search within",
                },
                "query": {
                    "type": "string",
                    "description": "The search query to find relevant sections",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Number of results to return (default: 5)",
                    "default": 5,
                },
            },
            "required": ["document_id", "query"],
        },
    },
    {
        "name": "get_document_info",
        "description": "Get metadata and statistics about a document, including filename, size, chunk count, and status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "document_id": {
                    "type": "string",
                    "description": "The ID of the document",
                },
            },
            "required": ["document_id"],
        },
    },
]


@observe(name="sub_agent_tool_read_document_chunks")
def read_document_chunks(
    document_id: str,
    user_id: str,
    start_chunk: int = 0,
    max_chunks: int | None = None,
) -> str:
    """Read chunks from a document in ChromaDB, sorted by chunk_index."""
    if max_chunks is None:
        max_chunks = settings.sub_agent_max_chunks_per_read

    collection = get_chroma_collection()

    where_filter = {
        "$and": [
            {"document_id": document_id},
            {"user_id": user_id},
        ]
    }

    # Get all matching chunks (ChromaDB doesn't support sorting, so we fetch and sort)
    try:
        count = collection.count()
        if count == 0:
            return "No chunks found."

        results = collection.get(
            where=where_filter,
            include=["documents", "metadatas"],
        )
    except Exception as e:
        logger.warning("Failed to read chunks for document %s: %s", document_id, e)
        return f"Error reading document: {e}"

    if not results["documents"]:
        return "No chunks found for this document."

    # Sort by chunk_index
    chunks = sorted(
        zip(results["documents"], results["metadatas"]),
        key=lambda x: x[1].get("chunk_index", 0),
    )

    # Apply range
    selected = chunks[start_chunk : start_chunk + max_chunks]

    if not selected:
        return f"No chunks in range [{start_chunk}, {start_chunk + max_chunks}). Document has {len(chunks)} chunks total."

    parts = []
    for doc, meta in selected:
        idx = meta.get("chunk_index", "?")
        parts.append(f"[Chunk {idx}]\n{doc}")

    summary = "\n\n".join(parts)

    get_client().update_current_span(
        metadata={
            "document_id": document_id,
            "start_chunk": start_chunk,
            "max_chunks": max_chunks,
            "chunks_returned": len(selected),
            "total_chunks": len(chunks),
        }
    )

    return summary


@observe(name="sub_agent_tool_search_within_document")
async def search_within_document(
    document_id: str,
    query: str,
    user_id: str,
    top_k: int = 5,
) -> str:
    """Semantic search within a single document."""
    collection = get_chroma_collection()

    query_embeddings = await generate_embeddings([query])
    if not query_embeddings:
        return "Failed to generate embeddings for the search query."

    where_filter = {
        "$and": [
            {"document_id": document_id},
            {"user_id": user_id},
        ]
    }

    try:
        count = collection.count()
        if count == 0:
            return "No documents in the collection."

        results = collection.query(
            query_embeddings=query_embeddings,
            where=where_filter,
            n_results=min(top_k, count),
            include=["documents", "metadatas", "distances"],
        )
    except Exception as e:
        logger.warning("Search failed for document %s: %s", document_id, e)
        return f"Search error: {e}"

    if not results["documents"] or not results["documents"][0]:
        return "No matching sections found."

    parts = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        idx = meta.get("chunk_index", "?")
        score = round(1.0 - dist, 3)
        parts.append(f"[Chunk {idx}, relevance: {score}]\n{doc}")

    get_client().update_current_span(
        metadata={
            "document_id": document_id,
            "query": query,
            "top_k": top_k,
            "results_count": len(parts),
        }
    )

    return "\n\n".join(parts)


@observe(name="sub_agent_tool_get_document_info")
async def get_document_info(
    document_id: str,
    user_id: str,
    db: aiosqlite.Connection,
) -> str:
    """Get document metadata and statistics from SQLite."""
    cursor = await db.execute(
        """SELECT id, filename, file_size, mime_type, status, chunk_count,
                  error_message, created_at, updated_at, metadata
           FROM documents WHERE id = ? AND user_id = ?""",
        (document_id, user_id),
    )
    row = await cursor.fetchone()
    if not row:
        return "Document not found."

    import json

    metadata_str = ""
    if row[9]:
        try:
            meta = json.loads(row[9]) if isinstance(row[9], str) else row[9]
            metadata_str = f"\nMetadata: {json.dumps(meta, indent=2)}"
        except Exception:
            metadata_str = f"\nMetadata: {row[9]}"

    info = (
        f"Document: {row[1]}\n"
        f"ID: {row[0]}\n"
        f"Size: {row[2]} bytes\n"
        f"Type: {row[3]}\n"
        f"Status: {row[4]}\n"
        f"Chunks: {row[5]}\n"
        f"Created: {row[7]}\n"
        f"Updated: {row[8]}"
        f"{metadata_str}"
    )

    if row[6]:
        info += f"\nError: {row[6]}"

    get_client().update_current_span(
        metadata={
            "document_id": document_id,
            "filename": row[1],
            "chunk_count": row[5],
        }
    )

    return info


async def execute_tool(
    tool_name: str,
    arguments: dict,
    user_id: str,
    db: aiosqlite.Connection,
) -> str:
    """Execute a sub-agent tool by name and return the result as a string."""
    if tool_name == "read_document_chunks":
        return read_document_chunks(
            document_id=arguments["document_id"],
            user_id=user_id,
            start_chunk=arguments.get("start_chunk", 0),
            max_chunks=arguments.get("max_chunks"),
        )
    elif tool_name == "search_within_document":
        return await search_within_document(
            document_id=arguments["document_id"],
            query=arguments["query"],
            user_id=user_id,
            top_k=arguments.get("top_k", 5),
        )
    elif tool_name == "get_document_info":
        return await get_document_info(
            document_id=arguments["document_id"],
            user_id=user_id,
            db=db,
        )
    else:
        return f"Unknown tool: {tool_name}"
