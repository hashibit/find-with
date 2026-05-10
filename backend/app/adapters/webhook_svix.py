"""Svix webhook verifier — production (Clerk webhooks)."""

from __future__ import annotations

import json

from svix.webhooks import Webhook, WebhookVerificationError

from app.ports.webhook_verifier import WebhookVerifier


class SvixWebhookVerifier(WebhookVerifier):
    def __init__(self, secret: str):
        self._wh = Webhook(secret)

    async def verify(self, payload: bytes, headers: dict[str, str]) -> dict:
        try:
            return self._wh.verify(payload, headers)
        except WebhookVerificationError as exc:
            raise ValueError(f"Webhook signature invalid: {exc}") from exc
