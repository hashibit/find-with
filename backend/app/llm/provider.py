"""LLM Provider abstraction (DIP — §7.3).

Strategy pattern: OpenAI / Anthropic / Fake providers behind a common protocol.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class LLMMessage:
    role: str  # system / user / assistant / tool
    content: str
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None
    name: str | None = None


@dataclass
class ToolDef:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema


@dataclass
class ProviderEvent:
    """Unified event from any LLM provider."""
    kind: str  # text_delta | tool_call | done | error
    delta: str = ""
    tool_name: str = ""
    tool_args: str = ""
    tool_call_id: str = ""
    finish_reason: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    error: str = ""


class LLMProvider(ABC):
    """Port: any LLM backend must implement this."""

    @abstractmethod
    async def stream(
        self,
        model: str,
        messages: list[LLMMessage],
        tools: list[ToolDef] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[ProviderEvent]:
        """Stream LLM response as events."""
        ...

    @abstractmethod
    async def embed(self, model: str, text: str) -> list[float]:
        """Generate embedding vector."""
        ...


class OpenAIProvider(LLMProvider):
    """OpenAI API provider."""

    def __init__(self, api_key: str):
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=api_key)

    async def stream(
        self,
        model: str,
        messages: list[LLMMessage],
        tools: list[ToolDef] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[ProviderEvent]:
        oai_messages = [{"role": m.role, "content": m.content} for m in messages]
        # Add tool_call_id for tool messages
        for i, m in enumerate(messages):
            if m.tool_call_id:
                oai_messages[i]["tool_call_id"] = m.tool_call_id
            if m.name:
                oai_messages[i]["name"] = m.name
            if m.tool_calls:
                oai_messages[i]["tool_calls"] = m.tool_calls

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": oai_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if tools:
            kwargs["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    },
                }
                for t in tools
            ]

        tool_calls_buffer: dict[int, dict] = {}

        async with await self.client.chat.completions.create(**kwargs) as stream:
            async for chunk in stream:
                if not chunk.choices and chunk.usage:
                    yield ProviderEvent(
                        kind="done",
                        prompt_tokens=chunk.usage.prompt_tokens,
                        completion_tokens=chunk.usage.completion_tokens,
                    )
                    continue

                if not chunk.choices:
                    continue

                choice = chunk.choices[0]
                delta = choice.delta

                if delta and delta.content:
                    yield ProviderEvent(kind="text_delta", delta=delta.content)

                if delta and delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_buffer:
                            tool_calls_buffer[idx] = {
                                "id": tc.id or "",
                                "name": "",
                                "args": "",
                            }
                        if tc.id:
                            tool_calls_buffer[idx]["id"] = tc.id
                        if tc.function and tc.function.name:
                            tool_calls_buffer[idx]["name"] = tc.function.name
                        if tc.function and tc.function.arguments:
                            tool_calls_buffer[idx]["args"] += tc.function.arguments

                if choice.finish_reason:
                    # Emit buffered tool calls
                    for _idx, buf in sorted(tool_calls_buffer.items()):
                        yield ProviderEvent(
                            kind="tool_call",
                            tool_name=buf["name"],
                            tool_args=buf["args"],
                            tool_call_id=buf["id"],
                        )
                    yield ProviderEvent(
                        kind="done",
                        finish_reason=choice.finish_reason,
                    )

    async def embed(self, model: str, text: str) -> list[float]:
        resp = await self.client.embeddings.create(model=model, input=text)
        return resp.data[0].embedding


class AnthropicProvider(LLMProvider):
    """Anthropic Claude API provider."""

    def __init__(self, api_key: str):
        from anthropic import AsyncAnthropic
        self.client = AsyncAnthropic(api_key=api_key)

    async def stream(
        self,
        model: str,
        messages: list[LLMMessage],
        tools: list[ToolDef] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[ProviderEvent]:
        # Separate system message
        system_content = ""
        claude_messages = []
        for m in messages:
            if m.role == "system":
                system_content += m.content + "\n"
            else:
                claude_messages.append({"role": m.role, "content": m.content})

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": claude_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system_content:
            kwargs["system"] = system_content.strip()
        if tools:
            kwargs["tools"] = [
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                }
                for t in tools
            ]

        async with self.client.messages.stream(**kwargs) as stream:
            async for event in stream:
                if event.type == "content_block_delta":
                    if hasattr(event.delta, "text"):
                        yield ProviderEvent(kind="text_delta", delta=event.delta.text)
                    elif hasattr(event.delta, "partial_json"):
                        yield ProviderEvent(kind="text_delta", delta=event.delta.partial_json)
                elif event.type == "content_block_stop":
                    pass
                elif event.type == "message_delta":
                    yield ProviderEvent(
                        kind="done",
                        finish_reason=event.delta.stop_reason or "end_turn",
                    )
                elif event.type == "message_start":
                    pass

            # Get final usage
            final = await stream.get_final_message()
            yield ProviderEvent(
                kind="done",
                prompt_tokens=final.usage.input_tokens,
                completion_tokens=final.usage.output_tokens,
            )

    async def embed(self, model: str, text: str) -> list[float]:
        # Anthropic doesn't have embedding API; use OpenAI for embeddings
        raise NotImplementedError("Use OpenAI for embeddings")


class FakeProvider(LLMProvider):
    """Test provider with scripted responses."""

    def __init__(self, responses: list[str] | None = None, tool_calls: list[dict] | None = None):
        self.responses = responses or ["Hello from FakeProvider."]
        self.tool_calls = tool_calls or []
        self._call_count = 0
        self._error_count = 0
        self.raise_errors: int = 0  # Consecutive errors to raise before succeeding

    async def stream(
        self,
        model: str,
        messages: list[LLMMessage],
        tools: list[ToolDef] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[ProviderEvent]:
        # Simulate errors for failover testing
        if self._error_count < self.raise_errors:
            self._error_count += 1
            yield ProviderEvent(kind="error", error="Simulated 5xx error")
            return

        idx = self._call_count % len(self.responses)
        response = self.responses[idx]
        self._call_count += 1

        # Emit tool calls if configured
        for tc in self.tool_calls:
            yield ProviderEvent(
                kind="tool_call",
                tool_name=tc.get("name", ""),
                tool_args=json.dumps(tc.get("args", {})),
                tool_call_id=tc.get("id", f"call_{self._call_count}"),
            )

        # Stream text response word by word
        for word in response.split():
            yield ProviderEvent(kind="text_delta", delta=word + " ")

        yield ProviderEvent(
            kind="done",
            finish_reason="stop",
            prompt_tokens=len(str(messages)) // 4,
            completion_tokens=len(response) // 4,
        )

    async def embed(self, model: str, text: str) -> list[float]:
        """Return a deterministic fake embedding."""
        import hashlib
        h = hashlib.sha256(text.encode()).digest()
        # Generate 1536 floats from hash (repeating)
        return [((b % 200) - 100) / 100.0 for b in (h * 48)[:1536]]
