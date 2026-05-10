"""Telemetry service — business event ingestion."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.telemetry import TelemetryEvent

logger = logging.getLogger(__name__)


class TelemetryService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def ingest_batch(self, events: list[dict]) -> dict:
        """Ingest a batch of client events (idempotent by event_id)."""
        accepted = 0
        deduped = 0

        for evt in events:
            event_id = evt.get("event_id", "")
            if not event_id:
                continue

            # Check dedup
            existing = await self.session.execute(
                select(TelemetryEvent).where(TelemetryEvent.event_id == event_id)
            )
            if existing.scalar_one_or_none():
                deduped += 1
                continue

            te = TelemetryEvent(
                event_id=event_id,
                user_id=evt.get("user_id", ""),
                session_id=evt.get("session_id"),
                surface=evt.get("surface"),
                name=evt.get("name", ""),
                props=evt.get("props"),
                ts=datetime.fromisoformat(evt["ts"]) if evt.get("ts") else datetime.now(timezone.utc),
                ext_version=evt.get("ext_version"),
                app_build=evt.get("app_build"),
            )
            self.session.add(te)
            accepted += 1

        await self.session.commit()
        return {"accepted": accepted, "deduped": deduped}
