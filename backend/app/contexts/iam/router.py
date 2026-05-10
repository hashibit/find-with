"""IAM HTTP routes."""

from fastapi import APIRouter, Depends, Request, Response, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.contexts.iam.service import IAMService
from app.contexts.iam.auth import get_current_user_id

router = APIRouter(prefix="/v1", tags=["iam"])


@router.get("/me/entitlements")
async def get_entitlements(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Product-side entitlements read (subscription written by website)."""
    svc = IAMService(session)
    return await svc.get_entitlements(user_id)


@router.get("/me/quota")
async def get_quota(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    """Current quota usage snapshot."""
    from app.contexts.quota.service import QuotaService
    svc = QuotaService(session)
    return await svc.get_usage(user_id)


@router.post("/iam/webhooks/clerk")
async def clerk_webhook(request: Request, session: AsyncSession = Depends(get_session)):
    """Clerk webhook handler — user.created / user.deleted events."""
    from svix.webhooks import Webhook, WebhookVerificationError
    from app.config import settings

    payload = await request.body()
    headers = {
        "svix-id": request.headers.get("svix-id", ""),
        "svix-timestamp": request.headers.get("svix-timestamp", ""),
        "svix-signature": request.headers.get("svix-signature", ""),
    }
    # Signature verification MUST happen before event_type dispatch to ensure
    # all event types (including future user.updated / session.created / etc.)
    # are protected. Do not move this into if/elif branches.
    try:
        wh = Webhook(settings.clerk_webhook_secret)
        body = wh.verify(payload, headers)
    except WebhookVerificationError:
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event_type = body.get("type", "")
    svc = IAMService(session)

    if event_type == "user.created":
        data = body.get("data", {})
        await svc.get_or_create_user(
            clerk_user_id=data.get("id", ""),
            email=data.get("email_addresses", [{}])[0].get("email_address", ""),
            full_name=f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or None,
        )
    elif event_type == "user.deleted":
        data = body.get("data", {})
        user = await svc.get_user_by_clerk_id(data.get("id", ""))
        if user:
            await svc.soft_delete_user(user.id)

    return {"received": True}


@router.post("/iam/auth/exchange")
async def auth_exchange(request: Request, session: AsyncSession = Depends(get_session)):
    """U-03: Exchange one-time auth_code for JWT (nonce flow)."""
    body = await request.json()
    code = body.get("code") or body.get("nonce")
    if not code:
        raise HTTPException(status_code=400, detail="Missing code/nonce")

    from app.contexts.iam.auth import exchange_auth_code
    result = await exchange_auth_code(code, request.client.host if request.client else "", session)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid or expired code")

    return result
