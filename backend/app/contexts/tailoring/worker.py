"""Tailoring arq worker jobs."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def generate_tailored_resume(ctx: dict, tailored_resume_id: str) -> None:
    """Load profile + materials + JD, call LLM, write sections with bullet states.

    arq passes a context dict; we build our own DB session inside the job.
    """
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

    from app.config import settings
    from app.db.models.tailoring import TailoringResume
    from app.db.models.profile import ProfileProfile, ProfileWorkExperience, ProfileMaterial, ProfileBaseResume
    from app.db.models.jobs import JobParsedJd
    from app.llm.client import LLMClient
    from app.llm.provider import LLMMessage
    from python_ulid import ULID

    engine = create_async_engine(settings.database_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with SessionLocal() as session:
            # Load tailored resume
            result = await session.execute(
                select(TailoringResume).where(TailoringResume.id == tailored_resume_id)
            )
            resume = result.scalar_one_or_none()
            if not resume:
                logger.error("TailoringResume %s not found", tailored_resume_id)
                return

            user_id = resume.user_id

            # Load base resume → selected material IDs
            base_result = await session.execute(
                select(ProfileBaseResume).where(
                    ProfileBaseResume.id == resume.base_resume_id,
                    ProfileBaseResume.user_id == user_id,
                )
            )
            base_resume = base_result.scalar_one_or_none()
            selected_material_ids: list[str] = (
                base_resume.selected_material_ids or [] if base_resume else []
            )

            # Load profile
            profile_result = await session.execute(
                select(ProfileProfile).where(ProfileProfile.user_id == user_id)
            )
            profile = profile_result.scalar_one_or_none()

            # Load work experiences
            we_result = await session.execute(
                select(ProfileWorkExperience).where(ProfileWorkExperience.user_id == user_id)
            )
            work_experiences = we_result.scalars().all()

            # Load materials (only CONFIRMED/USER_EDITED)
            mat_result = await session.execute(
                select(ProfileMaterial).where(
                    ProfileMaterial.user_id == user_id,
                    ProfileMaterial.status.in_(["CONFIRMED", "USER_EDITED"]),
                )
            )
            materials = mat_result.scalars().all()

            # Filter to selected if base resume specifies
            if selected_material_ids:
                materials = [m for m in materials if m.id in selected_material_ids]

            # Load JD
            jd_result = await session.execute(
                select(JobParsedJd).where(JobParsedJd.id == resume.parsed_jd_id)
            )
            jd = jd_result.scalar_one_or_none()

            # Build LLM prompt
            jd_summary = _build_jd_summary(jd)
            materials_summary = _build_materials_summary(materials)
            experiences_summary = _build_experiences_summary(work_experiences)
            basic_info = (profile.basic_info or {}) if profile else {}

            system_prompt = (
                "You are a professional resume writer. "
                "Given a job description and a candidate's profile, generate tailored resume sections. "
                "Output ONLY valid JSON matching this schema:\n"
                '{"sections": [{"title": "string", "bullets": [{"id": "string", "text": "string", '
                '"state": "PENDING", "material_id": "string|null"}]}]}'
            )
            user_prompt = (
                f"Candidate: {basic_info.get('full_name', 'Candidate')}\n\n"
                f"Job Description:\n{jd_summary}\n\n"
                f"Work Experience:\n{experiences_summary}\n\n"
                f"Achievement Materials:\n{materials_summary}\n\n"
                "Generate 3-5 resume sections (Summary, Skills, Experience, Projects, etc). "
                "For each bullet assign a unique id (ULID format), set state=PENDING, "
                "and reference the material_id if applicable."
            )

            llm = LLMClient()
            full_response = ""
            try:
                async for event in llm.stream(
                    model="gpt-4.1",
                    messages=[
                        LLMMessage(role="system", content=system_prompt),
                        LLMMessage(role="user", content=user_prompt),
                    ],
                    temperature=0.4,
                    max_tokens=3000,
                ):
                    if event.kind == "text":
                        full_response += event.text or ""
            except Exception:
                logger.exception("LLM call failed in generate_tailored_resume")
                full_response = ""

            sections = _parse_sections_response(full_response)

            # Assign ULIDs to bullets that lack IDs
            for section in sections:
                for bullet in section.get("bullets", []):
                    if not bullet.get("id"):
                        bullet["id"] = str(ULID())
                    if "state" not in bullet:
                        bullet["state"] = "PENDING"

            resume.sections = sections

            # Compute rough match score (bullet count heuristic for now)
            resume.match_after = min(1.0, len(sections) * 0.2)

            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(resume, "sections")
            await session.commit()

            logger.info(
                "generate_tailored_resume complete: id=%s sections=%d",
                tailored_resume_id,
                len(sections),
            )
    finally:
        await engine.dispose()


# --- helpers ---

def _build_jd_summary(jd) -> str:
    if not jd:
        return "No job description available."
    parts = []
    if jd.title:
        parts.append(f"Title: {jd.title}")
    if jd.company:
        parts.append(f"Company: {jd.company}")
    if jd.hard_skills:
        parts.append(f"Hard skills: {', '.join(jd.hard_skills[:10])}")
    if jd.soft_skills:
        parts.append(f"Soft skills: {', '.join(jd.soft_skills[:5])}")
    if jd.buzzword_translation:
        parts.append(f"Context: {jd.buzzword_translation[:300]}")
    return "\n".join(parts) or "No structured JD data."


def _build_materials_summary(materials) -> str:
    if not materials:
        return "No achievement materials."
    lines = []
    for m in materials[:20]:  # Cap to avoid prompt blowout
        text = m.shining_text or ""
        if text:
            lines.append(f"[{m.id}] {text[:200]}")
    return "\n".join(lines) or "No shining text available."


def _build_experiences_summary(experiences) -> str:
    if not experiences:
        return "No work experiences."
    lines = []
    for we in experiences[:10]:
        lines.append(f"- {we.title} @ {we.company} ({we.start}–{we.end or 'present'})")
        for b in (we.bullets or [])[:3]:
            lines.append(f"  • {b}")
    return "\n".join(lines)


def _parse_sections_response(raw: str) -> list:
    """Parse LLM JSON response into sections list."""
    import json
    import re

    # Extract JSON block
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not match:
        logger.warning("No JSON found in LLM response, returning empty sections")
        return []

    try:
        data = json.loads(match.group())
        sections = data.get("sections", [])
        if not isinstance(sections, list):
            return []
        return sections
    except json.JSONDecodeError:
        logger.warning("Failed to parse LLM JSON response")
        return []
