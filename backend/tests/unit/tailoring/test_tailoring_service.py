"""L1 unit tests for TailoringService — provenance, PENDING export gate, quota gate.

These tests protect the PRD §5模块4 "灵魂" — never fabricate experiences, every
bullet has a confirmable source, exports gated until user resolves PENDING state.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _resume_with_sections(sections):
    """Build a TailoringResume-like object whose .sections is mutable."""
    from app.db.models.tailoring import TailoringResume

    r = TailoringResume(
        id="01TR_TEST",
        user_id="u1",
        base_resume_id="01BR",
        parsed_jd_id="01PJD",
    )
    r.sections = sections
    return r


async def test_export_blocked_when_pending_bullets_exist():
    """PRD §5模块4.4 — bullets in PENDING state must block export."""
    from app.contexts.tailoring.service import TailoringService

    resume = _resume_with_sections([
        {"title": "Experience", "bullets": [
            {"id": "b1", "text": "X", "state": "CONFIRMED"},
            {"id": "b2", "text": "Y", "state": "PENDING"},
        ]},
    ])
    svc = TailoringService(AsyncMock())

    with patch.object(svc, "get", return_value=resume):
        with pytest.raises(ValueError) as exc:
            await svc.export("01TR_TEST", fmt="pdf", user_id="u1")

    assert "pending_bullets_exist" in str(exc.value)
    assert "1" in str(exc.value)  # count of pending bullets


async def test_export_with_all_confirmed_succeeds_and_consumes_quota():
    """All bullets CONFIRMED → export proceeds, quota consume invoked."""
    from app.contexts.tailoring.service import TailoringService

    resume = _resume_with_sections([
        {"title": "Experience", "bullets": [
            {"id": "b1", "text": "Delivered X", "state": "CONFIRMED"},
        ]},
    ])

    session = AsyncMock()
    session.add = MagicMock()
    svc = TailoringService(session)

    with patch.object(svc, "get", return_value=resume), \
         patch("app.contexts.quota.service.QuotaService.consume_on_export",
               new=AsyncMock(return_value=True)) as consume:
        result = await svc.export("01TR_TEST", fmt="txt", user_id="u1")

    assert result["fmt"] == "txt"
    consume.assert_awaited_once_with("u1", "01TR_TEST")


async def test_export_aborts_when_quota_exhausted():
    """quota.consume returns False → ValueError(quota_exceeded), no snapshot."""
    from app.contexts.tailoring.service import TailoringService

    resume = _resume_with_sections([
        {"title": "Experience", "bullets": [
            {"id": "b1", "text": "X", "state": "CONFIRMED"},
        ]},
    ])

    session = AsyncMock()
    svc = TailoringService(session)

    with patch.object(svc, "get", return_value=resume), \
         patch("app.contexts.quota.service.QuotaService.consume_on_export",
               new=AsyncMock(return_value=False)):
        with pytest.raises(ValueError) as exc:
            await svc.export("01TR_TEST", fmt="txt", user_id="u1")

    assert "quota_exceeded" in str(exc.value)


async def test_create_rejected_when_quota_exceeded():
    """create() must run quota.check first — refuse when allowed=False."""
    from app.contexts.tailoring.service import TailoringService

    session = AsyncMock()
    svc = TailoringService(session)

    with patch("app.contexts.quota.service.QuotaService.check",
               new=AsyncMock(return_value={"allowed": False, "remaining": 0})):
        with pytest.raises(ValueError) as exc:
            await svc.create(user_id="u1", radar_item_id="r1", base_resume_id="br1")

    assert "quota_exceeded" in str(exc.value)


async def test_re_apply_material_rejects_proposed_status():
    """PRD §5.1.4 — only CONFIRMED/USER_EDITED material may be applied to resume.

    Why: PROPOSED material has not been verified by the user; using it would let
    Quinn invent unconfirmed experiences into the resume.
    """
    from app.contexts.tailoring.service import TailoringService
    from app.db.models.profile import ProfileMaterial

    material = ProfileMaterial(
        id="01M",
        user_id="u1",
        raw_text=b"raw",
        shining_text="Polished version",
        provenance_kind="conversation",
        status="PROPOSED",  # not yet confirmed
    )

    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = material
    session.execute.return_value = mock_result

    svc = TailoringService(session)

    with pytest.raises(ValueError) as exc:
        await svc.re_apply_material(
            material_id="01M",
            tailored_resume_id="01TR",
            user_id="u1",
        )

    assert "material_status_invalid" in str(exc.value)
    assert "PROPOSED" in str(exc.value)


@pytest.mark.parametrize("good_status", ["CONFIRMED", "USER_EDITED"])
async def test_re_apply_material_accepts_confirmed_or_edited(good_status):
    """Both CONFIRMED and USER_EDITED material may flow into a resume."""
    from app.contexts.tailoring.service import TailoringService
    from app.db.models.profile import ProfileMaterial

    material = ProfileMaterial(
        id="01M",
        user_id="u1",
        raw_text=b"raw",
        shining_text="Polished",
        provenance_kind="conversation",
        status=good_status,
    )
    resume = _resume_with_sections([
        {"title": "Experience", "bullets": [
            {"id": "b1", "text": "old", "state": "PENDING", "material_id": "01M"},
        ]},
    ])

    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = material
    session.execute.return_value = mock_result

    svc = TailoringService(session)
    with patch.object(svc, "get", return_value=resume):
        out = await svc.re_apply_material(
            material_id="01M",
            tailored_resume_id="01TR",
            user_id="u1",
        )

    assert out["updated_bullets"] == 1
    assert resume.sections[0]["bullets"][0]["text"] == "Polished"


async def test_update_bullet_records_provenance_and_sets_pending():
    """Edited bullets must enter PENDING state with a provenance audit row."""
    from app.contexts.tailoring.service import TailoringService

    resume = _resume_with_sections([
        {"title": "Experience", "bullets": [
            {"id": "b1", "text": "Original text", "state": "CONFIRMED"},
        ]},
    ])

    session = AsyncMock()
    svc = TailoringService(session)

    # Stub LLM to return deterministic output. TailoringService reads
    # event.kind == "text" and event.text, so the stubbed event must expose both.
    from types import SimpleNamespace

    async def fake_stream(*_, **__):
        yield SimpleNamespace(kind="text", text="Tightened bullet text")

    with patch.object(svc, "get", return_value=resume), \
         patch("app.llm.client.LLMClient.stream", new=fake_stream):
        out = await svc.update_bullet(
            tailored_resume_id="01TR",
            bullet_id="b1",
            kind="tighten",
            text="make it shorter",
            user_id="u1",
        )

    bullet = resume.sections[0]["bullets"][0]
    assert bullet["state"] == "PENDING"
    assert "provenance" in bullet and len(bullet["provenance"]) == 1
    assert bullet["provenance"][0]["prev_text"] == "Original text"
    assert bullet["provenance"][0]["kind"] == "tighten"
    assert out["state"] == "PENDING"


async def test_confirm_bullet_rejects_already_confirmed():
    """Cannot confirm a bullet that is not PENDING."""
    from app.contexts.tailoring.service import TailoringService

    resume = _resume_with_sections([
        {"title": "Experience", "bullets": [
            {"id": "b1", "text": "X", "state": "CONFIRMED"},
        ]},
    ])

    session = AsyncMock()
    svc = TailoringService(session)
    with patch.object(svc, "get", return_value=resume):
        with pytest.raises(ValueError) as exc:
            await svc.confirm_bullet("01TR", "b1", "u1")

    assert "bullet_not_pending" in str(exc.value)
