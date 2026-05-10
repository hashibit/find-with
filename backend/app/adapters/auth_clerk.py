"""Clerk JWT verification — production implementation."""

from __future__ import annotations

import logging
import time

import httpx
from jose import jwt

from app.ports.auth import TokenVerifier, TokenPayload

logger = logging.getLogger(__name__)

_jwks_cache: dict | None = None
_jwks_cache_time: float = 0
_JWKS_TTL = 3600


class ClerkTokenVerifier(TokenVerifier):
    def __init__(self, jwks_url: str):
        self._jwks_url = jwks_url

    async def verify(self, token: str) -> TokenPayload:
        jwks = await self._get_jwks()
        try:
            payload = jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False})
        except Exception as exc:
            raise ValueError(f"JWT verification failed: {exc}") from exc

        sub = payload.get("sub", "")
        if not sub:
            raise ValueError("Token missing sub claim")

        return TokenPayload(clerk_user_id=sub, email=payload.get("email", ""))

    async def _get_jwks(self) -> dict:
        global _jwks_cache, _jwks_cache_time
        if _jwks_cache and (time.time() - _jwks_cache_time) < _JWKS_TTL:
            return _jwks_cache
        async with httpx.AsyncClient() as client:
            resp = await client.get(self._jwks_url)
            resp.raise_for_status()
            _jwks_cache = resp.json()
            _jwks_cache_time = time.time()
        return _jwks_cache  # type: ignore
