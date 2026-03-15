from __future__ import annotations

from pydantic import BaseModel, Field


class CreateFolderRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: str | None = None


class RenameFolderRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class MoveFolderRequest(BaseModel):
    parent_id: str | None = None  # None = move to root


class FolderResponse(BaseModel):
    id: str
    user_id: str
    name: str
    parent_id: str | None
    path: str
    created_at: str
    updated_at: str


class FolderListResponse(BaseModel):
    folders: list[FolderResponse]


class FolderTreeNode(BaseModel):
    id: str
    name: str
    path: str
    children: list[FolderTreeNode] = []
    document_count: int = 0


class FolderTreeResponse(BaseModel):
    tree: list[FolderTreeNode]


class MoveDocumentRequest(BaseModel):
    folder_id: str | None = None  # None = move to unfiled
