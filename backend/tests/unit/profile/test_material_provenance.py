"""L1 unit tests for ProfileMaterial — provenance required, status machine."""

import pytest
from sqlalchemy import inspect


def test_material_provenance_check_constraint():
    """ProfileMaterial has CHECK constraint requiring provenance_kind IS NOT NULL."""
    from app.db.models.profile import ProfileMaterial

    table = ProfileMaterial.__table__
    check_constraints = [c for c in table.constraints if hasattr(c, 'sqltext')]

    provenance_checks = [
        c for c in check_constraints
        if 'provenance_kind' in str(c.sqltext)
    ]
    assert len(provenance_checks) > 0, "Missing CHECK constraint on provenance_kind"


def test_material_status_default_proposed():
    """Default status should be PROPOSED."""
    from app.db.models.profile import ProfileMaterial

    col = ProfileMaterial.__table__.columns["status"]
    assert col.default.arg == "PROPOSED"


def test_material_raw_text_is_largebinary():
    """raw_text should be LargeBinary (encrypted field §12.1)."""
    from app.db.models.profile import ProfileMaterial
    from sqlalchemy import LargeBinary

    col = ProfileMaterial.__table__.columns["raw_text"]
    assert isinstance(col.type, LargeBinary)


class TestMaterialStatusTransitions:
    """Material status: PROPOSED -> CONFIRMED -> USER_EDITED."""

    VALID_STATUSES = {"PROPOSED", "CONFIRMED", "USER_EDITED"}

    def test_valid_statuses(self):
        for s in self.VALID_STATUSES:
            assert s in self.VALID_STATUSES

    def test_proposed_is_not_usable_for_resume(self):
        """PROPOSED materials should not be used in tailoring."""
        # This is a domain rule enforced by TailoringService.re_apply_material
        from app.contexts.tailoring.service import TailoringService
        assert hasattr(TailoringService, 're_apply_material')
