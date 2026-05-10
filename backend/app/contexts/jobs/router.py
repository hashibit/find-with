"""Jobs HTTP routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.contexts.iam.auth import get_current_user_id
from app.contexts.jobs.service import (
    JobsService,
    NotFound,
    Forbidden,
    InvalidTransition,
)

router = APIRouter(prefix="/v1/jobs", tags=["jobs"])


@router.post("/captures", status_code=202)
async def create_capture(
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Capture a job listing. Idempotency-Key header required."""
    if not idempotency_key:
        raise HTTPException(status_code=400, detail="Idempotency-Key header is required")

    body = await request.json()
    svc = JobsService(session)
    return await svc.create_capture(
        user_id=user_id,
        capture_data=body,
        idempotency_key=idempotency_key,
    )


@router.get("/captures/{capture_id}/parsed")
async def get_parsed_jd(
    capture_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Get parsed job description for a capture. 404 while parse is pending."""
    svc = JobsService(session)
    try:
        return await svc.get_parsed_jd(capture_id)
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/captures/{capture_id}/match")
async def get_match(
    capture_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Get match result for a capture. 404 while compute is pending."""
    svc = JobsService(session)
    try:
        return await svc.get_match(capture_id=capture_id, user_id=user_id)
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/radar")
async def list_radar(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    """List radar items for the current user."""
    svc = JobsService(session)
    return await svc.list_radar(user_id)


@router.patch("/radar/{radar_id}/status")
async def update_radar_status(
    radar_id: str,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Transition radar item status. Validates state machine."""
    body = await request.json()
    new_status = body.get("status")
    note = body.get("note")

    if not new_status:
        raise HTTPException(status_code=400, detail="'status' field is required")

    svc = JobsService(session)
    try:
        return await svc.update_radar_status(
            radar_id=radar_id,
            user_id=user_id,
            new_status=new_status,
            note=note,
        )
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Forbidden:
        raise HTTPException(status_code=403, detail="Access denied")
    except InvalidTransition as exc:
        raise HTTPException(status_code=422, detail=str(exc))
