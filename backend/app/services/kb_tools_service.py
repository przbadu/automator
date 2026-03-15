"""KB exploration tools service layer.

Five tools for exploring the knowledge base: ls, tree, grep, glob, read.
All functions operate on SQLite data (folders + document_content tables),
never on the filesystem. Every query is user-scoped via WHERE user_id = ?.
"""

import fnmatch
import re

import aiosqlite
from langfuse import observe

from app.models.kb_tools import (
    FileEntry,
    FolderEntry,
    GlobMatch,
    GlobResult,
    GrepDocMatch,
    GrepLineMatch,
    GrepResult,
    LsResult,
    ReadResult,
    TreeNode,
    TreeResult,
)


# --- Path helpers (internal) ---


def _validate_path(path: str) -> str | None:
    """Return normalized path or None if invalid.

    Paths must start with '/' and not contain '..'.
    """
    if ".." in path:
        return None
    if not path.startswith("/"):
        return None
    return path.rstrip("/") or "/"


async def resolve_folder_id(
    db: aiosqlite.Connection, user_id: str, path: str
) -> str | None:
    """Resolve a virtual path like '/reports/2024' to a folder ID.

    Returns None for root ('/') or if folder not found.
    """
    if path in ("", "/"):
        return None

    normalized = "/" + path.strip("/")
    cursor = await db.execute(
        "SELECT id FROM folders WHERE user_id = ? AND path = ?",
        (user_id, normalized),
    )
    row = await cursor.fetchone()
    return row[0] if row else None


async def resolve_document(
    db: aiosqlite.Connection, user_id: str, path: str
) -> tuple[str, str] | None:
    """Resolve '/reports/summary.pdf' to (document_id, filename).

    Last segment is filename, rest is folder path.
    For root-level docs, path is just the filename.
    """
    stripped = path.strip("/")
    if not stripped:
        return None

    parts = stripped.rsplit("/", 1)
    if len(parts) == 1:
        # Root-level document
        filename = parts[0]
        cursor = await db.execute(
            "SELECT id FROM documents WHERE user_id = ? AND filename = ? AND folder_id IS NULL",
            (user_id, filename),
        )
    else:
        folder_path, filename = parts
        folder_id = await resolve_folder_id(db, user_id, f"/{folder_path}")
        if folder_id is None:
            return None
        cursor = await db.execute(
            "SELECT id FROM documents WHERE user_id = ? AND filename = ? AND folder_id = ?",
            (user_id, filename, folder_id),
        )

    row = await cursor.fetchone()
    return (row[0], filename) if row else None


# --- Tool functions ---


@observe(name="kb_tool_ls")
async def kb_ls(
    db: aiosqlite.Connection,
    user_id: str,
    path: str = "/",
) -> LsResult:
    """List files and subfolders at the given path."""
    folder_id = await resolve_folder_id(db, user_id, path) if path != "/" else None

    if path != "/" and folder_id is None:
        return LsResult(path=path, folders=[], files=[], error="Folder not found")

    # Get subfolders
    if folder_id is None:
        cursor = await db.execute(
            "SELECT id, name, path FROM folders WHERE user_id = ? AND parent_id IS NULL ORDER BY name",
            (user_id,),
        )
    else:
        cursor = await db.execute(
            "SELECT id, name, path FROM folders WHERE user_id = ? AND parent_id = ? ORDER BY name",
            (user_id, folder_id),
        )
    folder_rows = await cursor.fetchall()

    # Get files in this folder
    if folder_id is None:
        cursor = await db.execute(
            "SELECT id, filename, file_size, mime_type, status FROM documents "
            "WHERE user_id = ? AND folder_id IS NULL ORDER BY filename",
            (user_id,),
        )
    else:
        cursor = await db.execute(
            "SELECT id, filename, file_size, mime_type, status FROM documents "
            "WHERE user_id = ? AND folder_id = ? ORDER BY filename",
            (user_id, folder_id),
        )
    file_rows = await cursor.fetchall()

    return LsResult(
        path=path,
        folders=[FolderEntry(id=r[0], name=r[1], path=r[2]) for r in folder_rows],
        files=[
            FileEntry(id=r[0], name=r[1], size=r[2], mime_type=r[3], status=r[4])
            for r in file_rows
        ],
    )


@observe(name="kb_tool_tree")
async def kb_tree(
    db: aiosqlite.Connection,
    user_id: str,
    path: str = "/",
    depth: int = 3,
    limit: int = 50,
) -> TreeResult:
    """Return hierarchical tree structure with depth limiting and truncation."""
    root_folder_id = (
        await resolve_folder_id(db, user_id, path) if path != "/" else None
    )

    if path != "/" and root_folder_id is None:
        return TreeResult(
            root=path,
            nodes=[],
            total_folders=0,
            total_files=0,
            error="Folder not found",
        )

    # Get folders using recursive CTE
    if root_folder_id is None:
        folder_query = """
        WITH RECURSIVE folder_tree AS (
            SELECT id, name, parent_id, path, 1 as depth
            FROM folders
            WHERE user_id = ? AND parent_id IS NULL

            UNION ALL

            SELECT f.id, f.name, f.parent_id, f.path, ft.depth + 1
            FROM folders f
            JOIN folder_tree ft ON f.parent_id = ft.id
            WHERE f.user_id = ? AND ft.depth < ?
        )
        SELECT id, name, parent_id, path, depth FROM folder_tree
        ORDER BY path
        """
        cursor = await db.execute(folder_query, (user_id, user_id, depth))
    else:
        folder_query = """
        WITH RECURSIVE folder_tree AS (
            SELECT id, name, parent_id, path, 1 as depth
            FROM folders
            WHERE user_id = ? AND parent_id = ?

            UNION ALL

            SELECT f.id, f.name, f.parent_id, f.path, ft.depth + 1
            FROM folders f
            JOIN folder_tree ft ON f.parent_id = ft.id
            WHERE f.user_id = ? AND ft.depth < ?
        )
        SELECT id, name, parent_id, path, depth FROM folder_tree
        ORDER BY path
        """
        cursor = await db.execute(
            folder_query, (user_id, root_folder_id, user_id, depth)
        )

    folder_rows = await cursor.fetchall()

    # Get all documents for the user (within scope)
    if root_folder_id is None:
        doc_cursor = await db.execute(
            "SELECT id, filename, folder_id FROM documents WHERE user_id = ? ORDER BY filename",
            (user_id,),
        )
    else:
        # Documents in this folder subtree
        folder_ids = [r[0] for r in folder_rows]
        folder_ids.append(root_folder_id)
        placeholders = ",".join("?" for _ in folder_ids)
        doc_cursor = await db.execute(
            f"SELECT id, filename, folder_id FROM documents WHERE user_id = ? AND folder_id IN ({placeholders}) ORDER BY filename",
            (user_id, *folder_ids),
        )

    doc_rows = await doc_cursor.fetchall()

    # Build folder lookup: parent_id -> [children]
    folder_map: dict[str | None, list] = {}
    for r in folder_rows:
        fid, fname, parent_id, fpath, fdepth = r[0], r[1], r[2], r[3], r[4]
        parent_key = parent_id if parent_id != root_folder_id else None
        if root_folder_id is None:
            parent_key = parent_id
        folder_map.setdefault(parent_key, []).append(
            {"id": fid, "name": fname, "path": fpath, "depth": fdepth}
        )

    # Build doc lookup: folder_id -> [docs]
    doc_map: dict[str | None, list] = {}
    for r in doc_rows:
        doc_map.setdefault(r[2], []).append({"id": r[0], "filename": r[1]})

    # Count entries for truncation
    total_folders = len(folder_rows)
    total_files = len(doc_rows)
    entry_count = 0
    truncated = False

    def build_children(
        parent_id: str | None, current_depth: int
    ) -> list[TreeNode]:
        nonlocal entry_count, truncated
        children = []

        # Add subfolders
        for folder in folder_map.get(parent_id, []):
            if entry_count >= limit:
                truncated = True
                return children
            entry_count += 1
            sub_children = None
            if current_depth < depth:
                sub_children = build_children(folder["id"], current_depth + 1)
                # Also add files within this folder
                for doc in doc_map.get(folder["id"], []):
                    if entry_count >= limit:
                        truncated = True
                        break
                    entry_count += 1
                    if sub_children is None:
                        sub_children = []
                    sub_children.append(
                        TreeNode(
                            name=doc["filename"],
                            type="file",
                            path=folder["path"] + "/" + doc["filename"],
                        )
                    )
            children.append(
                TreeNode(
                    name=folder["name"],
                    type="folder",
                    path=folder["path"],
                    children=sub_children,
                )
            )

        # Add root-level files (only for the top level of the tree)
        if parent_id is None and root_folder_id is None:
            for doc in doc_map.get(None, []):
                if entry_count >= limit:
                    truncated = True
                    break
                entry_count += 1
                children.append(
                    TreeNode(
                        name=doc["filename"],
                        type="file",
                        path="/" + doc["filename"],
                    )
                )

        return children

    # For root, start with None parent. For subfolder, start with root_folder_id's children.
    if root_folder_id is None:
        nodes = build_children(None, 1)
    else:
        nodes = build_children(root_folder_id, 1)
        # Also add files directly in the root folder
        for doc in doc_map.get(root_folder_id, []):
            if entry_count >= limit:
                truncated = True
                break
            entry_count += 1
            nodes.append(
                TreeNode(
                    name=doc["filename"],
                    type="file",
                    path=path.rstrip("/") + "/" + doc["filename"],
                )
            )

    return TreeResult(
        root=path,
        nodes=nodes,
        total_folders=total_folders,
        total_files=total_files,
        truncated=truncated,
    )


@observe(name="kb_tool_grep")
async def kb_grep(
    db: aiosqlite.Connection,
    user_id: str,
    pattern: str,
    path: str | None = None,
    case_insensitive: bool = False,
    max_matches: int = 50,
) -> GrepResult:
    """Regex search across extracted markdown content."""
    flags = re.IGNORECASE if case_insensitive else 0
    try:
        compiled = re.compile(pattern, flags)
    except re.error as e:
        return GrepResult(
            pattern=pattern, matches=[], total=0, error=f"Invalid regex: {e}"
        )

    # Build query with optional path scoping
    query = """
        SELECT dc.document_id, d.filename, d.folder_id, dc.content
        FROM document_content dc
        JOIN documents d ON d.id = dc.document_id
        WHERE dc.user_id = ?
    """
    params: list = [user_id]

    if path:
        folder_id = await resolve_folder_id(db, user_id, path)
        if folder_id:
            # Include documents in this folder and all subfolders
            query += " AND (d.folder_id = ? OR d.folder_id IN (SELECT id FROM folders WHERE user_id = ? AND path LIKE ?))"
            params.extend([folder_id, user_id, f"{path}/%"])
        else:
            # Path specified but folder not found - return empty
            return GrepResult(pattern=pattern, matches=[], total=0)

    cursor = await db.execute(query, params)

    matches = []
    for row in await cursor.fetchall():
        doc_id, filename, folder_id_val, content = row[0], row[1], row[2], row[3]
        lines = content.split("\n")
        doc_matches = []
        for line_num, line in enumerate(lines, 1):
            if compiled.search(line):
                doc_matches.append(
                    GrepLineMatch(line_number=line_num, text=line.strip()[:200])
                )
                if len(doc_matches) >= 5:  # Max previews per doc
                    break
        if doc_matches:
            matches.append(
                GrepDocMatch(
                    document_id=doc_id,
                    filename=filename,
                    line_matches=doc_matches,
                )
            )
            if len(matches) >= max_matches:
                break

    return GrepResult(
        pattern=pattern,
        matches=matches,
        total=len(matches),
        truncated=len(matches) >= max_matches,
    )


@observe(name="kb_tool_glob")
async def kb_glob(
    db: aiosqlite.Connection,
    user_id: str,
    pattern: str,
) -> GlobResult:
    """Match documents by filename pattern including unfiled documents."""
    # Get all documents with their folder paths
    cursor = await db.execute(
        """
        SELECT d.id, d.filename, f.path as folder_path
        FROM documents d
        LEFT JOIN folders f ON d.folder_id = f.id
        WHERE d.user_id = ?
        ORDER BY d.filename
        """,
        (user_id,),
    )
    rows = await cursor.fetchall()

    matches = []
    for row in rows:
        doc_id, filename, folder_path = row[0], row[1], row[2]

        # Build virtual path
        if folder_path:
            virtual_path = f"{folder_path}/{filename}"
        else:
            virtual_path = filename

        # Strip leading slash for matching
        virtual_no_slash = virtual_path.lstrip("/")

        # Try matching against full path and just filename
        if fnmatch.fnmatch(virtual_no_slash, pattern) or fnmatch.fnmatch(
            filename, pattern
        ):
            matches.append(
                GlobMatch(
                    document_id=doc_id,
                    filename=filename,
                    path=virtual_path if virtual_path.startswith("/") else f"/{virtual_path}" if folder_path else virtual_path,
                )
            )

    return GlobResult(
        pattern=pattern,
        matches=matches,
        total=len(matches),
    )


@observe(name="kb_tool_read")
async def kb_read(
    db: aiosqlite.Connection,
    user_id: str,
    path: str,
    offset: int | None = None,
    limit: int | None = None,
) -> ReadResult:
    """Read document content, optionally with line range."""
    resolved = await resolve_document(db, user_id, path)
    if resolved is None:
        return ReadResult(
            path=path,
            content="",
            line_count=0,
            char_count=0,
            error="Document not found",
        )

    doc_id, filename = resolved

    cursor = await db.execute(
        "SELECT content, line_count, char_count FROM document_content WHERE document_id = ? AND user_id = ?",
        (doc_id, user_id),
    )
    row = await cursor.fetchone()
    if row is None:
        return ReadResult(
            path=path,
            content="",
            line_count=0,
            char_count=0,
            error="Document content not found",
        )

    content, stored_line_count, stored_char_count = row[0], row[1], row[2]

    if offset is not None or limit is not None:
        lines = content.split("\n")
        total_lines = len(lines)
        start = offset or 0
        end = min(start + limit, total_lines) if limit else total_lines
        selected = lines[start:end]

        # Format with line numbers (1-indexed)
        width = len(str(end))
        numbered = [
            f"{i + start + 1:>{width}}  {line}" for i, line in enumerate(selected)
        ]
        output = "\n".join(numbered)

        return ReadResult(
            path=path,
            content=output,
            line_count=len(selected),
            char_count=len(output),
            offset=start,
            limit=limit,
            total_lines=total_lines,
        )

    return ReadResult(
        path=path,
        content=content,
        line_count=stored_line_count,
        char_count=stored_char_count,
    )
