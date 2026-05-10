"""Ephemeral encryption — dev/test (random key per process, data non-portable)."""

from __future__ import annotations

import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.ports.crypto import FieldCrypto


class EphemeralCrypto(FieldCrypto):
    def __init__(self) -> None:
        self._dek = AESGCM.generate_key(bit_length=256)

    def encrypt(self, plaintext: str) -> bytes:
        nonce = os.urandom(12)
        ct = AESGCM(self._dek).encrypt(nonce, plaintext.encode(), None)
        return nonce + ct

    def decrypt(self, ciphertext: bytes) -> str:
        nonce, ct = ciphertext[:12], ciphertext[12:]
        return AESGCM(self._dek).decrypt(nonce, ct, None).decode()

    def verify(self) -> None:
        pt = "findwith-verify"
        assert self.decrypt(self.encrypt(pt)) == pt
