"""All SQLAlchemy models — imported here for Alembic autogenerate."""

from app.db.models.iam import IamUser, IamSettings
from app.db.models.billing import BillingSubscription
from app.db.models.quota import QuotaUsageCounter, QuotaConsumeLog
from app.db.models.profile import (
    ProfileResumeSource, ProfileProfile, ProfileEducation,
    ProfileWorkExperience, ProfileProject, ProfileSkill,
    ProfileMaterial, ProfileBaseResume,
)
from app.db.models.jobs import (
    JobCapture, JobParsedJd, JobCompanyBrief,
    JobMatchResult, JobRadarItem,
)
from app.db.models.conversation import ConvConversation, ConvMessage
from app.db.models.tailoring import TailoringResume, TailoringSnapshot
from app.db.models.apply import ApplyFillPlan, ApplyApplication
from app.db.models.followup import FollowupEmail, FollowupDraft
from app.db.models.recommendation import RecoRecommendation
from app.db.models.telemetry import TelemetryEvent
from app.db.models.outbox import OutboxEvent
from app.db.models.idempotency import IdempotencyKey

__all__ = [
    "IamUser", "IamSettings",
    "BillingSubscription",
    "QuotaUsageCounter", "QuotaConsumeLog",
    "ProfileResumeSource", "ProfileProfile", "ProfileEducation",
    "ProfileWorkExperience", "ProfileProject", "ProfileSkill",
    "ProfileMaterial", "ProfileBaseResume",
    "JobCapture", "JobParsedJd", "JobCompanyBrief",
    "JobMatchResult", "JobRadarItem",
    "ConvConversation", "ConvMessage",
    "TailoringResume", "TailoringSnapshot",
    "ApplyFillPlan", "ApplyApplication",
    "FollowupEmail", "FollowupDraft",
    "RecoRecommendation",
    "TelemetryEvent",
    "OutboxEvent",
    "IdempotencyKey",
]
