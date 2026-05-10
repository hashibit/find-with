"""Tailoring models."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Text, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ULIDMixin, AuditMixin


class TailoringResume(Base, ULIDMixin, AuditMixin):
    __tablename__ = "tailoring_resumes"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    base_resume_id: Mapped[str] = mapped_column(String(26), nullable=False)
    parsed_jd_id: Mapped[str] = mapped_column(String(26), nullable=False)
    sections: Mapped[list | None] = mapped_column(JSONB)
    match_before: Mapped[float | None] = mapped_column(Float)
    match_after: Mapped[float | None] = mapped_column(Float)


class TailoringSnapshot(Base, ULIDMixin):
    __tablename__ = "tailoring_snapshots"

    tailored_resume_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    blob_uri_pdf: Mapped[str | None] = mapped_column(Text)
    plain_text: Mapped[str | None] = mapped_column(Text)
    frozen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
