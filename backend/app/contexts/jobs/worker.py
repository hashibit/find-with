"""arq worker jobs for the jobs context.

parse_jd: load capture text, call LLM, write ParsedJd, enqueue compute_match.
build_company_brief: web search → CompanyBrief (24h cache).
compute_match: pgvector semantic search over materials, write MatchResult, publish JobAnalyzed.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from app.db.session import async_session_factory
from app.db.models.jobs import (
    JobCapture,
    JobParsedJd,
    JobCompanyBrief,
    JobMatchResult,
    JobRadarItem,
)
from app.db.models.outbox import OutboxEvent

logger = logging.getLogger(__name__)

COMPANY_BRIEF_TTL_HOURS = 24


async def parse_jd(ctx: dict, capture_id: str) -> None:
    """
    arq job: load captured text, parse via LLM, write ParsedJd, enqueue compute_match.
    """
    async with async_session_factory() as session:
        result = await session.execute(
            select(JobCapture).where(JobCapture.id == capture_id)
        )
        capture = result.scalar_one_or_none()
        if not capture:
            logger.error("parse_jd: capture_id=%s not found", capture_id)
            return

        text = capture.captured_text or ""
        if not text and capture.captured_html:
            text = _strip_html(capture.captured_html)

        if not text:
            logger.warning("parse_jd: capture_id=%s has no text to parse", capture_id)
            return

        try:
            parsed = await _call_llm_parse_jd(text)
        except Exception as exc:
            logger.exception("parse_jd: LLM failed for capture_id=%s: %s", capture_id, exc)
            return

        from ulid import ULID

        jd = JobParsedJd(
            id=str(ULID()),
            capture_id=capture_id,
            title=parsed.get("title"),
            company=parsed.get("company"),
            location=parsed.get("location"),
            hard_skills=parsed.get("hard_skills"),
            soft_skills=parsed.get("soft_skills"),
            experience=parsed.get("experience"),
            education_required=parsed.get("education_required"),
            hidden_signals=parsed.get("hidden_signals"),
            nice_to_have=parsed.get("nice_to_have"),
            buzzword_translation=parsed.get("buzzword_translation"),
        )
        session.add(jd)

        # Update linked radar item parsed_jd_id
        radar_result = await session.execute(
            select(JobRadarItem).where(JobRadarItem.capture_id == capture_id)
        )
        radar = radar_result.scalar_one_or_none()
        if radar:
            radar.parsed_jd_id = jd.id
            radar.status = "ANALYZED"
            radar.last_status_at = datetime.now(timezone.utc)

        await session.commit()

        # Compute embedding for JD
        embedding = await _compute_embedding(text)
        if embedding:
            jd.jd_embedding = embedding
            await session.commit()

        # Enqueue compute_match for each user associated with this capture
        await _enqueue("compute_match", jd.id, capture.user_id)

        logger.info("parse_jd: capture_id=%s jd_id=%s done", capture_id, jd.id)


async def build_company_brief(ctx: dict, company: str) -> None:
    """
    arq job: fetch company info from web search, cache in jobs_company_briefs (24h TTL).
    """
    if not company:
        return

    async with async_session_factory() as session:
        # Check cache
        result = await session.execute(
            select(JobCompanyBrief).where(JobCompanyBrief.company == company)
        )
        existing = result.scalar_one_or_none()

        now = datetime.now(timezone.utc)
        if existing and existing.ttl_expires and existing.ttl_expires > now:
            logger.info("build_company_brief: cache hit for company=%s", company)
            return

        # Fetch from web (basic web search via LLM with web browsing or a search API)
        brief_data = await _fetch_company_info(company)

        ttl_expires = now + timedelta(hours=COMPANY_BRIEF_TTL_HOURS)

        if existing:
            existing.what_they_do = brief_data.get("what_they_do")
            existing.size_stage = brief_data.get("size_stage")
            existing.recent_news = brief_data.get("recent_news")
            existing.risks = brief_data.get("risks")
            existing.glassdoor_rating = brief_data.get("glassdoor_rating")
            existing.generated_at = now
            existing.ttl_expires = ttl_expires
        else:
            from ulid import ULID
            brief = JobCompanyBrief(
                id=str(ULID()),
                company=company,
                what_they_do=brief_data.get("what_they_do"),
                size_stage=brief_data.get("size_stage"),
                recent_news=brief_data.get("recent_news"),
                risks=brief_data.get("risks"),
                glassdoor_rating=brief_data.get("glassdoor_rating"),
                generated_at=now,
                ttl_expires=ttl_expires,
            )
            session.add(brief)

        await session.commit()
        logger.info("build_company_brief: company=%s refreshed", company)


async def compute_match(ctx: dict, parsed_jd_id: str, user_id: str) -> None:
    """
    arq job: pgvector semantic search over materials, compute scores, write MatchResult,
    publish JobAnalyzed outbox event.
    """
    async with async_session_factory() as session:
        # Load ParsedJd
        result = await session.execute(
            select(JobParsedJd).where(JobParsedJd.id == parsed_jd_id)
        )
        jd = result.scalar_one_or_none()
        if not jd:
            logger.error("compute_match: parsed_jd_id=%s not found", parsed_jd_id)
            return

        from app.db.models.profile import ProfileMaterial

        # Semantic search: find top materials by cosine similarity if embeddings available
        if jd.jd_embedding is not None:
            try:
                materials_result = await session.execute(
                    select(ProfileMaterial)
                    .where(ProfileMaterial.user_id == user_id)
                    .order_by(ProfileMaterial.embedding.cosine_distance(jd.jd_embedding))
                    .limit(20)
                )
                top_materials = materials_result.scalars().all()
            except Exception:
                # pgvector not available or no embeddings — fall back to all materials
                top_materials = await _get_all_materials(session, user_id)
        else:
            top_materials = await _get_all_materials(session, user_id)

        # Compute scores using LLM
        scores = await _compute_scores(jd, top_materials)

        from ulid import ULID
        match = JobMatchResult(
            id=str(ULID()),
            parsed_jd_id=parsed_jd_id,
            user_id=user_id,
            surface_score=scores.get("surface_score"),
            deep_score=scores.get("deep_score"),
            gaps=scores.get("gaps"),
            hits_surface=scores.get("hits_surface"),
            hits_deep=scores.get("hits_deep"),
            overall_advice=scores.get("overall_advice"),
            advice_rationale=scores.get("advice_rationale"),
        )
        session.add(match)

        # Update radar item match_id
        radar_result = await session.execute(
            select(JobRadarItem).where(
                JobRadarItem.parsed_jd_id == parsed_jd_id,
                JobRadarItem.user_id == user_id,
            )
        )
        radar = radar_result.scalar_one_or_none()
        if radar:
            radar.match_id = match.id

        # Publish JobAnalyzed outbox event
        outbox = OutboxEvent(
            id=str(ULID()),
            event_type="JobAnalyzed",
            payload={
                "user_id": user_id,
                "parsed_jd_id": parsed_jd_id,
                "match_id": match.id,
            },
            consumer_group="jobs",
        )
        session.add(outbox)

        await session.commit()
        logger.info(
            "compute_match: parsed_jd_id=%s user_id=%s match_id=%s done",
            parsed_jd_id, user_id, match.id,
        )


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

async def _call_llm_parse_jd(text: str) -> dict[str, Any]:
    from app.llm.client import LLMClient
    from app.llm.provider import LLMMessage

    system_prompt = (
        "You are a job description parser. Extract structured data from the JD text. "
        "Return JSON with keys: title, company, location, hard_skills (list of strings), "
        "soft_skills (list of strings), experience ({years_min, years_max, level}), "
        "education_required ({degree, field}), hidden_signals (list of strings), "
        "nice_to_have (list of strings), buzzword_translation (plain-English summary). "
        "Return only the JSON object."
    )

    client = LLMClient()
    messages = [
        LLMMessage(role="system", content=system_prompt),
        LLMMessage(role="user", content=f"Job description:\n\n{text[:10000]}"),
    ]

    response_text = ""
    async for event in client.stream(model="gpt-4.1-mini", messages=messages):
        if event.kind == "text_delta":
            response_text += event.delta

    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        cleaned = "\n".join(lines[1:-1]) if len(lines) > 2 else cleaned

    return json.loads(cleaned)


async def _compute_embedding(text: str) -> list[float] | None:
    try:
        from app.llm.client import LLMClient
        client = LLMClient()
        return await client.embed(text[:8000])
    except Exception as exc:
        logger.warning("Embedding failed: %s", exc)
        return None


async def _fetch_company_info(company: str) -> dict[str, Any]:
    """Use LLM to summarize company info. In production, augment with real web search."""
    from app.llm.client import LLMClient
    from app.llm.provider import LLMMessage

    system_prompt = (
        "You are a company research assistant. Provide a brief company overview. "
        "Return JSON with: what_they_do (string), size_stage (string), "
        "recent_news (list of brief strings), risks ({culture, growth, stability}). "
        "Return only JSON."
    )

    client = LLMClient()
    messages = [
        LLMMessage(role="system", content=system_prompt),
        LLMMessage(role="user", content=f"Company: {company}"),
    ]

    response_text = ""
    async for event in client.stream(model="gpt-4.1-mini", messages=messages):
        if event.kind == "text_delta":
            response_text += event.delta

    try:
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(lines[1:-1]) if len(lines) > 2 else cleaned
        return json.loads(cleaned)
    except Exception:
        return {}


async def _compute_scores(jd: JobParsedJd, materials: list) -> dict[str, Any]:
    """Score candidate materials against JD using LLM."""
    from app.llm.client import LLMClient
    from app.llm.provider import LLMMessage

    material_texts = []
    for m in materials[:10]:
        text = m.shining_text or ""
        if text:
            material_texts.append(text)

    system_prompt = (
        "You are a career coach evaluating a candidate's fit for a job. "
        "Given the job requirements and candidate materials, compute: "
        "surface_score (0-100 keyword match), deep_score (0-100 semantic fit), "
        "gaps (list of missing requirements), hits_surface (list of matched keywords), "
        "hits_deep (list of deep skill matches), "
        "overall_advice (APPLY/TAILOR/SKIP), advice_rationale (1-2 sentences). "
        "Return only JSON."
    )

    jd_summary = {
        "title": jd.title,
        "hard_skills": jd.hard_skills,
        "soft_skills": jd.soft_skills,
        "experience": jd.experience,
    }

    client = LLMClient()
    messages = [
        LLMMessage(role="system", content=system_prompt),
        LLMMessage(
            role="user",
            content=(
                f"Job requirements: {json.dumps(jd_summary)}\n\n"
                f"Candidate materials:\n{chr(10).join(material_texts[:5])}"
            ),
        ),
    ]

    response_text = ""
    async for event in client.stream(model="gpt-4.1-mini", messages=messages):
        if event.kind == "text_delta":
            response_text += event.delta

    try:
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(lines[1:-1]) if len(lines) > 2 else cleaned
        return json.loads(cleaned)
    except Exception:
        return {
            "surface_score": None,
            "deep_score": None,
            "gaps": [],
            "hits_surface": [],
            "hits_deep": [],
            "overall_advice": None,
            "advice_rationale": None,
        }


async def _get_all_materials(session: Any, user_id: str) -> list:
    from app.db.models.profile import ProfileMaterial
    result = await session.execute(
        select(ProfileMaterial).where(ProfileMaterial.user_id == user_id).limit(50)
    )
    return result.scalars().all()


def _strip_html(html: str) -> str:
    """Minimal HTML tag stripping — use beautifulsoup if available."""
    try:
        from bs4 import BeautifulSoup
        return BeautifulSoup(html, "html.parser").get_text(separator=" ")
    except ImportError:
        import re
        return re.sub(r"<[^>]+>", " ", html)


async def _enqueue(func_name: str, *args: Any) -> None:
    from arq import create_pool
    from app.worker.settings import parse_redis_url
    from app.config import settings

    try:
        pool = await create_pool(parse_redis_url(settings.redis_url))
        await pool.enqueue_job(func_name, *args)
        await pool.aclose()
    except Exception as exc:
        logger.warning("Failed to enqueue %s: %s", func_name, exc)
