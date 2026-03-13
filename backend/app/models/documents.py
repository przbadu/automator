from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: str
    user_id: str
    filename: str
    file_size: int
    mime_type: str
    status: str
    chunk_count: int
    error_message: str | None
    content_hash: str | None = None
    metadata: dict | None = None
    duplicate: bool = False
    updated: bool = False
    created_at: str
    updated_at: str


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
