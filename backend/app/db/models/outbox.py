"""Transactional outbox — U-02: consumer_group routing."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ULIDMixin


class OutboxEvent(Base, ULIDMixin):
    __tablename__ = "outbox_events"

    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONB)
    consumer_group: Mapped[str] = mapped_column(String(50), nullable=False)  # U-02
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
