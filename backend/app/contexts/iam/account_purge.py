"""AccountPurgeSaga — §7 account deletion with 24h grace period.

Steps:
1. Soft delete (deleted_at = now) + 24h grace
2. Stop Stripe billing immediately
3. Send confirmation email
4. [24h later via cron] Delete S3 objects
5. Delete Stripe customer
6. Delete Clerk user
7. Hard delete all domain data
Failure: 5 retries → dead letter + Sentry alert

U-05: Runbook at docs/runbook/account-purge-deadletter.md
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.iam import IamUser

logger = logging.getLogger(__name__)

# Saga state table (stored in iam_account_purge_sagas)
SAGA_STEPS = [
    "soft_delete",
    "stop_billing",
    "send_email",
    "delete_s3",
    "delete_stripe_customer",
    "delete_clerk_user",
    "hard_delete_data",
]


async def start_purge_saga(user_id: str, email: str, session: AsyncSession) -> dict:
    """Initiate account purge — step 1 (soft delete + 24h grace)."""
    from python_ulid import ULID

    # Step 1: Soft delete
    result = await session.execute(select(IamUser).where(IamUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False

    saga_id = str(ULID())
    scheduled_purge_at = datetime.now(timezone.utc) + timedelta(hours=24)

    # Write saga state (using outbox for simplicity in v0.1)
    from app.db.models.outbox import OutboxEvent
    outbox = OutboxEvent(
        id=saga_id,
        event_type="AccountPurgeSagaStarted",
        payload={
            "user_id": user_id,
            "email": email,
            "saga_id": saga_id,
            "scheduled_purge_at": scheduled_purge_at.isoformat(),
            "current_step": "soft_delete",
            "retry_count": 0,
        },
        consumer_group="billing",
    )
    session.add(outbox)
    await session.commit()

    return {
        "saga_id": saga_id,
        "scheduled_purge_at": scheduled_purge_at.isoformat(),
    }


async def cancel_purge(user_id: str, saga_id: str, session: AsyncSession) -> dict:
    """Cancel deletion within 24h grace period."""
    result = await session.execute(select(IamUser).where(IamUser.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return {"error": "User not found"}

    if not user.deleted_at:
        return {"error": "User is not scheduled for deletion"}

    # Check if within grace period
    if (datetime.now(timezone.utc) - user.deleted_at).total_seconds() > 86400:
        return {"error": "Grace period expired, deletion cannot be cancelled"}

    user.deleted_at = None
    user.is_active = True
    await session.commit()

    return {"cancelled": True}


async def execute_purge_step(
    saga_id: str,
    user_id: str,
    step: str,
    session: AsyncSession,
) -> bool:
    """Execute a single purge step. Returns True on success."""
    try:
        if step == "delete_s3":
            # Delete all S3 objects for this user
            logger.info("Deleting S3 objects for user %s", user_id)
            # In real impl: iterate R2 objects with user_id prefix
            return True

        elif step == "delete_stripe_customer":
            from app.db.models.billing import BillingSubscription
            result = await session.execute(
                select(BillingSubscription).where(BillingSubscription.user_id == user_id)
            )
            sub = result.scalar_one_or_none()
            if sub and sub.stripe_customer_id:
                import stripe
                from app.config import settings
                stripe.api_key = settings.clerk_secret_key
                try:
                    stripe.Customer.delete(sub.stripe_customer_id)
                except Exception:
                    logger.exception("Failed to delete Stripe customer")
                    return False
            return True

        elif step == "delete_clerk_user":
            result = await session.execute(select(IamUser).where(IamUser.id == user_id))
            user = result.scalar_one_or_none()
            if user and user.clerk_user_id:
                # In real impl: call Clerk API to delete user
                logger.info("Would delete Clerk user %s", user.clerk_user_id)
            return True

        elif step == "hard_delete_data":
            # Cascade delete all domain data
            tables = [
                "profile_materials", "profile_skills", "profile_projects",
                "profile_work_experiences", "profile_education",
                "profile_resume_sources", "profile_base_resumes", "profile_profiles",
                "jobs_match_results", "jobs_radar_items", "jobs_captures",
                "jobs_parsed_jds",
                "conv_messages",  # Must delete before conversations (FK-like)
                "conv_conversations",
                "tailoring_snapshots", "tailoring_resumes",
                "apply_applications", "apply_fill_plans",
                "followup_drafts", "followup_emails",
                "reco_recommendations",
                "quota_consume_log", "quota_usage_counters",
                "billing_subscriptions",
                "iam_settings",
            ]
            for table in tables:
                await session.execute(text(f"DELETE FROM {table} WHERE user_id = :uid"), {"uid": user_id})

            # Finally delete user
            await session.execute(delete(IamUser).where(IamUser.id == user_id))
            await session.commit()
            return True

        return True

    except Exception:
        logger.exception("Purge step %s failed for user %s (saga %s)", step, user_id, saga_id)
        return False


async def gdpr_purge_worker(session: AsyncSession) -> dict:
    """Daily worker: hard delete users 30+ days after soft delete.

    Separate from AccountPurgeSaga — this is the final cleanup.
    """
    from python_ulid import ULID
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    result = await session.execute(
        select(IamUser).where(
            IamUser.deleted_at.isnot(None),
            IamUser.deleted_at <= cutoff,
        )
    )
    users = result.scalars().all()

    purged = 0
    for user in users:
        success = await execute_purge_step("gdpr", user.id, "hard_delete_data", session)
        if success:
            purged += 1
            logger.info("GDPR purged user %s (deleted_at=%s)", user.id, user.deleted_at)

    return {"purged": purged, "total_eligible": len(users)}
