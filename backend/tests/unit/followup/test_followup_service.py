"""L1 unit tests for FollowupService — email kind mapping, body encryption, 30d cleanup.

PRD §5模块6: email classification drives radar status updates; body_text is
encrypted at rest and purged after 30 days while keeping parsed metadata.
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.parametrize("kind, expected_status", [
    ("REJECTION", "REJECTED"),
    ("INTERVIEW_REQUEST", "INTERVIEWING"),
    ("OFFER", "OFFERED"),
])
async def test_classify_maps_kind_to_radar_status(kind, expected_status):
    """Classified email kind must propagate to the linked radar item."""
    from app.contexts.followup.service import FollowupService
    from app.db.models.followup import FollowupEmail
    from app.db.models.jobs import JobRadarItem

    email = FollowupEmail(
        id="01E",
        user_id="u1",
        source="gmail-web",
        subject="re: your application",
        from_addr="recruiter@acme.com",
        body_text=None,
        radar_item_id="01R",
    )
    radar = JobRadarItem(id="01R", user_id="u1", capture_id="01C", status="WAITING")

    session = AsyncMock()
    # First execute → email lookup, second → radar lookup
    email_res = MagicMock()
    email_res.scalar_one_or_none.return_value = email
    radar_res = MagicMock()
    radar_res.scalar_one_or_none.return_value = radar
    session.execute.side_effect = [email_res, radar_res]

    svc = FollowupService(session)

    with patch(
        "app.contexts.followup.service._classify_with_llm",
        new=AsyncMock(return_value=(kind, {"company": "Acme"})),
    ):
        out = await svc.classify_email("01E")

    assert out["kind"] == kind
    assert email.kind == kind
    assert radar.status == expected_status


async def test_classify_other_kind_does_not_touch_radar():
    """OTHER / GHOSTED / INFO_REQUEST kinds must leave radar status alone."""
    from app.contexts.followup.service import FollowupService
    from app.db.models.followup import FollowupEmail

    email = FollowupEmail(
        id="01E", user_id="u1", source="gmail-web",
        subject="newsletter", from_addr="news@a.com",
        body_text=None, radar_item_id="01R",
    )

    session = AsyncMock()
    email_res = MagicMock()
    email_res.scalar_one_or_none.return_value = email
    session.execute.return_value = email_res

    svc = FollowupService(session)

    with patch(
        "app.contexts.followup.service._classify_with_llm",
        new=AsyncMock(return_value=("OTHER", {})),
    ):
        await svc.classify_email("01E")

    # session.execute called once for email lookup; never for radar update
    assert session.execute.call_count == 1


async def test_classify_email_without_radar_link_skips_status_propagation():
    """Email created without a radar_item_id must not blow up classification."""
    from app.contexts.followup.service import FollowupService
    from app.db.models.followup import FollowupEmail

    email = FollowupEmail(
        id="01E", user_id="u1", source="gmail-web",
        subject="x", from_addr="x@y.com",
        body_text=None, radar_item_id=None,
    )

    session = AsyncMock()
    email_res = MagicMock()
    email_res.scalar_one_or_none.return_value = email
    session.execute.return_value = email_res

    svc = FollowupService(session)

    with patch(
        "app.contexts.followup.service._classify_with_llm",
        new=AsyncMock(return_value=("REJECTION", {})),
    ):
        out = await svc.classify_email("01E")

    assert out["kind"] == "REJECTION"
    assert session.execute.call_count == 1  # no radar lookup


async def test_create_email_encrypts_body_text():
    """body_text must be stored as ciphertext bytes, never plaintext."""
    from app.contexts.followup.service import FollowupService

    captured = {}
    session = AsyncMock()

    def _capture_add(obj):
        captured["email"] = obj
    session.add = MagicMock(side_effect=_capture_add)

    svc = FollowupService(session)

    plaintext = "Hi, we'd like to schedule an interview."
    with patch("app.contexts.followup.service._enqueue_classify", new=AsyncMock()):
        await svc.create_email("u1", {
            "subject": "Interview",
            "from_addr": "hr@acme.com",
            "body_text": plaintext,
            "source": "gmail-web",
        })

    stored = captured["email"]
    # Encrypted: bytes, not the original string, not empty
    assert isinstance(stored.body_text, bytes)
    assert plaintext.encode() not in stored.body_text
    assert len(stored.body_text) > 0


async def test_cleanup_old_emails_nulls_body_after_30_days():
    """30-day retention: bodies older than cutoff → None; parsed metadata stays."""
    from app.contexts.followup.service import FollowupService
    from app.db.models.followup import FollowupEmail

    old = FollowupEmail(
        id="01OLD", user_id="u1", source="gmail-web",
        subject="old", from_addr="x@y.com",
        body_text=b"\x01encrypted-old",
    )
    # Force created_at to look old
    old.created_at = datetime.now(timezone.utc) - timedelta(days=45)

    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [old]
    session.execute.return_value = mock_result

    svc = FollowupService(session)
    count = await svc.cleanup_old_emails()

    assert count == 1
    assert old.body_text is None  # zeroed out


async def test_classify_invalid_kind_falls_back_to_other():
    """LLM returning an unknown kind string must be coerced to OTHER."""
    from app.contexts.followup.service import FollowupService
    from app.db.models.followup import FollowupEmail
    import json

    email = FollowupEmail(
        id="01E", user_id="u1", source="gmail-web",
        subject="x", from_addr="x@y.com",
        body_text=None, radar_item_id=None,
    )

    session = AsyncMock()
    email_res = MagicMock()
    email_res.scalar_one_or_none.return_value = email
    session.execute.return_value = email_res

    # Stub LLM at the provider level to return garbage kind
    from types import SimpleNamespace

    async def fake_stream(*_, **__):
        yield SimpleNamespace(
            kind="text",
            text=json.dumps({"kind": "MADE_UP_KIND", "company": "X"}),
        )

    svc = FollowupService(session)
    with patch("app.llm.client.LLMClient.stream", new=fake_stream):
        out = await svc.classify_email("01E")

    assert out["kind"] == "OTHER"
