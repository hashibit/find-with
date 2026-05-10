"""Conversation models."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Text, Integer, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ULIDMixin, AuditMixin


class ConvConversation(Base, ULIDMixin, AuditMixin):
    __tablename__ = "conv_conversations"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    anchor_id: Mapped[str | None] = mapped_column(String(26))
    effective_density: Mapped[str] = mapped_column(String(20), default="BALANCED", nullable=False)
    last_activity: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    rolling_summary: Mapped[str | None] = mapped_column(Text)
    important_quotes: Mapped[list | None] = mapped_column(JSONB)


class ConvMessage(Base, ULIDMixin):
    __tablename__ = "conv_messages"

    conversation_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # USER/ASSISTANT/SYSTEM/TOOL
    text: Mapped[str | None] = mapped_column(Text)
    tool_calls: Mapped[list | None] = mapped_column(JSONB)
    tool_result: Mapped[dict | None] = mapped_column(JSONB)
    token_prompt: Mapped[int | None] = mapped_column(Integer)
    token_completion: Mapped[int | None] = mapped_column(Integer)
    token_model: Mapped[str | None] = mapped_column(String(50))
    token_cost_usd: Mapped[float | None] = mapped_column(Float)
    finish_reason: Mapped[str | None] = mapped_column(String(20))
    meta: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
