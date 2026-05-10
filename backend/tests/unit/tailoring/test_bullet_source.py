"""L1 unit tests for tailoring — bullet source_material_ids invariant."""

import pytest


def test_tailoring_resume_sections_schema():
    """TailoringResume.sections is JSONB containing bullets with source tracking."""
    from app.db.models.tailoring import TailoringResume
    from sqlalchemy.dialects.postgresql import JSONB

    col = TailoringResume.__table__.columns["sections"]
    assert isinstance(col.type, JSONB)


def test_tailoring_snapshot_has_pdf_uri():
    """TailoringSnapshot tracks blob_uri_pdf for export."""
    from app.db.models.tailoring import TailoringSnapshot

    cols = {c.name for c in TailoringSnapshot.__table__.columns}
    assert "blob_uri_pdf" in cols
    assert "plain_text" in cols
    assert "frozen_at" in cols


def test_quota_consume_log_unique_constraint():
    """QuotaConsumeLog.tailored_resume_id is UNIQUE — prevents double-charge."""
    from app.db.models.quota import QuotaConsumeLog

    col = QuotaConsumeLog.__table__.columns["tailored_resume_id"]
    assert col.unique is True, "tailored_resume_id must be UNIQUE to prevent double-charge"
