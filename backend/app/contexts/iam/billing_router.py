"""Billing HTTP routes (website-facing, §4.4)."""

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.contexts.iam.auth import get_current_user_id
from app.contexts.iam.billing_service import BillingService

router = APIRouter(prefix="/v1/billing", tags=["billing"])


@router.post("/checkout")
async def create_checkout(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    body = await request.json()
    svc = BillingService(session)
    return await svc.create_checkout(
        user_id=user_id,
        target_tier=body.get("plan", "PRO").upper(),
        success_url=body.get("success_url", "https://findwith.com/billing/success"),
        cancel_url=body.get("cancel_url", "https://findwith.com/pricing"),
    )


@router.post("/checkout/finalize")
async def finalize_checkout(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")

    svc = BillingService(session)
    return await svc.finalize_checkout(session_id)


@router.post("/portal")
async def create_portal(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    body = await request.json()
    svc = BillingService(session)
    return await svc.create_portal(
        user_id=user_id,
        return_url=body.get("return_url", "https://findwith.com/dashboard"),
    )


@router.post("/resume")
async def resume_subscription(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
):
    svc = BillingService(session)
    return await svc.resume(user_id)


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    raw_body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    svc = BillingService(session)
    return await svc.handle_webhook(raw_body, signature)
