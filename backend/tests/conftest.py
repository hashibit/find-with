"""Shared test fixtures."""

import os
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://findwith:findwith_dev@localhost:5432/findwith_test"
os.environ["DATABASE_URL_SYNC"] = "postgresql://findwith:findwith_dev@localhost:5432/findwith_test"

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
