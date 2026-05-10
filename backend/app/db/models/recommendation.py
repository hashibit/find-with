"""Recommendation models."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ULIDMixin


class RecoRecommendation(Base, ULIDMixin):
    __tablename__ = "reco_recommendations"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    items: Mapped[list | None] = mapped_column(JSONB)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    feedback: Mapped[dict | None] = mapped_column(JSONB)
