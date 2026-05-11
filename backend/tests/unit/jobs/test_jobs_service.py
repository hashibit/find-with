"""L1 unit tests for JobsService.update_radar_status — actual enforcement.

The existing test_radar_state_machine.py only asserts the VALID_TRANSITIONS
constants. These tests exercise the method that USES the constants, including
authorization (Forbidden) and InvalidTransition raising.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest


def _radar(status="BROWSED", user_id="u1"):
    from app.db.models.jobs import JobRadarItem
    return JobRadarItem(id="01R", user_id=user_id, capture_id="01C", status=status)


async def test_update_radar_status_rejects_invalid_transition():
    """BROWSED -> OFFER is not allowed -> InvalidTransition raised."""
    from app.contexts.jobs.service import JobsService, InvalidTransition

    radar = _radar(status="BROWSED")
    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = radar
    session.execute.return_value = mock_result

    svc = JobsService(session)
    with pytest.raises(InvalidTransition) as exc:
        await svc.update_radar_status("01R", "u1", "OFFER")

    assert "BROWSED" in str(exc.value)
    assert "OFFER" in str(exc.value)
    # Status must remain unchanged
    assert radar.status == "BROWSED"


async def test_update_radar_status_rejects_other_user():
    """Different user attempting status update -> Forbidden, no mutation."""
    from app.contexts.jobs.service import JobsService, Forbidden

    radar = _radar(user_id="u_owner")
    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = radar
    session.execute.return_value = mock_result

    svc = JobsService(session)
    with pytest.raises(Forbidden):
        await svc.update_radar_status("01R", "u_attacker", "ANALYZED")

    assert radar.status == "BROWSED"


async def test_update_radar_status_not_found():
    """Missing radar item -> NotFound."""
    from app.contexts.jobs.service import JobsService, NotFound

    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    session.execute.return_value = mock_result

    svc = JobsService(session)
    with pytest.raises(NotFound):
        await svc.update_radar_status("missing", "u1", "ANALYZED")


async def test_update_radar_status_valid_transition_persists():
    """Valid transition updates status + last_status_at, accepts note."""
    from app.contexts.jobs.service import JobsService

    radar = _radar(status="ANALYZED")
    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = radar
    session.execute.return_value = mock_result

    svc = JobsService(session)
    out = await svc.update_radar_status(
        "01R", "u1", "TAILORING", note="strong match"
    )

    assert radar.status == "TAILORING"
    assert radar.user_decision_note == "strong match"
    assert out["status"] == "TAILORING"


async def test_update_radar_status_terminal_state_cannot_move_again():
    """Terminal states (e.g. OFFER_ACCEPTED) have no outgoing transitions."""
    from app.contexts.jobs.service import JobsService, InvalidTransition

    radar = _radar(status="OFFER_ACCEPTED")
    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = radar
    session.execute.return_value = mock_result

    svc = JobsService(session)
    # Try anything — all should be invalid from a terminal state
    for target in ["ANALYZED", "TAILORING", "SUBMITTED", "OFFER", "REJECTED"]:
        with pytest.raises(InvalidTransition):
            await svc.update_radar_status("01R", "u1", target)
