"""Pydantic request/response models for KB exploration tools."""

from pydantic import BaseModel


class FolderEntry(BaseModel):
    id: str
    name: str
    path: str


class FileEntry(BaseModel):
    id: str
    name: str
    size: int
    mime_type: str
    status: str


class LsResult(BaseModel):
    path: str
    folders: list[FolderEntry]
    files: list[FileEntry]
    error: str | None = None


class TreeNode(BaseModel):
    name: str
    type: str  # "folder" or "file"
    path: str
    children: list["TreeNode"] | None = None


class TreeResult(BaseModel):
    root: str
    nodes: list[TreeNode]
    total_folders: int
    total_files: int
    truncated: bool = False
    error: str | None = None


class GrepLineMatch(BaseModel):
    line_number: int
    text: str


class GrepDocMatch(BaseModel):
    document_id: str
    filename: str
    line_matches: list[GrepLineMatch]


class GrepResult(BaseModel):
    pattern: str
    matches: list[GrepDocMatch]
    total: int
    truncated: bool = False
    error: str | None = None


class GlobMatch(BaseModel):
    document_id: str
    filename: str
    path: str


class GlobResult(BaseModel):
    pattern: str
    matches: list[GlobMatch]
    total: int
    error: str | None = None


class ReadResult(BaseModel):
    path: str
    content: str
    line_count: int
    char_count: int
    offset: int | None = None
    limit: int | None = None
    total_lines: int | None = None
    error: str | None = None
