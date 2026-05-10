"""ProfileService — resume upload, parse status, profile CRUD, materials, base resumes, GDPR export."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.profile import (
    ProfileResumeSource,
    ProfileProfile,
    ProfileEducation,
    ProfileWorkExperience,
    ProfileProject,
    ProfileSkill,
    ProfileMaterial,
    ProfileBaseResume,
)

logger = logging.getLogger(__name__)


class ETagMismatch(Exception):
    pass


class NotFound(Exception):
    pass


class Forbidden(Exception):
    pass


class ProfileService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------
    # Resume upload & parse status
    # ------------------------------------------------------------------

    async def upload_resume(
        self,
        user_id: str,
        filename: str,
        content_type: str,
        data: bytes,
    ) -> ProfileResumeSource:
        """Upload resume to S3 and create a ResumeSource record, then enqueue parse_resume."""
        from ulid import ULID
        import aioboto3
        from app.config import settings

        resume_id = str(ULID())
        blob_key = f"resumes/{user_id}/{resume_id}/{filename}"

        # Upload to S3
        session_boto = aioboto3.Session()
        async with session_boto.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        ) as s3:
            await s3.put_object(
                Bucket=settings.s3_bucket,
                Key=blob_key,
                Body=data,
                ContentType=content_type,
            )

        blob_uri = f"s3://{settings.s3_bucket}/{blob_key}"

        record = ProfileResumeSource(
            id=resume_id,
            user_id=user_id,
            filename=filename,
            content_type=content_type,
            blob_uri=blob_uri,
            parse_status="PENDING",
        )
        self.session.add(record)
        await self.session.commit()

        # Enqueue parse job
        from app.db.redis import redis_pool
        from arq import create_pool
        from app.worker.settings import parse_redis_url
        from app.config import settings as cfg

        arq_pool = await create_pool(parse_redis_url(cfg.redis_url))
        await arq_pool.enqueue_job("parse_resume", resume_id)
        await arq_pool.aclose()

        return record

    async def get_parse_status(self, resume_id: str) -> ProfileResumeSource:
        result = await self.session.execute(
            select(ProfileResumeSource).where(ProfileResumeSource.id == resume_id)
        )
        record = result.scalar_one_or_none()
        if not record:
            raise NotFound(f"ResumeSource {resume_id} not found")
        return record

    # ------------------------------------------------------------------
    # Profile read / update
    # ------------------------------------------------------------------

    async def get_profile(self, user_id: str) -> dict[str, Any]:
        """Return full profile with all sub-entities."""
        profile_row = await self._get_or_create_profile(user_id)

        education = (
            await self.session.execute(
                select(ProfileEducation).where(ProfileEducation.user_id == user_id)
            )
        ).scalars().all()

        work = (
            await self.session.execute(
                select(ProfileWorkExperience).where(ProfileWorkExperience.user_id == user_id)
            )
        ).scalars().all()

        projects = (
            await self.session.execute(
                select(ProfileProject).where(ProfileProject.user_id == user_id)
            )
        ).scalars().all()

        skills = (
            await self.session.execute(
                select(ProfileSkill).where(ProfileSkill.user_id == user_id)
            )
        ).scalars().all()

        return {
            "user_id": user_id,
            "basic_info": profile_row.basic_info,
            "certifications": profile_row.certifications,
            "last_resume_uploaded_at": profile_row.last_resume_uploaded_at,
            "etag": profile_row.etag,
            "education": [_row_to_dict(e) for e in education],
            "work_experience": [_row_to_dict(w) for w in work],
            "projects": [_row_to_dict(p) for p in projects],
            "skills": [_row_to_dict(s) for s in skills],
        }

    async def update_profile(
        self,
        user_id: str,
        patch: dict[str, Any],
        etag: str | None,
    ) -> dict[str, Any]:
        """ETag-based optimistic-lock update. Raises ETagMismatch on conflict."""
        profile = await self._get_or_create_profile(user_id)

        if profile.etag and profile.etag != etag:
            raise ETagMismatch("ETag mismatch — reload and retry")

        if "basic_info" in patch:
            profile.basic_info = patch["basic_info"]
        if "certifications" in patch:
            profile.certifications = patch["certifications"]

        new_etag = _compute_etag(profile)
        profile.etag = new_etag
        await self.session.commit()

        return await self.get_profile(user_id)

    # ------------------------------------------------------------------
    # Materials
    # ------------------------------------------------------------------

    async def list_materials(self, user_id: str) -> list[dict[str, Any]]:
        result = await self.session.execute(
            select(ProfileMaterial).where(ProfileMaterial.user_id == user_id)
        )
        return [_material_to_dict(m) for m in result.scalars().all()]

    async def confirm_material(self, material_id: str, user_id: str) -> dict[str, Any]:
        material = await self._get_material(material_id, user_id)
        material.status = "CONFIRMED"
        await self.session.commit()
        return _material_to_dict(material)

    async def delete_material(self, material_id: str, user_id: str) -> None:
        material = await self._get_material(material_id, user_id)
        await self.session.delete(material)
        await self.session.commit()

    async def update_material(
        self, material_id: str, user_id: str, patch: dict[str, Any]
    ) -> dict[str, Any]:
        material = await self._get_material(material_id, user_id)
        allowed = {"shining_text", "rationale", "tags", "quant", "status"}
        for key, value in patch.items():
            if key in allowed:
                setattr(material, key, value)
        await self.session.commit()
        return _material_to_dict(material)

    # ------------------------------------------------------------------
    # Base resumes
    # ------------------------------------------------------------------

    async def list_base_resumes(self, user_id: str) -> list[dict[str, Any]]:
        result = await self.session.execute(
            select(ProfileBaseResume).where(ProfileBaseResume.user_id == user_id)
        )
        return [_row_to_dict(r) for r in result.scalars().all()]

    async def create_base_resume(self, user_id: str, name: str) -> dict[str, Any]:
        from ulid import ULID

        resume = ProfileBaseResume(
            id=str(ULID()),
            user_id=user_id,
            name=name,
            selected_material_ids=[],
            is_default=False,
        )
        self.session.add(resume)
        await self.session.commit()
        return _row_to_dict(resume)

    # ------------------------------------------------------------------
    # GDPR export
    # ------------------------------------------------------------------

    async def export_profile(self, user_id: str) -> dict[str, Any]:
        """GDPR JSON export of all profile data."""
        profile = await self.get_profile(user_id)
        materials = await self.list_materials(user_id)
        base_resumes = await self.list_base_resumes(user_id)

        resumes_result = await self.session.execute(
            select(ProfileResumeSource).where(ProfileResumeSource.user_id == user_id)
        )
        resume_sources = [_row_to_dict(r) for r in resumes_result.scalars().all()]

        return {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "profile": profile,
            "materials": materials,
            "base_resumes": base_resumes,
            "resume_sources": resume_sources,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_or_create_profile(self, user_id: str) -> ProfileProfile:
        result = await self.session.execute(
            select(ProfileProfile).where(ProfileProfile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()
        if not profile:
            profile = ProfileProfile(user_id=user_id)
            self.session.add(profile)
            await self.session.commit()
        return profile

    async def _get_material(self, material_id: str, user_id: str) -> ProfileMaterial:
        result = await self.session.execute(
            select(ProfileMaterial).where(ProfileMaterial.id == material_id)
        )
        material = result.scalar_one_or_none()
        if not material:
            raise NotFound(f"Material {material_id} not found")
        if material.user_id != user_id:
            raise Forbidden("Access denied")
        return material


# ------------------------------------------------------------------
# Utilities
# ------------------------------------------------------------------

def _row_to_dict(obj: Any) -> dict[str, Any]:
    """Convert a SQLAlchemy model instance to a plain dict."""
    result: dict[str, Any] = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if isinstance(value, datetime):
            value = value.isoformat()
        elif isinstance(value, bytes):
            value = None  # encrypted fields not exported as raw bytes
        result[column.name] = value
    return result


def _material_to_dict(material: ProfileMaterial) -> dict[str, Any]:
    d = _row_to_dict(material)
    # raw_text is encrypted bytes — never expose
    d.pop("raw_text", None)
    return d


def _compute_etag(profile: ProfileProfile) -> str:
    payload = json.dumps(
        {
            "basic_info": profile.basic_info,
            "certifications": profile.certifications,
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]
