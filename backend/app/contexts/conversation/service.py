"""ConversationService — conversation and message CRUD, rolling summary, density."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.conversation import ConvConversation, ConvMessage

logger = logging.getLogger(__name__)


class NotFound(Exception):
    pass


class Forbidden(Exception):
    pass


class ConversationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: str,
        kind: str,
        anchor_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a new conversation."""
        from python_ulid import ULID

        conv = ConvConversation(
            id=str(ULID()),
            user_id=user_id,
            kind=kind,
            anchor_id=anchor_id,
            effective_density="BALANCED",
            last_activity=datetime.now(timezone.utc),
        )
        self.session.add(conv)
        await self.session.commit()
        return _row_to_dict(conv)

    async def append_message(
        self,
        conversation_id: str,
        role: str,
        text: str | None = None,
        tool_calls: list | None = None,
        token_usage: dict | None = None,
    ) -> dict[str, Any]:
        """Append a message to the conversation."""
        from python_ulid import ULID

        token_usage = token_usage or {}
        msg = ConvMessage(
            id=str(ULID()),
            conversation_id=conversation_id,
            role=role,
            text=text,
            tool_calls=tool_calls,
            token_prompt=token_usage.get("prompt_tokens"),
            token_completion=token_usage.get("completion_tokens"),
            token_model=token_usage.get("model"),
            token_cost_usd=token_usage.get("cost_usd"),
            finish_reason=token_usage.get("finish_reason"),
        )
        self.session.add(msg)

        # Update conversation last_activity
        conv_result = await self.session.execute(
            select(ConvConversation).where(ConvConversation.id == conversation_id)
        )
        conv = conv_result.scalar_one_or_none()
        if conv:
            conv.last_activity = datetime.now(timezone.utc)

        await self.session.commit()
        return _row_to_dict(msg)

    async def get_messages(
        self,
        conversation_id: str,
        limit: int = 50,
        since: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return messages for a conversation, optionally since a message ID."""
        query = (
            select(ConvMessage)
            .where(ConvMessage.conversation_id == conversation_id)
            .order_by(ConvMessage.created_at.asc())
            .limit(limit)
        )

        if since:
            # Get the created_at of the 'since' message and filter after it
            since_result = await self.session.execute(
                select(ConvMessage.created_at).where(ConvMessage.id == since)
            )
            since_ts = since_result.scalar_one_or_none()
            if since_ts:
                query = query.where(ConvMessage.created_at > since_ts)

        result = await self.session.execute(query)
        return [_row_to_dict(m) for m in result.scalars().all()]

    async def get_rolling_summary(self, conversation_id: str) -> str | None:
        """Return rolling summary text for a conversation."""
        result = await self.session.execute(
            select(ConvConversation.rolling_summary).where(
                ConvConversation.id == conversation_id
            )
        )
        return result.scalar_one_or_none()

    async def set_density(
        self,
        conversation_id: str,
        density: str,
        reason: str | None = None,
        ttl: int | None = None,
    ) -> dict[str, Any]:
        """Update effective_density for a conversation."""
        result = await self.session.execute(
            select(ConvConversation).where(ConvConversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise NotFound(f"Conversation {conversation_id} not found")

        conv.effective_density = density
        await self.session.commit()
        return _row_to_dict(conv)

    async def get_conversation(self, conversation_id: str) -> ConvConversation:
        result = await self.session.execute(
            select(ConvConversation).where(ConvConversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise NotFound(f"Conversation {conversation_id} not found")
        return conv


# ------------------------------------------------------------------
# Utilities
# ------------------------------------------------------------------

def _row_to_dict(obj: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if isinstance(value, datetime):
            value = value.isoformat()
        result[column.name] = value
    return result
