"""Profile domain models."""

from datetime import datetime
from sqlalchemy import String, DateTime, func, Text, LargeBinary, Integer, Boolean, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ULIDMixin, AuditMixin

try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    Vector = None  # type: ignore


class ProfileResumeSource(Base, ULIDMixin, AuditMixin):
    __tablename__ = "profile_resume_sources"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), nullable=False)
    blob_uri: Mapped[str] = mapped_column(Text, nullable=False)
    parse_status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)
    parse_error: Mapped[str | None] = mapped_column(Text)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProfileProfile(Base, AuditMixin):
    __tablename__ = "profile_profiles"

    user_id: Mapped[str] = mapped_column(String(26), primary_key=True)
    basic_info: Mapped[dict | None] = mapped_column(JSONB)  # BasicInfo fields
    certifications: Mapped[list | None] = mapped_column(JSONB)
    last_resume_uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    etag: Mapped[str | None] = mapped_column(String(64))


class ProfileEducation(Base, ULIDMixin):
    __tablename__ = "profile_education"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    school: Mapped[str] = mapped_column(String(255), nullable=False)
    degree: Mapped[str | None] = mapped_column(String(100))
    major: Mapped[str | None] = mapped_column(String(100))
    start: Mapped[str | None] = mapped_column(String(7))  # YYYY-MM
    end: Mapped[str | None] = mapped_column(String(7))
    gpa: Mapped[str | None] = mapped_column(String(10))
    highlights: Mapped[list | None] = mapped_column(JSONB)


class ProfileWorkExperience(Base, ULIDMixin):
    __tablename__ = "profile_work_experiences"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255))
    start: Mapped[str | None] = mapped_column(String(7))
    end: Mapped[str | None] = mapped_column(String(7))
    bullets: Mapped[list | None] = mapped_column(JSONB)
    linked_material_ids: Mapped[list | None] = mapped_column(JSONB)


class ProfileProject(Base, ULIDMixin):
    __tablename__ = "profile_projects"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    start: Mapped[str | None] = mapped_column(String(7))
    end: Mapped[str | None] = mapped_column(String(7))
    linked_material_ids: Mapped[list | None] = mapped_column(JSONB)


class ProfileSkill(Base, ULIDMixin):
    __tablename__ = "profile_skills"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # HARD/SOFT/TOOL


class ProfileMaterial(Base, ULIDMixin, AuditMixin):
    __tablename__ = "profile_materials"
    __table_args__ = (
        CheckConstraint("provenance_kind IS NOT NULL", name="ck_material_provenance_required"),
    )

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    raw_text: Mapped[bytes | None] = mapped_column(LargeBinary)  # ENCRYPTED §12.1
    shining_text: Mapped[str | None] = mapped_column(Text)
    rationale: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list | None] = mapped_column(JSONB)
    quant: Mapped[dict | None] = mapped_column(JSONB)  # Quantification
    provenance_kind: Mapped[str] = mapped_column(String(20), nullable=False)  # conversation/resume/manual
    provenance_data: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="PROPOSED", nullable=False)
    linked_experience_id: Mapped[str | None] = mapped_column(String(26))
    embedding = mapped_column(Vector(1536), nullable=True) if Vector else mapped_column(JSONB, nullable=True)


class ProfileBaseResume(Base, ULIDMixin, AuditMixin):
    __tablename__ = "profile_base_resumes"

    user_id: Mapped[str] = mapped_column(String(26), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), default="Default", nullable=False)
    selected_material_ids: Mapped[list | None] = mapped_column(JSONB)
    is_default: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
