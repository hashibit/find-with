"""Idempotency middleware — Idempotency-Key header → Redis 24h (P0-S2)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Routes that require idempotency keys
IDEMPOTENT_ROUTES = {
    "/v1/jobs/captures",
    "/v1/apply/applications",
    "/v1/followup/emails",
    "/v1/tailoring",
}


class IdempotencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method != "POST":
            return await call_next(request)

        path = request.url.path
        idem_key = request.headers.get("Idempotency-Key")

        # Check if route requires idempotency
        requires_key = any(path.startswith(r) for r in IDEMPOTENT_ROUTES)

        if requires_key and not idem_key:
            return JSONResponse(
                status_code=400,
                content={"error": "Idempotency-Key header required for this endpoint"},
            )

        if not idem_key:
            return await call_next(request)

        # Check Redis for existing key
        from app.db.redis import redis_pool

        cache_key = f"idem:{idem_key}"
        cached = await redis_pool.get(cache_key)

        if cached:
            data = json.loads(cached)
            if data.get("status") == "in_flight":
                # Request is still being processed
                return JSONResponse(
                    status_code=409,
                    content={"error": "Request with this Idempotency-Key is in flight"},
                )
            # Return cached response
            return JSONResponse(
                status_code=data.get("status_code", 200),
                content=data.get("body", {}),
            )

        # Mark as in-flight
        await redis_pool.set(cache_key, json.dumps({"status": "in_flight"}), ex=86400)

        try:
            response = await call_next(request)

            # Cache successful responses
            if response.status_code < 500:
                body = b""
                async for chunk in response.body_iterator:
                    body += chunk if isinstance(chunk, bytes) else chunk.encode()

                cache_data = {
                    "status_code": response.status_code,
                    "body": json.loads(body) if body else {},
                }
                await redis_pool.set(cache_key, json.dumps(cache_data), ex=86400)

                return Response(
                    content=body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                )

            # On server error, remove the in-flight marker
            await redis_pool.delete(cache_key)
            return response

        except Exception:
            await redis_pool.delete(cache_key)
            raise
