"""Integration test fixtures — testcontainers + webhook signing + mocks."""

import json
import hashlib
import hmac
import time
import os
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

os.environ["ENVIRONMENT"] = "test"

# --- Testcontainer fixtures (session-scoped) ---

@pytest.fixture(scope="session")
def pg():
    """Real pgvector/pg15 container — never mock Postgres."""
    from testcontainers.postgres import PostgresContainer
    with PostgresContainer("pgvector/pgvector:pg15", dbname="findwith_test") as c:
        yield c

@pytest.fixture(scope="session")
def redis_container():
    """Real Redis 7 container."""
    from testcontainers.core.container import DockerContainer
    with DockerContainer("redis:7-alpine").with_exposed_ports(6379) as c:
        c.start()
        yield c

@pytest.fixture(scope="session")
def minio_container():
    """MinIO container for S3-compatible storage."""
    from testcontainers.core.container import DockerContainer
    with DockerContainer("minio/minio:latest") \
        .with_exposed_ports(9000) \
        .with_env("MINIO_ROOT_USER", "minioadmin") \
        .with_env("MINIO_ROOT_PASSWORD", "minioadmin") \
        .with_command("server /data") as c:
        c.start()
        yield c

# --- Database session fixture ---

@pytest.fixture
async def db(pg):
    """Async DB session with SAVEPOINT rollback per test."""
    url = pg.get_connection_url().replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(url)

    # Run migrations on first use
    async with engine.begin() as conn:
        # Import all models to register them
        from app.db.models import iam, billing, profile, jobs, conversation, tailoring, apply, followup, recommendation, quota, outbox, idempotency
        from app.db.base import Base
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSession(engine) as session:
        async with session.begin():
            yield session
            await session.rollback()  # SAVEPOINT rollback

    await engine.dispose()

# --- App client fixture ---

@pytest.fixture
async def client():
    """HTTPX async client for FastAPI app."""
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

# --- DB snapshot for zero-diff assertions ---

@pytest.fixture
def db_table_snapshot(db):
    """Snapshot a table's contents for before/after comparison."""
    async def _snapshot(table_name: str) -> list[dict]:
        result = await db.execute(text(f"SELECT * FROM {table_name} ORDER BY 1"))
        rows = result.mappings().all()
        return [dict(r) for r in rows]
    return _snapshot

# --- Clerk webhook signing fixtures ---

@pytest.fixture
def svix_test_secret(monkeypatch):
    """Inject a test Clerk webhook secret."""
    from pydantic import SecretStr
    from app.config import settings
    secret = "whsec_test_" + "x" * 32
    monkeypatch.setattr(settings, "clerk_webhook_secret", secret)
    return secret

@pytest.fixture
def signed_clerk_webhook(svix_test_secret):
    """Sign a Clerk webhook payload with svix, returning (body_bytes, headers_dict)."""
    from svix.webhooks import Webhook
    from ulid import ULID

    def _sign(data: dict, type_: str):
        body = json.dumps({"type": type_, "data": data}).encode()
        wh = Webhook(svix_test_secret)
        msg_id = "msg_" + str(ULID())
        ts = datetime.now(timezone.utc)
        sig = wh.sign(msg_id, ts, body)
        return body, {
            "svix-id": msg_id,
            "svix-timestamp": str(int(ts.timestamp())),
            "svix-signature": sig,
        }
    return _sign

# --- Stripe webhook signing fixtures ---

@pytest.fixture
def stripe_test_whsec(monkeypatch):
    """Inject test Stripe webhook secret + API key."""
    from pydantic import SecretStr
    from app.config import settings
    secret = "whsec_test_stripe_" + "x" * 32
    monkeypatch.setattr(settings, "stripe_webhook_secret", secret)
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_stripe")
    return secret

@pytest.fixture
def signed_stripe_event(stripe_test_whsec):
    """Sign a Stripe event payload using HMAC-SHA256, returning (payload_bytes, sig_header).

    Uses public HMAC algorithm directly — does not depend on stripe SDK private
    method `_compute_signature`. Stripe webhook secret (whsec_ prefix) is used
    as UTF-8 encoded HMAC key (unlike svix which base64-decodes the secret).
    """
    def _sign(event_obj: dict, *, secret: str | None = None):
        payload = json.dumps(event_obj).encode()
        ts = int(time.time())
        use = secret or stripe_test_whsec
        signed_payload = f"{ts}.".encode() + payload
        sig = hmac.new(use.encode(), signed_payload, hashlib.sha256).hexdigest()
        return payload, f"t={ts},v1={sig}"
    return _sign

# --- Sentry mock ---

@pytest.fixture
def sentry_mock(monkeypatch):
    """Capture Sentry events for assertion."""
    events = []
    monkeypatch.setattr("sentry_sdk.capture_event", lambda e: events.append(e))
    monkeypatch.setattr("sentry_sdk.capture_message", lambda m, **kw: events.append({"message": m, **kw}))
    return SimpleNamespace(events=events, last=lambda: events[-1] if events else None)

# --- Clerk JWT test keypair ---

@pytest.fixture
def clerk_test_keypair():
    """RSA keypair for test Clerk JWT signing (not production keys)."""
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()

    return SimpleNamespace(
        private_key=private_key,
        public_key=public_key,
        kid="test-key-1",
    )
