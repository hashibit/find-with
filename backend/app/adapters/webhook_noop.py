"""Noop webhook verifier — dev/test, skips signature check."""

from __future__ import annotations

import json

from app.ports.webhook_verifier import WebhookVerifier


class NoopWebhookVerifier(WebhookVerifier):
    async def verify(self, payload: bytes, headers: dict[str, str]) -> dict:
        return json.loads(payload)
