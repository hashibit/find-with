"""Tailoring HTTP routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.contexts.iam.auth import get_current_user_id
from app.contexts.tailoring.service import TailoringService

router = APIRouter(prefix="/v1/tailoring", tags=["tailoring"])


class CreateTailoringRequest(BaseModel):
    radar_item_id: str
    base_resume_id: str


class UpdateBulletRequest(BaseModel):
    kind: str
    text: str


@router.post("")
async def create_tailoring(
    body: CreateTailoringRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Create a tailored resume: quota check + enqueue generation + open GAP_MINING conversation."""
    svc = TailoringService(session)
    try:
        return await svc.create(
            user_id=user_id,
            radar_item_id=body.radar_item_id,
            base_resume_id=body.base_resume_id,
        )
    except ValueError as exc:
        msg = str(exc)
        if msg == "quota_exceeded":
            raise HTTPException(status_code=402, detail="Tailoring quota exceeded")
        if msg == "radar_item_not_found":
            raise HTTPException(status_code=404, detail="Radar item not found")
        if msg == "radar_item_has_no_parsed_jd":
            raise HTTPException(status_code=422, detail="Radar item has no parsed JD")
        raise HTTPException(status_code=400, detail=msg)


@router.get("/{id}")
async def get_tailoring(
    id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Get tailored resume with all sections and bullet states."""
    svc = TailoringService(session)
    try:
        resume = await svc.get(id, user_id)
    except ValueError as exc:
        if str(exc) == "not_found":
            raise HTTPException(status_code=404, detail="Tailored resume not found")
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "id": resume.id,
        "user_id": resume.user_id,
        "base_resume_id": resume.base_resume_id,
        "parsed_jd_id": resume.parsed_jd_id,
        "sections": resume.sections,
        "match_before": resume.match_before,
        "match_after": resume.match_after,
        "created_at": resume.created_at.isoformat(),
        "updated_at": resume.updated_at.isoformat(),
    }


@router.patch("/{id}/bullets/{bid}")
async def update_bullet(
    id: str,
    bid: str,
    body: UpdateBulletRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Natural language bullet edit via LLM, preserving provenance chain."""
    svc = TailoringService(session)
    try:
        return await svc.update_bullet(
            tailored_resume_id=id,
            bullet_id=bid,
            kind=body.kind,
            text=body.text,
            user_id=user_id,
        )
    except ValueError as exc:
        msg = str(exc)
        if msg == "not_found":
            raise HTTPException(status_code=404, detail="Tailored resume not found")
        if msg == "bullet_not_found":
            raise HTTPException(status_code=404, detail="Bullet not found")
        raise HTTPException(status_code=400, detail=msg)


@router.post("/{id}/bullets/{bid}:confirm")
async def confirm_bullet(
    id: str,
    bid: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Confirm a bullet: PENDING → CONFIRMED."""
    svc = TailoringService(session)
    try:
        return await svc.confirm_bullet(
            tailored_resume_id=id,
            bullet_id=bid,
            user_id=user_id,
        )
    except ValueError as exc:
        msg = str(exc)
        if msg == "not_found":
            raise HTTPException(status_code=404, detail="Tailored resume not found")
        if msg == "bullet_not_found":
            raise HTTPException(status_code=404, detail="Bullet not found")
        if msg == "bullet_not_pending":
            raise HTTPException(status_code=409, detail="Bullet is not in PENDING state")
        raise HTTPException(status_code=400, detail=msg)


@router.post("/{id}/exports")
async def export_tailoring(
    id: str,
    fmt: str = Query(default="pdf", pattern="^(pdf|txt)$"),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Export tailored resume. Requires all bullets confirmed. Consumes quota."""
    svc = TailoringService(session)
    try:
        return await svc.export(
            tailored_resume_id=id,
            fmt=fmt,
            user_id=user_id,
        )
    except ValueError as exc:
        msg = str(exc)
        if msg == "not_found":
            raise HTTPException(status_code=404, detail="Tailored resume not found")
        if msg == "quota_exceeded":
            raise HTTPException(status_code=402, detail="Tailoring quota exceeded")
        if msg.startswith("pending_bullets_exist"):
            count = msg.split(":")[1] if ":" in msg else "?"
            raise HTTPException(
                status_code=422,
                detail=f"Cannot export: {count} bullet(s) still in PENDING state",
            )
        raise HTTPException(status_code=400, detail=msg)
