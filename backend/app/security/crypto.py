"""Field-level encryption — thin wrapper over injected FieldCrypto port.

Usage unchanged: `encrypt_field(text) -> bytes`, `decrypt_field(bytes) -> str`.
Implementation (envelope vs ephemeral) resolved by deps.get_field_crypto().
"""

from app.deps import get_field_crypto


def encrypt_field(plaintext: str) -> bytes:
    return get_field_crypto().encrypt(plaintext)


def decrypt_field(data: bytes) -> str:
    return get_field_crypto().decrypt(data)


def verify_encryption_keys() -> None:
    get_field_crypto().verify()


def generate_dek_kek_pair() -> tuple[str, str, str]:
    """Utility: generate a new DEK+KEK pair for initial setup."""
    import base64
    import os
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    kek = AESGCM.generate_key(bit_length=256)
    dek = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(12)
    dek_ct = nonce + AESGCM(kek).encrypt(nonce, dek, None)

    return (
        base64.b64encode(kek).decode(),
        base64.b64encode(dek_ct).decode(),
        base64.b64encode(dek).decode(),
    )
