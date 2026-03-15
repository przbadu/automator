import json
import logging
import uuid
from datetime import datetime, timezone

import aiosqlite
from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.database import get_chroma_collection, get_db
from app.middleware.auth import get_current_user
from app.models.documents import (
    DocumentContentResponse,
    DocumentListResponse,
    DocumentResponse,
    FTSSearchResponse,
    FTSSearchResult,
)
from app.models.folders import MoveDocumentRequest
from app.services.record_manager import check_duplicate, compute_content_hash
from app.services.status_events import publish
from app.services.storage_service import delete_file, save_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf", ".docx", ".pptx", ".html", ".htm", ".xlsx", ".csv"}
ALLOWED_MIME_TYPES = {
    "text/plain", "text/markdown", "application/octet-stream",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/html",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
}


def _check_extension(filename: str) -> str:
    """Validate file extension and return it."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )
    return ext


_MIME_MAP = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".html": "text/html",
    ".htm": "text/html",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
}


def _mime_for_ext(ext: str) -> str:
    return _MIME_MAP.get(ext, "application/octet-stream")


def _parse_metadata(raw: str | None) -> dict | None:
    """Parse metadata JSON string, returning None for empty/invalid."""
    if not raw or raw == "{}":
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    folder_id: str | None = Form(default=None),
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No filename")

    ext = _check_extension(file.filename)

    content = await file.read()
    file_size = len(content)
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if file_size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Max: {settings.max_upload_size_mb}MB",
        )

    user_id = current_user["id"]

    # Validate folder exists and belongs to user
    if folder_id:
        cursor = await db.execute(
            "SELECT id FROM folders WHERE id = ? AND user_id = ?",
            (folder_id, user_id),
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    now = datetime.now(timezone.utc).isoformat()
    mime_type = _mime_for_ext(ext)
    content_hash = compute_content_hash(content)

    # Check for duplicates
    result = await check_duplicate(db, user_id, content_hash, file.filename)

    if result and result["action"] == "skip":
        row = result["document"]
        doc = DocumentResponse(
            id=row[0], user_id=row[1], filename=row[2], file_size=row[3],
            mime_type=row[4], status=row[5], chunk_count=row[6], error_message=row[7],
            created_at=row[8], updated_at=row[9], content_hash=row[10], duplicate=True,
        )
        return JSONResponse(status_code=200, content=doc.model_dump())

    if result and result["action"] == "retry":
        row = result["document"]
        doc_id = row[0]
        existing_filename = row[2]
        # Delete old file and re-save (in case it was corrupted or missing)
        delete_file(user_id, doc_id)
        await save_file(user_id, doc_id, existing_filename, content)
        # Reset status to pending for re-processing
        await db.execute(
            """UPDATE documents SET status = 'pending', chunk_count = 0,
                      error_message = NULL, updated_at = ?
               WHERE id = ?""",
            (now, doc_id),
        )
        await db.commit()
        from app.services.ingestion_service import ingest_document
        background_tasks.add_task(ingest_document, doc_id, user_id, existing_filename)
        doc = DocumentResponse(
            id=doc_id, user_id=user_id, filename=existing_filename, file_size=file_size,
            mime_type=mime_type, status="pending", chunk_count=0, error_message=None,
            content_hash=content_hash, created_at=row[8], updated_at=now,
        )
        return JSONResponse(status_code=200, content=doc.model_dump())

    if result and result["action"] == "conflict":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document is currently being processed",
        )

    if result and result["action"] == "update":
        row = result["document"]
        doc_id = row[0]
        # Delete old ChromaDB chunks
        collection = get_chroma_collection()
        try:
            collection.delete(where={"document_id": doc_id})
        except Exception:
            logger.warning("Failed to delete old chunks for document %s", doc_id)
        # Delete old file from disk
        delete_file(user_id, doc_id)
        # Save new file
        await save_file(user_id, doc_id, file.filename, content)
        # Update DB record
        await db.execute(
            """UPDATE documents SET content_hash = ?, file_size = ?, mime_type = ?,
                      status = 'pending', chunk_count = 0, error_message = NULL, updated_at = ?
               WHERE id = ?""",
            (content_hash, file_size, mime_type, now, doc_id),
        )
        await db.commit()
        # Queue background ingestion
        from app.services.ingestion_service import ingest_document
        background_tasks.add_task(ingest_document, doc_id, user_id, file.filename)
        doc = DocumentResponse(
            id=doc_id, user_id=user_id, filename=file.filename, file_size=file_size,
            mime_type=mime_type, status="pending", chunk_count=0, error_message=None,
            content_hash=content_hash, updated=True, created_at=row[8], updated_at=now,
        )
        return JSONResponse(status_code=200, content=doc.model_dump())

    # New document
    doc_id = str(uuid.uuid4())
    await save_file(user_id, doc_id, file.filename, content)
    await db.execute(
        """INSERT INTO documents (id, user_id, filename, file_size, mime_type, status, content_hash, created_at, updated_at, folder_id)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)""",
        (doc_id, user_id, file.filename, file_size, mime_type, content_hash, now, now, folder_id),
    )
    await db.commit()

    from app.services.ingestion_service import ingest_document
    background_tasks.add_task(ingest_document, doc_id, user_id, file.filename)

    return JSONResponse(
        status_code=201,
        content=DocumentResponse(
            id=doc_id, user_id=user_id, filename=file.filename, file_size=file_size,
            mime_type=mime_type, status="pending", chunk_count=0, error_message=None,
            content_hash=content_hash, created_at=now, updated_at=now, folder_id=folder_id,
        ).model_dump(),
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        """SELECT id, user_id, filename, file_size, mime_type, status, chunk_count,
                  error_message, created_at, updated_at, content_hash, metadata, folder_id
           FROM documents WHERE user_id = ? ORDER BY created_at DESC""",
        (current_user["id"],),
    )
    rows = await cursor.fetchall()
    return DocumentListResponse(
        documents=[
            DocumentResponse(
                id=r[0], user_id=r[1], filename=r[2], file_size=r[3], mime_type=r[4],
                status=r[5], chunk_count=r[6], error_message=r[7], created_at=r[8],
                updated_at=r[9], content_hash=r[10], metadata=_parse_metadata(r[11]),
                folder_id=r[12],
            )
            for r in rows
        ]
    )


@router.get("/status/stream")
async def document_status_stream(
    current_user: dict = Depends(get_current_user),
):
    """SSE endpoint for real-time document ingestion status updates."""
    from app.services.status_events import subscribe

    user_id = current_user["id"]

    async def event_generator():
        import json
        async for event in subscribe(user_id):
            yield {"data": json.dumps(event)}

    return EventSourceResponse(event_generator())


@router.get("/search/fts", response_model=FTSSearchResponse)
async def fts_search(
    q: str,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Full-text search over document content using FTS5."""
    user_id = current_user["id"]

    if not q.strip():
        return FTSSearchResponse(results=[], query=q, total=0)

    cursor = await db.execute(
        """SELECT dc.document_id, d.filename,
                  highlight(document_content_fts, 0, '<mark>', '</mark>') as snippet,
                  rank
           FROM document_content_fts
           JOIN document_content dc ON dc.rowid = document_content_fts.rowid
           JOIN documents d ON d.id = dc.document_id
           WHERE document_content_fts MATCH ?
             AND dc.user_id = ?
           ORDER BY rank
           LIMIT ?""",
        (q, user_id, limit),
    )
    rows = await cursor.fetchall()
    results = [
        FTSSearchResult(
            document_id=r[0],
            filename=r[1],
            snippet=r[2][:500] if r[2] else "",
            rank=float(r[3]),
        )
        for r in rows
    ]
    return FTSSearchResponse(results=results, query=q, total=len(results))


@router.post("/admin/backfill-content")
async def backfill_content(
    current_user: dict = Depends(get_current_user),
):
    """Backfill document_content for existing documents missing full markdown."""
    from app.services.backfill_service import backfill_document_content

    stats = await backfill_document_content()
    return stats


@router.get("/{document_id}/content", response_model=DocumentContentResponse)
async def get_document_content(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Return the full extracted markdown content for a document."""
    user_id = current_user["id"]

    # Verify document belongs to user
    cursor = await db.execute(
        "SELECT id FROM documents WHERE id = ? AND user_id = ?",
        (document_id, user_id),
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    cursor = await db.execute(
        "SELECT document_id, content, line_count, char_count FROM document_content WHERE document_id = ? AND user_id = ?",
        (document_id, user_id),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document content not found")

    return DocumentContentResponse(
        document_id=row[0],
        content=row[1],
        line_count=row[2],
        char_count=row[3],
    )


@router.get("/{document_id}/chunks")
async def get_document_chunks(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Return all chunks for a document from ChromaDB, sorted by chunk_index."""
    user_id = current_user["id"]

    # Verify document belongs to user
    cursor = await db.execute(
        "SELECT id FROM documents WHERE id = ? AND user_id = ?",
        (document_id, user_id),
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    collection = get_chroma_collection()
    results = collection.get(
        where={"$and": [{"user_id": user_id}, {"document_id": document_id}]},
        include=["documents", "metadatas"],
    )

    if not results["documents"]:
        return []

    chunks = []
    for doc, meta in zip(results["documents"], results["metadatas"]):
        chunks.append({
            "chunk_index": meta.get("chunk_index", 0),
            "content": doc,
        })

    chunks.sort(key=lambda c: c["chunk_index"])
    return chunks


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        """SELECT id, user_id, filename, file_size, mime_type, status, chunk_count,
                  error_message, created_at, updated_at, content_hash, metadata, folder_id
           FROM documents WHERE id = ? AND user_id = ?""",
        (document_id, current_user["id"]),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return DocumentResponse(
        id=row[0], user_id=row[1], filename=row[2], file_size=row[3], mime_type=row[4],
        status=row[5], chunk_count=row[6], error_message=row[7], created_at=row[8],
        updated_at=row[9], content_hash=row[10], metadata=_parse_metadata(row[11]),
        folder_id=row[12],
    )


@router.patch("/{document_id}/move")
async def move_document(
    document_id: str,
    req: MoveDocumentRequest,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Move a document to a different folder (or to unfiled if folder_id is null)."""
    user_id = current_user["id"]

    # Verify document exists and belongs to user
    cursor = await db.execute(
        "SELECT id FROM documents WHERE id = ? AND user_id = ?",
        (document_id, user_id),
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Validate target folder if provided
    if req.folder_id:
        cursor = await db.execute(
            "SELECT id FROM folders WHERE id = ? AND user_id = ?",
            (req.folder_id, user_id),
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    # Update document's folder_id
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE documents SET folder_id = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        (req.folder_id, now, document_id, user_id),
    )
    await db.commit()

    # Return updated document
    cursor = await db.execute(
        """SELECT id, user_id, filename, file_size, mime_type, status, chunk_count,
                  error_message, created_at, updated_at, content_hash, metadata, folder_id
           FROM documents WHERE id = ?""",
        (document_id,),
    )
    row = await cursor.fetchone()
    return DocumentResponse(
        id=row[0], user_id=row[1], filename=row[2], file_size=row[3], mime_type=row[4],
        status=row[5], chunk_count=row[6], error_message=row[7], created_at=row[8],
        updated_at=row[9], content_hash=row[10], metadata=_parse_metadata(row[11]),
        folder_id=row[12],
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    user_id = current_user["id"]
    cursor = await db.execute(
        "SELECT id, filename FROM documents WHERE id = ? AND user_id = ?",
        (document_id, user_id),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Delete from ChromaDB
    collection = get_chroma_collection()
    try:
        collection.delete(where={"document_id": document_id})
    except Exception:
        logger.warning("Failed to delete chunks from ChromaDB for document %s", document_id)

    # Invalidate BM25 keyword search cache for this user
    from app.services.keyword_search_service import invalidate_cache
    invalidate_cache(user_id)

    # Delete file from disk
    delete_file(user_id, document_id)

    # Delete from SQLite
    await db.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    await db.commit()
