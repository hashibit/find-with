"""Billing — written by website, read-only by product backend."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ULIDMixin


class BillingSubscription(Base, ULIDMixin):
    __tablename__ = "billing_subscriptions"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    tier: Mapped[str] = mapped_column(String(20), default="FREE", nullable=False)
    state: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255))
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_reason: Mapped[str | None] = mapped_column(String(50))
    # U-04: Stripe Event tie-breaker
    last_event_id: Mapped[str | None] = mapped_column(String(255))
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
