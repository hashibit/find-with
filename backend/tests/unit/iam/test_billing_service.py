"""L1 unit tests for BillingService — pause/resume + U-04 tie-breaker.

PRD §9.4: "用户接受 offer 后，订阅自动暂停，不取消" — pause must not cancel.
U-04: webhook tie-breaker prevents out-of-order events from clobbering newer state.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _sub(state="ACTIVE", **kw):
    """Build a BillingSubscription stand-in."""
    from app.db.models.billing import BillingSubscription
    s = BillingSubscription(
        id="01SUB",
        user_id=kw.get("user_id", "u1"),
        tier=kw.get("tier", "PRO"),
        state=state,
        stripe_customer_id="cus_x",
        stripe_subscription_id="sub_x",
    )
    for k, v in kw.items():
        setattr(s, k, v)
    return s


async def test_pause_sets_state_paused_with_reason_and_calls_gateway():
    """Accept-offer flow → state=PAUSED, paused_reason set, gateway invoked."""
    from app.contexts.iam.billing_service import BillingService

    session = AsyncMock()
    session.add = MagicMock()
    sub = _sub()

    gw = AsyncMock()
    svc = BillingService(session, gw)

    with patch.object(svc, "_get_subscription", new=AsyncMock(return_value=sub)):
        out = await svc.pause("u1", reason="OFFER_ACCEPTED")

    assert sub.state == "PAUSED"
    assert sub.paused_reason == "OFFER_ACCEPTED"
    gw.pause_subscription.assert_awaited_once_with("sub_x")
    assert out == {"state": "PAUSED"}


async def test_pause_emits_entitlements_changed_outbox_event():
    """Pause must emit EntitlementsChanged so downstream agents react."""
    from app.contexts.iam.billing_service import BillingService
    from app.db.models.outbox import OutboxEvent

    session = AsyncMock()
    added = []
    session.add = MagicMock(side_effect=lambda x: added.append(x))
    sub = _sub()
    gw = AsyncMock()
    svc = BillingService(session, gw)

    with patch.object(svc, "_get_subscription", new=AsyncMock(return_value=sub)):
        await svc.pause("u1", reason="OFFER_ACCEPTED")

    events = [x for x in added if isinstance(x, OutboxEvent)]
    assert len(events) == 1
    assert events[0].event_type == "EntitlementsChanged"
    assert events[0].consumer_group == "agent"
    assert events[0].payload["state"] == "PAUSED"
    assert events[0].payload["reason"] == "OFFER_ACCEPTED"


async def test_pause_no_subscription_returns_error_no_gateway_call():
    """No-op when user has no subscription; gateway must NOT be called."""
    from app.contexts.iam.billing_service import BillingService

    session = AsyncMock()
    gw = AsyncMock()
    svc = BillingService(session, gw)

    with patch.object(svc, "_get_subscription", new=AsyncMock(return_value=None)):
        out = await svc.pause("u1")

    assert "error" in out
    gw.pause_subscription.assert_not_awaited()


async def test_resume_clears_paused_reason():
    """Resume → state=ACTIVE, paused_reason=None, gateway resume called."""
    from app.contexts.iam.billing_service import BillingService

    sub = _sub(state="PAUSED", paused_reason="OFFER_ACCEPTED")
    session = AsyncMock()
    session.add = MagicMock()
    gw = AsyncMock()
    svc = BillingService(session, gw)

    with patch.object(svc, "_get_subscription", new=AsyncMock(return_value=sub)):
        out = await svc.resume("u1")

    assert sub.state == "ACTIVE"
    assert sub.paused_reason is None
    gw.resume_subscription.assert_awaited_once_with("sub_x")
    assert out == {"state": "ACTIVE"}


async def test_handle_webhook_rejects_bad_signature_with_401():
    """gateway.verify_webhook raising ValueError → HTTPException(401)."""
    from fastapi import HTTPException
    from app.contexts.iam.billing_service import BillingService

    session = AsyncMock()
    gw = AsyncMock()
    gw.verify_webhook.side_effect = ValueError("bad sig")
    svc = BillingService(session, gw)

    with pytest.raises(HTTPException) as exc:
        await svc.handle_webhook(b"x", "t=1,v1=bad")

    assert exc.value.status_code == 401


async def test_handle_webhook_dedupes_repeat_event_id():
    """Idempotency: second delivery of same event_id returns deduped=True."""
    from app.contexts.iam.billing_service import BillingService
    from app.ports.payment import WebhookEvent
    from app.db.models.idempotency import IdempotencyKey

    session = AsyncMock()
    gw = AsyncMock()
    gw.verify_webhook.return_value = WebhookEvent(
        event_id="evt_repeat",
        event_type="customer.subscription.updated",
        event_at=datetime.now(timezone.utc),
        user_id="u1",
        status="CANCELED",
    )

    existing_key = IdempotencyKey(key="evt_repeat", key_type="stripe_event")
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing_key
    session.execute.return_value = mock_result

    svc = BillingService(session, gw)
    out = await svc.handle_webhook(b"raw", "sig")

    assert out == {"processed": False, "deduped": True}


async def test_handle_webhook_deletion_event_marks_subscription_canceled():
    """customer.subscription.deleted → state=CANCELED regardless of payload status.

    Verifies verify_webhook's deletion branch is honored by handle_webhook.
    """
    from app.contexts.iam.billing_service import BillingService
    from app.ports.payment import WebhookEvent

    session = AsyncMock()
    session.add = MagicMock()
    gw = AsyncMock()
    now = datetime.now(timezone.utc)
    gw.verify_webhook.return_value = WebhookEvent(
        event_id="evt_del_1",
        event_type="customer.subscription.deleted",
        event_at=now,
        user_id="u1",
        status="CANCELED",
        period_end=now + timedelta(days=1),
    )

    # First execute: idempotency lookup → None. Subsequent calls return the sub.
    sub = _sub()
    idem_result = MagicMock()
    idem_result.scalar_one_or_none.return_value = None
    sub_result = MagicMock()
    sub_result.scalar_one_or_none.return_value = sub
    session.execute.side_effect = [idem_result, sub_result]

    svc = BillingService(session, gw)
    out = await svc.handle_webhook(b"raw", "sig")

    assert out == {"processed": True, "deduped": False}
    assert sub.state == "CANCELED"
    assert sub.last_event_id == "evt_del_1"


async def test_handle_webhook_older_event_does_not_overwrite_newer_state():
    """U-04 tie-breaker: a stale event with smaller event_id must not clobber.

    Reject rule (billing_service.handle_webhook):
      if db_sub.last_event_at >= event.event_at
         and db_sub.last_event_id >= event.event_id  → drop incoming.

    Setup: db row already processed 'evt_002' (newer). Incoming 'evt_001'
    arrives at the same timestamp and should be dropped, leaving CANCELED intact.
    """
    from app.contexts.iam.billing_service import BillingService
    from app.ports.payment import WebhookEvent

    session = AsyncMock()
    session.add = MagicMock()
    gw = AsyncMock()
    now = datetime.now(timezone.utc)

    gw.verify_webhook.return_value = WebhookEvent(
        event_id="evt_001",  # lexicographically smaller → stale
        event_type="customer.subscription.updated",
        event_at=now,
        user_id="u1",
        status="ACTIVE",  # would overwrite CANCELED if applied
    )

    sub = _sub(state="CANCELED")
    sub.last_event_id = "evt_002"  # already-applied newer id
    sub.last_event_at = now

    idem_result = MagicMock()
    idem_result.scalar_one_or_none.return_value = None
    sub_result = MagicMock()
    sub_result.scalar_one_or_none.return_value = sub
    session.execute.side_effect = [idem_result, sub_result]

    svc = BillingService(session, gw)
    out = await svc.handle_webhook(b"raw", "sig")

    assert out == {"processed": False, "deduped": False}
    assert sub.state == "CANCELED"  # NOT overwritten by stale event
    assert sub.last_event_id == "evt_002"
