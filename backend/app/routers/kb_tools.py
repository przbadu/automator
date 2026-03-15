"""KB exploration tools REST endpoints.

Exposes ls, tree, grep, glob, read as POST endpoints under /kb/tools/.
All endpoints require JWT Bearer auth and scope queries to the current user.
"""

import aiosqlite
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.kb_tools import (
    GlobResult,
    GrepResult,
    LsResult,
    ReadResult,
    TreeResult,
)
from app.services.kb_tools_service import kb_glob, kb_grep, kb_ls, kb_read, kb_tree

router = APIRouter(prefix="/kb/tools", tags=["kb-tools"])


# --- Request models ---


class LsRequest(BaseModel):
    path: str = "/"


class TreeRequest(BaseModel):
    path: str = "/"
    depth: int = 3
    limit: int = 50


class GrepRequest(BaseModel):
    pattern: str
    path: str | None = None
    case_insensitive: bool = False
    max_matches: int = 50


class GlobRequest(BaseModel):
    pattern: str


class ReadRequest(BaseModel):
    path: str
    offset: int | None = None
    limit: int | None = None


# --- Endpoints ---


@router.post("/ls", response_model=LsResult)
async def tool_ls(
    body: LsRequest,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> LsResult:
    """List files and subfolders at the given path."""
    return await kb_ls(db, current_user["id"], path=body.path)


@router.post("/tree", response_model=TreeResult)
async def tool_tree(
    body: TreeRequest,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> TreeResult:
    """Return hierarchical tree structure."""
    return await kb_tree(
        db, current_user["id"], path=body.path, depth=body.depth, limit=body.limit
    )


@router.post("/grep", response_model=GrepResult)
async def tool_grep(
    body: GrepRequest,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> GrepResult:
    """Regex search across document content."""
    return await kb_grep(
        db,
        current_user["id"],
        pattern=body.pattern,
        path=body.path,
        case_insensitive=body.case_insensitive,
        max_matches=body.max_matches,
    )


@router.post("/glob", response_model=GlobResult)
async def tool_glob(
    body: GlobRequest,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> GlobResult:
    """Match documents by filename pattern."""
    return await kb_glob(db, current_user["id"], pattern=body.pattern)


@router.post("/read", response_model=ReadResult)
async def tool_read(
    body: ReadRequest,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> ReadResult:
    """Read document content."""
    return await kb_read(
        db, current_user["id"], path=body.path, offset=body.offset, limit=body.limit
    )
