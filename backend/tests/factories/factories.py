"""Factory Boy factories for test data generation."""

from datetime import datetime, timezone

import factory
from ulid import ULID


class ULIDFactory(factory.LazyFunction):
    def __init__(self):
        super().__init__(lambda: str(ULID()))


class IamUserFactory(factory.Factory):
    class Meta:
        model = dict

    id = factory.LazyFunction(lambda: str(ULID()))
    clerk_user_id = factory.LazyFunction(lambda: f"clerk_{ULID()}")
    email = factory.LazyAttribute(lambda o: f"{o.id[:8]}@test.findwith.com")
    full_name = factory.Faker("name")
    deleted_at = None
    is_active = True


class BillingSubscriptionFactory(factory.Factory):
    class Meta:
        model = dict

    id = factory.LazyFunction(lambda: str(ULID()))
    user_id = factory.LazyFunction(lambda: str(ULID()))
    tier = "PRO"
    state = "ACTIVE"
    stripe_customer_id = factory.LazyFunction(lambda: f"cus_{ULID()}")
    stripe_subscription_id = factory.LazyFunction(lambda: f"sub_{ULID()}")
    period_end = factory.LazyFunction(lambda: datetime.now(timezone.utc))
    paused_reason = None
    last_event_id = None
    last_event_at = None


class ProfileMaterialFactory(factory.Factory):
    class Meta:
        model = dict

    id = factory.LazyFunction(lambda: str(ULID()))
    user_id = factory.LazyFunction(lambda: str(ULID()))
    raw_text = b"test raw text"
    shining_text = "Demonstrated leadership in cross-functional project"
    rationale = "Shows ownership and initiative"
    tags = ["leadership", "initiative"]
    quant = {"value": "30%", "unit": "improvement", "context": "team velocity"}
    provenance_kind = "conversation"
    provenance_data = {"conversation_id": "conv_test", "turn": 5}
    status = "PROPOSED"


class JobCaptureFactory(factory.Factory):
    class Meta:
        model = dict

    id = factory.LazyFunction(lambda: str(ULID()))
    user_id = factory.LazyFunction(lambda: str(ULID()))
    source = "LINKEDIN"
    source_url = "https://www.linkedin.com/jobs/view/12345"
    source_job_id = "12345"
    captured_text = "Senior Software Engineer at Stripe..."
    meta = {"company": "Stripe", "title": "Senior Software Engineer"}


class RadarItemFactory(factory.Factory):
    class Meta:
        model = dict

    id = factory.LazyFunction(lambda: str(ULID()))
    user_id = factory.LazyFunction(lambda: str(ULID()))
    capture_id = factory.LazyFunction(lambda: str(ULID()))
    status = "BROWSED"


class ConversationFactory(factory.Factory):
    class Meta:
        model = dict

    id = factory.LazyFunction(lambda: str(ULID()))
    user_id = factory.LazyFunction(lambda: str(ULID()))
    kind = "ONBOARDING"
    effective_density = "BALANCED"
