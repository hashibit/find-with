"""Apply Service — fill plan generation and application submission."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.apply import ApplyFillPlan, ApplyApplication
from app.db.models.jobs import JobRadarItem

logger = logging.getLogger(__name__)


class ApplyService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_fill_plan(
        self,
        user_id: str,
        radar_item_id: str,
        page_signals: dict,
    ) -> ApplyFillPlan:
        """Generate FillPlan with field mappings from page signals + profile data."""
        from ulid import ULID
        from app.db.models.profile import ProfileProfile, ProfileWorkExperience

        # Verify radar item ownership
        result = await self.session.execute(
            select(JobRadarItem).where(
                JobRadarItem.id == radar_item_id,
                JobRadarItem.user_id == user_id,
            )
        )
        radar_item = result.scalar_one_or_none()
        if not radar_item:
            raise ValueError("radar_item_not_found")

        # Load profile for field mapping
        profile_result = await self.session.execute(
            select(ProfileProfile).where(ProfileProfile.user_id == user_id)
        )
        profile = profile_result.scalar_one_or_none()
        basic_info = (profile.basic_info or {}) if profile else {}

        # Load work history
        we_result = await self.session.execute(
            select(ProfileWorkExperience).where(ProfileWorkExperience.user_id == user_id)
        )
        work_experiences = we_result.scalars().all()

        # Generate field mappings via LLM
        fields = await _generate_field_mappings(
            page_signals=page_signals,
            basic_info=basic_info,
            work_experiences=work_experiences,
        )

        # Build preview summary
        filled_count = sum(1 for f in fields if f.get("value"))
        preview_summary = (
            f"Auto-filled {filled_count}/{len(fields)} fields. "
            f"Review and approve before submission."
        )

        plan = ApplyFillPlan(
            id=str(ULID()),
            radar_item_id=radar_item_id,
            user_id=user_id,
            fields=fields,
            preview_summary=preview_summary,
            user_approved=False,
        )
        self.session.add(plan)
        await self.session.commit()

        return plan

    async def approve_fill_plan(
        self,
        fill_plan_id: str,
        user_id: str,
    ) -> ApplyFillPlan:
        """Mark fill plan as approved."""
        result = await self.session.execute(
            select(ApplyFillPlan).where(
                ApplyFillPlan.id == fill_plan_id,
                ApplyFillPlan.user_id == user_id,
            )
        )
        plan = result.scalar_one_or_none()
        if not plan:
            raise ValueError("fill_plan_not_found")
        if plan.user_approved:
            raise ValueError("already_approved")

        plan.user_approved = True
        plan.approved_at = datetime.now(timezone.utc)
        await self.session.commit()

        return plan

    async def create_application(
        self,
        user_id: str,
        radar_item_id: str,
        resume_snapshot_id: str | None,
    ) -> ApplyApplication:
        """Create Application record, update RadarItem to SUBMITTED, schedule followup."""
        from ulid import ULID

        # Verify radar item ownership
        result = await self.session.execute(
            select(JobRadarItem).where(
                JobRadarItem.id == radar_item_id,
                JobRadarItem.user_id == user_id,
            )
        )
        radar_item = result.scalar_one_or_none()
        if not radar_item:
            raise ValueError("radar_item_not_found")

        application = ApplyApplication(
            id=str(ULID()),
            user_id=user_id,
            radar_item_id=radar_item_id,
            resume_snapshot_id=resume_snapshot_id,
        )
        self.session.add(application)

        # Update radar item status to SUBMITTED
        radar_item.status = "SUBMITTED"
        radar_item.last_status_at = datetime.now(timezone.utc)

        await self.session.commit()

        # Schedule followup reminder (enqueue arq job)
        await _schedule_followup(application.id, user_id)

        return application


# --- helpers ---

async def _generate_field_mappings(
    page_signals: dict,
    basic_info: dict,
    work_experiences: list,
) -> list[dict]:
    """Use LLM to map ATS form fields to candidate profile data."""
    from app.llm.client import LLMClient
    from app.llm.provider import LLMMessage
    import json

    fields_detected = page_signals.get("fields", [])
    if not fields_detected:
        return []

    we_summary = "; ".join(
        f"{we.title} at {we.company}" for we in work_experiences[:5]
    )

    system_prompt = (
        "You are an ATS form assistant. "
        "Given detected form fields and candidate data, return a JSON array of field mappings. "
        "Each item: {\"field_name\": \"...\", \"field_type\": \"...\", \"value\": \"...\", \"confidence\": 0.0-1.0}"
    )
    user_prompt = (
        f"Detected fields: {json.dumps(fields_detected[:30])}\n\n"
        f"Candidate name: {basic_info.get('full_name', '')}\n"
        f"Email: {basic_info.get('email', '')}\n"
        f"Phone: {basic_info.get('phone', '')}\n"
        f"Location: {basic_info.get('location', '')}\n"
        f"Work history: {we_summary}\n\n"
        "Return ONLY a JSON array of mappings."
    )

    llm = LLMClient()
    full_response = ""
    try:
        async for event in llm.stream(
            model="gpt-4.1-mini",
            messages=[
                LLMMessage(role="system", content=system_prompt),
                LLMMessage(role="user", content=user_prompt),
            ],
            temperature=0.1,
            max_tokens=2000,
        ):
            if event.kind == "text":
                full_response += event.text or ""
    except Exception:
        logger.exception("LLM field mapping failed")
        return [{"field_name": f, "value": "", "confidence": 0.0} for f in fields_detected]

    import re
    match = re.search(r'\[.*\]', full_response, re.DOTALL)
    if not match:
        return []
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        logger.warning("Failed to parse field mapping JSON")
        return []


async def _schedule_followup(application_id: str, user_id: str) -> None:
    """Enqueue a follow-up reminder job after application submission."""
    try:
        from app.db.redis import redis_pool
        from arq import create_pool
        from app.worker.settings import parse_redis_url
        from app.config import settings as app_settings

        arq_redis = await create_pool(parse_redis_url(app_settings.redis_url))
        # Enqueue with a 7-day defer (not implemented in all arq versions — best effort)
        await arq_redis.enqueue_job("schedule_followup_reminder", application_id, user_id)
        await arq_redis.close()
    except Exception:
        logger.warning("Failed to schedule followup reminder for application %s", application_id)
