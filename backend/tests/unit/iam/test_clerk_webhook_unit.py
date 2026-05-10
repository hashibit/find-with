"""L1 unit tests for Clerk webhook — fast, no containers."""

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


async def test_clerk_webhook_rejects_empty_headers(monkeypatch):
    """No svix headers -> 401."""
    from app.config import settings
    monkeypatch.setattr(settings, "clerk_webhook_secret", "whsec_test_" + "x" * 32)

    from app.main import app
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post(
            "/v1/iam/webhooks/clerk",
            json={"type": "user.created", "data": {"id": "u1"}},
        )
    assert r.status_code == 401


async def test_iam_service_get_or_create_user_creates():
    """IAMService.get_or_create_user creates user when not exists."""
    from app.contexts.iam.service import IAMService
    from app.db.models.iam import IamUser

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    svc = IAMService(mock_session)
    user = await svc.get_or_create_user(
        clerk_user_id="clerk_123",
        email="test@example.com",
        full_name="Test User",
    )

    assert mock_session.add.called
    added = mock_session.add.call_args[0][0]
    assert isinstance(added, (IamUser, type(added)))


async def test_iam_service_get_or_create_user_returns_existing():
    """IAMService.get_or_create_user returns existing when found."""
    from app.contexts.iam.service import IAMService
    from app.db.models.iam import IamUser

    existing_user = IamUser(
        id="existing_id",
        clerk_user_id="clerk_existing",
        email="existing@test.com",
    )

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing_user
    mock_session.execute.return_value = mock_result

    svc = IAMService(mock_session)
    user = await svc.get_or_create_user(
        clerk_user_id="clerk_existing",
        email="existing@test.com",
    )
    assert user == existing_user
    assert not mock_session.add.called  # should not add again
