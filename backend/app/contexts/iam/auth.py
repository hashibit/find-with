"""Authentication — re-exports get_current_user_id from deps for backward compat.

All token verification logic lives in ports/auth + adapters. Wiring in deps.py.
"""

from app.deps import get_current_user_id  # noqa: F401 — re-export
