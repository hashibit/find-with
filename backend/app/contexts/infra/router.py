"""Infrastructure routes — telemetry, config."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.contexts.iam.auth import get_current_user_id

router = APIRouter(prefix="/v1", tags=["infra"])


@router.post("/telemetry/events:batch")
async def ingest_telemetry(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Ingest batch of client telemetry events."""
    from app.contexts.infra.telemetry import TelemetryService
    body = await request.json()
    events = body.get("events", [])
    svc = TelemetryService(session)
    return await svc.ingest_batch(events)


@router.get("/config/selectors")
async def get_selectors(request: Request):
    """Remote selector configuration for content scripts (§8.4)."""
    # ETag support
    etag = "v1-selectors-default"
    if request.headers.get("if-none-match") == etag:
        from fastapi.responses import Response
        return Response(status_code=304)

    selectors = {
        "linkedin.job_detail.title": [
            "h1.t-24",
            "h1[data-test-component='job-title']",
            ".job-details-jobs-unified-top-card__job-title h1",
            "h1",
        ],
        "linkedin.job_detail.company": [
            "a.topcard__org-name-link",
            ".job-details-jobs-unified-top-card__company-name a",
            ".topcard__flavors a",
        ],
        "linkedin.job_detail.description": [
            ".jobs-description__content",
            ".description__text",
            "section.description",
            "div[class*='description']",
        ],
        "linkedin.job_detail.location": [
            ".topcard__flavor--bullet",
            ".job-details-jobs-unified-top-card__bullet",
        ],
        "linkedin.easy_apply.form_fields": [
            "div.jobs-easy-apply-content",
            "form.jobs-easy-apply-form",
        ],
        "gmail.email.subject": [
            "h2[data-thread-perm-id]",
            "h2.hP",
        ],
        "gmail.email.from": [
            "span.gD",
            "span[email]",
        ],
        "gmail.email.body": [
            "div.a3s.aiL",
            "div[role='list'] div.a3s",
        ],
    }

    from fastapi.responses import JSONResponse
    resp = JSONResponse(content=selectors)
    resp.headers["ETag"] = etag
    resp.headers["Cache-Control"] = "public, max-age=30"
    return resp
