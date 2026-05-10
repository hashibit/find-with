"""Dev/test token verifier — token IS the user identity, no network call."""

from app.ports.auth import TokenVerifier, TokenPayload


class DevTokenVerifier(TokenVerifier):
    async def verify(self, token: str) -> TokenPayload:
        return TokenPayload(
            clerk_user_id=f"dev_{token}",
            email=f"{token}@dev.findwith.local",
        )
