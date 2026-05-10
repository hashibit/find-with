"""Clerk webhook integration tests — U-11 regression baseline.

These tests are the security regression baseline for U-11 (Clerk webhook
signature verification). Lines marked `# core assertion` MUST NOT be removed.
"""

import json
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock

import pytest
from svix.webhooks import Webhook

pytestmark = pytest.mark.integration


async def test_clerk_unsigned_rejected_no_db_write(client, db, db_table_snapshot):
    """U-11 Attack B — curl forged user.deleted must be 401, DB zero diff."""
    snap = await db_table_snapshot("iam_users")
    r = await client.post(
        "/v1/iam/webhooks/clerk",
        json={"type": "user.deleted", "data": {"id": "user_x"}},
    )
    assert r.status_code == 401  # core assertion
    assert await db_table_snapshot("iam_users") == snap  # core assertion (zero change)


async def test_clerk_missing_headers_rejected(client):
    """No svix-* headers at all -> 401."""
    r = await client.post(
        "/v1/iam/webhooks/clerk",
        content=json.dumps({"type": "user.created", "data": {"id": "u1"}}).encode(),
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 401  # core assertion


async def test_clerk_wrong_signature_rejected(client, svix_test_secret):
    """Tampered signature -> 401."""
    body = json.dumps({"type": "user.created", "data": {"id": "u1"}}).encode()
    r = await client.post(
        "/v1/iam/webhooks/clerk",
        content=body,
        headers={
            "svix-id": "msg_fake",
            "svix-timestamp": str(int(datetime.now(timezone.utc).timestamp())),
            "svix-signature": "v1,tampered_signature_value_here",
        },
    )
    assert r.status_code == 401  # core assertion


async def test_clerk_valid_signature_creates_user(client, db, signed_clerk_webhook):
    """Valid svix signature -> 200, user created in DB."""
    body, headers = signed_clerk_webhook(
        data={"id": "user_a", "email_addresses": [{"email_address": "a@test.com"}]},
        type_="user.created",
    )
    r = await client.post("/v1/iam/webhooks/clerk", content=body, headers=headers)
    assert r.status_code == 200  # core assertion

    from sqlalchemy import select
    from app.db.models.iam import IamUser
    user = await db.scalar(select(IamUser).where(IamUser.clerk_user_id == "user_a"))
    assert user is not None  # core assertion


async def test_clerk_valid_signature_deletes_user(client, db, signed_clerk_webhook):
    """Valid user.deleted -> soft delete."""
    # First create the user
    from app.db.models.iam import IamUser
    from ulid import ULID
    user = IamUser(
        id=str(ULID()),
        clerk_user_id="user_del",
        email="del@test.com",
    )
    db.add(user)
    await db.flush()

    body, headers = signed_clerk_webhook(
        data={"id": "user_del"},
        type_="user.deleted",
    )
    r = await client.post("/v1/iam/webhooks/clerk", content=body, headers=headers)
    assert r.status_code == 200

    from sqlalchemy import select
    refreshed = await db.scalar(select(IamUser).where(IamUser.clerk_user_id == "user_del"))
    assert refreshed.deleted_at is not None  # core assertion


async def test_clerk_timestamp_outside_window_rejected(client, svix_test_secret):
    """Payload signed 11 minutes ago -> rejected (svix default tolerance ~5min)."""
    body = json.dumps({"type": "user.created", "data": {"id": "u_old"}}).encode()
    old_ts = datetime.now(timezone.utc) - timedelta(minutes=11)

    wh = Webhook(svix_test_secret)
    msg_id = "msg_old_ts"
    sig = wh.sign(msg_id, old_ts, body)

    r = await client.post(
        "/v1/iam/webhooks/clerk",
        content=body,
        headers={
            "svix-id": msg_id,
            "svix-timestamp": str(int(old_ts.timestamp())),
            "svix-signature": sig,
        },
    )
    assert r.status_code == 401  # core assertion (replay prevention)


async def test_clerk_verify_called_before_event_dispatch(client, monkeypatch, signed_clerk_webhook):
    """Whitebox: signature verification MUST happen before body['type'] is read."""
    call_order = []

    original_verify = Webhook.verify
    def tracking_verify(self, payload, headers):
        call_order.append("verify")
        return original_verify(self, payload, headers)

    monkeypatch.setattr(Webhook, "verify", tracking_verify)

    from app.contexts.iam.service import IAMService
    original_get_or_create = IAMService.get_or_create_user
    async def tracking_dispatch(**kwargs):
        call_order.append("dispatch")
        return await original_get_or_create(IAMService.__new__(IAMService), **kwargs)

    monkeypatch.setattr(IAMService, "get_or_create_user", tracking_dispatch)

    body, headers = signed_clerk_webhook(
        data={"id": "u_order", "email_addresses": [{"email_address": "order@test.com"}]},
        type_="user.created",
    )
    await client.post("/v1/iam/webhooks/clerk", content=body, headers=headers)

    assert call_order[0] == "verify"  # core assertion (order must not be reversed)
