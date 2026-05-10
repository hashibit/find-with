"""Followup models."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Text, LargeBinary
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ULIDMixin, AuditMixin


class FollowupEmail(Base, ULIDMixin, AuditMixin):
    __tablename__ = "followup_emails"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(20), default="gmail-web", nullable=False)
    subject: Mapped[str | None] = mapped_column(String(500))
    from_addr: Mapped[str | None] = mapped_column(String(255))
    body_text: Mapped[bytes | None] = mapped_column(LargeBinary)  # ENCRYPTED §12.1
    kind: Mapped[str | None] = mapped_column(String(30))
    parsed: Mapped[dict | None] = mapped_column(JSONB)
    radar_item_id: Mapped[str | None] = mapped_column(String(26))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FollowupDraft(Base, ULIDMixin, AuditMixin):
    __tablename__ = "followup_drafts"

    email_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(26), nullable=False)
    text: Mapped[str | None] = mapped_column(Text)
    intent: Mapped[str | None] = mapped_column(String(50))
