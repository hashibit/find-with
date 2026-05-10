"""Idempotency keys — TTL 24h."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    key_type: Mapped[str] = mapped_column(String(50), default="api", nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(26))
    response_status: Mapped[int | None] = mapped_column()
    response_body: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
