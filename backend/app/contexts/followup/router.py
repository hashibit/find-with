"""Followup HTTP routes."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.contexts.iam.auth import get_current_user_id
from app.contexts.followup.service import FollowupService

router = APIRouter(prefix="/v1/followup", tags=["followup"])


class CreateEmailRequest(BaseModel):
    subject: str | None = None
    from_addr: str | None = None
    body_text: str | None = None
    source: str = "gmail-web"
    radar_item_id: str | None = None
    received_at: str | None = None


class DraftReplyRequest(BaseModel):
    intent: str


@router.post("/emails")
async def create_email(
    body: CreateEmailRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Ingest a followup email (encrypted body), enqueue classification."""
    svc = FollowupService(session)
    email = await svc.create_email(
        user_id=user_id,
        capture_data=body.model_dump(),
    )

    return {
        "id": email.id,
        "source": email.source,
        "subject": email.subject,
        "from_addr": email.from_addr,
        "radar_item_id": email.radar_item_id,
        "created_at": email.created_at.isoformat(),
    }


@router.get("/emails/{id}")
async def get_email(
    id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Get followup email metadata and classification results (body excluded)."""
    svc = FollowupService(session)
    try:
        return await svc.get_email(email_id=id, user_id=user_id)
    except ValueError as exc:
        if str(exc) == "email_not_found":
            raise HTTPException(status_code=404, detail="Email not found")
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/emails/{id}:draft-reply")
async def draft_reply(
    id: str,
    body: DraftReplyRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Generate LLM reply draft based on intent."""
    svc = FollowupService(session)
    try:
        draft = await svc.draft_reply(
            email_id=id,
            user_id=user_id,
            intent=body.intent,
        )
    except ValueError as exc:
        if str(exc) == "email_not_found":
            raise HTTPException(status_code=404, detail="Email not found")
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "id": draft.id,
        "email_id": draft.email_id,
        "intent": draft.intent,
        "text": draft.text,
        "created_at": draft.created_at.isoformat(),
    }
