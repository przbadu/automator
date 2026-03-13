import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

import aiosqlite
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.chat import MessageCreate, MessageResponse, ThreadCreate, ThreadResponse
from langfuse import get_client, observe

from app.services.encryption_service import decrypt_value
from app.services.intent_service import classify_intent
from app.services.langfuse_service import create_openai_client, openai_client
from app.services.llm_service import build_rag_system_message, generate_thread_title, get_thread_messages, stream_chat_completion
from app.services.query_service import contextualize_query
from app.services.retrieval_service import retrieve_relevant_chunks
from app.services.sub_agent_service import run_sub_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/threads", tags=["chat"])


def _parse_message_metadata(raw: str | None) -> dict | None:
    """Parse metadata JSON string into dict, returning None for empty/invalid."""
    if not raw or raw == "{}":
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None

# Track active streams so they can be stopped via the /stop endpoint
# Key: thread_id, Value: asyncio.Event (set = stop requested)
_active_streams: dict[str, asyncio.Event] = {}


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
            content=r[4], metadata=_parse_message_metadata(r[5]), created_at=r[6],
        )
        for r in rows
    ]


@router.post("/{thread_id}/stop", status_code=status.HTTP_200_OK)
async def stop_generation(
    thread_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Signal an active stream to stop generating."""
    stop_event = _active_streams.get(thread_id)
    if stop_event:
        stop_event.set()
        return {"status": "stopped"}
    return {"status": "no_active_stream"}


@router.post("/{thread_id}/messages")
@observe(name="chat_send_message")
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

    # Check if this is the first message (for title generation)
    is_first_message = len(messages) == 1

    # Resolve LLM config: user's default DB config → env var fallback → error
    llm_client = None
    llm_model = None
    llm_provider = None

    config_cursor = await db.execute(
        "SELECT * FROM llm_configs WHERE user_id = ? AND is_default = 1",
        (current_user["id"],),
    )
    llm_config_row = await config_cursor.fetchone()

    if llm_config_row:
        api_key = decrypt_value(llm_config_row["api_key_encrypted"])
        llm_provider = llm_config_row["provider"]
        llm_model = llm_config_row["model_name"]
        if llm_provider == "anthropic":
            from app.services.anthropic_service import create_anthropic_client
            llm_client = create_anthropic_client(api_key)
        else:
            api_url = llm_config_row["api_url"]
            llm_client = create_openai_client(api_key, api_url)
    elif not settings.llm_api_key:
        from sse_starlette.sse import EventSourceResponse as _ESR

        async def _error_gen():
            yield {"data": json.dumps({"type": "error", "message": "No LLM configured. Please add one in Settings."})}

        return _ESR(_error_gen())

    # Set Langfuse trace context for full pipeline visibility
    get_client().update_current_span(
        name="chat_message",
        metadata={
            "thread_id": thread_id,
            "user_id": current_user["id"],
            "llm_provider": llm_provider or "openai-compatible",
            "llm_model": llm_model or settings.llm_model,
        },
    )

    # Contextualize the query using conversation history
    search_query = req.content
    if len(messages) > 1:
        try:
            search_query = await contextualize_query(
                user_message=req.content,
                chat_history=messages[-6:-1],
                client=llm_client,
                model=llm_model,
                provider=llm_provider,
            )
            logger.info("Contextualized query: %r -> %r", req.content, search_query)
        except Exception:
            logger.warning("Query contextualization failed, using original", exc_info=True)

    # Intent classification for sub-agent routing
    use_sub_agent = False
    target_document_id = None
    target_document_filename = None

    if settings.sub_agent_enabled:
        try:
            doc_cursor = await db.execute(
                "SELECT id, filename, chunk_count FROM documents WHERE user_id = ? AND status = 'completed'",
                (current_user["id"],),
            )
            user_documents = [
                {"id": r[0], "filename": r[1], "chunk_count": r[2]}
                for r in await doc_cursor.fetchall()
            ]
            logger.info("Sub-agent: found %d completed documents for user", len(user_documents))
            intent = await classify_intent(
                user_message=req.content,
                user_documents=user_documents,
                chat_history=messages,
                client=llm_client,
                model=llm_model,
                provider=llm_provider,
            )
            logger.info(
                "Sub-agent intent: needs=%s, doc_id=%s, doc_name=%s",
                intent.needs_sub_agent, intent.target_document_id, intent.target_document_filename,
            )
            if intent.needs_sub_agent:
                use_sub_agent = True
                target_document_id = intent.target_document_id
                target_document_filename = intent.target_document_filename
                logger.info(
                    "Sub-agent activated (doc=%s, id=%s)",
                    target_document_filename,
                    target_document_id,
                )
        except Exception:
            logger.warning("Intent classification failed, using normal pipeline", exc_info=True)

    # Retrieve relevant document context (always run for source citations)
    system_message = None
    sources: list[dict] = []
    try:
        retrieval_results = await retrieve_relevant_chunks(search_query, current_user["id"])
        if retrieval_results:
            context_chunks = [
                {"filename": r.document_filename, "chunk_index": r.chunk_index, "content": r.chunk_content, "document_type": r.document_type}
                for r in retrieval_results
            ]
            # Only build RAG system message for normal path (sub-agent has its own context)
            if not use_sub_agent:
                system_message = build_rag_system_message(context_chunks)
            sources = [
                {
                    "filename": r.document_filename,
                    "chunk_index": r.chunk_index,
                    "preview": r.chunk_content[:200],
                    "relevance_score": round(r.relevance_score, 3),
                    "document_type": r.document_type,
                    "document_id": r.document_id,
                }
                for r in retrieval_results
            ]
    except Exception:
        logger.warning("Retrieval failed, proceeding without context", exc_info=True)

    # Register stop signal for this thread
    stop_event = asyncio.Event()
    _active_streams[thread_id] = stop_event

    metadata_json = json.dumps({"sources": sources}) if sources else "{}"

    async def event_generator():
        assistant_content = ""
        stopped = False
        # Collect sub-agent activity for persistence
        sub_agent_tool_calls: list[dict] = []
        sub_agent_tool_results: list[dict] = []
        try:
            if use_sub_agent:
                # Sub-agent path — emit sources first if available
                if sources:
                    yield {"data": json.dumps({"type": "sources", "sources": sources})}
                async for event in run_sub_agent(
                    user_message=req.content,
                    document_id=target_document_id,
                    document_filename=target_document_filename,
                    user_id=current_user["id"],
                    chat_history=messages,
                    client=llm_client,
                    model=llm_model,
                    provider=llm_provider,
                    stop_event=stop_event,
                    db=db,
                ):
                    if event["type"] == "delta":
                        assistant_content += event.get("content", "")
                    elif event["type"] == "sub_agent_tool_call":
                        sub_agent_tool_calls.append({
                            "tool": event.get("tool", ""),
                            "args": event.get("args", {}),
                        })
                    elif event["type"] == "sub_agent_tool_result":
                        sub_agent_tool_results.append({
                            "tool": event.get("tool", ""),
                            "summary": event.get("summary", ""),
                        })
                    yield {"data": json.dumps(event)}
            else:
                # Normal RAG path
                if sources:
                    yield {"data": json.dumps({"type": "sources", "sources": sources})}

                async for delta in stream_chat_completion(messages, stop_event=stop_event, system_message=system_message, client=llm_client, model=llm_model, provider=llm_provider):
                    assistant_content += delta
                    yield {"data": json.dumps({"type": "delta", "content": delta})}

            stopped = stop_event.is_set()
            if stopped:
                logger.info("Stop requested for thread %s, saving partial response (%d chars)", thread_id, len(assistant_content))

            # Build final metadata (include sub-agent activity if applicable)
            if use_sub_agent:
                final_metadata = json.dumps({
                    "sub_agent": True,
                    "target_document": target_document_filename,
                    "sources": sources,
                    "tool_calls": sub_agent_tool_calls,
                    "tool_results": sub_agent_tool_results,
                })
            else:
                final_metadata = metadata_json

            # Save assistant message (full or partial) with metadata
            if assistant_content.strip():
                assistant_msg_id = str(uuid.uuid4())
                msg_now = datetime.now(timezone.utc).isoformat()
                await db.execute(
                    "INSERT INTO messages (id, thread_id, user_id, role, content, metadata, created_at) VALUES (?, ?, ?, 'assistant', ?, ?, ?)",
                    (assistant_msg_id, thread_id, current_user["id"], assistant_content, final_metadata, msg_now),
                )
                await db.execute(
                    "UPDATE threads SET updated_at = ? WHERE id = ?",
                    (msg_now, thread_id),
                )
                await db.commit()

                # Auto-generate title from first user message (only on full completion)
                new_title = None
                if is_first_message and not stopped:
                    try:
                        new_title = await generate_thread_title(req.content, client=llm_client, model=llm_model, provider=llm_provider)
                        await db.execute(
                            "UPDATE threads SET title = ? WHERE id = ?",
                            (new_title, thread_id),
                        )
                        await db.commit()
                    except Exception:
                        pass

                yield {"data": json.dumps({
                    "type": "done",
                    "message_id": assistant_msg_id,
                    "thread_title": new_title,
                    "stopped": stopped,
                })}
            else:
                yield {"data": json.dumps({"type": "done", "message_id": None, "stopped": stopped})}

        except asyncio.CancelledError:
            # Client disconnected — best-effort save
            if assistant_content.strip():
                try:
                    msg_id = str(uuid.uuid4())
                    msg_now = datetime.now(timezone.utc).isoformat()
                    await db.execute(
                        "INSERT INTO messages (id, thread_id, user_id, role, content, created_at) VALUES (?, ?, ?, 'assistant', ?, ?)",
                        (msg_id, thread_id, current_user["id"], assistant_content, msg_now),
                    )
                    await db.execute(
                        "UPDATE threads SET updated_at = ? WHERE id = ?",
                        (msg_now, thread_id),
                    )
                    await db.commit()
                    logger.info("Saved partial response on disconnect (%d chars) for thread %s", len(assistant_content), thread_id)
                except Exception:
                    logger.exception("Failed to save partial response for thread %s", thread_id)
            raise
        finally:
            _active_streams.pop(thread_id, None)

    return EventSourceResponse(event_generator())
