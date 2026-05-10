"""Billing HTTP routes (website-facing, §4.4)."""

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.deps import get_current_user_id, get_payment_gateway
from app.ports.payment import PaymentGateway
from app.contexts.iam.billing_service import BillingService

router = APIRouter(prefix="/v1/billing", tags=["billing"])


def _billing_svc(
    session: AsyncSession = Depends(get_session),
    gateway: PaymentGateway = Depends(get_payment_gateway),
) -> BillingService:
    return BillingService(session, gateway)


@router.post("/checkout")
async def create_checkout(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    svc: BillingService = Depends(_billing_svc),
):
    body = await request.json()
    return await svc.create_checkout(
        user_id=user_id,
        target_tier=body.get("plan", "PRO").upper(),
        success_url=body.get("success_url", "https://findwith.com/billing/success"),
        cancel_url=body.get("cancel_url", "https://findwith.com/pricing"),
    )


@router.post("/checkout/finalize")
async def finalize_checkout(
    request: Request,
    svc: BillingService = Depends(_billing_svc),
):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")
    return await svc.finalize_checkout(
        session_id, user_id=body.get("user_id"), target_tier=body.get("tier"),
    )


@router.post("/portal")
async def create_portal(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    svc: BillingService = Depends(_billing_svc),
):
    body = await request.json()
    return await svc.create_portal(
        user_id=user_id,
        return_url=body.get("return_url", "https://findwith.com/dashboard"),
    )


@router.post("/resume")
async def resume_subscription(
    user_id: str = Depends(get_current_user_id),
    svc: BillingService = Depends(_billing_svc),
):
    return await svc.resume(user_id)


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    svc: BillingService = Depends(_billing_svc),
):
    raw_body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    return await svc.handle_webhook(raw_body, signature)
