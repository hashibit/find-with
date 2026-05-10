"""Apply models."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ULIDMixin, AuditMixin


class ApplyFillPlan(Base, ULIDMixin, AuditMixin):
    __tablename__ = "apply_fill_plans"

    radar_item_id: Mapped[str] = mapped_column(String(26), nullable=False)
    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    fields: Mapped[list | None] = mapped_column(JSONB)
    preview_summary: Mapped[str | None] = mapped_column(String(2000))
    user_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ApplyApplication(Base, ULIDMixin):
    __tablename__ = "apply_applications"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    radar_item_id: Mapped[str] = mapped_column(String(26), nullable=False)
    resume_snapshot_id: Mapped[str | None] = mapped_column(String(26))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
