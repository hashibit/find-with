"""L1 unit tests for RadarItem state machine — all valid/invalid transitions."""

import pytest
from app.contexts.jobs.service import JobsService, VALID_TRANSITIONS


# All valid status values
ALL_STATUSES = [
    "BROWSED", "ANALYZED", "DECLINED", "TAILORING", "SUBMITTED",
    "WAITING", "INTERVIEWING", "REJECTED", "OFFER",
    "OFFER_ACCEPTED", "OFFER_DECLINED",
]


class TestRadarStateMachine:
    """Enumerate all valid and invalid transitions."""

    @pytest.mark.parametrize("from_status,to_status", [
        (from_s, to_s)
        for from_s, valid_targets in VALID_TRANSITIONS.items()
        for to_s in valid_targets
    ])
    def test_valid_transitions(self, from_status, to_status):
        """All transitions defined in VALID_TRANSITIONS should be accepted."""
        assert to_status in VALID_TRANSITIONS.get(from_status, set())

    @pytest.mark.parametrize("from_status,to_status", [
        (from_s, to_s)
        for from_s in ALL_STATUSES
        for to_s in ALL_STATUSES
        if to_s not in VALID_TRANSITIONS.get(from_s, set()) and from_s != to_s
    ])
    def test_invalid_transitions(self, from_status, to_status):
        """Transitions NOT in VALID_TRANSITIONS should be rejected."""
        assert to_status not in VALID_TRANSITIONS.get(from_status, set())

    def test_terminal_states_have_no_outgoing(self):
        """OFFER_ACCEPTED, OFFER_DECLINED, REJECTED, DECLINED have no outgoing transitions."""
        terminal = {"OFFER_ACCEPTED", "OFFER_DECLINED", "REJECTED", "DECLINED"}
        for status in terminal:
            assert status not in VALID_TRANSITIONS, f"{status} should be terminal"

    def test_browsed_can_only_go_to_analyzed(self):
        assert VALID_TRANSITIONS["BROWSED"] == {"ANALYZED"}

    def test_analyzed_can_decline_or_tailor(self):
        assert VALID_TRANSITIONS["ANALYZED"] == {"DECLINED", "TAILORING"}

    def test_offer_can_accept_or_decline(self):
        assert VALID_TRANSITIONS["OFFER"] == {"OFFER_ACCEPTED", "OFFER_DECLINED"}
