"""Dependency injection — wire implementations based on environment.

All external service interfaces are resolved here. No `if dev` anywhere else.
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_session
from app.ports.auth import TokenVerifier
from app.ports.payment import PaymentGateway
from app.ports.webhook_verifier import WebhookVerifier
from app.ports.crypto import FieldCrypto


# --- Singletons (created once per process) ---

@lru_cache
def get_token_verifier() -> TokenVerifier:
    if settings.clerk_jwks_url:
        from app.adapters.auth_clerk import ClerkTokenVerifier
        return ClerkTokenVerifier(settings.clerk_jwks_url)
    from app.adapters.auth_dev import DevTokenVerifier
    return DevTokenVerifier()


@lru_cache
def get_payment_gateway() -> PaymentGateway:
    if settings.stripe_secret_key:
        from app.adapters.payment_stripe import StripePaymentGateway
        return StripePaymentGateway(settings.stripe_secret_key, settings.stripe_webhook_secret)
    from app.adapters.payment_stub import StubPaymentGateway
    return StubPaymentGateway()


@lru_cache
def get_clerk_webhook_verifier() -> WebhookVerifier:
    if settings.clerk_webhook_secret:
        from app.adapters.webhook_svix import SvixWebhookVerifier
        return SvixWebhookVerifier(settings.clerk_webhook_secret)
    from app.adapters.webhook_noop import NoopWebhookVerifier
    return NoopWebhookVerifier()


@lru_cache
def get_field_crypto() -> FieldCrypto:
    if settings.kek and settings.dek_ciphertext:
        from app.adapters.crypto_envelope import EnvelopeCrypto
        return EnvelopeCrypto(settings.kek, settings.dek_ciphertext)
    from app.adapters.crypto_ephemeral import EphemeralCrypto
    return EphemeralCrypto()


# --- FastAPI dependencies ---

async def get_current_user_id(
    request: Request,
    session: AsyncSession = Depends(get_session),
    verifier: TokenVerifier = Depends(get_token_verifier),
) -> str:
    """Extract and verify bearer token → return internal user_id."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header[7:]

    try:
        payload = await verifier.verify(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    from app.contexts.iam.service import IAMService
    svc = IAMService(session)
    user = await svc.get_user_by_clerk_id(payload.clerk_user_id)
    if not user:
        user = await svc.get_or_create_user(
            clerk_user_id=payload.clerk_user_id,
            email=payload.email,
        )
    return user.id
