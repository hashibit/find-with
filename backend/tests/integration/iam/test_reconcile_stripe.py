"""Stripe reconciliation script tests — U-12 mandatory post-task.

Tests for backend/scripts/reconcile_stripe_subscriptions.py.
These verify that the reconciliation script correctly detects drift between
Stripe and the local billing_subscriptions table.
"""

import csv
import json
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration


async def test_reconcile_detects_db_stale_active(db, sentry_mock, tmp_path):
    """DB shows ACTIVE but Stripe shows canceled -> DB_STALE_ACTIVE drift."""
    from app.db.models.billing import BillingSubscription
    from ulid import ULID

    sub = BillingSubscription(
        id=str(ULID()),
        user_id="u_stale",
        tier="PRO",
        state="ACTIVE",  # DB says active
        stripe_customer_id="cus_stale",
        stripe_subscription_id="sub_stale",
    )
    db.add(sub)
    await db.commit()

    # Mock Stripe API to return canceled
    from backend.scripts.reconcile_stripe_subscriptions import ReconcileRunner

    stripe_data = {
        "sub_stale": {
            "id": "sub_stale",
            "status": "canceled",
            "current_period_end": 1735776000,
        }
    }

    runner = ReconcileRunner(
        db_session=db,
        stripe_subscriptions=stripe_data,
        dry_run=True,
        out_dir=tmp_path,
    )
    result = await runner.run()

    # Verify drift detected
    assert result.drift_count > 0  # core assertion

    csv_path = tmp_path / "drift.csv"
    assert csv_path.exists()

    with open(csv_path) as f:
        rows = list(csv.DictReader(f))
    assert any(
        r["kind"] == "DB_STALE_ACTIVE" and r["stripe_sub_id"] == "sub_stale"
        for r in rows
    )  # core assertion


async def test_reconcile_detects_db_missing(db, tmp_path):
    """Stripe has subscription but DB doesn't -> DB_MISSING drift."""
    from backend.scripts.reconcile_stripe_subscriptions import ReconcileRunner

    stripe_data = {
        "sub_orphan": {
            "id": "sub_orphan",
            "status": "active",
            "current_period_end": 1735776000,
        }
    }

    runner = ReconcileRunner(
        db_session=db,
        stripe_subscriptions=stripe_data,
        dry_run=True,
        out_dir=tmp_path,
    )
    result = await runner.run()

    csv_path = tmp_path / "drift.csv"
    with open(csv_path) as f:
        rows = list(csv.DictReader(f))
    assert any(r["kind"] == "DB_MISSING" for r in rows)  # core assertion


async def test_reconcile_no_drift_clean(db, tmp_path):
    """Stripe and DB agree -> zero drift."""
    from app.db.models.billing import BillingSubscription
    from ulid import ULID

    sub = BillingSubscription(
        id=str(ULID()),
        user_id="u_clean",
        tier="PRO",
        state="ACTIVE",
        stripe_customer_id="cus_clean",
        stripe_subscription_id="sub_clean",
    )
    db.add(sub)
    await db.commit()

    from backend.scripts.reconcile_stripe_subscriptions import ReconcileRunner

    stripe_data = {
        "sub_clean": {
            "id": "sub_clean",
            "status": "active",
            "current_period_end": 1735776000,
        }
    }

    runner = ReconcileRunner(
        db_session=db,
        stripe_subscriptions=stripe_data,
        dry_run=True,
        out_dir=tmp_path,
    )
    result = await runner.run()
    assert result.drift_count == 0


async def test_reconcile_dry_run_no_writes(db, tmp_path):
    """Dry run must NOT execute any UPDATE statements."""
    from app.db.models.billing import BillingSubscription
    from ulid import ULID

    sub = BillingSubscription(
        id=str(ULID()),
        user_id="u_dryrun",
        tier="PRO",
        state="ACTIVE",
        stripe_customer_id="cus_dryrun",
        stripe_subscription_id="sub_dryrun",
    )
    db.add(sub)
    await db.commit()

    from backend.scripts.reconcile_stripe_subscriptions import ReconcileRunner

    stripe_data = {
        "sub_dryrun": {
            "id": "sub_dryrun",
            "status": "canceled",
            "current_period_end": 1735776000,
        }
    }

    runner = ReconcileRunner(
        db_session=db,
        stripe_subscriptions=stripe_data,
        dry_run=True,
        out_dir=tmp_path,
    )
    await runner.run()

    # Verify DB was NOT updated
    from sqlalchemy import select
    row = await db.scalar(
        select(BillingSubscription).where(
            BillingSubscription.stripe_subscription_id == "sub_dryrun"
        )
    )
    assert row.state == "ACTIVE"  # core assertion (not mutated by dry run)


async def test_reconcile_non_dry_run_raises_not_implemented(db, tmp_path):
    """Non-dry-run mode is not yet implemented — must raise explicitly."""
    from backend.scripts.reconcile_stripe_subscriptions import ReconcileRunner

    runner = ReconcileRunner(
        db_session=db,
        stripe_subscriptions={"sub_x": {"id": "sub_x", "status": "active"}},
        dry_run=False,
        out_dir=tmp_path,
    )
    with pytest.raises(NotImplementedError, match="Write-back mode not implemented"):
        await runner.run()
