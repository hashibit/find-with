"""Tier × State test matrix — 14 cells for orthogonal coverage.

Every I-* integration test should use @pytest.mark.tiers(...) to auto-expand
across relevant tier/state combinations.
"""

import enum
import pytest
from ulid import ULID


class Tier(str, enum.Enum):
    FREE = "FREE"
    PRO = "PRO"
    PRO_PLUS = "PRO_PLUS"


class SubscriptionState(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    PAST_DUE = "PAST_DUE"
    GRACE = "GRACE"
    CANCELED = "CANCELED"
    PENDING_UPGRADE = "PENDING_UPGRADE"


TIER_STATE_MATRIX = [
    # FREE users have no subscription state, but have quota dimension
    (Tier.FREE, None, "quota_unused"),
    (Tier.FREE, None, "quota_partial"),
    (Tier.FREE, None, "quota_exhausted"),
    # PRO full state machine
    (Tier.PRO, SubscriptionState.ACTIVE, None),
    (Tier.PRO, SubscriptionState.PAUSED, None),
    (Tier.PRO, SubscriptionState.PAST_DUE, None),
    (Tier.PRO, SubscriptionState.GRACE, None),
    (Tier.PRO, SubscriptionState.CANCELED, None),
    # PRO_PLUS full state machine
    (Tier.PRO_PLUS, SubscriptionState.ACTIVE, None),
    (Tier.PRO_PLUS, SubscriptionState.PAUSED, None),
    (Tier.PRO_PLUS, SubscriptionState.PAST_DUE, None),
    (Tier.PRO_PLUS, SubscriptionState.GRACE, None),
    (Tier.PRO_PLUS, SubscriptionState.CANCELED, None),
    # Edge: FREE -> PRO upgrade in progress (Stripe charged, webhook not arrived)
    (Tier.FREE, SubscriptionState.PENDING_UPGRADE, None),
]


def _cell_id(param):
    tier, state, quota_sub = param
    if state:
        return f"{tier.value}-{state.value}"
    return f"{tier.value}-{quota_sub or 'NA'}"


@pytest.fixture(params=TIER_STATE_MATRIX, ids=_cell_id)
async def user_with_tier(request, db):
    """Create a test user with the given tier/state/quota combination.

    Yields (user_id, tier, state, quota_sub) tuple.
    """
    tier, state, quota_sub = request.param
    user_id = str(ULID())

    # Create IAM user
    from app.db.models.iam import IamUser, IamSettings
    user = IamUser(
        id=user_id,
        clerk_user_id=f"clerk_{user_id}",
        email=f"{user_id}@test.findwith.com",
        full_name="Test User",
    )
    db.add(user)

    settings = IamSettings(
        user_id=user_id,
        density="BALANCED",
    )
    db.add(settings)

    # Create billing subscription if state is set.
    # PENDING_UPGRADE: Stripe has already charged (tier=PRO in DB) but the webhook
    # hasn't arrived yet, so effective_tier is computed at runtime by
    # IAMService.get_entitlements — not by this fixture. We just store the DB row.
    if state is not None:
        from app.db.models.billing import BillingSubscription
        from datetime import datetime, timezone, timedelta

        # For PENDING_UPGRADE, DB tier is PRO (Stripe charged) but product-side
        # hasn't flipped entitlements yet. For all others, tier matches the param.
        db_tier = "PRO" if state == SubscriptionState.PENDING_UPGRADE else tier.value

        sub = BillingSubscription(
            id=str(ULID()),
            user_id=user_id,
            tier=db_tier,
            state=state.value,
            stripe_customer_id=f"cus_{user_id[:10]}",
            stripe_subscription_id=f"sub_{user_id[:10]}",
            period_end=datetime.now(timezone.utc) + timedelta(days=30),
        )
        db.add(sub)

    # Set up quota for FREE users
    if tier == Tier.FREE:
        from app.db.models.quota import QuotaUsageCounter
        quota_map = {"quota_unused": 0, "quota_partial": 1, "quota_exhausted": 3}
        completed = quota_map.get(quota_sub, 0)
        counter = QuotaUsageCounter(
            user_id=user_id,
            tailoring_completed=completed,
            tailoring_limit=3,
        )
        db.add(counter)

    await db.commit()
    yield user_id, tier, state, quota_sub
