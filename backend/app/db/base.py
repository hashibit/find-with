"""SQLAlchemy declarative base + common mixins."""

from datetime import datetime

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ULIDMixin:
    """Primary key = ULID text."""
    id: Mapped[str] = mapped_column(String(26), primary_key=True)


class AuditMixin:
    """created_at / updated_at auto-managed."""
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
