"""Stub payment gateway — dev/test, no Stripe dependency."""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta

from ulid import ULID

from app.ports.payment import PaymentGateway, CheckoutResult, WebhookEvent


class StubPaymentGateway(PaymentGateway):
    async def create_checkout(
        self, customer_id: str | None, user_id: str, tier: str,
        success_url: str, cancel_url: str,
    ) -> CheckoutResult:
        session_id = f"cs_dev_{ULID()}"
        return CheckoutResult(
            hosted_url=f"{success_url}?session_id={session_id}",
            session_id=session_id,
        )

    async def retrieve_checkout(self, session_id: str) -> dict:
        # In dev, finalize is called with explicit user_id/tier,
        # so this is only a fallback.
        return {
            "user_id": "",
            "tier": "PRO",
            "customer_id": f"cus_dev_{ULID()}",
            "subscription_id": f"sub_dev_{ULID()}",
            "period_end": datetime.now(timezone.utc) + timedelta(days=30),
        }

    async def create_portal(self, customer_id: str, return_url: str) -> str:
        return return_url

    async def pause_subscription(self, subscription_id: str) -> None:
        pass  # DB-only

    async def resume_subscription(self, subscription_id: str) -> None:
        pass  # DB-only

    async def delete_customer(self, customer_id: str) -> None:
        pass  # noop

    async def verify_webhook(self, raw_body: bytes, signature: str) -> WebhookEvent:
        data = json.loads(raw_body)
        return WebhookEvent(
            event_id=data.get("id", f"evt_dev_{ULID()}"),
            event_type=data.get("type", ""),
            event_at=datetime.now(timezone.utc),
        )
