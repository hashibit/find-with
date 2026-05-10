"""Encryption round-trip tests."""

import pytest
from app.security.crypto import encrypt_field, decrypt_field, generate_dek_kek_pair, _unwrap_dek


class TestEncryption:
    def test_round_trip(self):
        plaintext = "This is a secret resume section with PII data."
        ct = encrypt_field(plaintext)
        result = decrypt_field(ct)
        assert result == plaintext

    def test_different_nonces(self):
        """Same plaintext should produce different ciphertext (random nonce)."""
        pt = "same text"
        ct1 = encrypt_field(pt)
        ct2 = encrypt_field(pt)
        assert ct1 != ct2  # different nonces
        assert decrypt_field(ct1) == decrypt_field(ct2) == pt

    def test_unicode(self):
        pt = "中文简历内容 + émojis 🎉"
        assert decrypt_field(encrypt_field(pt)) == pt

    def test_empty_string(self):
        assert decrypt_field(encrypt_field("")) == ""

    def test_generate_dek_kek_pair(self):
        kek_b64, dek_ct_b64, dek_b64 = generate_dek_kek_pair()
        assert len(kek_b64) > 0
        assert len(dek_ct_b64) > 0
        assert len(dek_b64) > 0
