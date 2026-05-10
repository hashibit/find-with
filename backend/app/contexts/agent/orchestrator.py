"""AgentOrchestrator — Quinn's brain (§7.1).

Assembles context, binds tools per scene, streams LLM output, handles tool calls.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from app.llm.client import LLMClient
from app.llm.provider import LLMMessage, ToolDef, ProviderEvent
from app.contexts.agent.tools import ToolRegistry, ToolResult
from app.contexts.agent.context_builder import ContextBuilder
from app.prompts import load_prompt

logger = logging.getLogger(__name__)

# Model routing
MODEL_PARSE = "gpt-4.1-mini"  # Parsing, classification
MODEL_WRITE = "gpt-4.1"       # Resume writing, conversation
EMBED_MODEL = "text-embedding-3-small"


@dataclass
class AgentEvent:
    """SSE event envelope."""
    kind: str  # text_delta | tool_call | tool_result | state_change | error | done
    data: dict[str, Any]


class AgentOrchestrator:
    """Main agent loop: context → tools → LLM → stream."""

    def __init__(
        self,
        llm_client: LLMClient,
        tool_registry: ToolRegistry,
        context_builder: ContextBuilder,
    ):
        self.llm = llm_client
        self.tools = tool_registry
        self.context = context_builder

    async def respond(
        self,
        conversation_id: str,
        user_id: str,
        user_message: str,
        conversation_kind: str = "FREE_CHAT",
        anchor_id: str | None = None,
    ) -> AsyncIterator[AgentEvent]:
        """Process a user message and stream agent events."""
        # 1. Build context
        messages = await self.context.build(
            conversation_id=conversation_id,
            user_id=user_id,
            conversation_kind=conversation_kind,
            anchor_id=anchor_id,
        )

        # Append user message
        messages.append(LLMMessage(role="user", content=user_message))

        # 2. Bind tools for this scene
        tool_defs = self.tools.get_tools_for_scene(conversation_kind)

        # 3. Stream LLM
        model = MODEL_WRITE
        full_text = ""
        tool_calls_pending: list[dict] = []

        async for event in self.llm.stream(
            model=model,
            messages=messages,
            tools=tool_defs if tool_defs else None,
        ):
            if event.kind == "text_delta":
                full_text += event.delta
                yield AgentEvent(
                    kind="text_delta",
                    data={
                        "conversation_id": conversation_id,
                        "delta": event.delta,
                    },
                )

            elif event.kind == "tool_call":
                tool_calls_pending.append({
                    "name": event.tool_name,
                    "args": event.tool_args,
                    "call_id": event.tool_call_id,
                })
                yield AgentEvent(
                    kind="tool_call",
                    data={
                        "name": event.tool_name,
                        "arguments_json": event.tool_args,
                        "call_id": event.tool_call_id,
                    },
                )

            elif event.kind == "done":
                # Process pending tool calls
                for tc in tool_calls_pending:
                    result = await self._execute_tool(
                        tc["name"], tc["args"], tc["call_id"],
                        user_id, conversation_id,
                    )
                    yield AgentEvent(
                        kind="tool_result",
                        data={
                            "call_id": tc["call_id"],
                            "result_json": json.dumps(result.data),
                            "ok": result.ok,
                            "error": result.error,
                        },
                    )

                    # If sync tool succeeded and we have more to say, continue LLM
                    if result.ok and result.mode == "SYNC":
                        # Append tool result to messages and get next LLM response
                        messages.append(LLMMessage(
                            role="assistant",
                            content=full_text,
                            tool_calls=[{
                                "id": tc["call_id"],
                                "type": "function",
                                "function": {
                                    "name": tc["name"],
                                    "arguments": tc["args"],
                                },
                            }],
                        ))
                        messages.append(LLMMessage(
                            role="tool",
                            content=json.dumps(result.data),
                            tool_call_id=tc["call_id"],
                            name=tc["name"],
                        ))

                        full_text = ""
                        async for cont_event in self.llm.stream(
                            model=model,
                            messages=messages,
                            tools=tool_defs if tool_defs else None,
                        ):
                            if cont_event.kind == "text_delta":
                                full_text += cont_event.delta
                                yield AgentEvent(
                                    kind="text_delta",
                                    data={
                                        "conversation_id": conversation_id,
                                        "delta": cont_event.delta,
                                    },
                                )
                            elif cont_event.kind == "done":
                                break

                    elif result.mode == "ASYNC":
                        yield AgentEvent(
                            kind="state_change",
                            data={
                                "key": "generating",
                                "value": result.task_id or "",
                            },
                        )

                yield AgentEvent(
                    kind="done",
                    data={
                        "prompt_tokens": event.prompt_tokens,
                        "completion_tokens": event.completion_tokens,
                        "finish_reason": event.finish_reason,
                    },
                )

            elif event.kind == "error":
                yield AgentEvent(
                    kind="error",
                    data={"code": "LLM_ERROR", "message": event.error},
                )

    async def _execute_tool(
        self,
        tool_name: str,
        args_json: str,
        call_id: str,
        user_id: str,
        conversation_id: str,
    ) -> ToolResult:
        """Execute a tool call, respecting mode (SYNC/ASYNC) and requires."""
        try:
            args = json.loads(args_json) if args_json else {}
        except json.JSONDecodeError:
            return ToolResult(ok=False, error=f"Invalid JSON arguments: {args_json}", data={}, mode="SYNC")

        return await self.tools.invoke(
            tool_name=tool_name,
            arguments=args,
            user_id=user_id,
            conversation_id=conversation_id,
        )
