"""Rate limiting middleware — token bucket per user+endpoint (P0-S2)."""

from __future__ import annotations

import logging
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Rate limits: (requests, window_seconds)
RATE_LIMITS: dict[str, tuple[int, int]] = {
    "/v1/conversations": (6, 60),       # 6 req/min for conversation messages
    "/v1/tailoring": (10, 60),           # 10 req/min
    "/v1/profile/resumes": (5, 60),      # 5 uploads/min
    "default": (60, 60),                  # 60 req/min general
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Extract user identity (from auth header or IP)
        auth = request.headers.get("Authorization", "")
        user_key = auth[7:20] if auth.startswith("Bearer ") else (request.client.host if request.client else "anon")

        # Find matching rate limit
        path = request.url.path
        limit_config = RATE_LIMITS.get("default")
        for prefix, config in RATE_LIMITS.items():
            if prefix != "default" and path.startswith(prefix):
                limit_config = config
                break

        max_requests, window = limit_config  # type: ignore

        # Token bucket via Redis
        from app.db.redis import redis_pool

        bucket_key = f"rl:{user_key}:{path.split('/')[1:3]}"

        try:
            current = await redis_pool.get(bucket_key)
            if current and int(current) >= max_requests:
                return JSONResponse(
                    status_code=429,
                    content={"error": "Rate limit exceeded", "retry_after": window},
                    headers={"Retry-After": str(window)},
                )

            pipe = redis_pool.pipeline()
            pipe.incr(bucket_key)
            pipe.expire(bucket_key, window)
            await pipe.execute()

        except Exception:
            # Redis down → allow request (fail-open)
            logger.warning("Rate limit check failed (Redis unavailable)")

        return await call_next(request)
