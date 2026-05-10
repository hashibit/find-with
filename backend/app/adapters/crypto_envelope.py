"""Envelope encryption — production (KEK unwraps DEK, AES-256-GCM)."""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.ports.crypto import FieldCrypto


class EnvelopeCrypto(FieldCrypto):
    def __init__(self, kek_b64: str, dek_ciphertext_b64: str):
        kek = base64.b64decode(kek_b64)
        dek_ct = base64.b64decode(dek_ciphertext_b64)
        nonce, ct = dek_ct[:12], dek_ct[12:]
        try:
            self._dek = AESGCM(kek).decrypt(nonce, ct, None)
        except Exception as exc:
            raise RuntimeError(f"Failed to unwrap DEK with KEK: {exc}") from exc

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
