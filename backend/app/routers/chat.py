import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

import aiosqlite
from sse_starlette.sse import EventSourceResponse

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.chat import MessageCreate, MessageResponse, ThreadCreate, ThreadResponse
from app.services.llm_service import get_thread_messages, stream_chat_completion

router = APIRouter(prefix="/threads", tags=["chat"])


@router.post("", response_model=ThreadResponse, status_code=status.HTTP_201_CREATED)
async def create_thread(
    req: ThreadCreate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    thread_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO threads (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (thread_id, current_user["id"], req.title, now, now),
    )
    await db.commit()
    return ThreadResponse(
        id=thread_id,
        user_id=current_user["id"],
        title=req.title,
        created_at=now,
        updated_at=now,
    )


@router.get("", response_model=list[ThreadResponse])
async def list_threads(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        "SELECT id, user_id, title, created_at, updated_at FROM threads WHERE user_id = ? ORDER BY updated_at DESC",
        (current_user["id"],),
    )
    rows = await cursor.fetchall()
    return [
        ThreadResponse(id=r[0], user_id=r[1], title=r[2], created_at=r[3], updated_at=r[4])
        for r in rows
    ]


@router.get("/{thread_id}", response_model=ThreadResponse)
async def get_thread(
    thread_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        "SELECT id, user_id, title, created_at, updated_at FROM threads WHERE id = ? AND user_id = ?",
        (thread_id, current_user["id"]),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return ThreadResponse(id=row[0], user_id=row[1], title=row[2], created_at=row[3], updated_at=row[4])


@router.delete("/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(
    thread_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    cursor = await db.execute(
        "SELECT id FROM threads WHERE id = ? AND user_id = ?",
        (thread_id, current_user["id"]),
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    await db.execute("DELETE FROM threads WHERE id = ?", (thread_id,))
    await db.commit()


@router.get("/{thread_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    thread_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    # Verify thread ownership
    cursor = await db.execute(
        "SELECT id FROM threads WHERE id = ? AND user_id = ?",
        (thread_id, current_user["id"]),
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")

    cursor = await db.execute(
        "SELECT id, thread_id, user_id, role, content, metadata, created_at FROM messages WHERE thread_id = ? ORDER BY created_at ASC",
        (thread_id,),
    )
    rows = await cursor.fetchall()
    return [
        MessageResponse(
            id=r[0], thread_id=r[1], user_id=r[2], role=r[3],
            content=r[4], metadata=r[5], created_at=r[6],
        )
        for r in rows
    ]


@router.post("/{thread_id}/messages")
async def send_message(
    thread_id: str,
    req: MessageCreate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    # Verify thread ownership
    cursor = await db.execute(
        "SELECT id FROM threads WHERE id = ? AND user_id = ?",
        (thread_id, current_user["id"]),
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")

    # Save user message
    user_msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO messages (id, thread_id, user_id, role, content, created_at) VALUES (?, ?, ?, 'user', ?, ?)",
        (user_msg_id, thread_id, current_user["id"], req.content, now),
    )
    await db.commit()

    # Load full history for LLM
    messages = await get_thread_messages(db, thread_id)

    async def event_generator():
        assistant_content = ""
        async for delta in stream_chat_completion(messages):
            assistant_content += delta
            yield {"data": json.dumps({"type": "delta", "content": delta})}

        # Save assistant message
        assistant_msg_id = str(uuid.uuid4())
        msg_now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "INSERT INTO messages (id, thread_id, user_id, role, content, created_at) VALUES (?, ?, ?, 'assistant', ?, ?)",
            (assistant_msg_id, thread_id, current_user["id"], assistant_content, msg_now),
        )
        await db.execute(
            "UPDATE threads SET updated_at = ? WHERE id = ?",
            (msg_now, thread_id),
        )
        await db.commit()

        yield {"data": json.dumps({"type": "done", "message_id": assistant_msg_id})}

    return EventSourceResponse(event_generator())
