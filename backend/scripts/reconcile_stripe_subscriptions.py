"""Stripe subscription reconciliation script.

Compares billing_subscriptions table against Stripe API to detect drift.
Runs weekly via APScheduler (Mon 02:00 UTC) in prod, or manually via CLI.

Usage (from project root):
    PYTHONPATH=backend uv run python -m backend.scripts.reconcile_stripe_subscriptions \\
        --output=/tmp
    # Add --no-dry-run to enable write-back (not yet implemented).
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass
class DriftRow:
    kind: str  # DB_STALE_ACTIVE, DB_MISSING, STRIPE_MISSING, STATUS_MISMATCH, PERIOD_MISMATCH
    stripe_sub_id: str
    db_status: str | None = None
    stripe_status: str | None = None
    db_period_end: str | None = None
    stripe_period_end: str | None = None
    user_id: str | None = None
    detail: str = ""


@dataclass
class ReconcileResult:
    drift_count: int = 0
    csv_path: Path | None = None
    drifts: list[DriftRow] = field(default_factory=list)


class ReconcileRunner:
    """Reconciliation engine — testable with injected Stripe data."""

    def __init__(
        self,
        db_session: AsyncSession,
        stripe_subscriptions: dict[str, dict] | None = None,
        dry_run: bool = True,
        out_dir: Path | None = None,
    ):
        self.db = db_session
        self.stripe_subs = stripe_subscriptions or {}
        self.dry_run = dry_run
        self.out_dir = out_dir or Path("/tmp")

    async def _fetch_stripe_subscriptions(self) -> dict[str, dict]:
        """Fetch all subscriptions from Stripe API. Override with constructor injection for tests."""
        if self.stripe_subs:
            return self.stripe_subs

        import stripe
        from app.config import settings
        stripe.api_key = settings.stripe_secret_key

        result = {}
        subs = stripe.Subscription.list(limit=100)
        for sub in subs.auto_paging_iter():
            result[sub.id] = {
                "id": sub.id,
                "status": sub.status,
                "current_period_end": sub.current_period_end,
            }
        return result

    async def _fetch_db_subscriptions(self) -> dict[str, dict]:
        """Fetch all subscriptions from billing_subscriptions table."""
        from app.db.models.billing import BillingSubscription

        result = await self.db.execute(
            select(BillingSubscription).where(
                BillingSubscription.stripe_subscription_id.isnot(None)
            )
        )
        rows = result.scalars().all()
        return {
            row.stripe_subscription_id: {
                "stripe_sub_id": row.stripe_subscription_id,
                "status": row.state.lower() if row.state else None,
                "period_end": row.period_end.isoformat() if row.period_end else None,
                "user_id": row.user_id,
            }
            for row in rows
        }

    async def run(self) -> ReconcileResult:
        """Execute reconciliation. Returns result with drift details.

        When dry_run=True (default), only reports drift via CSV + Sentry.
        When dry_run=False, would apply corrections — not yet implemented.
        """
        if not self.dry_run:
            raise NotImplementedError(
                "Write-back mode not implemented yet. Use --dry-run (default)."
            )

        stripe_subs = await self._fetch_stripe_subscriptions()
        db_subs = await self._fetch_db_subscriptions()
        drifts: list[DriftRow] = []

        all_sub_ids = set(stripe_subs.keys()) | set(db_subs.keys())

        for sub_id in all_sub_ids:
            in_stripe = stripe_subs.get(sub_id)
            in_db = db_subs.get(sub_id)

            if in_stripe and not in_db:
                drifts.append(DriftRow(
                    kind="DB_MISSING",
                    stripe_sub_id=sub_id,
                    stripe_status=in_stripe.get("status"),
                    detail="Stripe has subscription but DB does not",
                ))
            elif in_db and not in_stripe:
                drifts.append(DriftRow(
                    kind="STRIPE_MISSING",
                    stripe_sub_id=sub_id,
                    db_status=in_db.get("status"),
                    user_id=in_db.get("user_id"),
                    detail="DB has subscription but Stripe does not",
                ))
            elif in_stripe and in_db:
                stripe_status = in_stripe.get("status", "").lower()
                db_status = (in_db.get("status") or "").lower()

                # DB says active but Stripe says canceled
                if db_status == "active" and stripe_status == "canceled":
                    drifts.append(DriftRow(
                        kind="DB_STALE_ACTIVE",
                        stripe_sub_id=sub_id,
                        db_status=db_status,
                        stripe_status=stripe_status,
                        user_id=in_db.get("user_id"),
                        detail="DB active but Stripe canceled",
                    ))
                elif db_status != stripe_status:
                    drifts.append(DriftRow(
                        kind="STATUS_MISMATCH",
                        stripe_sub_id=sub_id,
                        db_status=db_status,
                        stripe_status=stripe_status,
                        user_id=in_db.get("user_id"),
                        detail=f"Status mismatch: DB={db_status}, Stripe={stripe_status}",
                    ))

        # Write CSV
        csv_path = self.out_dir / "drift.csv"
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "kind", "stripe_sub_id", "db_status", "stripe_status",
                "db_period_end", "stripe_period_end", "user_id", "detail",
            ])
            writer.writeheader()
            for d in drifts:
                writer.writerow(vars(d))

        # Sentry alert if drift > 0
        if drifts:
            try:
                import sentry_sdk
                sentry_sdk.capture_message(
                    f"Stripe reconciliation found {len(drifts)} drift(s)",
                    level="warning",
                    tags={"count": len(drifts)},
                )
            except Exception:
                logger.warning("Failed to send Sentry alert for drift")

        result = ReconcileResult(
            drift_count=len(drifts),
            csv_path=csv_path,
            drifts=drifts,
        )

        logger.info("Reconciliation complete: %d drift(s) found", len(drifts))
        return result


async def main():
    parser = argparse.ArgumentParser(description="Reconcile Stripe subscriptions")
    parser.add_argument("--no-dry-run", dest="dry_run", action="store_false", default=True,
                        help="Disable dry-run to enable write-back (not yet implemented)")
    parser.add_argument("--output", type=str, default="/tmp")
    parser.add_argument("--stripe-key", type=str, default=None)
    args = parser.parse_args()

    from app.db.session import async_session_factory
    async with async_session_factory() as session:
        runner = ReconcileRunner(
            db_session=session,
            dry_run=args.dry_run,
            out_dir=Path(args.output),
        )
        result = await runner.run()
        print(f"Drift count: {result.drift_count}")
        if result.csv_path:
            print(f"CSV: {result.csv_path}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
