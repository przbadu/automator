import logging
import uuid
from datetime import datetime, timezone

import aiosqlite
import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.llm_config import (
    PROVIDER_BASE_URLS,
    FetchModelsRequest,
    FetchModelsResponse,
    LLMConfigCreate,
    LLMConfigResponse,
    LLMConfigUpdate,
    mask_api_key,
)
from app.services.encryption_service import decrypt_value, encrypt_value

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm-configs", tags=["llm-configs"])


def _resolve_api_url(provider: str, api_url: str | None) -> str | None:
    """Resolve api_url from provider. Only openai_compatible uses user-provided URL."""
    if provider == "anthropic":
        return None
    if provider == "openai_compatible":
        return api_url
    return PROVIDER_BASE_URLS.get(provider)


def _row_to_response(row: aiosqlite.Row) -> LLMConfigResponse:
    decrypted_key = decrypt_value(row["api_key_encrypted"])
    return LLMConfigResponse(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        provider=row["provider"],
        api_key_masked=mask_api_key(decrypted_key),
        api_url=row["api_url"],
        model_name=row["model_name"],
        is_default=bool(row["is_default"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.post("/models", response_model=FetchModelsResponse)
async def fetch_models(
    req: FetchModelsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Fetch available models from the provider's API. Validates the API key."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if req.provider == "anthropic":
                resp = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "x-api-key": req.api_key,
                        "anthropic-version": "2023-06-01",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                models = sorted([m["id"] for m in data.get("data", [])])
            else:
                base_url = _resolve_api_url(req.provider, req.api_url)
                if not base_url:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="API URL is required for this provider",
                    )
                # Strip trailing /v1 to build /v1/models properly
                url = base_url.rstrip("/") + "/models"
                resp = await client.get(
                    url,
                    headers={"Authorization": f"Bearer {req.api_key}"},
                )
                resp.raise_for_status()
                data = resp.json()
                models = sorted([m["id"] for m in data.get("data", [])])
    except httpx.HTTPStatusError as e:
        detail = "Invalid API key or provider rejected the request"
        try:
            body = e.response.json()
            detail = body.get("error", {}).get("message", detail) if isinstance(body.get("error"), dict) else body.get("detail", detail)
        except Exception:
            pass
        raise HTTPException(status_code=e.response.status_code, detail=detail)
    except httpx.ConnectError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not connect to provider API")
    except Exception:
        logger.exception("Failed to fetch models")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to fetch models from provider")

    return FetchModelsResponse(models=models)


@router.get("", response_model=list[LLMConfigResponse])
async def list_configs(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        "SELECT * FROM llm_configs WHERE user_id = ? ORDER BY created_at DESC",
        (current_user["id"],),
    )
    rows = await cursor.fetchall()
    return [_row_to_response(r) for r in rows]


@router.get("/default", response_model=LLMConfigResponse)
async def get_default_config(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        "SELECT * FROM llm_configs WHERE user_id = ? AND is_default = 1",
        (current_user["id"],),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No default LLM config")
    return _row_to_response(row)


@router.post("", response_model=LLMConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_config(
    req: LLMConfigCreate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    config_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    encrypted_key = encrypt_value(req.api_key)
    api_url = _resolve_api_url(req.provider, req.api_url)

    # Check if user has any configs — first one auto-becomes default
    cursor = await db.execute(
        "SELECT COUNT(*) FROM llm_configs WHERE user_id = ?",
        (current_user["id"],),
    )
    count = (await cursor.fetchone())[0]
    is_default = 1 if count == 0 or req.is_default else 0

    if is_default and count > 0:
        await db.execute(
            "UPDATE llm_configs SET is_default = 0 WHERE user_id = ?",
            (current_user["id"],),
        )

    await db.execute(
        """INSERT INTO llm_configs (id, user_id, name, provider, api_key_encrypted, api_url, model_name, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (config_id, current_user["id"], req.name, req.provider, encrypted_key, api_url, req.model_name, is_default, now, now),
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM llm_configs WHERE id = ?", (config_id,))
    return _row_to_response(await cursor.fetchone())


@router.put("/{config_id}", response_model=LLMConfigResponse)
async def update_config(
    config_id: str,
    req: LLMConfigUpdate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        "SELECT * FROM llm_configs WHERE id = ? AND user_id = ?",
        (config_id, current_user["id"]),
    )
    existing = await cursor.fetchone()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Config not found")

    now = datetime.now(timezone.utc).isoformat()
    name = req.name if req.name is not None else existing["name"]
    provider = req.provider if req.provider is not None else existing["provider"]
    model_name = req.model_name if req.model_name is not None else existing["model_name"]
    api_url = _resolve_api_url(provider, req.api_url if req.api_url is not None else existing["api_url"])

    if req.api_key is not None:
        encrypted_key = encrypt_value(req.api_key)
    else:
        encrypted_key = existing["api_key_encrypted"]

    is_default = existing["is_default"]
    if req.is_default is not None:
        if req.is_default:
            await db.execute(
                "UPDATE llm_configs SET is_default = 0 WHERE user_id = ?",
                (current_user["id"],),
            )
            is_default = 1
        else:
            # Don't allow unsetting if it's the only config
            cursor2 = await db.execute(
                "SELECT COUNT(*) FROM llm_configs WHERE user_id = ?",
                (current_user["id"],),
            )
            count = (await cursor2.fetchone())[0]
            if count == 1:
                is_default = 1  # Keep as default
            else:
                is_default = 0

    await db.execute(
        """UPDATE llm_configs SET name=?, provider=?, api_key_encrypted=?, api_url=?, model_name=?, is_default=?, updated_at=?
           WHERE id=?""",
        (name, provider, encrypted_key, api_url, model_name, is_default, now, config_id),
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM llm_configs WHERE id = ?", (config_id,))
    return _row_to_response(await cursor.fetchone())


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_config(
    config_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        "SELECT * FROM llm_configs WHERE id = ? AND user_id = ?",
        (config_id, current_user["id"]),
    )
    existing = await cursor.fetchone()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Config not found")

    was_default = bool(existing["is_default"])
    await db.execute("DELETE FROM llm_configs WHERE id = ?", (config_id,))

    # Promote most recent if we deleted the default
    if was_default:
        await db.execute(
            """UPDATE llm_configs SET is_default = 1
               WHERE id = (SELECT id FROM llm_configs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1)""",
            (current_user["id"],),
        )

    await db.commit()
