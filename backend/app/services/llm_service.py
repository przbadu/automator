import asyncio
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


async def stream_chat_completion(
    messages: list[dict],
    stop_event: asyncio.Event | None = None,
) -> AsyncGenerator[str, None]:
    """Stream chat completion deltas from the LLM.

    If stop_event is provided and gets set, the stream is closed (cancelling
    the request to the LLM server) and the generator exits.
    """
    response = await openai_client.chat.completions.create(
        model=settings.llm_model,
        messages=messages,
        stream=True,
    )
    try:
        async for chunk in response:
            if stop_event and stop_event.is_set():
                break
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    finally:
        # Close the HTTP connection to the LLM server, stopping generation
        await response.close()


async def generate_thread_title(user_message: str) -> str:
    """Generate a short, descriptive title for a chat thread based on the user's first message."""
    response = await openai_client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {
                "role": "system",
                "content": "Generate a short, concise title (max 6 words) for a chat conversation based on the user's first message. Return only the title, no quotes or punctuation at the end.",
            },
            {"role": "user", "content": user_message},
        ],
        max_tokens=20,
    )
    title = response.choices[0].message.content.strip().strip('"\'')
    return title[:80] if title else user_message[:50]
