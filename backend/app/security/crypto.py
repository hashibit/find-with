"""Field-level encryption — AES-256 envelope (DEK/KEK).

§12.1: Day-1 mandatory. Columns: resume bytes, email body, material.raw_text.
"""

import base64
import hashlib
import os
from functools import lru_cache

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings

_DEK_PLAINTEXT: bytes | None = None


def _unwrap_dek() -> bytes:
    """Decrypt DEK using KEK (envelope encryption). Fail-fast if invalid."""
    global _DEK_PLAINTEXT
    if _DEK_PLAINTEXT is not None:
        return _DEK_PLAINTEXT

    if not settings.kek or not settings.dek_ciphertext:
        if settings.environment == "test":
            # Test mode: generate ephemeral key
            _DEK_PLAINTEXT = AESGCM.generate_key(bit_length=256)
            return _DEK_PLAINTEXT
        raise RuntimeError(
            "KEK or DEK_CIPHERTEXT not configured. "
            "Field-level encryption is mandatory (§12.1). "
            "Set KEK and DEK_CIPHERTEXT environment variables."
        )

    kek_bytes = base64.b64decode(settings.kek)
    dek_ct = base64.b64decode(settings.dek_ciphertext)

    # DEK ciphertext format: nonce(12) || ciphertext(32+16)
    nonce = dek_ct[:12]
    ct = dek_ct[12:]

    aesgcm = AESGCM(kek_bytes)
    try:
        _DEK_PLAINTEXT = aesgcm.decrypt(nonce, ct, None)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to unwrap DEK with KEK — check key material. Error: {exc}"
        ) from exc

    # Clear env var after unwrap (defense in depth)
    os.environ.pop("DEK_CIPHERTEXT", None)

    return _DEK_PLAINTEXT


def encrypt_field(plaintext: str) -> bytes:
    """Encrypt a text field → bytes (nonce || ciphertext)."""
    dek = _unwrap_dek()
    aesgcm = AESGCM(dek)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return nonce + ct


def decrypt_field(data: bytes) -> str:
    """Decrypt bytes → plaintext string."""
    dek = _unwrap_dek()
    nonce = data[:12]
    ct = data[12:]
    aesgcm = AESGCM(dek)
    return aesgcm.decrypt(nonce, ct, None).decode("utf-8")


def verify_encryption_keys():
    """Startup fail-fast: verify KEK can unwrap DEK and round-trip works."""
    try:
        dek = _unwrap_dek()
        # Round-trip test
        test_pt = "findwith-encryption-verify"
        ct = encrypt_field(test_pt)
        result = decrypt_field(ct)
        assert result == test_pt, "Encryption round-trip failed"
    except Exception as exc:
        import sentry_sdk
        sentry_sdk.capture_exception(exc)
        raise SystemExit(f"FATAL: Encryption verification failed: {exc}") from exc


def generate_dek_kek_pair() -> tuple[str, str, str]:
    """Utility: generate a new DEK+KEK pair for initial setup.

    Returns (kek_b64, dek_ciphertext_b64, dek_plaintext_b64).
    """
    kek = AESGCM.generate_key(bit_length=256)
    dek = AESGCM.generate_key(bit_length=256)

    aesgcm = AESGCM(kek)
    nonce = os.urandom(12)
    dek_ct = nonce + aesgcm.encrypt(nonce, dek, None)

    return (
        base64.b64encode(kek).decode(),
        base64.b64encode(dek_ct).decode(),
        base64.b64encode(dek).decode(),
    )
