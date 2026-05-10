"""Port: incoming webhook signature verification (Clerk / generic).

Implementations:
  - SvixWebhookVerifier   (production — svix signature check)
  - NoopWebhookVerifier   (dev/test — parse JSON, skip signature)
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class WebhookVerifier(ABC):
    @abstractmethod
    async def verify(self, payload: bytes, headers: dict[str, str]) -> dict:
        """Verify signature and return parsed body.

        Raises ValueError on invalid signature.
        """
        ...
