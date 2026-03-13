from pydantic import BaseModel


class ThreadCreate(BaseModel):
    title: str = "New Chat"


class ThreadResponse(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: str
    updated_at: str


class SourceCitation(BaseModel):
    filename: str
    chunk_index: int
    preview: str
    relevance_score: float
    document_type: str | None = None


class MessageMetadata(BaseModel):
    sources: list[SourceCitation] = []


class MessageResponse(BaseModel):
    id: str
    thread_id: str
    user_id: str
    role: str
    content: str
    metadata: MessageMetadata | None = None
    created_at: str


class MessageCreate(BaseModel):
    content: str
