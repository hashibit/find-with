"""L3 integration — AccountPurgeSaga grace period + hard-delete cascade.

PRD §10.1: 用户可以随时删除账号; PRD §11 "陪伴有终点".
Saga steps:
  start_purge_saga  → soft delete + 24h grace + outbox event
  cancel_purge      → restores within grace, errors after
  hard_delete_data  → cascades across all per-user tables
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text

pytestmark = pytest.mark.integration


async def _make_user(db, *, user_id: str = "u_purge_1", email: str = "p@x.com"):
    from app.db.models.iam import IamUser
    user = IamUser(
        id=user_id,
        clerk_user_id=f"clerk_{user_id}",
        email=email,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    return user


async def test_start_purge_soft_deletes_and_emits_saga_event(db):
    """start_purge_saga marks deleted_at + writes AccountPurgeSagaStarted outbox."""
    from app.contexts.iam.account_purge import start_purge_saga
    from app.db.models.iam import IamUser
    from app.db.models.outbox import OutboxEvent

    await _make_user(db, user_id="u_purge_1")

    out = await start_purge_saga("u_purge_1", "p@x.com", db)
    assert "saga_id" in out
    assert "scheduled_purge_at" in out

    db.expire_all()
    user = await db.scalar(select(IamUser).where(IamUser.id == "u_purge_1"))
    assert user.deleted_at is not None
    assert user.is_active is False

    outbox = await db.scalar(
        select(OutboxEvent).where(OutboxEvent.event_type == "AccountPurgeSagaStarted")
    )
    assert outbox is not None
    assert outbox.payload["user_id"] == "u_purge_1"
    assert outbox.payload["current_step"] == "soft_delete"
    assert outbox.consumer_group == "billing"


async def test_cancel_purge_within_grace_period_restores_user(db):
    """Cancelling within 24h restores deleted_at=None, is_active=True."""
    from app.contexts.iam.account_purge import start_purge_saga, cancel_purge
    from app.db.models.iam import IamUser

    await _make_user(db, user_id="u_purge_2", email="p2@x.com")
    out = await start_purge_saga("u_purge_2", "p2@x.com", db)

    cancel = await cancel_purge("u_purge_2", out["saga_id"], db)
    assert cancel == {"cancelled": True}

    db.expire_all()
    user = await db.scalar(select(IamUser).where(IamUser.id == "u_purge_2"))
    assert user.deleted_at is None
    assert user.is_active is True


async def test_cancel_purge_after_grace_period_rejected(db):
    """Past the 24h window, cancel must error and NOT reactivate the user."""
    from app.contexts.iam.account_purge import cancel_purge
    from app.db.models.iam import IamUser

    await _make_user(db, user_id="u_purge_3", email="p3@x.com")

    # Force deleted_at to >24h ago directly (bypassing the saga starter)
    user = await db.scalar(select(IamUser).where(IamUser.id == "u_purge_3"))
    user.deleted_at = datetime.now(timezone.utc) - timedelta(hours=25)
    user.is_active = False
    await db.commit()

    result = await cancel_purge("u_purge_3", "saga_x", db)
    assert "error" in result
    assert "Grace period expired" in result["error"]

    db.expire_all()
    after = await db.scalar(select(IamUser).where(IamUser.id == "u_purge_3"))
    # User remains soft-deleted (no accidental restoration)
    assert after.deleted_at is not None
    assert after.is_active is False


async def test_cancel_purge_user_not_scheduled_returns_error(db):
    """Live user (no deleted_at) can't be 'cancelled'."""
    from app.contexts.iam.account_purge import cancel_purge

    await _make_user(db, user_id="u_purge_4", email="p4@x.com")

    result = await cancel_purge("u_purge_4", "saga_irrelevant", db)
    assert "error" in result
    assert "not scheduled" in result["error"]


async def test_hard_delete_data_step_removes_user_row(db):
    """hard_delete_data step issues DELETE across all tables + removes IamUser."""
    from app.contexts.iam.account_purge import execute_purge_step
    from app.db.models.iam import IamUser

    await _make_user(db, user_id="u_purge_5", email="p5@x.com")

    ok = await execute_purge_step("saga_h", "u_purge_5", "hard_delete_data", db)
    assert ok is True

    db.expire_all()
    user = await db.scalar(select(IamUser).where(IamUser.id == "u_purge_5"))
    assert user is None


async def test_gdpr_worker_only_picks_users_older_than_30_days(db):
    """gdpr_purge_worker filters by deleted_at <= cutoff (30 days)."""
    from app.contexts.iam.account_purge import gdpr_purge_worker
    from app.db.models.iam import IamUser

    # User A: deleted 40 days ago → eligible
    await _make_user(db, user_id="u_gdpr_old", email="old@x.com")
    a = await db.scalar(select(IamUser).where(IamUser.id == "u_gdpr_old"))
    a.deleted_at = datetime.now(timezone.utc) - timedelta(days=40)
    a.is_active = False

    # User B: deleted 10 days ago → NOT eligible
    await _make_user(db, user_id="u_gdpr_recent", email="recent@x.com")
    b = await db.scalar(select(IamUser).where(IamUser.id == "u_gdpr_recent"))
    b.deleted_at = datetime.now(timezone.utc) - timedelta(days=10)
    b.is_active = False

    # User C: not deleted at all → NOT eligible
    await _make_user(db, user_id="u_gdpr_live", email="live@x.com")
    await db.commit()

    out = await gdpr_purge_worker(db)
    assert out["purged"] == 1
    assert out["total_eligible"] == 1

    db.expire_all()
    # Only the old user is gone
    assert (await db.scalar(select(IamUser).where(IamUser.id == "u_gdpr_old"))) is None
    assert (await db.scalar(select(IamUser).where(IamUser.id == "u_gdpr_recent"))) is not None
    assert (await db.scalar(select(IamUser).where(IamUser.id == "u_gdpr_live"))) is not None
