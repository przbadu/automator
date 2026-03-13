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
    document_id: str = ""


class ToolCallRecord(BaseModel):
    tool: str
    args: dict = {}


class ToolResultRecord(BaseModel):
    tool: str
    summary: str = ""


class MessageMetadata(BaseModel):
    sources: list[SourceCitation] = []
    sub_agent: bool | None = None
    target_document: str | None = None
    tool_calls: list[ToolCallRecord] = []
    tool_results: list[ToolResultRecord] = []


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
