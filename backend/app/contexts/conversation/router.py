"""Conversation HTTP routes — including SSE streaming."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.contexts.iam.auth import get_current_user_id
from app.contexts.conversation.service import ConversationService, NotFound

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/conversations", tags=["conversation"])


@router.post("", status_code=201)
async def create_conversation(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Create a new conversation."""
    body = await request.json()
    svc = ConversationService(session)
    return await svc.create(
        user_id=user_id,
        kind=body.get("kind", "FREE_CHAT"),
        anchor_id=body.get("anchor_id"),
    )


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    request: Request,
    stream: bool = Query(default=False),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> Any:
    """
    Send a user message and get an agent response.

    With ?stream=true returns text/event-stream (SSE).
    Without stream returns a plain JSON response.
    """
    body = await request.json()
    text = body.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="'text' field is required")

    # Verify conversation exists and belongs to user
    svc = ConversationService(session)
    try:
        conv = await svc.get_conversation(conversation_id)
    except NotFound:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if conv.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Append user message
    await svc.append_message(
        conversation_id=conversation_id,
        role="USER",
        text=text,
    )

    if stream:
        return StreamingResponse(
            _stream_agent_response(
                conversation_id=conversation_id,
                user_id=user_id,
                user_message=text,
                conversation_kind=conv.kind,
                anchor_id=conv.anchor_id,
                session=session,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming path: collect full response
    full_text = ""
    token_usage: dict[str, Any] = {}

    async for event in _iter_agent(
        conversation_id=conversation_id,
        user_id=user_id,
        user_message=text,
        conversation_kind=conv.kind,
        anchor_id=conv.anchor_id,
    ):
        if event["kind"] == "text_delta":
            full_text += event["data"].get("delta", "")
        elif event["kind"] == "done":
            token_usage = event["data"]

    # Persist assistant message
    await svc.append_message(
        conversation_id=conversation_id,
        role="ASSISTANT",
        text=full_text,
        token_usage={
            "prompt_tokens": token_usage.get("prompt_tokens"),
            "completion_tokens": token_usage.get("completion_tokens"),
            "finish_reason": token_usage.get("finish_reason"),
        },
    )

    return {"text": full_text, "token_usage": token_usage}


@router.get("/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    since: str | None = Query(default=None),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    """Return conversation message history."""
    svc = ConversationService(session)
    try:
        conv = await svc.get_conversation(conversation_id)
    except NotFound:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if conv.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return await svc.get_messages(
        conversation_id=conversation_id,
        limit=limit,
        since=since,
    )


@router.post("/{conversation_id}/messages/{msg_id}:resume")
async def resume_stream(
    conversation_id: str,
    msg_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> Any:
    """
    Resume a broken SSE stream from a specific message ID.

    Re-streams all messages after msg_id as SSE events.
    """
    svc = ConversationService(session)
    try:
        conv = await svc.get_conversation(conversation_id)
    except NotFound:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if conv.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    messages = await svc.get_messages(
        conversation_id=conversation_id,
        limit=200,
        since=msg_id,
    )

    async def _replay():
        for msg in messages:
            data = json.dumps({"kind": "message", "data": msg})
            yield f"data: {data}\n\n"
        yield "data: " + json.dumps({"kind": "done", "data": {}}) + "\n\n"

    return StreamingResponse(
        _replay(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ------------------------------------------------------------------
# SSE streaming internals
# ------------------------------------------------------------------

async def _stream_agent_response(
    conversation_id: str,
    user_id: str,
    user_message: str,
    conversation_kind: str,
    anchor_id: str | None,
    session: AsyncSession,
) -> Any:
    """
    Generator: calls AgentOrchestrator.respond(), yields SSE-formatted events,
    and on Done persists the assistant message with token usage.
    """
    full_text = ""
    token_usage: dict[str, Any] = {}
    error_occurred = False

    try:
        async for event in _iter_agent(
            conversation_id=conversation_id,
            user_id=user_id,
            user_message=user_message,
            conversation_kind=conversation_kind,
            anchor_id=anchor_id,
        ):
            kind = event["kind"]
            data = event["data"]

            if kind == "text_delta":
                full_text += data.get("delta", "")

            elif kind == "done":
                token_usage = data

            elif kind == "error":
                error_occurred = True
                logger.error(
                    "Agent error for conversation=%s: %s",
                    conversation_id,
                    data.get("message"),
                )

            yield f"data: {json.dumps(event)}\n\n"

    except Exception as exc:
        logger.exception("SSE stream failed for conversation=%s: %s", conversation_id, exc)
        error_event = {"kind": "error", "data": {"code": "STREAM_ERROR", "message": str(exc)}}
        yield f"data: {json.dumps(error_event)}\n\n"
        error_occurred = True

    finally:
        # Persist assistant message even if an error occurred mid-stream
        if full_text or not error_occurred:
            try:
                svc = ConversationService(session)
                await svc.append_message(
                    conversation_id=conversation_id,
                    role="ASSISTANT",
                    text=full_text,
                    token_usage={
                        "prompt_tokens": token_usage.get("prompt_tokens"),
                        "completion_tokens": token_usage.get("completion_tokens"),
                        "finish_reason": token_usage.get("finish_reason"),
                    },
                )
            except Exception as persist_exc:
                logger.error(
                    "Failed to persist assistant message for conversation=%s: %s",
                    conversation_id,
                    persist_exc,
                )


async def _iter_agent(
    conversation_id: str,
    user_id: str,
    user_message: str,
    conversation_kind: str,
    anchor_id: str | None,
):
    """
    Build AgentOrchestrator and iterate over AgentEvents,
    converting them to plain dicts for JSON serialisation.
    """
    from app.llm.client import LLMClient
    from app.contexts.agent.orchestrator import AgentOrchestrator
    from app.contexts.agent.tools import ToolRegistry
    from app.contexts.agent.context_builder import ContextBuilder

    llm_client = LLMClient()
    tool_registry = ToolRegistry()
    context_builder = ContextBuilder()

    orchestrator = AgentOrchestrator(
        llm_client=llm_client,
        tool_registry=tool_registry,
        context_builder=context_builder,
    )

    async for agent_event in orchestrator.respond(
        conversation_id=conversation_id,
        user_id=user_id,
        user_message=user_message,
        conversation_kind=conversation_kind,
        anchor_id=anchor_id,
    ):
        yield {"kind": agent_event.kind, "data": agent_event.data}
