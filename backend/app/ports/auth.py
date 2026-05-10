"""Port: token verification.

Implementations:
  - ClerkTokenVerifier  (production — calls Clerk JWKS)
  - DevTokenVerifier    (dev/test — token IS the user identity)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TokenPayload:
    clerk_user_id: str
    email: str


class TokenVerifier(ABC):
    @abstractmethod
    async def verify(self, token: str) -> TokenPayload:
        """Verify a bearer token and return identity claims.

        Raises ValueError on invalid/expired token.
        """
        ...
