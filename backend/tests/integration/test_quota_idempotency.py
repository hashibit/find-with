"""L3 integration — QuotaService.consume_on_export idempotency.

The UNIQUE constraint on QuotaConsumeLog.tailored_resume_id is the database
guarantee that backs PRD §9.2 "3 个岗位 = 完整走完流程一次": two PDF exports
of the same tailored resume must NOT double-charge against the FREE quota.

Pure model-tests can assert the constraint exists; this test exercises the
service flow end-to-end with the real Postgres testcontainer.
"""

import pytest

pytestmark = pytest.mark.integration


async def test_consume_on_export_is_idempotent_per_tailored_resume(db):
    """Second consume_on_export with the same tailored_resume_id is a no-op."""
    from app.contexts.quota.service import QuotaService
    from app.db.models.quota import QuotaUsageCounter, QuotaConsumeLog
    from sqlalchemy import select
    from unittest.mock import patch, AsyncMock

    svc = QuotaService(db)

    with patch.object(
        svc, "_get_entitlements",
        new=AsyncMock(return_value={"effective_tier": "FREE"}),
    ):
        # First export → consumed
        ok1 = await svc.consume_on_export("u_quota_1", "tr_a")
        assert ok1 is True

        # Second export, same tailored_resume_id → reports success but no double-charge
        ok2 = await svc.consume_on_export("u_quota_1", "tr_a")
        assert ok2 is True

    # Counter must show exactly 1 consumption
    counter = await db.scalar(
        select(QuotaUsageCounter).where(QuotaUsageCounter.user_id == "u_quota_1")
    )
    assert counter.tailoring_completed == 1

    # Exactly one ConsumeLog row exists
    logs = (await db.execute(
        select(QuotaConsumeLog).where(QuotaConsumeLog.user_id == "u_quota_1")
    )).scalars().all()
    assert len(logs) == 1
    assert logs[0].tailored_resume_id == "tr_a"


async def test_consume_on_export_distinct_resumes_each_charge(db):
    """Different tailored_resume_id values consume separate quota units."""
    from app.contexts.quota.service import QuotaService
    from app.db.models.quota import QuotaUsageCounter
    from sqlalchemy import select
    from unittest.mock import patch, AsyncMock

    svc = QuotaService(db)

    with patch.object(
        svc, "_get_entitlements",
        new=AsyncMock(return_value={"effective_tier": "FREE"}),
    ):
        for rid in ("tr_a", "tr_b", "tr_c"):
            assert await svc.consume_on_export("u_quota_2", rid) is True

    counter = await db.scalar(
        select(QuotaUsageCounter).where(QuotaUsageCounter.user_id == "u_quota_2")
    )
    assert counter.tailoring_completed == 3


async def test_consume_on_export_free_user_blocked_after_limit(db):
    """FREE user hitting 3/3 → next consume returns False, counter untouched."""
    from app.contexts.quota.service import QuotaService
    from app.db.models.quota import QuotaUsageCounter
    from sqlalchemy import select
    from unittest.mock import patch, AsyncMock

    # Pre-set counter to 3/3
    counter = QuotaUsageCounter(
        user_id="u_quota_full",
        tailoring_completed=3,
        tailoring_limit=3,
    )
    db.add(counter)
    await db.commit()

    svc = QuotaService(db)
    with patch.object(
        svc, "_get_entitlements",
        new=AsyncMock(return_value={"effective_tier": "FREE"}),
    ):
        ok = await svc.consume_on_export("u_quota_full", "tr_overflow")

    assert ok is False
    # Verify counter not bumped
    db.expire_all()
    refreshed = await db.scalar(
        select(QuotaUsageCounter).where(QuotaUsageCounter.user_id == "u_quota_full")
    )
    assert refreshed.tailoring_completed == 3


async def test_consume_on_export_pro_user_bypasses_limit(db):
    """PRO tier ignores the FREE 3-item cap even after 'overflow'."""
    from app.contexts.quota.service import QuotaService
    from app.db.models.quota import QuotaUsageCounter
    from sqlalchemy import select
    from unittest.mock import patch, AsyncMock

    counter = QuotaUsageCounter(
        user_id="u_quota_pro",
        tailoring_completed=3,
        tailoring_limit=3,
    )
    db.add(counter)
    await db.commit()

    svc = QuotaService(db)
    with patch.object(
        svc, "_get_entitlements",
        new=AsyncMock(return_value={"effective_tier": "PRO"}),
    ):
        ok = await svc.consume_on_export("u_quota_pro", "tr_pro_1")

    assert ok is True
    db.expire_all()
    refreshed = await db.scalar(
        select(QuotaUsageCounter).where(QuotaUsageCounter.user_id == "u_quota_pro")
    )
    assert refreshed.tailoring_completed == 4
