"""Quota tracking."""

from datetime import datetime
from sqlalchemy import String, Integer, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class QuotaUsageCounter(Base):
    __tablename__ = "quota_usage_counters"

    user_id: Mapped[str] = mapped_column(String(26), primary_key=True)
    tailoring_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tailoring_limit: Mapped[int] = mapped_column(Integer, default=3, nullable=False)  # free=3
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class QuotaConsumeLog(Base):
    __tablename__ = "quota_consume_log"

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(26), nullable=False)
    tailored_resume_id: Mapped[str] = mapped_column(String(26), unique=True, nullable=False)  # UNIQUE prevents double-charge
    consumed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
