"""Stripe payment gateway — production implementation."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import stripe as stripe_lib

from app.ports.payment import PaymentGateway, CheckoutResult, WebhookEvent

logger = logging.getLogger(__name__)

_TIER_PRICES = {
    "PRO": "price_pro_monthly",
    "PRO_PLUS": "price_pro_plus_monthly",
}


class StripePaymentGateway(PaymentGateway):
    def __init__(self, secret_key: str, webhook_secret: str):
        self._webhook_secret = webhook_secret
        stripe_lib.api_key = secret_key

    async def create_checkout(
        self, customer_id: str | None, user_id: str, tier: str,
        success_url: str, cancel_url: str,
    ) -> CheckoutResult:
        if not customer_id:
            customer = stripe_lib.Customer.create(metadata={"user_id": user_id})
            customer_id = customer.id

        session = stripe_lib.checkout.Session.create(
            customer=customer_id,
            line_items=[{"price": _TIER_PRICES.get(tier, _TIER_PRICES["PRO"]), "quantity": 1}],
            mode="subscription",
            success_url=success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=cancel_url,
            metadata={"user_id": user_id, "target_tier": tier},
        )
        return CheckoutResult(hosted_url=session.url, session_id=session.id)

    async def retrieve_checkout(self, session_id: str) -> dict:
        session = stripe_lib.checkout.Session.retrieve(session_id, expand=["subscription"])
        sub = session.subscription
        return {
            "user_id": session.metadata.get("user_id", ""),
            "tier": session.metadata.get("target_tier", "PRO"),
            "customer_id": session.customer,
            "subscription_id": sub.id if sub else None,
            "period_end": datetime.fromtimestamp(sub.current_period_end, tz=timezone.utc) if sub and sub.current_period_end else None,
        }

    async def create_portal(self, customer_id: str, return_url: str) -> str:
        session = stripe_lib.billing_portal.Session.create(
            customer=customer_id, return_url=return_url,
        )
        return session.url

    async def pause_subscription(self, subscription_id: str) -> None:
        stripe_lib.Subscription.modify(
            subscription_id, pause_collection={"behavior": "mark_uncollectible"},
        )

    async def resume_subscription(self, subscription_id: str) -> None:
        stripe_lib.Subscription.modify(subscription_id, pause_collection="")

    async def delete_customer(self, customer_id: str) -> None:
        stripe_lib.Customer.delete(customer_id)

    async def verify_webhook(self, raw_body: bytes, signature: str) -> WebhookEvent:
        try:
            event = stripe_lib.Webhook.construct_event(raw_body, signature, self._webhook_secret)
        except stripe_lib.SignatureVerificationError as exc:
            raise ValueError(f"Invalid Stripe signature: {exc}") from exc

        wh = WebhookEvent(
            event_id=event.id,
            event_type=event.type,
            event_at=datetime.fromtimestamp(event.created, tz=timezone.utc),
        )

        if event.type in ("customer.subscription.updated", "customer.subscription.deleted"):
            obj = event.data.object
            metadata = getattr(obj, "metadata", None)
            user_id = ""
            if metadata is not None and "user_id" in metadata:
                user_id = metadata["user_id"]
            wh.user_id = user_id
            wh.subscription_id = getattr(obj, "id", None)
            wh.customer_id = getattr(obj, "customer", None)
            status = getattr(obj, "status", None)
            wh.status = "CANCELED" if event.type.endswith("deleted") else (status.upper() if status else "ACTIVE")
            cpe = getattr(obj, "current_period_end", None)
            if not cpe:
                items = getattr(obj, "items", None)
                data = getattr(items, "data", None) if items is not None else None
                if data:
                    first = data[0] if len(data) > 0 else None
                    if first is not None:
                        cpe = getattr(first, "current_period_end", None)
            if cpe:
                wh.period_end = datetime.fromtimestamp(cpe, tz=timezone.utc)

        return wh
