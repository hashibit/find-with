"""Quota Service — usage tracking, gate checks, idempotent export consumption."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.quota import QuotaUsageCounter, QuotaConsumeLog

logger = logging.getLogger(__name__)


class QuotaService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_usage(self, user_id: str) -> dict:
        """Return current quota usage snapshot."""
        result = await self.session.execute(
            select(QuotaUsageCounter).where(QuotaUsageCounter.user_id == user_id)
        )
        usage = result.scalar_one_or_none()

        if not usage:
            return {
                "user_id": user_id,
                "tailoring_completed": 0,
                "tailoring_limit": 3,
                "tailoring_remaining": 3,
                "effective_tier": "FREE",
            }

        entitlements = await self._get_entitlements(user_id)
        effective_tier = entitlements.get("effective_tier", "FREE")

        if effective_tier != "FREE":
            # PRO = unlimited
            return {
                "user_id": user_id,
                "tailoring_completed": usage.tailoring_completed,
                "tailoring_limit": None,
                "tailoring_remaining": None,
                "effective_tier": effective_tier,
            }

        remaining = max(0, usage.tailoring_limit - usage.tailoring_completed)
        return {
            "user_id": user_id,
            "tailoring_completed": usage.tailoring_completed,
            "tailoring_limit": usage.tailoring_limit,
            "tailoring_remaining": remaining,
            "effective_tier": effective_tier,
        }

    async def check(self, user_id: str) -> dict:
        """Read-only quota gate. Returns {allowed: bool, remaining: int|None}."""
        result = await self.session.execute(
            select(QuotaUsageCounter).where(QuotaUsageCounter.user_id == user_id)
        )
        usage = result.scalar_one_or_none()

        entitlements = await self._get_entitlements(user_id)
        effective_tier = entitlements.get("effective_tier", "FREE")

        if effective_tier != "FREE":
            return {"allowed": True, "remaining": None, "effective_tier": effective_tier}

        if not usage:
            return {"allowed": True, "remaining": 3, "effective_tier": effective_tier}

        remaining = max(0, usage.tailoring_limit - usage.tailoring_completed)
        return {
            "allowed": remaining > 0,
            "remaining": remaining,
            "effective_tier": effective_tier,
        }

    async def consume_on_export(self, user_id: str, tailored_resume_id: str) -> bool:
        """Consume quota on PDF/txt export. FOR UPDATE + UNIQUE prevents double-charge."""
        from ulid import ULID

        # Check if already consumed (idempotent)
        existing = await self.session.execute(
            select(QuotaConsumeLog).where(QuotaConsumeLog.tailored_resume_id == tailored_resume_id)
        )
        if existing.scalar_one_or_none():
            return True  # Already consumed, success (idempotent)

        # Lock and check
        counter = await self.session.execute(
            select(QuotaUsageCounter).where(QuotaUsageCounter.user_id == user_id).with_for_update()
        )
        usage = counter.scalar_one_or_none()
        if not usage:
            # Create counter — set defaults explicitly so the in-memory check
            # below (tailoring_completed >= tailoring_limit) works before flush.
            usage = QuotaUsageCounter(
                user_id=user_id,
                tailoring_completed=0,
                tailoring_limit=3,
            )
            self.session.add(usage)

        if usage.tailoring_completed >= usage.tailoring_limit:
            # Check if user has PRO (unlimited)
            entitlements = await self._get_entitlements(user_id)
            if entitlements.get("effective_tier") == "FREE":
                return False  # Quota exceeded

        usage.tailoring_completed += 1
        log = QuotaConsumeLog(
            id=str(ULID()),
            user_id=user_id,
            tailored_resume_id=tailored_resume_id,
        )
        self.session.add(log)
        await self.session.commit()
        return True

    async def _get_entitlements(self, user_id: str) -> dict:
        """Delegate to IAMService for entitlement data."""
        from app.contexts.iam.service import IAMService
        iam = IAMService(self.session)
        return await iam.get_entitlements(user_id)
