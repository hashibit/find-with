"""Billing Service — orchestrates subscription state via injected PaymentGateway.

No direct Stripe imports. Production vs dev behavior determined by which
PaymentGateway implementation is injected (see deps.py).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.billing import BillingSubscription
from app.db.models.idempotency import IdempotencyKey
from app.db.models.outbox import OutboxEvent
from app.ports.payment import PaymentGateway, WebhookEvent

logger = logging.getLogger(__name__)


class BillingService:
    def __init__(self, session: AsyncSession, gateway: PaymentGateway):
        self.session = session
        self.gw = gateway

    async def create_checkout(self, user_id: str, target_tier: str, success_url: str, cancel_url: str) -> dict:
        sub = await self._get_subscription(user_id)
        result = await self.gw.create_checkout(
            customer_id=sub.stripe_customer_id if sub else None,
            user_id=user_id, tier=target_tier,
            success_url=success_url, cancel_url=cancel_url,
        )
        return {"hosted_url": result.hosted_url, "session_id": result.session_id}

    async def finalize_checkout(self, session_id: str, user_id: str | None = None, target_tier: str | None = None) -> dict:
        if user_id and target_tier:
            # Direct finalize (dev or explicit)
            return await self._upsert_subscription(user_id, target_tier)

        info = await self.gw.retrieve_checkout(session_id)
        return await self._upsert_subscription(
            info["user_id"], info["tier"],
            stripe_customer_id=info.get("customer_id"),
            stripe_subscription_id=info.get("subscription_id"),
            period_end=info.get("period_end"),
        )

    async def create_portal(self, user_id: str, return_url: str) -> dict:
        sub = await self._get_subscription(user_id)
        if not sub or not sub.stripe_customer_id:
            return {"error": "No subscription found"}
        url = await self.gw.create_portal(sub.stripe_customer_id, return_url)
        return {"hosted_url": url}

    async def pause(self, user_id: str, reason: str = "OFFER_ACCEPTED") -> dict:
        sub = await self._get_subscription(user_id)
        if not sub:
            return {"error": "No subscription"}

        if sub.stripe_subscription_id:
            await self.gw.pause_subscription(sub.stripe_subscription_id)

        sub.state = "PAUSED"
        sub.paused_reason = reason
        self._emit_entitlements_changed(user_id, "PAUSED", reason=reason)
        await self.session.commit()
        return {"state": "PAUSED"}

    async def resume(self, user_id: str) -> dict:
        sub = await self._get_subscription(user_id)
        if not sub:
            return {"error": "No subscription"}

        if sub.stripe_subscription_id:
            await self.gw.resume_subscription(sub.stripe_subscription_id)

        sub.state = "ACTIVE"
        sub.paused_reason = None
        self._emit_entitlements_changed(user_id, "ACTIVE")
        await self.session.commit()
        return {"state": "ACTIVE"}

    async def handle_webhook(self, raw_body: bytes, signature: str) -> dict:
        try:
            event = await self.gw.verify_webhook(raw_body, signature)
        except ValueError as exc:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail=str(exc))

        # Idempotency
        existing = await self.session.execute(
            select(IdempotencyKey).where(IdempotencyKey.key == event.event_id)
        )
        if existing.scalar_one_or_none():
            return {"processed": False, "deduped": True}

        # U-04 tie-breaker
        if event.user_id and event.event_type in (
            "customer.subscription.updated", "customer.subscription.deleted",
        ):
            db_sub = await self._get_subscription(event.user_id)
            if db_sub:
                if db_sub.last_event_at and db_sub.last_event_at >= event.event_at:
                    if db_sub.last_event_id and db_sub.last_event_id >= event.event_id:
                        return {"processed": False, "deduped": False}

                db_sub.last_event_id = event.event_id
                db_sub.last_event_at = event.event_at
                if event.status:
                    db_sub.state = event.status
                if event.period_end:
                    db_sub.period_end = event.period_end

        from ulid import ULID
        self.session.add(IdempotencyKey(key=event.event_id, key_type="stripe_event"))
        await self.session.commit()
        return {"processed": True, "deduped": False}

    # --- internals ---

    async def _upsert_subscription(
        self, user_id: str, tier: str, *,
        stripe_customer_id: str | None = None,
        stripe_subscription_id: str | None = None,
        period_end: datetime | None = None,
    ) -> dict:
        from ulid import ULID

        db_sub = await self._get_subscription(user_id)
        if period_end is None:
            period_end = datetime.now(timezone.utc) + timedelta(days=30)

        if db_sub:
            db_sub.tier = tier
            db_sub.state = "ACTIVE"
            db_sub.stripe_customer_id = stripe_customer_id or db_sub.stripe_customer_id
            db_sub.stripe_subscription_id = stripe_subscription_id or db_sub.stripe_subscription_id
            db_sub.period_end = period_end
        else:
            db_sub = BillingSubscription(
                id=str(ULID()), user_id=user_id, tier=tier, state="ACTIVE",
                stripe_customer_id=stripe_customer_id or f"cus_stub_{user_id}",
                stripe_subscription_id=stripe_subscription_id or f"sub_stub_{ULID()}",
                period_end=period_end,
            )
            self.session.add(db_sub)

        self._emit_entitlements_changed(user_id, "ACTIVE")
        await self.session.commit()
        return {"user_id": user_id, "tier": tier, "state": "ACTIVE"}

    def _emit_entitlements_changed(self, user_id: str, state: str, reason: str | None = None) -> None:
        from ulid import ULID
        payload: dict = {"user_id": user_id, "state": state}
        if reason:
            payload["reason"] = reason
        self.session.add(OutboxEvent(
            id=str(ULID()), event_type="EntitlementsChanged",
            payload=payload, consumer_group="agent",
        ))

    async def _get_subscription(self, user_id: str) -> BillingSubscription | None:
        result = await self.session.execute(
            select(BillingSubscription).where(BillingSubscription.user_id == user_id)
        )
        return result.scalar_one_or_none()
