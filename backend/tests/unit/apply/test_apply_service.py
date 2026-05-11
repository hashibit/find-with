"""L1 unit tests for ApplyService — fill plan ownership, approval flow.

PRD §5模块5: Quinn fills the form but the user clicks Submit. Ownership and
double-approve guards prevent a different user from submitting on someone's behalf.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _radar(user_id="u1"):
    from app.db.models.jobs import JobRadarItem
    return JobRadarItem(
        id="01R", user_id=user_id, capture_id="01C", status="TAILORING",
    )


async def test_create_fill_plan_rejects_when_radar_belongs_to_other_user():
    """Querying with composite (id, user_id) returns None → ValueError."""
    from app.contexts.apply.service import ApplyService

    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # no match
    session.execute.return_value = mock_result

    svc = ApplyService(session)
    with pytest.raises(ValueError) as exc:
        await svc.create_fill_plan(
            user_id="u_attacker",
            radar_item_id="01R",
            page_signals={"fields": []},
        )
    assert "radar_item_not_found" in str(exc.value)


async def test_approve_fill_plan_rejects_double_approval():
    """Already-approved plan must not transition again."""
    from app.contexts.apply.service import ApplyService
    from app.db.models.apply import ApplyFillPlan

    plan = ApplyFillPlan(
        id="01P", user_id="u1", radar_item_id="01R",
        fields=[], preview_summary="", user_approved=True,
    )

    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = plan
    session.execute.return_value = mock_result

    svc = ApplyService(session)
    with pytest.raises(ValueError) as exc:
        await svc.approve_fill_plan(fill_plan_id="01P", user_id="u1")

    assert "already_approved" in str(exc.value)


async def test_approve_fill_plan_other_user_returns_not_found():
    """Other-user approval attempt should look like 'not found' (no info leak)."""
    from app.contexts.apply.service import ApplyService

    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    session.execute.return_value = mock_result

    svc = ApplyService(session)
    with pytest.raises(ValueError) as exc:
        await svc.approve_fill_plan(fill_plan_id="01P", user_id="u_other")
    assert "fill_plan_not_found" in str(exc.value)


async def test_approve_fill_plan_sets_approved_at_timestamp():
    """Approval must stamp approved_at — used for audit + LinkedIn submit gate."""
    from app.contexts.apply.service import ApplyService
    from app.db.models.apply import ApplyFillPlan

    plan = ApplyFillPlan(
        id="01P", user_id="u1", radar_item_id="01R",
        fields=[], preview_summary="", user_approved=False,
    )
    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = plan
    session.execute.return_value = mock_result

    svc = ApplyService(session)
    out = await svc.approve_fill_plan(fill_plan_id="01P", user_id="u1")

    assert out.user_approved is True
    assert out.approved_at is not None


async def test_create_application_transitions_radar_to_submitted():
    """Application creation flips RadarItem.status to SUBMITTED + schedules followup."""
    from app.contexts.apply.service import ApplyService

    radar = _radar()
    session = AsyncMock()
    session.add = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = radar
    session.execute.return_value = mock_result

    svc = ApplyService(session)
    with patch(
        "app.contexts.apply.service._schedule_followup",
        new=AsyncMock(),
    ) as sched:
        app = await svc.create_application(
            user_id="u1",
            radar_item_id="01R",
            resume_snapshot_id="01SNAP",
        )

    assert radar.status == "SUBMITTED"
    assert app.resume_snapshot_id == "01SNAP"
    sched.assert_awaited_once()


async def test_create_application_rejects_other_users_radar_item():
    """Submission for someone else's radar must fail before touching DB."""
    from app.contexts.apply.service import ApplyService

    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    session.execute.return_value = mock_result

    svc = ApplyService(session)
    with pytest.raises(ValueError) as exc:
        await svc.create_application(
            user_id="u_attacker",
            radar_item_id="01R",
            resume_snapshot_id=None,
        )
    assert "radar_item_not_found" in str(exc.value)
