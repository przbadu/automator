import asyncio
import logging

import aiosqlite
from langfuse import observe

from app.database import DB_PATH, get_chroma_collection
from app.services.conversion_service import convert_document, needs_conversion
from app.services.storage_service import get_upload_path, read_file_text

logger = logging.getLogger(__name__)


def _reconstruct_from_chunks(document_id: str) -> str | None:
    """Attempt to reconstruct document content from ChromaDB chunks.

    Fallback when the source file is missing from disk (RESEARCH.md Pitfall 3).
    Returns concatenated chunk text ordered by chunk_index, or None if no chunks found.
    """
    try:
        collection = get_chroma_collection()
        results = collection.get(
            where={"document_id": document_id},
            include=["documents", "metadatas"],
        )

        if not results["documents"]:
            return None

        # Pair chunks with their index for proper ordering
        chunks = []
        for doc, meta in zip(results["documents"], results["metadatas"]):
            idx = meta.get("chunk_index", 0) if meta else 0
            chunks.append((idx, doc))

        chunks.sort(key=lambda c: c[0])
        return "\n\n".join(text for _, text in chunks)
    except Exception as e:
        logger.warning("Failed to reconstruct from ChromaDB for document %s: %s", document_id, e)
        return None


@observe(name="backfill_document_content")
async def backfill_document_content() -> dict:
    """Backfill document_content for existing documents missing full markdown.

    Finds all completed documents without a row in document_content,
    re-extracts their markdown content (or reconstructs from chunks),
    and inserts into document_content with proper FTS5 sync.

    Returns stats dict: {success, failed, skipped, total}
    """
    stats = {"success": 0, "failed": 0, "skipped": 0, "total": 0}

    db = await aiosqlite.connect(DB_PATH)
    try:
        await db.execute("PRAGMA foreign_keys = ON")

        # Find all completed documents missing from document_content
        cursor = await db.execute(
            """SELECT d.id, d.user_id, d.filename
               FROM documents d
               LEFT JOIN document_content dc ON d.id = dc.document_id
               WHERE d.status = 'completed'
                 AND dc.document_id IS NULL"""
        )
        rows = await cursor.fetchall()
        stats["total"] = len(rows)

        logger.info("Backfill: found %d documents missing content", len(rows))

        # Process sequentially to avoid memory issues with Docling
        for row in rows:
            doc_id, user_id, filename = row[0], row[1], row[2]
            try:
                text = None

                if needs_conversion(filename):
                    # File needs Docling conversion
                    file_path = get_upload_path(user_id, doc_id, filename)
                    if file_path.exists():
                        text = await asyncio.to_thread(convert_document, file_path)
                    else:
                        logger.warning(
                            "Source file missing for document %s (%s), trying ChromaDB fallback",
                            doc_id, filename,
                        )
                        text = _reconstruct_from_chunks(doc_id)
                else:
                    # Plain text file
                    try:
                        text = read_file_text(user_id, doc_id, filename)
                    except FileNotFoundError:
                        logger.warning(
                            "Source file missing for document %s (%s), trying ChromaDB fallback",
                            doc_id, filename,
                        )
                        text = _reconstruct_from_chunks(doc_id)

                if text is None:
                    logger.warning(
                        "Could not extract content for document %s (%s) - no source file or chunks",
                        doc_id, filename,
                    )
                    stats["failed"] += 1
                    continue

                line_count = text.count("\n") + 1
                char_count = len(text)

                # Upsert using ON CONFLICT DO UPDATE (NOT INSERT OR REPLACE)
                # to preserve FTS5 rowid mapping (RESEARCH.md Pitfall 4)
                await db.execute(
                    """INSERT INTO document_content (document_id, user_id, content, line_count, char_count)
                       VALUES (?, ?, ?, ?, ?)
                       ON CONFLICT(document_id) DO UPDATE SET
                           content = excluded.content,
                           line_count = excluded.line_count,
                           char_count = excluded.char_count""",
                    (doc_id, user_id, text, line_count, char_count),
                )
                await db.commit()

                stats["success"] += 1
                logger.info(
                    "Backfilled document %s (%s): %d chars, %d lines",
                    doc_id, filename, char_count, line_count,
                )

            except Exception as e:
                logger.error("Failed to backfill document %s (%s): %s", doc_id, filename, e)
                stats["failed"] += 1

        logger.info(
            "Backfill complete: %d success, %d failed, %d skipped, %d total",
            stats["success"], stats["failed"], stats["skipped"], stats["total"],
        )

    finally:
        await db.close()

    return stats
