import asyncio
from collections import defaultdict
from typing import AsyncIterator

# Per-user event queues for SSE broadcasting
_queues: dict[str, list[asyncio.Queue]] = defaultdict(list)


async def publish(user_id: str, event: dict) -> None:
    """Push a status event to all connected SSE clients for a user."""
    for queue in _queues.get(user_id, []):
        await queue.put(event)


async def subscribe(user_id: str) -> AsyncIterator[dict]:
    """Subscribe to status events for a user. Yields events until disconnected."""
    queue: asyncio.Queue = asyncio.Queue()
    _queues[user_id].append(queue)
    try:
        while True:
            event = await queue.get()
            yield event
    except asyncio.CancelledError:
        pass
    finally:
        _queues[user_id].remove(queue)
        if not _queues[user_id]:
            del _queues[user_id]
