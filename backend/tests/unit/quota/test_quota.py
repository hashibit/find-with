"""L1 unit tests for quota — idempotency and limits."""

from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

import pytest


async def test_quota_check_free_user_allowed():
    """FREE user with 0/3 used -> allowed."""
    from app.contexts.quota.service import QuotaService
    from app.db.models.quota import QuotaUsageCounter

    counter = QuotaUsageCounter(
        user_id="u_free",
        tailoring_completed=0,
        tailoring_limit=3,
    )

    mock_session = AsyncMock()
    # Mock entitlements
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = counter
    mock_session.execute.return_value = mock_result

    svc = QuotaService(mock_session)

    with patch.object(svc, '_get_entitlements', return_value={"effective_tier": "FREE"}):
        result = await svc.check("u_free")

    assert result["allowed"] is True
    assert result["remaining"] == 3


async def test_quota_check_free_user_exhausted():
    """FREE user with 3/3 used -> not allowed."""
    from app.contexts.quota.service import QuotaService
    from app.db.models.quota import QuotaUsageCounter

    counter = QuotaUsageCounter(
        user_id="u_exhausted",
        tailoring_completed=3,
        tailoring_limit=3,
    )

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = counter
    mock_session.execute.return_value = mock_result

    svc = QuotaService(mock_session)

    with patch.object(svc, '_get_entitlements', return_value={"effective_tier": "FREE"}):
        result = await svc.check("u_exhausted")

    assert result["allowed"] is False
    assert result["remaining"] == 0


async def test_quota_check_pro_user_unlimited():
    """PRO user -> always allowed, remaining=None."""
    from app.contexts.quota.service import QuotaService

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    svc = QuotaService(mock_session)

    with patch.object(svc, '_get_entitlements', return_value={"effective_tier": "PRO"}):
        result = await svc.check("u_pro")

    assert result["allowed"] is True
    assert result["remaining"] is None
