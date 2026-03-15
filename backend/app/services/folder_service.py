import logging
import re
import uuid

import aiosqlite
from fastapi import HTTPException

from langfuse import observe

from app.services.storage_service import delete_file

logger = logging.getLogger(__name__)

INVALID_FOLDER_NAME = re.compile(r'[/\\<>:"|?*\x00-\x1f]')

FOLDER_COLUMNS = ["id", "user_id", "name", "parent_id", "path", "created_at", "updated_at"]


def _row_to_dict(row: aiosqlite.Row) -> dict:
    """Convert an aiosqlite.Row to a dict using FOLDER_COLUMNS."""
    return dict(row)


def validate_folder_name(name: str) -> str:
    """Strip whitespace, reject empty, reject invalid characters."""
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty")
    if INVALID_FOLDER_NAME.search(name):
        raise HTTPException(status_code=400, detail="Folder name contains invalid characters")
    if name in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid folder name")
    return name


async def compute_folder_path(
    db: aiosqlite.Connection, parent_id: str | None, folder_name: str, user_id: str
) -> str:
    """Compute the materialized path for a folder."""
    if parent_id is None:
        return f"/{folder_name}"
    cursor = await db.execute(
        "SELECT path FROM folders WHERE id = ? AND user_id = ?",
        (parent_id, user_id),
    )
    row = await cursor.fetchone()
    if not row:
        raise ValueError("Parent folder not found")
    return f"{row['path']}/{folder_name}"


async def check_name_conflict(
    db: aiosqlite.Connection,
    user_id: str,
    parent_id: str | None,
    name: str,
    exclude_id: str | None = None,
) -> None:
    """Check for duplicate folder names in the same parent. Raises 409 if conflict."""
    if parent_id is None:
        query = "SELECT id FROM folders WHERE user_id = ? AND parent_id IS NULL AND name = ?"
        params: list = [user_id, name]
    else:
        query = "SELECT id FROM folders WHERE user_id = ? AND parent_id = ? AND name = ?"
        params = [user_id, parent_id, name]

    if exclude_id:
        query += " AND id != ?"
        params.append(exclude_id)

    cursor = await db.execute(query, params)
    if await cursor.fetchone():
        raise HTTPException(
            status_code=409,
            detail="A folder with this name already exists in the target location",
        )


@observe(name="create_folder")
async def create_folder(
    db: aiosqlite.Connection, user_id: str, name: str, parent_id: str | None = None
) -> dict:
    """Create a new folder."""
    name = validate_folder_name(name)
    await check_name_conflict(db, user_id, parent_id, name)

    # Validate parent exists and belongs to user
    if parent_id is not None:
        cursor = await db.execute(
            "SELECT id FROM folders WHERE id = ? AND user_id = ?",
            (parent_id, user_id),
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Parent folder not found")

    path = await compute_folder_path(db, parent_id, name, user_id)
    folder_id = str(uuid.uuid4())
    now_sql = "datetime('now')"

    await db.execute(
        f"""INSERT INTO folders (id, user_id, name, parent_id, path, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, {now_sql}, {now_sql})""",
        (folder_id, user_id, name, parent_id, path),
    )
    await db.commit()

    return await get_folder(db, user_id, folder_id)


@observe(name="rename_folder")
async def rename_folder(
    db: aiosqlite.Connection, user_id: str, folder_id: str, new_name: str
) -> dict:
    """Rename a folder and update descendant paths."""
    new_name = validate_folder_name(new_name)

    folder = await get_folder(db, user_id, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    await check_name_conflict(db, user_id, folder["parent_id"], new_name, exclude_id=folder_id)

    old_path = folder["path"]
    new_path = await compute_folder_path(db, folder["parent_id"], new_name, user_id)

    # Update folder name and path
    await db.execute(
        "UPDATE folders SET name = ?, path = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
        (new_name, new_path, folder_id, user_id),
    )

    # Update all descendant paths
    await db.execute(
        """UPDATE folders SET path = ? || substr(path, ? + 1), updated_at = datetime('now')
           WHERE user_id = ? AND path LIKE ? || '/%'""",
        (new_path, len(old_path), user_id, old_path),
    )

    await db.commit()
    return await get_folder(db, user_id, folder_id)


async def would_create_cycle(
    db: aiosqlite.Connection, folder_id: str, target_parent_id: str | None, user_id: str
) -> bool:
    """Check if moving folder_id under target_parent_id would create a cycle."""
    if target_parent_id is None:
        return False
    if target_parent_id == folder_id:
        return True

    cursor = await db.execute(
        """WITH RECURSIVE ancestors(id, parent_id) AS (
               SELECT id, parent_id FROM folders WHERE id = ? AND user_id = ?
               UNION ALL
               SELECT f.id, f.parent_id FROM folders f
               JOIN ancestors a ON f.id = a.parent_id
           )
           SELECT 1 FROM ancestors WHERE id = ?""",
        (target_parent_id, user_id, folder_id),
    )
    return await cursor.fetchone() is not None


@observe(name="move_folder")
async def move_folder(
    db: aiosqlite.Connection, user_id: str, folder_id: str, new_parent_id: str | None
) -> dict:
    """Move a folder to a different parent."""
    folder = await get_folder(db, user_id, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Check cycle
    if await would_create_cycle(db, folder_id, new_parent_id, user_id):
        raise HTTPException(status_code=400, detail="Cannot move a folder into its own subtree")

    # Validate new parent exists and belongs to user
    if new_parent_id is not None:
        cursor = await db.execute(
            "SELECT id FROM folders WHERE id = ? AND user_id = ?",
            (new_parent_id, user_id),
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Target parent folder not found")

    await check_name_conflict(db, user_id, new_parent_id, folder["name"], exclude_id=folder_id)

    old_path = folder["path"]
    new_path = await compute_folder_path(db, new_parent_id, folder["name"], user_id)

    # Update folder parent and path
    await db.execute(
        "UPDATE folders SET parent_id = ?, path = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
        (new_parent_id, new_path, folder_id, user_id),
    )

    # Update all descendant paths
    await db.execute(
        """UPDATE folders SET path = ? || substr(path, ? + 1), updated_at = datetime('now')
           WHERE user_id = ? AND path LIKE ? || '/%'""",
        (new_path, len(old_path), user_id, old_path),
    )

    await db.commit()
    return await get_folder(db, user_id, folder_id)


@observe(name="delete_folder")
async def delete_folder(
    db: aiosqlite.Connection, user_id: str, folder_id: str, chroma_collection
) -> None:
    """Delete a folder and cascade to subfolders, documents, ChromaDB chunks, and disk files."""
    folder = await get_folder(db, user_id, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Find all documents in this folder and subfolders
    cursor = await db.execute(
        """WITH RECURSIVE subtree(id) AS (
               SELECT id FROM folders WHERE id = ? AND user_id = ?
               UNION ALL
               SELECT f.id FROM folders f
               JOIN subtree s ON f.parent_id = s.id
           )
           SELECT d.id, d.user_id FROM documents d
           WHERE d.folder_id IN (SELECT id FROM subtree)""",
        (folder_id, user_id),
    )
    doc_rows = await cursor.fetchall()

    # Delete ChromaDB chunks and disk files for each document
    for doc_row in doc_rows:
        doc_id = doc_row["id"]
        doc_user_id = doc_row["user_id"]
        try:
            chroma_collection.delete(where={"document_id": doc_id})
        except Exception:
            logger.warning("Failed to delete ChromaDB chunks for document %s", doc_id)
        try:
            delete_file(doc_user_id, doc_id)
        except Exception:
            logger.warning("Failed to delete disk files for document %s", doc_id)

    # Delete documents from SQLite
    for doc_row in doc_rows:
        await db.execute("DELETE FROM documents WHERE id = ?", (doc_row["id"],))

    # Delete the folder (CASCADE handles subfolders)
    await db.execute("DELETE FROM folders WHERE id = ? AND user_id = ?", (folder_id, user_id))
    await db.commit()


async def list_folders(db: aiosqlite.Connection, user_id: str) -> list[dict]:
    """List all folders for a user, ordered by path."""
    cursor = await db.execute(
        "SELECT id, user_id, name, parent_id, path, created_at, updated_at FROM folders WHERE user_id = ? ORDER BY path",
        (user_id,),
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def get_folder(db: aiosqlite.Connection, user_id: str, folder_id: str) -> dict | None:
    """Get a single folder by ID."""
    cursor = await db.execute(
        "SELECT id, user_id, name, parent_id, path, created_at, updated_at FROM folders WHERE id = ? AND user_id = ?",
        (folder_id, user_id),
    )
    row = await cursor.fetchone()
    if not row:
        return None
    return dict(row)


@observe(name="get_folder_tree")
async def get_folder_tree(
    db: aiosqlite.Connection, user_id: str, root_id: str | None = None
) -> list[dict]:
    """Build a folder tree with document counts."""
    if root_id:
        # Get root folder path for filtering
        root = await get_folder(db, user_id, root_id)
        if not root:
            raise HTTPException(status_code=404, detail="Root folder not found")
        cursor = await db.execute(
            """SELECT f.id, f.name, f.path, f.parent_id,
                      (SELECT COUNT(*) FROM documents d WHERE d.folder_id = f.id AND d.user_id = ?) as document_count
               FROM folders f
               WHERE f.user_id = ? AND (f.id = ? OR f.path LIKE ? || '/%')
               ORDER BY f.path""",
            (user_id, user_id, root_id, root["path"]),
        )
    else:
        cursor = await db.execute(
            """SELECT f.id, f.name, f.path, f.parent_id,
                      (SELECT COUNT(*) FROM documents d WHERE d.folder_id = f.id AND d.user_id = ?) as document_count
               FROM folders f
               WHERE f.user_id = ?
               ORDER BY f.path""",
            (user_id, user_id),
        )

    rows = await cursor.fetchall()
    folders = [
        {
            "id": row["id"],
            "name": row["name"],
            "path": row["path"],
            "parent_id": row["parent_id"],
            "document_count": row["document_count"],
            "children": [],
        }
        for row in rows
    ]

    # Build tree using parent_id grouping
    by_id = {f["id"]: f for f in folders}
    roots = []
    for f in folders:
        if f["parent_id"] and f["parent_id"] in by_id:
            by_id[f["parent_id"]]["children"].append(f)
        else:
            roots.append(f)

    return roots


async def get_folder_documents(
    db: aiosqlite.Connection, user_id: str, folder_id: str
) -> list[dict]:
    """Get all documents in a specific folder."""
    folder = await get_folder(db, user_id, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    cursor = await db.execute(
        """SELECT id, user_id, filename, file_size, mime_type, status, chunk_count,
                  error_message, created_at, updated_at, content_hash, metadata, folder_id
           FROM documents WHERE folder_id = ? AND user_id = ?
           ORDER BY created_at DESC""",
        (folder_id, user_id),
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]
