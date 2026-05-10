"""Billing Service — Stripe integration (website-side, runs in same FastAPI).

Handles: Checkout, Finalize, Portal, Pause, Resume, Webhook.
U-04: Event tie-breaker using Stripe Event.created + Event.id.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models.billing import BillingSubscription

logger = logging.getLogger(__name__)


class BillingService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_checkout(self, user_id: str, target_tier: str, success_url: str, cancel_url: str) -> dict:
        """Create Stripe Checkout Session."""
        import stripe
        stripe.api_key = settings.stripe_secret_key

        # Get or create Stripe customer
        sub = await self._get_subscription(user_id)
        customer_id = sub.stripe_customer_id if sub else None

        if not customer_id:
            # Create Stripe customer
            customer = stripe.Customer.create(metadata={"user_id": user_id})
            customer_id = customer.id

        price_id = self._tier_to_price(target_tier)
        session = stripe.checkout.Session.create(
            customer=customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=cancel_url,
            metadata={"user_id": user_id, "target_tier": target_tier},
        )

        return {"hosted_url": session.url, "session_id": session.id}

    async def finalize_checkout(self, session_id: str) -> dict:
        """Finalize after Stripe Checkout success — sync subscription to DB."""
        import stripe
        stripe.api_key = settings.stripe_secret_key

        session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
        sub = session.subscription

        user_id = session.metadata.get("user_id", "")
        target_tier = session.metadata.get("target_tier", "PRO")

        from python_ulid import ULID
        db_sub = await self._get_subscription(user_id)

        if db_sub:
            db_sub.tier = target_tier
            db_sub.state = "ACTIVE"
            db_sub.stripe_customer_id = session.customer
            db_sub.stripe_subscription_id = sub.id if sub else None
            db_sub.period_end = datetime.fromtimestamp(sub.current_period_end, tz=timezone.utc) if sub else None
        else:
            db_sub = BillingSubscription(
                id=str(ULID()),
                user_id=user_id,
                tier=target_tier,
                state="ACTIVE",
                stripe_customer_id=session.customer,
                stripe_subscription_id=sub.id if sub else None,
                period_end=datetime.fromtimestamp(sub.current_period_end, tz=timezone.utc) if sub else None,
            )
            self.session.add(db_sub)

        # Write outbox event
        from app.db.models.outbox import OutboxEvent
        outbox = OutboxEvent(
            id=str(ULID()),
            event_type="EntitlementsChanged",
            payload={"user_id": user_id, "tier": target_tier, "state": "ACTIVE"},
            consumer_group="agent",
        )
        self.session.add(outbox)

        await self.session.commit()
        return {"user_id": user_id, "tier": target_tier, "state": "ACTIVE"}

    async def create_portal(self, user_id: str, return_url: str) -> dict:
        """Create Stripe Customer Portal session."""
        import stripe
        stripe.api_key = settings.stripe_secret_key

        sub = await self._get_subscription(user_id)
        if not sub or not sub.stripe_customer_id:
            return {"error": "No subscription found"}

        session = stripe.billing_portal.Session.create(
            customer=sub.stripe_customer_id,
            return_url=return_url,
        )
        return {"hosted_url": session.url}

    async def pause(self, user_id: str, reason: str = "OFFER_ACCEPTED") -> dict:
        """Pause subscription (farewell flow)."""
        import stripe
        stripe.api_key = settings.stripe_secret_key

        sub = await self._get_subscription(user_id)
        if not sub or not sub.stripe_subscription_id:
            return {"error": "No subscription"}

        stripe.Subscription.modify(
            sub.stripe_subscription_id,
            pause_collection={"behavior": "mark_uncollectible"},
        )

        sub.state = "PAUSED"
        sub.paused_reason = reason

        # Outbox
        from python_ulid import ULID
        from app.db.models.outbox import OutboxEvent
        outbox = OutboxEvent(
            id=str(ULID()),
            event_type="EntitlementsChanged",
            payload={"user_id": user_id, "state": "PAUSED", "reason": reason},
            consumer_group="agent",
        )
        self.session.add(outbox)
        await self.session.commit()

        return {"state": "PAUSED"}

    async def resume(self, user_id: str) -> dict:
        """Resume paused subscription."""
        import stripe
        stripe.api_key = settings.stripe_secret_key

        sub = await self._get_subscription(user_id)
        if not sub or not sub.stripe_subscription_id:
            return {"error": "No subscription"}

        stripe.Subscription.modify(
            sub.stripe_subscription_id,
            pause_collection="",
        )

        sub.state = "ACTIVE"
        sub.paused_reason = None

        from python_ulid import ULID
        from app.db.models.outbox import OutboxEvent
        outbox = OutboxEvent(
            id=str(ULID()),
            event_type="EntitlementsChanged",
            payload={"user_id": user_id, "state": "ACTIVE"},
            consumer_group="agent",
        )
        self.session.add(outbox)
        await self.session.commit()

        return {"state": "ACTIVE"}

    async def handle_webhook(self, raw_body: bytes, signature: str) -> dict:
        """Handle Stripe webhook with U-04 event tie-breaker."""
        import stripe
        stripe.api_key = settings.stripe_secret_key

        from fastapi import HTTPException

        try:
            event = stripe.Webhook.construct_event(
                raw_body, signature, settings.stripe_webhook_secret,
            )
        except stripe.error.SignatureVerificationError as e:
            logger.warning("Stripe webhook signature verification failed", extra={"err": str(e)})
            raise HTTPException(status_code=401, detail="Invalid Stripe webhook signature")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid payload")

        # Idempotency check
        from app.db.models.idempotency import IdempotencyKey
        existing = await self.session.execute(
            select(IdempotencyKey).where(IdempotencyKey.key == event.id)
        )
        if existing.scalar_one_or_none():
            return {"processed": False, "deduped": True}

        # U-04: Event tie-breaker
        event_at = datetime.fromtimestamp(event.created, tz=timezone.utc)

        if event.type in ("customer.subscription.updated", "customer.subscription.deleted"):
            stripe_sub = event.data.object
            user_id = stripe_sub.metadata.get("user_id", "")

            db_sub = await self._get_subscription(user_id)
            if db_sub:
                # U-04 tie-breaker: only update if this event is newer
                if db_sub.last_event_at and db_sub.last_event_at >= event_at:
                    if db_sub.last_event_id and db_sub.last_event_id >= event.id:
                        # Older event arrived late, skip
                        return {"processed": False, "deduped": False}

                db_sub.last_event_id = event.id
                db_sub.last_event_at = event_at

                if event.type == "customer.subscription.deleted":
                    db_sub.state = "CANCELED"
                else:
                    db_sub.state = stripe_sub.status.upper() if stripe_sub.status else "ACTIVE"
                    if stripe_sub.current_period_end:
                        db_sub.period_end = datetime.fromtimestamp(stripe_sub.current_period_end, tz=timezone.utc)

        # Record idempotency
        from python_ulid import ULID
        idem = IdempotencyKey(key=event.id, key_type="stripe_event")
        self.session.add(idem)

        await self.session.commit()
        return {"processed": True, "deduped": False}

    async def _get_subscription(self, user_id: str) -> BillingSubscription | None:
        result = await self.session.execute(
            select(BillingSubscription).where(BillingSubscription.user_id == user_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _tier_to_price(tier: str) -> str:
        """Map tier to Stripe Price ID (from env in prod)."""
        return {
            "PRO": "price_pro_monthly",
            "PRO_PLUS": "price_pro_plus_monthly",
        }.get(tier, "price_pro_monthly")
