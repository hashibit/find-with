"""Recommendation HTTP routes."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.contexts.iam.auth import get_current_user_id
from app.contexts.recommendation.service import RecoService

router = APIRouter(tags=["recommendation"])


class FeedbackRequest(BaseModel):
    feedback: dict


@router.get("/v1/recommendations/today")
async def get_today(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Return today's recommendation, building it if not yet generated."""
    svc = RecoService(session)
    reco = await svc.get_today(user_id)

    if not reco:
        # Build on-demand for first request of the day
        try:
            reco = await svc.build_daily_reco(user_id)
        except Exception:
            raise HTTPException(
                status_code=503, detail="Could not generate recommendations at this time"
            )

    return {
        "id": reco.id,
        "user_id": reco.user_id,
        "items": reco.items,
        "sent_at": reco.sent_at.isoformat() if reco.sent_at else None,
        "feedback": reco.feedback,
    }


@router.post("/v1/recommendations/{id}/feedback")
async def record_feedback(
    id: str,
    body: FeedbackRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Record user feedback on a recommendation item."""
    svc = RecoService(session)
    try:
        reco = await svc.record_feedback(
            reco_id=id,
            user_id=user_id,
            feedback=body.feedback,
        )
    except ValueError as exc:
        if str(exc) == "recommendation_not_found":
            raise HTTPException(status_code=404, detail="Recommendation not found")
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "id": reco.id,
        "feedback": reco.feedback,
    }


@router.get("/v1/r/{user_id}/{reco_id}/click")
async def track_click(
    user_id: str,
    reco_id: str,
    sig: str,
    session: AsyncSession = Depends(get_session),
):
    """HMAC-validated click tracker — 302 redirect to job URL.

    U-08: sig = HMAC-SHA256(user_id|reco_id|sent_at_day)[:16] base64url.
    No auth required (public link from email).
    """
    svc = RecoService(session)
    redirect_url = await svc.validate_click(
        user_id=user_id,
        reco_id=reco_id,
        sig=sig,
    )

    if not redirect_url:
        raise HTTPException(status_code=400, detail="Invalid or expired click link")

    return RedirectResponse(url=redirect_url, status_code=302)
