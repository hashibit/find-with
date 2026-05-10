"""Tailoring Service — resume tailoring lifecycle."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.tailoring import TailoringResume, TailoringSnapshot
from app.db.models.profile import ProfileMaterial
from app.db.models.conversation import ConvConversation

logger = logging.getLogger(__name__)

VALID_MATERIAL_STATUSES = {"CONFIRMED", "USER_EDITED"}


class TailoringService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: str,
        radar_item_id: str,
        base_resume_id: str,
    ) -> dict:
        """Quota check, enqueue generate_tailored_resume, create GAP_MINING conversation."""
        from python_ulid import ULID
        from app.contexts.quota.service import QuotaService

        # Quota gate (read-only check — actual consume happens at export)
        quota_svc = QuotaService(self.session)
        quota = await quota_svc.check(user_id)
        if not quota["allowed"]:
            raise ValueError("quota_exceeded")

        # Resolve parsed_jd_id from radar_item
        from app.db.models.jobs import JobRadarItem
        result = await self.session.execute(
            select(JobRadarItem).where(
                JobRadarItem.id == radar_item_id,
                JobRadarItem.user_id == user_id,
            )
        )
        radar_item = result.scalar_one_or_none()
        if not radar_item:
            raise ValueError("radar_item_not_found")
        if not radar_item.parsed_jd_id:
            raise ValueError("radar_item_has_no_parsed_jd")

        tailored_resume = TailoringResume(
            id=str(ULID()),
            user_id=user_id,
            base_resume_id=base_resume_id,
            parsed_jd_id=radar_item.parsed_jd_id,
        )
        self.session.add(tailored_resume)

        # Create GAP_MINING conversation anchored to this tailored resume
        conversation = ConvConversation(
            id=str(ULID()),
            user_id=user_id,
            kind="GAP_MINING",
            anchor_id=tailored_resume.id,
        )
        self.session.add(conversation)
        await self.session.commit()

        # Enqueue arq job
        try:
            from app.db.redis import redis_pool
            from arq import create_pool
            from arq.connections import RedisSettings
            from app.worker.settings import parse_redis_url
            from app.config import settings as app_settings

            arq_redis = await create_pool(parse_redis_url(app_settings.redis_url))
            await arq_redis.enqueue_job(
                "generate_tailored_resume",
                tailored_resume.id,
            )
            await arq_redis.close()
        except Exception:
            logger.exception("Failed to enqueue generate_tailored_resume job")

        return {
            "tailored_resume_id": tailored_resume.id,
            "conversation_id": conversation.id,
            "status": "queued",
        }

    async def get(self, tailored_resume_id: str, user_id: str) -> TailoringResume:
        """Return TailoringResume with sections."""
        result = await self.session.execute(
            select(TailoringResume).where(
                TailoringResume.id == tailored_resume_id,
                TailoringResume.user_id == user_id,
            )
        )
        resume = result.scalar_one_or_none()
        if not resume:
            raise ValueError("not_found")
        return resume

    async def update_bullet(
        self,
        tailored_resume_id: str,
        bullet_id: str,
        kind: str,
        text: str,
        user_id: str,
    ) -> dict:
        """Natural language edit via LLM, preserve provenance."""
        resume = await self.get(tailored_resume_id, user_id)
        sections = resume.sections or []

        bullet = _find_bullet(sections, bullet_id)
        if bullet is None:
            raise ValueError("bullet_not_found")

        # LLM-assisted edit: refine the text
        from app.llm.client import LLMClient
        from app.llm.provider import LLMMessage

        llm = LLMClient()
        system_prompt = (
            "You are a professional resume editor. "
            "Given a bullet point and an edit instruction, return ONLY the revised bullet text. "
            "Preserve all quantified metrics. Keep it under 200 characters."
        )
        user_prompt = (
            f"Original bullet: {bullet.get('text', '')}\n"
            f"Edit kind: {kind}\n"
            f"New text or instruction: {text}\n"
            "Return only the revised bullet."
        )

        revised_text = text  # fallback
        try:
            full_response = ""
            async for event in llm.stream(
                model="gpt-4.1-mini",
                messages=[
                    LLMMessage(role="system", content=system_prompt),
                    LLMMessage(role="user", content=user_prompt),
                ],
                temperature=0.3,
                max_tokens=256,
            ):
                if event.kind == "text":
                    full_response += event.text or ""
            if full_response.strip():
                revised_text = full_response.strip()
        except Exception:
            logger.exception("LLM bullet edit failed, using raw text")

        # Preserve provenance
        prev_text = bullet.get("text", "")
        bullet["text"] = revised_text
        bullet["state"] = "PENDING"
        bullet["provenance"] = bullet.get("provenance", [])
        bullet["provenance"].append({
            "kind": kind,
            "prev_text": prev_text,
            "edited_at": datetime.now(timezone.utc).isoformat(),
        })

        resume.sections = sections
        # Force JSONB dirty tracking
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(resume, "sections")
        await self.session.commit()

        return {"bullet_id": bullet_id, "text": revised_text, "state": "PENDING"}

    async def confirm_bullet(
        self,
        tailored_resume_id: str,
        bullet_id: str,
        user_id: str,
    ) -> dict:
        """Transition bullet state PENDING → CONFIRMED."""
        resume = await self.get(tailored_resume_id, user_id)
        sections = resume.sections or []

        bullet = _find_bullet(sections, bullet_id)
        if bullet is None:
            raise ValueError("bullet_not_found")
        if bullet.get("state") != "PENDING":
            raise ValueError("bullet_not_pending")

        bullet["state"] = "CONFIRMED"

        resume.sections = sections
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(resume, "sections")
        await self.session.commit()

        return {"bullet_id": bullet_id, "state": "CONFIRMED"}

    async def re_apply_material(
        self,
        material_id: str,
        tailored_resume_id: str,
        user_id: str,
    ) -> dict:
        """Validate material.status ∈ {CONFIRMED, USER_EDITED}, update PENDING bullets."""
        result = await self.session.execute(
            select(ProfileMaterial).where(
                ProfileMaterial.id == material_id,
                ProfileMaterial.user_id == user_id,
            )
        )
        material = result.scalar_one_or_none()
        if not material:
            raise ValueError("material_not_found")
        if material.status not in VALID_MATERIAL_STATUSES:
            raise ValueError(
                f"material_status_invalid: {material.status} not in {VALID_MATERIAL_STATUSES}"
            )

        resume = await self.get(tailored_resume_id, user_id)
        sections = resume.sections or []

        updated = 0
        for section in sections:
            for bullet in section.get("bullets", []):
                if bullet.get("state") == "PENDING" and bullet.get("material_id") == material_id:
                    bullet["text"] = material.shining_text or bullet["text"]
                    updated += 1

        resume.sections = sections
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(resume, "sections")
        await self.session.commit()

        return {"updated_bullets": updated}

    async def export(
        self,
        tailored_resume_id: str,
        fmt: str,
        user_id: str,
    ) -> dict:
        """Check no PENDING bullets (422 if any), render PDF via WeasyPrint, save snapshot, consume quota."""
        resume = await self.get(tailored_resume_id, user_id)
        sections = resume.sections or []

        # Gate: no PENDING bullets allowed
        pending = [
            b
            for s in sections
            for b in s.get("bullets", [])
            if b.get("state") == "PENDING"
        ]
        if pending:
            raise ValueError(f"pending_bullets_exist:{len(pending)}")

        # Consume quota (idempotent — UNIQUE on tailored_resume_id)
        from app.contexts.quota.service import QuotaService
        quota_svc = QuotaService(self.session)
        consumed = await quota_svc.consume_on_export(user_id, tailored_resume_id)
        if not consumed:
            raise ValueError("quota_exceeded")

        from python_ulid import ULID

        blob_uri_pdf: str | None = None
        plain_text: str | None = None

        if fmt == "pdf":
            blob_uri_pdf = await _render_pdf(resume, sections)
        elif fmt == "txt":
            plain_text = _render_text(sections)
        else:
            raise ValueError(f"unsupported_format:{fmt}")

        snapshot = TailoringSnapshot(
            id=str(ULID()),
            tailored_resume_id=tailored_resume_id,
            blob_uri_pdf=blob_uri_pdf,
            plain_text=plain_text,
        )
        self.session.add(snapshot)
        await self.session.commit()

        return {
            "snapshot_id": snapshot.id,
            "fmt": fmt,
            "blob_uri_pdf": blob_uri_pdf,
        }


# --- helpers ---

def _find_bullet(sections: list, bullet_id: str) -> dict | None:
    for section in sections:
        for bullet in section.get("bullets", []):
            if bullet.get("id") == bullet_id:
                return bullet
    return None


async def _render_pdf(resume: TailoringResume, sections: list) -> str:
    """Render resume to PDF via WeasyPrint and upload to S3."""
    html = _sections_to_html(sections)

    try:
        from weasyprint import HTML
        pdf_bytes = HTML(string=html).write_pdf()
    except ImportError:
        logger.warning("WeasyPrint not installed, using placeholder PDF")
        pdf_bytes = b"%PDF placeholder"
    except Exception:
        logger.exception("WeasyPrint rendering failed")
        pdf_bytes = b"%PDF placeholder"

    # Upload to S3
    blob_uri = await _upload_to_s3(f"exports/{resume.id}.pdf", pdf_bytes, "application/pdf")
    return blob_uri


def _render_text(sections: list) -> str:
    lines = []
    for section in sections:
        lines.append(f"=== {section.get('title', 'Section')} ===")
        for bullet in section.get("bullets", []):
            lines.append(f"- {bullet.get('text', '')}")
        lines.append("")
    return "\n".join(lines)


def _sections_to_html(sections: list) -> str:
    parts = ["<html><body>"]
    for section in sections:
        parts.append(f"<h2>{section.get('title', '')}</h2><ul>")
        for bullet in section.get("bullets", []):
            parts.append(f"<li>{bullet.get('text', '')}</li>")
        parts.append("</ul>")
    parts.append("</body></html>")
    return "".join(parts)


async def _upload_to_s3(key: str, data: bytes, content_type: str) -> str:
    try:
        import boto3
        from app.config import settings

        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        )
        s3.put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type)
        return f"s3://{settings.s3_bucket}/{key}"
    except Exception:
        logger.exception("S3 upload failed")
        return f"local://{key}"
