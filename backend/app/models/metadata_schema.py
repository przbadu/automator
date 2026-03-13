from pydantic import BaseModel, Field

ALLOWED_DATA_TYPES = ["string", "number", "date", "boolean", "list[string]"]

# Prevent conflicts with ChromaDB built-in metadata keys
RESERVED_FIELD_NAMES = {"user_id", "document_id", "filename", "chunk_index"}

DEFAULT_FIELDS = [
    {"name": "title", "display_label": "Title", "data_type": "string", "required": True, "description": "Document title or best descriptive title"},
    {"name": "summary", "display_label": "Summary", "data_type": "string", "required": True, "description": "2-3 sentence summary of the document content"},
    {"name": "document_type", "display_label": "Document Type", "data_type": "string", "required": True, "description": "Type: article, report, tutorial, notes, email, legal, technical, other"},
    {"name": "language", "display_label": "Language", "data_type": "string", "required": True, "description": "Primary language code (e.g. 'en', 'es', 'fr', 'de')"},
    {"name": "topics", "display_label": "Topics", "data_type": "list[string]", "required": False, "description": "3-5 key topics or themes"},
    {"name": "key_entities", "display_label": "Key Entities", "data_type": "list[string]", "required": False, "description": "Important named entities: people, organizations, products"},
]


class MetadataFieldDefinition(BaseModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9_]*$", max_length=50)
    display_label: str = Field(max_length=100)
    data_type: str
    required: bool = False
    description: str = Field(max_length=500)


class MetadataSchemaCreate(BaseModel):
    fields: list[MetadataFieldDefinition]


class MetadataSchemaResponse(BaseModel):
    id: str
    user_id: str
    fields: list[MetadataFieldDefinition]
    created_at: str
    updated_at: str
