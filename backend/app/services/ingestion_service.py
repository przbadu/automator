import asyncio
import json
import logging
from datetime import datetime, timezone

import aiosqlite

from app.database import DB_PATH, get_chroma_collection
from app.services.chunking_service import chunk_text
from app.services.conversion_service import convert_document, needs_conversion
from app.services.embedding_service import generate_embeddings
from app.services.metadata_service import extract_metadata
from app.services.status_events import publish
from app.services.storage_service import get_upload_path, read_file_text

logger = logging.getLogger(__name__)


async def _update_status(
    db: aiosqlite.Connection,
    doc_id: str,
    user_id: str,
    status: str,
    chunk_count: int = 0,
    error_message: str | None = None,
    progress: str = "",
    metadata: dict | None = None,
) -> None:
    """Update document status in DB and broadcast via SSE."""
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """UPDATE documents SET status = ?, chunk_count = ?, error_message = ?, updated_at = ?
           WHERE id = ?""",
        (status, chunk_count, error_message, now, doc_id),
    )
    await db.commit()

    event = {"type": "status_update", "document_id": doc_id, "status": status}
    if progress:
        event["progress"] = progress
    if chunk_count:
        event["chunk_count"] = chunk_count
    if error_message:
        event["error_message"] = error_message
    if metadata:
        event["metadata"] = metadata
    await publish(user_id, event)


async def ingest_document(doc_id: str, user_id: str, filename: str) -> None:
    """Full ingestion pipeline: read → chunk → embed → store in ChromaDB."""
    db = await aiosqlite.connect(DB_PATH)
    try:
        # 1. Processing
        await _update_status(db, doc_id, user_id, "processing", progress="Reading file...")

        try:
            if needs_conversion(filename):
                # Convert non-plaintext files via Docling
                await _update_status(db, doc_id, user_id, "converting", progress="Converting document...")
                file_path = get_upload_path(user_id, doc_id, filename)
                loop = asyncio.get_event_loop()
                text = await loop.run_in_executor(None, convert_document, file_path)
            else:
                text = read_file_text(user_id, doc_id, filename)
        except Exception as e:
            await _update_status(db, doc_id, user_id, "failed", error_message=f"Failed to read file: {e}")
            return

        if not text.strip():
            await _update_status(db, doc_id, user_id, "failed", error_message="File is empty")
            return

        # 2. Chunking
        await _update_status(db, doc_id, user_id, "chunking", progress="Chunking document...")
        try:
            chunks = chunk_text(text)
        except Exception as e:
            await _update_status(db, doc_id, user_id, "failed", error_message=f"Chunking failed: {e}")
            return

        if not chunks:
            await _update_status(db, doc_id, user_id, "failed", error_message="No chunks produced")
            return

        # 2.5 Metadata extraction (best-effort)
        await _update_status(db, doc_id, user_id, "extracting_metadata", progress="Extracting metadata...")
        metadata = None
        try:
            db.row_factory = aiosqlite.Row
            metadata = await extract_metadata(text, filename, user_id, db)
            db.row_factory = None
            if metadata:
                await db.execute(
                    "UPDATE documents SET metadata = ? WHERE id = ?",
                    (json.dumps(metadata), doc_id),
                )
                await db.commit()
                logger.info("Metadata extracted for document %s: %s", doc_id, list(metadata.keys()))
        except Exception as e:
            db.row_factory = None
            logger.warning("Metadata extraction failed for %s, continuing: %s", doc_id, e)

        # 3. Embedding
        await _update_status(db, doc_id, user_id, "embedding", progress=f"Generating embeddings for {len(chunks)} chunks...")
        try:
            embeddings = await generate_embeddings([c.content for c in chunks])
        except Exception as e:
            await _update_status(db, doc_id, user_id, "failed", error_message=f"Embedding failed: {e}")
            return

        # 4. Store in ChromaDB
        collection = get_chroma_collection()
        ids = [f"{doc_id}_chunk_{c.chunk_index}" for c in chunks]

        # Build chunk metadata, flattening extracted metadata for filtering
        def _build_chunk_metadata(chunk_index: int) -> dict:
            m = {
                "user_id": user_id,
                "document_id": doc_id,
                "filename": filename,
                "chunk_index": chunk_index,
            }
            if metadata:
                for key, value in metadata.items():
                    if isinstance(value, list):
                        m[key] = ",".join(str(v) for v in value)
                    elif isinstance(value, bool):
                        m[key] = str(value).lower()
                    elif value is not None:
                        m[key] = value
            return m

        metadatas = [_build_chunk_metadata(c.chunk_index) for c in chunks]
        documents = [c.content for c in chunks]

        # Remove any existing chunks for this document (handles re-ingestion on update)
        try:
            collection.delete(where={"document_id": doc_id})
        except Exception:
            pass

        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents,
        )

        # 5. Complete
        await _update_status(
            db, doc_id, user_id, "completed",
            chunk_count=len(chunks),
            progress="Ingestion complete",
            metadata=metadata,
        )
        logger.info("Document %s ingested: %d chunks", doc_id, len(chunks))

        # Invalidate BM25 keyword search cache for this user
        from app.services.keyword_search_service import invalidate_cache
        invalidate_cache(user_id)

    except Exception as e:
        logger.exception("Ingestion failed for document %s", doc_id)
        try:
            await _update_status(db, doc_id, user_id, "failed", error_message=str(e))
        except Exception:
            pass
    finally:
        await db.close()


async def reset_stuck_documents() -> None:
    """Reset documents stuck in processing states back to pending (startup recovery)."""
    db = await aiosqlite.connect(DB_PATH)
    try:
        await db.execute(
            """UPDATE documents SET status = 'pending', updated_at = ?
               WHERE status IN ('processing', 'converting', 'chunking', 'extracting_metadata', 'embedding')""",
            (datetime.now(timezone.utc).isoformat(),),
        )
        await db.commit()
    finally:
        await db.close()
