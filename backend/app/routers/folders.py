import logging

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database import get_chroma_collection, get_db
from app.middleware.auth import get_current_user
from app.models.documents import DocumentListResponse, DocumentResponse
from app.models.folders import (
    CreateFolderRequest,
    FolderListResponse,
    FolderResponse,
    FolderTreeNode,
    FolderTreeResponse,
    MoveFolderRequest,
    RenameFolderRequest,
)
from app.services.folder_service import (
    create_folder,
    delete_folder,
    get_folder,
    get_folder_documents,
    get_folder_tree,
    list_folders,
    move_folder,
    rename_folder,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/folders", tags=["folders"])


def _parse_metadata(raw: str | None) -> dict | None:
    """Parse metadata JSON string, returning None for empty/invalid."""
    if not raw or raw == "{}":
        return None
    try:
        import json
        return json.loads(raw)
    except Exception:
        return None


@router.post("", status_code=status.HTTP_201_CREATED, response_model=FolderResponse)
async def create_folder_endpoint(
    req: CreateFolderRequest,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    folder = await create_folder(db, current_user["id"], req.name, req.parent_id)
    return FolderResponse(**folder)


@router.get("", response_model=FolderListResponse)
async def list_folders_endpoint(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    folders = await list_folders(db, current_user["id"])
    return FolderListResponse(folders=[FolderResponse(**f) for f in folders])


@router.get("/tree", response_model=FolderTreeResponse)
async def get_folder_tree_endpoint(
    root_id: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    tree = await get_folder_tree(db, current_user["id"], root_id)
    return FolderTreeResponse(tree=[_build_tree_node(n) for n in tree])


def _build_tree_node(node: dict) -> FolderTreeNode:
    """Recursively build FolderTreeNode from dict."""
    return FolderTreeNode(
        id=node["id"],
        name=node["name"],
        path=node["path"],
        document_count=node.get("document_count", 0),
        children=[_build_tree_node(c) for c in node.get("children", [])],
    )


@router.get("/{folder_id}", response_model=FolderResponse)
async def get_folder_endpoint(
    folder_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    folder = await get_folder(db, current_user["id"], folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return FolderResponse(**folder)


@router.patch("/{folder_id}", response_model=FolderResponse)
async def rename_folder_endpoint(
    folder_id: str,
    req: RenameFolderRequest,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    folder = await rename_folder(db, current_user["id"], folder_id, req.name)
    return FolderResponse(**folder)


@router.patch("/{folder_id}/move", response_model=FolderResponse)
async def move_folder_endpoint(
    folder_id: str,
    req: MoveFolderRequest,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    folder = await move_folder(db, current_user["id"], folder_id, req.parent_id)
    return FolderResponse(**folder)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder_endpoint(
    folder_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    collection = get_chroma_collection()
    await delete_folder(db, current_user["id"], folder_id, collection)


@router.get("/{folder_id}/documents", response_model=DocumentListResponse)
async def get_folder_documents_endpoint(
    folder_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    docs = await get_folder_documents(db, current_user["id"], folder_id)
    return DocumentListResponse(
        documents=[
            DocumentResponse(
                id=d["id"],
                user_id=d["user_id"],
                filename=d["filename"],
                file_size=d["file_size"],
                mime_type=d["mime_type"],
                status=d["status"],
                chunk_count=d["chunk_count"],
                error_message=d["error_message"],
                created_at=d["created_at"],
                updated_at=d["updated_at"],
                content_hash=d.get("content_hash"),
                metadata=_parse_metadata(d.get("metadata")),
                folder_id=d.get("folder_id"),
            )
            for d in docs
        ]
    )
