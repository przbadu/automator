from collections.abc import AsyncGenerator

import aiosqlite

from app.config import settings
from app.services.langsmith_service import openai_client


async def get_thread_messages(db: aiosqlite.Connection, thread_id: str) -> list[dict]:
    """Load all messages for a thread, ordered by creation time."""
    cursor = await db.execute(
        "SELECT role, content FROM messages WHERE thread_id = ? ORDER BY created_at ASC",
        (thread_id,),
    )
    rows = await cursor.fetchall()
    return [{"role": row[0], "content": row[1]} for row in rows]


async def stream_chat_completion(messages: list[dict]) -> AsyncGenerator[str, None]:
    """Stream chat completion deltas from the LLM."""
    response = await openai_client.chat.completions.create(
        model=settings.llm_model,
        messages=messages,
        stream=True,
    )
    async for chunk in response:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
