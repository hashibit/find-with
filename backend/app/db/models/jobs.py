"""Jobs domain models."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Text, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ULIDMixin, AuditMixin

try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    Vector = None  # type: ignore


class JobCapture(Base, ULIDMixin, AuditMixin):
    __tablename__ = "jobs_captures"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_job_id: Mapped[str | None] = mapped_column(String(100))
    captured_html: Mapped[str | None] = mapped_column(Text)
    captured_text: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict | None] = mapped_column(JSONB)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class JobParsedJd(Base, ULIDMixin):
    __tablename__ = "jobs_parsed_jds"

    capture_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255))
    company: Mapped[str | None] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(255))
    hard_skills: Mapped[list | None] = mapped_column(JSONB)
    soft_skills: Mapped[list | None] = mapped_column(JSONB)
    experience: Mapped[dict | None] = mapped_column(JSONB)
    education_required: Mapped[dict | None] = mapped_column(JSONB)
    hidden_signals: Mapped[list | None] = mapped_column(JSONB)
    nice_to_have: Mapped[list | None] = mapped_column(JSONB)
    buzzword_translation: Mapped[str | None] = mapped_column(Text)
    parsed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    jd_embedding = mapped_column(Vector(1536), nullable=True) if Vector else mapped_column(JSONB, nullable=True)


class JobCompanyBrief(Base, ULIDMixin):
    __tablename__ = "jobs_company_briefs"

    company: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    what_they_do: Mapped[str | None] = mapped_column(Text)
    size_stage: Mapped[str | None] = mapped_column(String(100))
    recent_news: Mapped[list | None] = mapped_column(JSONB)
    risks: Mapped[dict | None] = mapped_column(JSONB)
    glassdoor_rating: Mapped[float | None] = mapped_column(Float)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ttl_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class JobMatchResult(Base, ULIDMixin):
    __tablename__ = "jobs_match_results"

    parsed_jd_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    surface_score: Mapped[float | None] = mapped_column(Float)
    deep_score: Mapped[float | None] = mapped_column(Float)
    gaps: Mapped[list | None] = mapped_column(JSONB)
    hits_surface: Mapped[list | None] = mapped_column(JSONB)
    hits_deep: Mapped[list | None] = mapped_column(JSONB)
    overall_advice: Mapped[str | None] = mapped_column(String(50))
    advice_rationale: Mapped[str | None] = mapped_column(Text)


class JobRadarItem(Base, ULIDMixin, AuditMixin):
    __tablename__ = "jobs_radar_items"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    capture_id: Mapped[str | None] = mapped_column(String(26))
    parsed_jd_id: Mapped[str | None] = mapped_column(String(26))
    match_id: Mapped[str | None] = mapped_column(String(26))
    resume_snapshot_id: Mapped[str | None] = mapped_column(String(26))
    status: Mapped[str] = mapped_column(String(30), default="BROWSED", nullable=False)
    last_status_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user_decision_note: Mapped[str | None] = mapped_column(Text)
