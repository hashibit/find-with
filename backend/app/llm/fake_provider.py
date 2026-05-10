"""FakeProvider — golden replay for LLM calls in test environments.

Matches prompts by fingerprint hash and returns pre-recorded responses.
Used in L1/L3/L4 tests to avoid hitting real LLM APIs.

Golden files live in backend/tests/fixtures/llm_golden/ organized by tool:
    llm_golden/tailor_resume/<sha256>.json
    llm_golden/shining_moment_mining/<sha256>.json
    llm_golden/jd_parse/<sha256>.json
    llm_golden/email_classify/<sha256>.json

Run with --record-mode to capture new golden responses (requires human review).
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

GOLDEN_DIR = Path(__file__).parent.parent.parent / "tests" / "fixtures" / "llm_golden"


def _fingerprint(model: str, prompt: str, temperature: float = 0.0, max_tokens: int = 4096) -> str:
    """Compute stable fingerprint for a prompt configuration."""
    key = f"{model}|{prompt}|{temperature}|{max_tokens}"
    return hashlib.sha256(key.encode()).hexdigest()


class FakeProvider:
    """Drop-in replacement for LLM provider in test environments.

    Usage:
        provider = FakeProvider()
        response = await provider.complete(model="gpt-4.1", prompt="...")
    """

    def __init__(self, golden_dir: Path | None = None, record_mode: bool = False):
        self.golden_dir = golden_dir or GOLDEN_DIR
        self.record_mode = record_mode
        self._cache: dict[str, dict] = {}
        self._load_cache()

    def _load_cache(self):
        """Load all golden files into memory."""
        if not self.golden_dir.exists():
            logger.warning("Golden directory not found: %s", self.golden_dir)
            return

        for json_file in self.golden_dir.rglob("*.json"):
            try:
                data = json.loads(json_file.read_text())
                fp = data.get("fingerprint") or json_file.stem
                self._cache[fp] = data
            except (json.JSONDecodeError, KeyError):
                logger.warning("Skipping invalid golden file: %s", json_file)

    async def complete(
        self,
        model: str,
        prompt: str,
        system: str = "",
        temperature: float = 0.0,
        max_tokens: int = 4096,
        tools: list | None = None,
    ) -> dict:
        """Return cached golden response or raise if not found.

        Returns dict with keys: content, model, usage, tool_calls
        """
        fp = _fingerprint(model, prompt, temperature, max_tokens)

        if fp in self._cache:
            cached = self._cache[fp]
            return {
                "content": cached.get("response", ""),
                "model": model,
                "usage": cached.get("usage", {"prompt_tokens": 0, "completion_tokens": 0}),
                "tool_calls": cached.get("tool_calls", []),
                "finish_reason": cached.get("finish_reason", "stop"),
            }

        if self.record_mode:
            logger.info("RECORD MODE: fingerprint %s not found, will record after real call", fp)
            raise NotImplementedError(
                f"Record mode: prompt fingerprint {fp} not in golden cache. "
                "Run with a real provider to record, then review and commit."
            )

        # In non-record mode, return a safe fallback for tests
        logger.warning("Golden miss for fingerprint %s — returning empty response", fp)
        return {
            "content": "[FakeProvider: no golden match]",
            "model": model,
            "usage": {"prompt_tokens": len(prompt) // 4, "completion_tokens": 10},
            "tool_calls": [],
            "finish_reason": "stop",
        }

    def save_golden(
        self,
        model: str,
        prompt: str,
        response: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        tool_name: str = "general",
        usage: dict | None = None,
        tool_calls: list | None = None,
    ) -> Path:
        """Save a golden response file (for record mode)."""
        fp = _fingerprint(model, prompt, temperature, max_tokens)

        out_dir = self.golden_dir / tool_name
        out_dir.mkdir(parents=True, exist_ok=True)

        out_path = out_dir / f"{fp}.json"
        data = {
            "fingerprint": fp,
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "prompt_preview": prompt[:200],
            "response": response,
            "usage": usage or {"prompt_tokens": 0, "completion_tokens": 0},
            "tool_calls": tool_calls or [],
            "finish_reason": "stop",
        }
        out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))

        self._cache[fp] = data
        logger.info("Saved golden: %s", out_path)
        return out_path
