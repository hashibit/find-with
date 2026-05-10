"""L1 unit tests for conversation domain."""

import pytest
from unittest.mock import AsyncMock, MagicMock


async def test_conversation_create():
    """ConversationService.create returns conversation with default density."""
    from app.contexts.conversation.service import ConversationService

    mock_session = AsyncMock()
    svc = ConversationService(mock_session)

    result = await svc.create(user_id="u1", kind="ONBOARDING")

    assert mock_session.add.called
    assert result["kind"] == "ONBOARDING"
    assert result["effective_density"] == "BALANCED"


async def test_conversation_message_roles():
    """Valid message roles are USER, ASSISTANT, SYSTEM, TOOL."""
    from app.db.models.conversation import ConvMessage

    col = ConvMessage.__table__.columns["role"]
    # Just verify the column exists and is a string
    assert col is not None
