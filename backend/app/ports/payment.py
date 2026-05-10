"""Port: payment gateway.

Implementations:
  - StripePaymentGateway  (production — real Stripe API)
  - StubPaymentGateway    (dev/test — DB-only, no Stripe calls)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class CheckoutResult:
    hosted_url: str
    session_id: str


@dataclass
class WebhookEvent:
    event_id: str
    event_type: str
    event_at: datetime
    subscription_id: str | None = None
    customer_id: str | None = None
    user_id: str | None = None
    status: str | None = None
    period_end: datetime | None = None


class PaymentGateway(ABC):
    @abstractmethod
    async def create_checkout(
        self, customer_id: str | None, user_id: str, tier: str,
        success_url: str, cancel_url: str,
    ) -> CheckoutResult: ...

    @abstractmethod
    async def retrieve_checkout(self, session_id: str) -> dict:
        """Return {user_id, tier, customer_id, subscription_id, period_end}."""
        ...

    @abstractmethod
    async def create_portal(self, customer_id: str, return_url: str) -> str:
        """Return portal hosted URL."""
        ...

    @abstractmethod
    async def pause_subscription(self, subscription_id: str) -> None: ...

    @abstractmethod
    async def resume_subscription(self, subscription_id: str) -> None: ...

    @abstractmethod
    async def delete_customer(self, customer_id: str) -> None: ...

    @abstractmethod
    async def verify_webhook(self, raw_body: bytes, signature: str) -> WebhookEvent:
        """Verify webhook signature and parse event.

        Raises ValueError on invalid signature.
        """
        ...
