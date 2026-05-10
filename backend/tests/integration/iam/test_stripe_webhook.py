"""Stripe webhook integration tests — U-12 regression baseline.

These tests are the security regression baseline for U-12 (Stripe webhook
secret misconfiguration). Lines marked `# core assertion` MUST NOT be removed.

IMPORTANT: Stripe webhook endpoint is at /v1/billing/webhooks/stripe
(billing_router prefix = /v1/billing), NOT /v1/iam/webhooks/stripe.
"""

import json
import pytest

pytestmark = pytest.mark.integration


async def test_stripe_wrong_secret_returns_401_not_200(client, signed_stripe_event, sentry_mock):
    """U-12 core regression — wrong secret must return 401, never 200.

    This prevents the `except Exception` silent swallow regression.
    """
    payload, sig_header = signed_stripe_event(
        {"id": "evt_1", "object": "event", "type": "customer.subscription.updated",
         "data": {"object": {"id": "sub_x", "status": "canceled",
                             "metadata": {"user_id": "u1"},
                             "current_period_end": 1735689600}}},
        secret="whsec_WRONG",
    )
    r = await client.post(
        "/v1/billing/webhooks/stripe",
        content=payload,
        headers={"Stripe-Signature": sig_header},
    )
    assert r.status_code == 401  # core assertion (NOT 200!)


async def test_stripe_malformed_payload_returns_400(client):
    """Malformed JSON payload -> 400."""
    r = await client.post(
        "/v1/billing/webhooks/stripe",
        content=b"not-json{{{",
        headers={"Stripe-Signature": "t=123,v1=abc"},
    )
    assert r.status_code in (400, 401)  # core assertion


async def test_stripe_missing_signature_header(client, stripe_test_whsec):
    """No Stripe-Signature header -> 401."""
    r = await client.post(
        "/v1/billing/webhooks/stripe",
        content=json.dumps({"id": "evt_no_sig", "type": "test"}).encode(),
    )
    assert r.status_code == 401  # core assertion


async def test_stripe_api_key_uses_stripe_secret_not_clerk(monkeypatch):
    """U-12 fixture check — stripe.api_key must come from stripe_secret_key."""
    import stripe
    from app.config import settings

    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_stripe_correct")
    monkeypatch.setattr(settings, "clerk_secret_key", "sk_clerk_DIFFERENT")

    # Instantiate StripePaymentGateway — its __init__ sets stripe.api_key
    from app.adapters.payment_stripe import StripePaymentGateway

    StripePaymentGateway(
        secret_key=settings.stripe_secret_key,
        webhook_secret=settings.stripe_webhook_secret,
    )

    assert stripe.api_key == "sk_test_stripe_correct"  # core assertion


async def test_stripe_valid_signature_updates_billing(client, db, signed_stripe_event):
    """Valid Stripe event -> 200, billing subscription updated."""
    # Pre-create a subscription to update
    from app.db.models.billing import BillingSubscription
    from ulid import ULID

    sub = BillingSubscription(
        id=str(ULID()),
        user_id="u_stripe_test",
        tier="PRO",
        state="ACTIVE",
        stripe_customer_id="cus_test",
        stripe_subscription_id="sub_stripe_valid",
    )
    db.add(sub)
    await db.commit()

    payload, sig = signed_stripe_event({
        "id": "evt_valid_1",
        "object": "event",
        "type": "customer.subscription.updated",
        "created": 1735689600,
        "data": {
            "object": {
                "id": "sub_stripe_valid",
                "status": "canceled",
                "metadata": {"user_id": "u_stripe_test"},
                "current_period_end": 1735776000,
            }
        },
    })
    r = await client.post(
        "/v1/billing/webhooks/stripe",
        content=payload,
        headers={"Stripe-Signature": sig},
    )
    assert r.status_code == 200  # core assertion

    from sqlalchemy import select
    db.expire_all()
    row = await db.scalar(
        select(BillingSubscription).where(
            BillingSubscription.stripe_subscription_id == "sub_stripe_valid"
        )
    )
    assert row.state == "CANCELED"  # core assertion
    assert row.last_event_id == "evt_valid_1"  # core assertion (U-04 tie-breaker)


async def test_stripe_duplicate_event_deduped(client, db, signed_stripe_event):
    """Same Event.id sent twice -> second returns deduped=True."""
    from app.db.models.billing import BillingSubscription
    from ulid import ULID

    sub = BillingSubscription(
        id=str(ULID()),
        user_id="u_dedup",
        tier="PRO",
        state="ACTIVE",
        stripe_customer_id="cus_dedup",
        stripe_subscription_id="sub_dedup",
    )
    db.add(sub)
    await db.commit()

    event = {
        "id": "evt_dedup_1",
        "object": "event",
        "type": "customer.subscription.updated",
        "created": 1735689600,
        "data": {
            "object": {
                "id": "sub_dedup",
                "status": "active",
                "metadata": {"user_id": "u_dedup"},
                "current_period_end": 1735776000,
            }
        },
    }

    payload1, sig1 = signed_stripe_event(event)
    r1 = await client.post("/v1/billing/webhooks/stripe", content=payload1, headers={"Stripe-Signature": sig1})
    assert r1.status_code == 200

    payload2, sig2 = signed_stripe_event(event)
    r2 = await client.post("/v1/billing/webhooks/stripe", content=payload2, headers={"Stripe-Signature": sig2})
    assert r2.status_code == 200
    assert r2.json().get("deduped") is True  # core assertion (idempotency)
