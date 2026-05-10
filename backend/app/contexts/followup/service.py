"""Followup Service — email ingestion, classification, reply drafting, cleanup."""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.followup import FollowupEmail, FollowupDraft
from app.security.crypto import encrypt_field, decrypt_field

logger = logging.getLogger(__name__)

# Email kind values written by LLM classification
VALID_EMAIL_KINDS = {
    "REJECTION",
    "INTERVIEW_REQUEST",
    "OFFER",
    "GHOSTED",
    "FOLLOW_UP_NEEDED",
    "INFO_REQUEST",
    "OTHER",
}

# Map email kind to radar item status
KIND_TO_RADAR_STATUS = {
    "REJECTION": "REJECTED",
    "INTERVIEW_REQUEST": "INTERVIEWING",
    "OFFER": "OFFERED",
}


class FollowupService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_email(
        self,
        user_id: str,
        capture_data: dict,
    ) -> FollowupEmail:
        """Create FollowupEmail with encrypted body_text, enqueue classification."""
        from python_ulid import ULID

        subject = capture_data.get("subject", "")[:500]
        from_addr = capture_data.get("from_addr", "")[:255]
        body_text_raw = capture_data.get("body_text", "")
        source = capture_data.get("source", "gmail-web")[:20]
        radar_item_id = capture_data.get("radar_item_id")

        received_at_raw = capture_data.get("received_at")
        received_at = None
        if received_at_raw:
            try:
                received_at = datetime.fromisoformat(received_at_raw)
            except (ValueError, TypeError):
                received_at = datetime.now(timezone.utc)

        # Encrypt email body (§12.1)
        body_encrypted: bytes | None = None
        if body_text_raw:
            body_encrypted = encrypt_field(body_text_raw)

        email = FollowupEmail(
            id=str(ULID()),
            user_id=user_id,
            source=source,
            subject=subject,
            from_addr=from_addr,
            body_text=body_encrypted,
            radar_item_id=radar_item_id,
            received_at=received_at,
        )
        self.session.add(email)
        await self.session.commit()

        # Enqueue classification
        await _enqueue_classify(email.id)

        return email

    async def classify_email(self, email_id: str) -> dict:
        """LLM classification: writes kind + parsed, auto-updates RadarItem status."""
        result = await self.session.execute(
            select(FollowupEmail).where(FollowupEmail.id == email_id)
        )
        email = result.scalar_one_or_none()
        if not email:
            raise ValueError("email_not_found")

        # Decrypt body for LLM
        body_text = ""
        if email.body_text:
            try:
                body_text = decrypt_field(email.body_text)
            except Exception:
                logger.warning("Failed to decrypt email body for %s", email_id)

        kind, parsed = await _classify_with_llm(
            subject=email.subject or "",
            from_addr=email.from_addr or "",
            body_text=body_text,
        )

        email.kind = kind
        email.parsed = parsed
        await self.session.commit()

        # Auto-update radar item status if mapping exists
        if email.radar_item_id and kind in KIND_TO_RADAR_STATUS:
            await _update_radar_status(
                self.session,
                email.radar_item_id,
                email.user_id,
                KIND_TO_RADAR_STATUS[kind],
            )

        return {"email_id": email_id, "kind": kind, "parsed": parsed}

    async def draft_reply(
        self,
        email_id: str,
        user_id: str,
        intent: str,
    ) -> FollowupDraft:
        """LLM-generated reply draft based on intent."""
        from python_ulid import ULID

        result = await self.session.execute(
            select(FollowupEmail).where(
                FollowupEmail.id == email_id,
                FollowupEmail.user_id == user_id,
            )
        )
        email = result.scalar_one_or_none()
        if not email:
            raise ValueError("email_not_found")

        # Decrypt body for context
        body_text = ""
        if email.body_text:
            try:
                body_text = decrypt_field(email.body_text)[:500]
            except Exception:
                logger.warning("Failed to decrypt email body for %s", email_id)

        draft_text = await _draft_reply_with_llm(
            subject=email.subject or "",
            from_addr=email.from_addr or "",
            body_snippet=body_text,
            intent=intent,
            parsed=email.parsed or {},
        )

        draft = FollowupDraft(
            id=str(ULID()),
            email_id=email_id,
            user_id=user_id,
            text=draft_text,
            intent=intent[:50],
        )
        self.session.add(draft)
        await self.session.commit()

        return draft

    async def get_email(self, email_id: str, user_id: str) -> dict:
        """Return email record (body_text excluded from response)."""
        result = await self.session.execute(
            select(FollowupEmail).where(
                FollowupEmail.id == email_id,
                FollowupEmail.user_id == user_id,
            )
        )
        email = result.scalar_one_or_none()
        if not email:
            raise ValueError("email_not_found")

        return {
            "id": email.id,
            "user_id": email.user_id,
            "source": email.source,
            "subject": email.subject,
            "from_addr": email.from_addr,
            "kind": email.kind,
            "parsed": email.parsed,
            "radar_item_id": email.radar_item_id,
            "received_at": email.received_at.isoformat() if email.received_at else None,
            "created_at": email.created_at.isoformat(),
        }

    async def cleanup_old_emails(self) -> int:
        """30-day body_text cleanup: set to NULL, keep parsed metadata."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)

        result = await self.session.execute(
            select(FollowupEmail).where(
                FollowupEmail.created_at < cutoff,
                FollowupEmail.body_text.is_not(None),
            )
        )
        emails = result.scalars().all()

        count = 0
        for email in emails:
            email.body_text = None
            count += 1

        if count:
            await self.session.commit()
            logger.info("Cleaned up body_text for %d emails older than 30 days", count)

        return count


# --- helpers ---

async def _classify_with_llm(
    subject: str,
    from_addr: str,
    body_text: str,
) -> tuple[str, dict]:
    from app.llm.client import LLMClient
    from app.llm.provider import LLMMessage
    import json, re

    system_prompt = (
        "You are a job-search email classifier. "
        "Classify the email and extract structured data. "
        "Return ONLY JSON: "
        '{"kind": "REJECTION|INTERVIEW_REQUEST|OFFER|GHOSTED|FOLLOW_UP_NEEDED|INFO_REQUEST|OTHER", '
        '"company": "...", "role": "...", "next_step": "...", "date_mentioned": "..."}'
    )
    user_prompt = (
        f"From: {from_addr}\nSubject: {subject}\n\nBody:\n{body_text[:1500]}"
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
            max_tokens=512,
        ):
            if event.kind == "text":
                full_response += event.text or ""
    except Exception:
        logger.exception("LLM email classification failed")
        return "OTHER", {}

    match = re.search(r'\{.*\}', full_response, re.DOTALL)
    if not match:
        return "OTHER", {}

    try:
        data = json.loads(match.group())
        kind = data.get("kind", "OTHER")
        if kind not in VALID_EMAIL_KINDS:
            kind = "OTHER"
        parsed = {k: v for k, v in data.items() if k != "kind"}
        return kind, parsed
    except json.JSONDecodeError:
        return "OTHER", {}


async def _draft_reply_with_llm(
    subject: str,
    from_addr: str,
    body_snippet: str,
    intent: str,
    parsed: dict,
) -> str:
    from app.llm.client import LLMClient
    from app.llm.provider import LLMMessage

    system_prompt = (
        "You are a professional job-search email assistant. "
        "Draft a concise, professional reply email body based on the intent. "
        "Return only the email body text, no subject line."
    )
    user_prompt = (
        f"Original email from: {from_addr}\nSubject: {subject}\n"
        f"Company: {parsed.get('company', 'the company')}\n"
        f"Role: {parsed.get('role', 'the position')}\n\n"
        f"Intent: {intent}\n\n"
        f"Context:\n{body_snippet}\n\n"
        "Write a professional reply:"
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
            temperature=0.5,
            max_tokens=512,
        ):
            if event.kind == "text":
                full_response += event.text or ""
    except Exception:
        logger.exception("LLM reply drafting failed")
        return ""

    return full_response.strip()


async def _enqueue_classify(email_id: str) -> None:
    try:
        from arq import create_pool
        from app.worker.settings import parse_redis_url
        from app.config import settings as app_settings

        arq_redis = await create_pool(parse_redis_url(app_settings.redis_url))
        await arq_redis.enqueue_job("classify_email", email_id)
        await arq_redis.close()
    except Exception:
        logger.warning("Failed to enqueue classify_email for %s", email_id)


async def _update_radar_status(
    session: AsyncSession,
    radar_item_id: str,
    user_id: str,
    new_status: str,
) -> None:
    from app.db.models.jobs import JobRadarItem

    result = await session.execute(
        select(JobRadarItem).where(
            JobRadarItem.id == radar_item_id,
            JobRadarItem.user_id == user_id,
        )
    )
    item = result.scalar_one_or_none()
    if item:
        item.status = new_status
        item.last_status_at = datetime.now(timezone.utc)
        await session.commit()
        logger.info("RadarItem %s status updated to %s via email classification", radar_item_id, new_status)
