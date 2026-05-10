"""IAM models — iam_users, iam_settings."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ULIDMixin, AuditMixin


class IamUser(Base, ULIDMixin, AuditMixin):
    __tablename__ = "iam_users"

    clerk_user_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class IamSettings(Base):
    __tablename__ = "iam_settings"

    user_id: Mapped[str] = mapped_column(String(26), primary_key=True)
    density: Mapped[str] = mapped_column(String(20), default="BALANCED", nullable=False)
    locale: Mapped[str] = mapped_column(String(10), default="en-US", nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)
