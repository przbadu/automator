import hashlib

import aiosqlite


def compute_content_hash(content: bytes) -> str:
    """Compute SHA-256 hex digest of file content."""
    return hashlib.sha256(content).hexdigest()


async def check_duplicate(
    db: aiosqlite.Connection, user_id: str, content_hash: str, filename: str
) -> dict | None:
    """Check for duplicate content or filename and return action recommendation.

    Returns:
        None — new document, proceed normally
        {"action": "skip", "document": row} — identical content exists
        {"action": "update", "document": row} — same filename, different content
        {"action": "conflict", "document": row} — file is currently being processed
    """
    # Check for same content hash (any filename)
    cursor = await db.execute(
        """SELECT id, user_id, filename, file_size, mime_type, status, chunk_count,
                  error_message, created_at, updated_at, content_hash
           FROM documents WHERE user_id = ? AND content_hash = ? LIMIT 1""",
        (user_id, content_hash),
    )
    row = await cursor.fetchone()
    if row:
        return {"action": "skip", "document": row}

    # Check for same filename (different content)
    cursor = await db.execute(
        """SELECT id, user_id, filename, file_size, mime_type, status, chunk_count,
                  error_message, created_at, updated_at, content_hash
           FROM documents WHERE user_id = ? AND filename = ? LIMIT 1""",
        (user_id, filename),
    )
    row = await cursor.fetchone()
    if row:
        if row[5] in ("processing", "chunking", "embedding"):
            return {"action": "conflict", "document": row}
        return {"action": "update", "document": row}

    return None
