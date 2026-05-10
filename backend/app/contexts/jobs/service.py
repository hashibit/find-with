"""JobsService — job capture, JD parsing, match results, radar management."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.jobs import (
    JobCapture,
    JobParsedJd,
    JobMatchResult,
    JobRadarItem,
    JobCompanyBrief,
)

logger = logging.getLogger(__name__)

VALID_TRANSITIONS: dict[str, set[str]] = {
    "BROWSED": {"ANALYZED"},
    "ANALYZED": {"DECLINED", "TAILORING"},
    "TAILORING": {"SUBMITTED"},
    "SUBMITTED": {"WAITING"},
    "WAITING": {"INTERVIEWING", "REJECTED"},
    "INTERVIEWING": {"REJECTED", "OFFER"},
    "OFFER": {"OFFER_ACCEPTED", "OFFER_DECLINED"},
}


class NotFound(Exception):
    pass


class Forbidden(Exception):
    pass


class InvalidTransition(Exception):
    pass


class JobsService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------
    # Capture
    # ------------------------------------------------------------------

    async def create_capture(
        self,
        user_id: str,
        capture_data: dict[str, Any],
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        """Create a JobCapture + RadarItem(BROWSED), enqueue parse_jd + build_company_brief."""
        from python_ulid import ULID

        # Idempotency check
        if idempotency_key:
            existing = await self._find_capture_by_idempotency_key(idempotency_key)
            if existing:
                return _row_to_dict(existing)

        capture = JobCapture(
            id=str(ULID()),
            user_id=user_id,
            source=capture_data.get("source", "MANUAL"),
            source_url=capture_data.get("source_url", ""),
            source_job_id=capture_data.get("source_job_id"),
            captured_html=capture_data.get("captured_html"),
            captured_text=capture_data.get("captured_text"),
            meta=capture_data.get("meta"),
        )
        self.session.add(capture)

        radar = JobRadarItem(
            id=str(ULID()),
            user_id=user_id,
            capture_id=capture.id,
            status="BROWSED",
            last_status_at=datetime.now(timezone.utc),
        )
        self.session.add(radar)
        await self.session.commit()

        # Store idempotency key in meta if provided
        if idempotency_key:
            capture.meta = {**(capture.meta or {}), "_idempotency_key": idempotency_key}
            await self.session.commit()

        # Enqueue background jobs
        await _enqueue_jobs(
            ("parse_jd", capture.id),
            ("build_company_brief", capture_data.get("company") or capture_data.get("meta", {}).get("company", "")),
        )

        return _row_to_dict(capture)

    async def get_parsed_jd(self, capture_id: str) -> dict[str, Any]:
        result = await self.session.execute(
            select(JobParsedJd).where(JobParsedJd.capture_id == capture_id)
        )
        jd = result.scalar_one_or_none()
        if not jd:
            raise NotFound(f"ParsedJd for capture {capture_id} not found")
        return _row_to_dict(jd)

    async def get_match(self, capture_id: str, user_id: str) -> dict[str, Any]:
        # Get parsed JD first
        jd_result = await self.session.execute(
            select(JobParsedJd).where(JobParsedJd.capture_id == capture_id)
        )
        jd = jd_result.scalar_one_or_none()
        if not jd:
            raise NotFound("ParsedJd not found — parse may still be in progress")

        result = await self.session.execute(
            select(JobMatchResult).where(
                JobMatchResult.parsed_jd_id == jd.id,
                JobMatchResult.user_id == user_id,
            )
        )
        match = result.scalar_one_or_none()
        if not match:
            raise NotFound("MatchResult not computed yet")
        return _row_to_dict(match)

    # ------------------------------------------------------------------
    # Radar
    # ------------------------------------------------------------------

    async def list_radar(self, user_id: str) -> list[dict[str, Any]]:
        result = await self.session.execute(
            select(JobRadarItem).where(JobRadarItem.user_id == user_id)
        )
        return [_row_to_dict(r) for r in result.scalars().all()]

    async def update_radar_status(
        self,
        radar_id: str,
        user_id: str,
        new_status: str,
        note: str | None = None,
    ) -> dict[str, Any]:
        result = await self.session.execute(
            select(JobRadarItem).where(JobRadarItem.id == radar_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise NotFound(f"RadarItem {radar_id} not found")
        if item.user_id != user_id:
            raise Forbidden("Access denied")

        current = item.status
        allowed = VALID_TRANSITIONS.get(current, set())
        if new_status not in allowed:
            raise InvalidTransition(
                f"Cannot transition from {current!r} to {new_status!r}. "
                f"Allowed: {sorted(allowed)}"
            )

        item.status = new_status
        item.last_status_at = datetime.now(timezone.utc)
        if note is not None:
            item.user_decision_note = note

        await self.session.commit()
        return _row_to_dict(item)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _find_capture_by_idempotency_key(self, key: str) -> JobCapture | None:
        result = await self.session.execute(
            select(JobCapture).where(
                JobCapture.meta["_idempotency_key"].astext == key
            )
        )
        return result.scalar_one_or_none()


# ------------------------------------------------------------------
# Utilities
# ------------------------------------------------------------------

def _row_to_dict(obj: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if isinstance(value, datetime):
            value = value.isoformat()
        result[column.name] = value
    return result


async def _enqueue_jobs(*jobs: tuple) -> None:
    """Enqueue multiple arq jobs. Each element is (function_name, *args)."""
    from arq import create_pool
    from app.worker.settings import parse_redis_url
    from app.config import settings

    try:
        pool = await create_pool(parse_redis_url(settings.redis_url))
        for job in jobs:
            func_name = job[0]
            args = job[1:]
            # Filter empty args (e.g. empty company name)
            if len(args) == 1 and not args[0]:
                continue
            await pool.enqueue_job(func_name, *args)
        await pool.aclose()
    except Exception as exc:
        logger.warning("Failed to enqueue jobs %s: %s", jobs, exc)
