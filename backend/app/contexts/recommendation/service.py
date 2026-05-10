"""Recommendation Service — daily job reco pipeline with HMAC click tracking."""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.recommendation import RecoRecommendation

logger = logging.getLogger(__name__)

# Secret for HMAC click signatures (pulled from settings at runtime)
_CLICK_SECRET: str | None = None


def _get_click_secret() -> str:
    global _CLICK_SECRET
    if _CLICK_SECRET is None:
        from app.config import settings
        # Derive from clerk_secret_key for click HMAC (separate concern from auth)
        _CLICK_SECRET = settings.clerk_secret_key or "dev-click-secret"
    return _CLICK_SECRET


def _compute_click_sig(user_id: str, reco_id: str, sent_at_day: str, secret: str) -> str:
    msg = f"{user_id}|{reco_id}|{sent_at_day}"
    sig = hmac.new(secret.encode(), msg.encode(), hashlib.sha256).digest()[:16]
    return base64.urlsafe_b64encode(sig).decode().rstrip("=")


class RecoService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def build_daily_reco(self, user_id: str) -> RecoRecommendation:
        """SerpAPI search, pgvector dedup, LLM rerank, create Recommendation."""
        from ulid import ULID

        # Fetch candidate profile keywords for search
        search_terms = await _build_search_terms(self.session, user_id)

        # SerpAPI search
        raw_results = await _serp_search(search_terms)

        # pgvector dedup: remove jobs already seen by user
        deduped = await _dedup_with_pgvector(self.session, user_id, raw_results)

        # LLM rerank
        ranked_items = await _llm_rerank(user_id, deduped)

        now = datetime.now(timezone.utc)
        reco = RecoRecommendation(
            id=str(ULID()),
            user_id=user_id,
            items=ranked_items,
            sent_at=now,
            feedback=None,
        )
        self.session.add(reco)
        await self.session.commit()

        return reco

    async def get_today(self, user_id: str) -> RecoRecommendation | None:
        """Return today's recommendation for the user."""
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        result = await self.session.execute(
            select(RecoRecommendation)
            .where(
                RecoRecommendation.user_id == user_id,
                RecoRecommendation.sent_at >= today_start,
            )
            .order_by(RecoRecommendation.sent_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def record_feedback(
        self,
        reco_id: str,
        user_id: str,
        feedback: dict,
    ) -> RecoRecommendation:
        """Record user feedback on a recommendation."""
        result = await self.session.execute(
            select(RecoRecommendation).where(
                RecoRecommendation.id == reco_id,
                RecoRecommendation.user_id == user_id,
            )
        )
        reco = result.scalar_one_or_none()
        if not reco:
            raise ValueError("recommendation_not_found")

        # Merge new feedback with existing
        existing = reco.feedback or {}
        existing.update(feedback)
        existing["recorded_at"] = datetime.now(timezone.utc).isoformat()
        reco.feedback = existing

        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(reco, "feedback")
        await self.session.commit()

        return reco

    async def validate_click(
        self,
        user_id: str,
        reco_id: str,
        sig: str,
    ) -> str | None:
        """HMAC verification + dedup click tracking. Returns redirect URL or None."""
        result = await self.session.execute(
            select(RecoRecommendation).where(
                RecoRecommendation.id == reco_id,
                RecoRecommendation.user_id == user_id,
            )
        )
        reco = result.scalar_one_or_none()
        if not reco:
            logger.warning("Click validation: reco %s not found for user %s", reco_id, user_id)
            return None

        # Verify HMAC against the sent_at day
        if not reco.sent_at:
            return None

        sent_at_day = reco.sent_at.strftime("%Y-%m-%d")
        expected_sig = _compute_click_sig(user_id, reco_id, sent_at_day, _get_click_secret())

        if not hmac.compare_digest(sig, expected_sig):
            logger.warning("Click HMAC mismatch for reco %s user %s", reco_id, user_id)
            return None

        # Dedup: track click in feedback
        feedback = reco.feedback or {}
        if feedback.get("clicked"):
            # Already tracked — still return the URL (idempotent)
            pass
        else:
            feedback["clicked"] = True
            feedback["clicked_at"] = datetime.now(timezone.utc).isoformat()
            reco.feedback = feedback

            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(reco, "feedback")
            await self.session.commit()

        # Extract redirect URL from first item
        items = reco.items or []
        if items:
            return items[0].get("url") or items[0].get("link")

        return None


# --- helpers ---

async def _build_search_terms(session: AsyncSession, user_id: str) -> list[str]:
    from app.db.models.profile import ProfileProfile, ProfileSkill

    profile_result = await session.execute(
        select(ProfileProfile).where(ProfileProfile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()
    basic_info = (profile.basic_info or {}) if profile else {}

    skills_result = await session.execute(
        select(ProfileSkill).where(ProfileSkill.user_id == user_id).limit(10)
    )
    skills = skills_result.scalars().all()

    terms = []
    if basic_info.get("current_title"):
        terms.append(basic_info["current_title"])
    terms.extend(s.name for s in skills[:5])

    return terms or ["software engineer"]


async def _serp_search(search_terms: list[str]) -> list[dict]:
    """SerpAPI job search."""
    from app.config import settings

    serp_api_key = getattr(settings, "serp_api_key", None)
    if not serp_api_key:
        logger.warning("SERP_API_KEY not configured, returning empty results")
        return []

    query = " ".join(search_terms[:3]) + " jobs"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://serpapi.com/search",
                params={
                    "engine": "google_jobs",
                    "q": query,
                    "api_key": serp_api_key,
                    "num": 20,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("jobs_results", [])
    except Exception:
        logger.exception("SerpAPI search failed")
        return []


async def _dedup_with_pgvector(
    session: AsyncSession,
    user_id: str,
    results: list[dict],
) -> list[dict]:
    """Remove jobs already seen/recommended to the user using pgvector similarity."""
    if not results:
        return []

    # Get recent recommendation item IDs to exclude
    recent_result = await session.execute(
        select(RecoRecommendation)
        .where(RecoRecommendation.user_id == user_id)
        .order_by(RecoRecommendation.sent_at.desc())
        .limit(30)
    )
    recent_recos = recent_result.scalars().all()

    seen_urls: set[str] = set()
    for reco in recent_recos:
        for item in (reco.items or []):
            url = item.get("url") or item.get("link") or ""
            if url:
                seen_urls.add(url)

    # Simple URL-based dedup (pgvector embedding dedup would require job embeddings)
    deduped = [
        r for r in results
        if (r.get("link") or r.get("url") or "") not in seen_urls
    ]

    return deduped[:15]


async def _llm_rerank(user_id: str, items: list[dict]) -> list[dict]:
    """LLM rerank based on profile fit."""
    if not items:
        return []

    from app.llm.client import LLMClient
    from app.llm.provider import LLMMessage
    import json, re

    # Truncate to top 15 for LLM context
    candidates = items[:15]

    system_prompt = (
        "You are a job relevance ranker. "
        "Given a list of job postings as JSON, return them reranked by likely fit. "
        "Add a 'fit_score' (0.0-1.0) and 'fit_reason' to each item. "
        "Return ONLY the JSON array."
    )
    user_prompt = (
        f"Rank these {len(candidates)} job postings by fit:\n"
        f"{json.dumps(candidates, default=str)[:4000]}"
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
            temperature=0.2,
            max_tokens=3000,
        ):
            if event.kind == "text":
                full_response += event.text or ""
    except Exception:
        logger.exception("LLM rerank failed, returning original order")
        return candidates

    match = re.search(r'\[.*\]', full_response, re.DOTALL)
    if not match:
        return candidates

    try:
        ranked = json.loads(match.group())
        if isinstance(ranked, list):
            return ranked
    except json.JSONDecodeError:
        pass

    return candidates
