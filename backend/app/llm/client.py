"""LLM Client — manages provider selection, failover, and budget.

§7.3: Default gpt-4.1-mini for parsing, gpt-4.1 for resume writing.
Failover: OpenAI 5xx > 5/min → switch to Anthropic.
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator

from app.config import settings
from app.llm.provider import (
    LLMProvider,
    LLMMessage,
    ToolDef,
    ProviderEvent,
    OpenAIProvider,
    AnthropicProvider,
    FakeProvider,
)

logger = logging.getLogger(__name__)

# Error tracking for failover
_error_window: list[float] = []
ERROR_THRESHOLD = 5
ERROR_WINDOW_SECONDS = 60


class LLMClient:
    """High-level LLM client with failover and budget tracking."""

    def __init__(
        self,
        primary: LLMProvider | None = None,
        fallback: LLMProvider | None = None,
    ):
        if primary is None:
            if settings.openai_api_key:
                primary = OpenAIProvider(settings.openai_api_key)
            else:
                primary = FakeProvider()

        if fallback is None and settings.anthropic_api_key:
            fallback = AnthropicProvider(settings.anthropic_api_key)

        self.primary = primary
        self.fallback = fallback
        self._using_fallback = False
        self._total_prompt_tokens = 0
        self._total_completion_tokens = 0

    def _should_failover(self) -> bool:
        """Check if we should switch to fallback provider."""
        now = time.time()
        # Clean old errors
        _error_window[:] = [t for t in _error_window if now - t < ERROR_WINDOW_SECONDS]
        return len(_error_window) >= ERROR_THRESHOLD

    def _record_error(self) -> None:
        _error_window.append(time.time())

    @property
    def _active_provider(self) -> LLMProvider:
        if self._using_fallback and self.fallback:
            return self.fallback
        return self.primary

    async def stream(
        self,
        model: str,
        messages: list[LLMMessage],
        tools: list[ToolDef] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[ProviderEvent]:
        """Stream with automatic failover."""
        provider = self._active_provider

        try:
            async for event in provider.stream(model, messages, tools, temperature, max_tokens):
                if event.kind == "error" and self.fallback and not self._using_fallback:
                    self._record_error()
                    if self._should_failover():
                        logger.warning("Switching to fallback provider after %d errors", ERROR_THRESHOLD)
                        self._using_fallback = True
                        # Remap model for Anthropic
                        fallback_model = self._remap_model(model)
                        async for fb_event in self.fallback.stream(
                            fallback_model, messages, tools, temperature, max_tokens
                        ):
                            yield fb_event
                        return
                    yield event
                    return

                if event.kind == "done":
                    self._total_prompt_tokens += event.prompt_tokens
                    self._total_completion_tokens += event.completion_tokens

                yield event

        except Exception as e:
            logger.exception("LLM provider error")
            self._record_error()
            if self.fallback and not self._using_fallback and self._should_failover():
                self._using_fallback = True
                fallback_model = self._remap_model(model)
                async for event in self.fallback.stream(
                    fallback_model, messages, tools, temperature, max_tokens
                ):
                    yield event
            else:
                yield ProviderEvent(kind="error", error=str(e))

    async def embed(self, model: str, text: str) -> list[float]:
        """Generate embedding (always uses primary/OpenAI)."""
        return await self.primary.embed(model, text)

    @staticmethod
    def _remap_model(openai_model: str) -> str:
        """Map OpenAI model name to Anthropic equivalent."""
        mapping = {
            "gpt-4.1": "claude-sonnet-4-20250514",
            "gpt-4.1-mini": "claude-sonnet-4-20250514",
            "gpt-4o": "claude-sonnet-4-20250514",
            "gpt-4o-mini": "claude-haiku-4-5-20251001",
        }
        return mapping.get(openai_model, "claude-sonnet-4-20250514")

    @property
    def total_tokens(self) -> dict[str, int]:
        return {
            "prompt": self._total_prompt_tokens,
            "completion": self._total_completion_tokens,
        }
