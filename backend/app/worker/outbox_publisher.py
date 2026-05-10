"""Outbox publisher — polls outbox_events and dispatches per consumer_group (U-02).

Runs as a standalone process: `python -m app.worker.outbox_publisher`
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_factory

logger = logging.getLogger(__name__)

# Allowed consumer groups (fail-fast if unknown)
CONSUMER_GROUPS = {"agent", "billing", "telemetry"}

POLL_INTERVAL = 1.0  # seconds
BATCH_SIZE = 50


async def poll_and_dispatch(consumer_group: str) -> int:
    """Poll outbox_events for a specific consumer_group, dispatch, mark dispatched.

    Uses SKIP LOCKED to allow multiple publishers without contention.
    Returns number of events dispatched.
    """
    async with async_session_factory() as session:
        # SELECT ... FOR UPDATE SKIP LOCKED
        result = await session.execute(
            text("""
                SELECT id, event_type, payload
                FROM outbox_events
                WHERE consumer_group = :cg
                  AND dispatched_at IS NULL
                ORDER BY created_at
                LIMIT :limit
                FOR UPDATE SKIP LOCKED
            """),
            {"cg": consumer_group, "limit": BATCH_SIZE},
        )
        rows = result.fetchall()

        if not rows:
            return 0

        for row in rows:
            event_id, event_type, payload = row
            try:
                await _dispatch_event(consumer_group, event_type, payload, session)
                await session.execute(
                    text("UPDATE outbox_events SET dispatched_at = :now WHERE id = :id"),
                    {"now": datetime.now(timezone.utc), "id": event_id},
                )
            except Exception:
                logger.exception("Failed to dispatch event %s (type=%s, cg=%s)", event_id, event_type, consumer_group)

        await session.commit()
        return len(rows)


async def _dispatch_event(
    consumer_group: str,
    event_type: str,
    payload: dict | None,
    session: AsyncSession,
) -> None:
    """Route event to handler based on consumer_group + event_type.

    Handlers are registered per context in later sprints.
    """
    logger.info("Dispatching event_type=%s to consumer_group=%s", event_type, consumer_group)
    # Handler registry — populated by context modules
    # For now, just log
    pass


async def run_publisher(consumer_group: str) -> None:
    """Run the outbox publisher loop for a single consumer_group."""
    if consumer_group not in CONSUMER_GROUPS:
        raise ValueError(f"Unknown consumer_group: {consumer_group}. Allowed: {CONSUMER_GROUPS}")

    logger.info("Outbox publisher started for consumer_group=%s", consumer_group)

    while True:
        try:
            dispatched = await poll_and_dispatch(consumer_group)
            if dispatched:
                logger.info("Dispatched %d events for %s", dispatched, consumer_group)
        except Exception:
            logger.exception("Outbox publisher error for %s", consumer_group)

        await asyncio.sleep(POLL_INTERVAL)


async def main() -> None:
    """Run publishers for all consumer groups concurrently."""
    import sys
    groups = sys.argv[1:] if len(sys.argv) > 1 else list(CONSUMER_GROUPS)

    tasks = [asyncio.create_task(run_publisher(cg)) for cg in groups]
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
