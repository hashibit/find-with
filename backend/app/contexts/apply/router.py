"""Apply HTTP routes."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.contexts.iam.auth import get_current_user_id
from app.contexts.apply.service import ApplyService

router = APIRouter(prefix="/v1/apply", tags=["apply"])


class CreateFillPlanRequest(BaseModel):
    radar_item_id: str
    page_signals: dict = {}


class CreateApplicationRequest(BaseModel):
    radar_item_id: str
    resume_snapshot_id: str | None = None


@router.post("/fill-plans")
async def create_fill_plan(
    body: CreateFillPlanRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Generate ATS fill plan from page signals + profile data."""
    svc = ApplyService(session)
    try:
        plan = await svc.create_fill_plan(
            user_id=user_id,
            radar_item_id=body.radar_item_id,
            page_signals=body.page_signals,
        )
    except ValueError as exc:
        msg = str(exc)
        if msg == "radar_item_not_found":
            raise HTTPException(status_code=404, detail="Radar item not found")
        raise HTTPException(status_code=400, detail=msg)

    return {
        "id": plan.id,
        "radar_item_id": plan.radar_item_id,
        "fields": plan.fields,
        "preview_summary": plan.preview_summary,
        "user_approved": plan.user_approved,
        "created_at": plan.created_at.isoformat(),
    }


@router.patch("/fill-plans/{id}:approve")
async def approve_fill_plan(
    id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Approve a fill plan for submission."""
    svc = ApplyService(session)
    try:
        plan = await svc.approve_fill_plan(fill_plan_id=id, user_id=user_id)
    except ValueError as exc:
        msg = str(exc)
        if msg == "fill_plan_not_found":
            raise HTTPException(status_code=404, detail="Fill plan not found")
        if msg == "already_approved":
            raise HTTPException(status_code=409, detail="Fill plan already approved")
        raise HTTPException(status_code=400, detail=msg)

    return {
        "id": plan.id,
        "user_approved": plan.user_approved,
        "approved_at": plan.approved_at.isoformat() if plan.approved_at else None,
    }


@router.post("/applications")
async def create_application(
    body: CreateApplicationRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Submit an application, mark radar item SUBMITTED, schedule followup."""
    svc = ApplyService(session)
    try:
        application = await svc.create_application(
            user_id=user_id,
            radar_item_id=body.radar_item_id,
            resume_snapshot_id=body.resume_snapshot_id,
        )
    except ValueError as exc:
        msg = str(exc)
        if msg == "radar_item_not_found":
            raise HTTPException(status_code=404, detail="Radar item not found")
        raise HTTPException(status_code=400, detail=msg)

    return {
        "id": application.id,
        "radar_item_id": application.radar_item_id,
        "resume_snapshot_id": application.resume_snapshot_id,
        "submitted_at": application.submitted_at.isoformat(),
    }
