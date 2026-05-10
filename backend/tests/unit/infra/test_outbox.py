"""L1 unit tests for outbox — consumer_group routing."""

import pytest


def test_outbox_event_has_consumer_group():
    """OutboxEvent must have consumer_group for U-02 routing."""
    from app.db.models.outbox import OutboxEvent

    cols = {c.name for c in OutboxEvent.__table__.columns}
    assert "consumer_group" in cols
    assert "event_type" in cols
    assert "payload" in cols
    assert "dispatched_at" in cols


def test_outbox_consumer_group_not_nullable():
    """consumer_group must be NOT NULL."""
    from app.db.models.outbox import OutboxEvent

    col = OutboxEvent.__table__.columns["consumer_group"]
    assert col.nullable is False


def test_idempotency_key_model():
    """IdempotencyKey tracks key + key_type."""
    from app.db.models.idempotency import IdempotencyKey

    cols = {c.name for c in IdempotencyKey.__table__.columns}
    assert "key" in cols
    assert "key_type" in cols
    assert "response_body" in cols
