"""Authentication — Clerk JWT verification + auth code exchange (U-03)."""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_session

logger = logging.getLogger(__name__)

# JWT verification cache
_jwks_cache: dict[str, Any] | None = None
_jwks_cache_time: float = 0
JWKS_CACHE_TTL = 3600  # 1 hour


async def get_current_user_id(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> str:
    """Extract and verify Clerk JWT from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header[7:]

    if settings.environment == "test":
        # In test mode, treat token as user_id directly
        return token

    try:
        from jose import jwt, JWTError
        # Fetch JWKS
        jwks = await _get_jwks()
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        clerk_user_id = payload.get("sub", "")
        if not clerk_user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no sub claim")

        # Lazy sync user
        from app.contexts.iam.service import IAMService
        svc = IAMService(session)
        user = await svc.get_user_by_clerk_id(clerk_user_id)
        if not user:
            user = await svc.get_or_create_user(
                clerk_user_id=clerk_user_id,
                email=payload.get("email", "unknown@findwith.com"),
            )

        return user.id

    except Exception as e:
        logger.warning("JWT verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def _get_jwks() -> dict:
    """Fetch and cache Clerk JWKS."""
    global _jwks_cache, _jwks_cache_time

    if _jwks_cache and (time.time() - _jwks_cache_time) < JWKS_CACHE_TTL:
        return _jwks_cache

    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(settings.clerk_jwks_url)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_cache_time = time.time()

    return _jwks_cache  # type: ignore


async def exchange_auth_code(code: str, client_ip: str, session: AsyncSession) -> dict | None:
    """U-03: Exchange one-time auth code for session token.

    Code stored in Redis with: user_id, ip, created_at, consumed.
    """
    from app.db.redis import redis_pool

    key = f"auth_code:{code}"
    data = await redis_pool.hgetall(key)

    if not data:
        return None

    # Check if already consumed
    if data.get("consumed") == "1":
        return None

    # Check IP binding
    if data.get("ip") and data.get("ip") != client_ip:
        logger.warning("Auth code IP mismatch: expected=%s, got=%s", data.get("ip"), client_ip)
        return None

    # Check TTL (5 min)
    created_at = float(data.get("created_at", "0"))
    if time.time() - created_at > 300:
        return None

    # Mark consumed
    await redis_pool.hset(key, "consumed", "1")
    await redis_pool.expire(key, 60)  # Cleanup after 1 min

    # Get or create user
    from app.contexts.iam.service import IAMService
    svc = IAMService(session)
    user = await svc.get_user_by_clerk_id(data.get("clerk_user_id", ""))
    if not user:
        user = await svc.get_or_create_user(
            clerk_user_id=data.get("clerk_user_id", ""),
            email=data.get("email", ""),
        )

    # Generate short-lived token (10 min)
    from jose import jwt
    token = jwt.encode(
        {
            "sub": user.clerk_user_id,
            "user_id": user.id,
            "exp": int(time.time()) + 600,
        },
        settings.clerk_secret_key,
        algorithm="HS256",
    )

    return {
        "token": token,
        "expires_at": int(time.time()) + 600,
        "user_id": user.id,
    }
