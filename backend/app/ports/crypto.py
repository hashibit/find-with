"""Port: field-level encryption.

Implementations:
  - EnvelopeCrypto    (production — KEK/DEK envelope with AES-256-GCM)
  - EphemeralCrypto   (dev/test — random key per process lifetime)
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class FieldCrypto(ABC):
    @abstractmethod
    def encrypt(self, plaintext: str) -> bytes: ...

    @abstractmethod
    def decrypt(self, ciphertext: bytes) -> str: ...

    @abstractmethod
    def verify(self) -> None:
        """Startup self-check. Raises on failure."""
        ...
