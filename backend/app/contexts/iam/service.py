"""IAM Service — Clerk JWT verification, user sync, entitlements read."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.iam import IamUser, IamSettings
from app.db.models.billing import BillingSubscription

logger = logging.getLogger(__name__)


class IAMService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_or_create_user(self, clerk_user_id: str, email: str, full_name: str | None = None) -> IamUser:
        """Lazy sync: create user if not exists (webhook may arrive late)."""
        result = await self.session.execute(
            select(IamUser).where(IamUser.clerk_user_id == clerk_user_id)
        )
        user = result.scalar_one_or_none()

        if user:
            return user

        from python_ulid import ULID
        user = IamUser(
            id=str(ULID()),
            clerk_user_id=clerk_user_id,
            email=email,
            full_name=full_name,
        )
        self.session.add(user)

        # Create default settings
        settings = IamSettings(
            user_id=user.id,
            density="BALANCED",
            locale="en-US",
            timezone="UTC",
        )
        self.session.add(settings)

        await self.session.commit()
        return user

    async def get_user_by_clerk_id(self, clerk_user_id: str) -> IamUser | None:
        result = await self.session.execute(
            select(IamUser).where(IamUser.clerk_user_id == clerk_user_id)
        )
        return result.scalar_one_or_none()

    async def get_entitlements(self, user_id: str) -> dict:
        """Read-only entitlements view (subscription written by website)."""
        result = await self.session.execute(
            select(BillingSubscription).where(BillingSubscription.user_id == user_id)
        )
        sub = result.scalar_one_or_none()

        if not sub:
            return {
                "user_id": user_id,
                "tier": "FREE",
                "effective_tier": "FREE",
                "state": "ACTIVE",
                "period_end": None,
                "feature_flags": {},
            }

        # Compute effective tier
        effective_tier = sub.tier
        if sub.state == "PAUSED" and sub.period_end and sub.period_end > datetime.now(timezone.utc):
            effective_tier = sub.tier  # PAUSED but still within period
        elif sub.state in ("CANCELED", "PAST_DUE"):
            if sub.period_end and sub.period_end > datetime.now(timezone.utc):
                effective_tier = sub.tier  # Grace period
            else:
                effective_tier = "FREE"

        return {
            "user_id": user_id,
            "tier": sub.tier,
            "effective_tier": effective_tier,
            "state": sub.state,
            "period_end": sub.period_end.isoformat() if sub.period_end else None,
            "feature_flags": {},
        }

    async def soft_delete_user(self, user_id: str) -> None:
        """Mark user as deleted (24h grace period before purge)."""
        result = await self.session.execute(
            select(IamUser).where(IamUser.id == user_id)
        )
        user = result.scalar_one_or_none()
        if user:
            user.deleted_at = datetime.now(timezone.utc)
            user.is_active = False
            await self.session.commit()
