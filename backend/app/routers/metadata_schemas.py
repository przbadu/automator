import json
import logging
import uuid
from datetime import datetime, timezone

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.metadata_schema import (
    ALLOWED_DATA_TYPES,
    DEFAULT_FIELDS,
    RESERVED_FIELD_NAMES,
    MetadataFieldDefinition,
    MetadataSchemaCreate,
    MetadataSchemaResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/metadata-schemas", tags=["metadata-schemas"])


def _build_response(row: aiosqlite.Row) -> MetadataSchemaResponse:
    fields_raw = json.loads(row["fields"])
    fields = [MetadataFieldDefinition(**f) for f in fields_raw]
    return MetadataSchemaResponse(
        id=row["id"],
        user_id=row["user_id"],
        fields=fields,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _default_response(user_id: str) -> MetadataSchemaResponse:
    """Return a virtual response with default fields when no custom schema exists."""
    now = datetime.now(timezone.utc).isoformat()
    return MetadataSchemaResponse(
        id="default",
        user_id=user_id,
        fields=[MetadataFieldDefinition(**f) for f in DEFAULT_FIELDS],
        created_at=now,
        updated_at=now,
    )


@router.get("/defaults", response_model=list[MetadataFieldDefinition])
async def get_defaults(
    current_user: dict = Depends(get_current_user),
):
    """Return the default metadata field definitions."""
    return [MetadataFieldDefinition(**f) for f in DEFAULT_FIELDS]


@router.get("", response_model=MetadataSchemaResponse)
async def get_schema(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Return the user's metadata schema, or defaults if none saved."""
    cursor = await db.execute(
        "SELECT * FROM metadata_schemas WHERE user_id = ?",
        (current_user["id"],),
    )
    row = await cursor.fetchone()
    if not row:
        return _default_response(current_user["id"])
    return _build_response(row)


@router.put("", response_model=MetadataSchemaResponse)
async def upsert_schema(
    req: MetadataSchemaCreate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Create or update the user's metadata schema."""
    if not req.fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one field is required",
        )

    # Validate fields
    seen_names: set[str] = set()
    for field in req.fields:
        if field.data_type not in ALLOWED_DATA_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid data_type '{field.data_type}'. Allowed: {ALLOWED_DATA_TYPES}",
            )
        if field.name in RESERVED_FIELD_NAMES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Field name '{field.name}' is reserved",
            )
        if field.name in seen_names:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate field name '{field.name}'",
            )
        seen_names.add(field.name)

    user_id = current_user["id"]
    now = datetime.now(timezone.utc).isoformat()
    fields_json = json.dumps([f.model_dump() for f in req.fields])

    # Check if schema exists
    cursor = await db.execute(
        "SELECT id FROM metadata_schemas WHERE user_id = ?", (user_id,)
    )
    existing = await cursor.fetchone()

    if existing:
        await db.execute(
            "UPDATE metadata_schemas SET fields = ?, updated_at = ? WHERE user_id = ?",
            (fields_json, now, user_id),
        )
    else:
        schema_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO metadata_schemas (id, user_id, fields, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (schema_id, user_id, fields_json, now, now),
        )

    await db.commit()

    cursor = await db.execute(
        "SELECT * FROM metadata_schemas WHERE user_id = ?", (user_id,)
    )
    return _build_response(await cursor.fetchone())


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schema(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Delete custom schema, reverting to defaults."""
    await db.execute(
        "DELETE FROM metadata_schemas WHERE user_id = ?",
        (current_user["id"],),
    )
    await db.commit()
