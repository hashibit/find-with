"""Profile HTTP routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.contexts.iam.auth import get_current_user_id
from app.contexts.profile.service import ProfileService, ETagMismatch, NotFound, Forbidden

router = APIRouter(prefix="/v1/profile", tags=["profile"])


# ------------------------------------------------------------------
# Resume upload & parse status
# ------------------------------------------------------------------

@router.post("/resumes", status_code=202)
async def upload_resume(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Upload a resume file (PDF or DOCX). Enqueues async parse."""
    content_type = file.content_type or "application/octet-stream"
    if content_type not in (
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ):
        raise HTTPException(status_code=415, detail="Only PDF and DOCX are supported")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    svc = ProfileService(session)
    record = await svc.upload_resume(
        user_id=user_id,
        filename=file.filename or "resume",
        content_type=content_type,
        data=data,
    )
    return {"resume_id": record.id, "parse_status": record.parse_status}


@router.get("/resumes/{resume_id}")
async def get_parse_status(
    resume_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Poll parse status for a previously uploaded resume."""
    svc = ProfileService(session)
    try:
        record = await svc.get_parse_status(resume_id)
    except NotFound:
        raise HTTPException(status_code=404, detail="Resume not found")

    if record.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "resume_id": record.id,
        "parse_status": record.parse_status,
        "parse_error": record.parse_error,
        "uploaded_at": record.uploaded_at.isoformat() if record.uploaded_at else None,
    }


# ------------------------------------------------------------------
# Profile read / update
# ------------------------------------------------------------------

@router.get("/me")
async def get_profile(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Return full profile with sub-entities."""
    svc = ProfileService(session)
    profile = await svc.get_profile(user_id)
    return JSONResponse(
        content=profile,
        headers={"ETag": f'"{profile.get("etag", "")}"'},
    )


@router.patch("/me")
async def update_profile(
    request: Request,
    if_match: str | None = Header(default=None),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Update profile fields. Requires If-Match header for optimistic locking."""
    if not if_match:
        raise HTTPException(status_code=428, detail="If-Match header is required")

    # Strip surrounding quotes from ETag header value
    etag = if_match.strip('"')

    body = await request.json()
    svc = ProfileService(session)
    try:
        profile = await svc.update_profile(user_id=user_id, patch=body, etag=etag)
    except ETagMismatch as exc:
        raise HTTPException(status_code=412, detail=str(exc))

    return JSONResponse(
        content=profile,
        headers={"ETag": f'"{profile.get("etag", "")}"'},
    )


# ------------------------------------------------------------------
# Materials
# ------------------------------------------------------------------

@router.get("/me/materials")
async def list_materials(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    """List all material items for the current user."""
    svc = ProfileService(session)
    return await svc.list_materials(user_id)


@router.put("/me/materials/{material_id}")
async def update_material(
    material_id: str,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Update a material item."""
    body = await request.json()
    svc = ProfileService(session)
    try:
        return await svc.update_material(material_id=material_id, user_id=user_id, patch=body)
    except NotFound:
        raise HTTPException(status_code=404, detail="Material not found")
    except Forbidden:
        raise HTTPException(status_code=403, detail="Access denied")


@router.post("/me/materials/{material_id}:confirm")
async def confirm_material(
    material_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Mark a material as CONFIRMED."""
    svc = ProfileService(session)
    try:
        return await svc.confirm_material(material_id=material_id, user_id=user_id)
    except NotFound:
        raise HTTPException(status_code=404, detail="Material not found")
    except Forbidden:
        raise HTTPException(status_code=403, detail="Access denied")


@router.delete("/me/materials/{material_id}", status_code=204)
async def delete_material(
    material_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a material item."""
    svc = ProfileService(session)
    try:
        await svc.delete_material(material_id=material_id, user_id=user_id)
    except NotFound:
        raise HTTPException(status_code=404, detail="Material not found")
    except Forbidden:
        raise HTTPException(status_code=403, detail="Access denied")


# ------------------------------------------------------------------
# Base resumes
# ------------------------------------------------------------------

@router.get("/me/base-resumes")
async def list_base_resumes(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    """List base resumes for the current user."""
    svc = ProfileService(session)
    return await svc.list_base_resumes(user_id)


@router.post("/me/base-resumes", status_code=201)
async def create_base_resume(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Create a new base resume."""
    body = await request.json()
    name = body.get("name", "Default")
    svc = ProfileService(session)
    return await svc.create_base_resume(user_id=user_id, name=name)


# ------------------------------------------------------------------
# GDPR export
# ------------------------------------------------------------------

@router.post("/me:export")
async def export_profile(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """GDPR: export all profile data as JSON."""
    svc = ProfileService(session)
    return await svc.export_profile(user_id)
