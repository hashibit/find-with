"""Telemetry events — partitioned by month."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"

    event_id: Mapped[str] = mapped_column(String(26), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(26))
    surface: Mapped[str | None] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    props: Mapped[dict | None] = mapped_column(JSONB)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ext_version: Mapped[str | None] = mapped_column(String(20))
    app_build: Mapped[str | None] = mapped_column(String(20))
