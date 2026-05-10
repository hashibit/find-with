"""ToolRegistry — §7.4 tool management.

Each tool is a callable with defined schema, execution mode, requires, and side effects.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Awaitable
from dataclasses import dataclass, field
from typing import Any

from app.llm.provider import ToolDef

logger = logging.getLogger(__name__)


@dataclass
class ToolResult:
    ok: bool
    data: dict[str, Any]
    error: str = ""
    mode: str = "SYNC"  # SYNC or ASYNC
    task_id: str | None = None


@dataclass
class ToolSpec:
    """Internal tool specification."""
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema
    execution_mode: str = "SYNC"  # SYNC or ASYNC
    requires: list[str] = field(default_factory=list)
    side_effect: str = "READ"  # READ or WRITE
    scenes: list[str] = field(default_factory=list)  # Which conversation kinds this tool is available in
    handler: Callable[..., Awaitable[ToolResult]] | None = None


class ToolRegistry:
    """Registry of all agent-callable tools."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> None:
        """Register a tool."""
        self._tools[spec.name] = spec
        logger.info("Registered tool: %s (mode=%s, scenes=%s)", spec.name, spec.execution_mode, spec.scenes)

    def get_tools_for_scene(self, conversation_kind: str) -> list[ToolDef]:
        """Get tool definitions available for a specific conversation kind."""
        defs = []
        for spec in self._tools.values():
            # Tool available if no scene restriction or scene matches
            if not spec.scenes or conversation_kind in spec.scenes or "ALL" in spec.scenes:
                defs.append(ToolDef(
                    name=spec.name,
                    description=spec.description,
                    parameters=spec.parameters,
                ))
        return defs

    async def invoke(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        user_id: str,
        conversation_id: str,
    ) -> ToolResult:
        """Invoke a tool by name."""
        spec = self._tools.get(tool_name)
        if not spec:
            return ToolResult(ok=False, error=f"Unknown tool: {tool_name}", data={})

        if not spec.handler:
            return ToolResult(ok=False, error=f"Tool {tool_name} has no handler", data={})

        # Check requires (preconditions)
        # These would be validated by the handler itself in practice
        try:
            result = await spec.handler(
                user_id=user_id,
                conversation_id=conversation_id,
                **arguments,
            )
            return result
        except Exception as e:
            logger.exception("Tool %s failed", tool_name)
            return ToolResult(ok=False, error=str(e), data={}, mode=spec.execution_mode)

    def list_tools(self) -> list[str]:
        return list(self._tools.keys())


def create_default_registry() -> ToolRegistry:
    """Create registry with all v0.1 tools pre-registered (handlers added later)."""
    registry = ToolRegistry()

    # search_company (ASYNC, jobs)
    registry.register(ToolSpec(
        name="search_company",
        description="Search for company information including size, stage, recent news, and risk signals.",
        parameters={
            "type": "object",
            "properties": {
                "company": {"type": "string", "description": "Company name to research"},
            },
            "required": ["company"],
        },
        execution_mode="ASYNC",
        side_effect="WRITE",
        scenes=["JOB_ANALYSIS"],
    ))

    # mine_shining_point (SYNC, profile)
    registry.register(ToolSpec(
        name="mine_shining_point",
        description="Extract a 'shining point' achievement from the user's message and create a PROPOSED material item.",
        parameters={
            "type": "object",
            "properties": {
                "raw_text": {"type": "string", "description": "The user's original words to extract from"},
            },
            "required": ["raw_text"],
        },
        execution_mode="SYNC",
        side_effect="WRITE",
        scenes=["ONBOARDING", "GAP_MINING"],
    ))

    # generate_tailored_resume (ASYNC, tailoring)
    registry.register(ToolSpec(
        name="generate_tailored_resume",
        description="Generate a tailored resume based on profile, materials, and job description.",
        parameters={
            "type": "object",
            "properties": {
                "parsed_jd_id": {"type": "string"},
                "base_resume_id": {"type": "string"},
            },
            "required": ["parsed_jd_id", "base_resume_id"],
        },
        execution_mode="ASYNC",
        side_effect="WRITE",
        scenes=["TAILOR_EDIT"],
    ))

    # edit_bullet (SYNC, tailoring)
    registry.register(ToolSpec(
        name="edit_bullet",
        description="Edit a resume bullet point using natural language instruction.",
        parameters={
            "type": "object",
            "properties": {
                "bullet_id": {"type": "string"},
                "instruction": {"type": "string", "description": "Natural language edit instruction"},
            },
            "required": ["bullet_id", "instruction"],
        },
        execution_mode="SYNC",
        side_effect="WRITE",
        scenes=["TAILOR_EDIT"],
    ))

    # re_apply_material_to_tailoring (SYNC, tailoring)
    registry.register(ToolSpec(
        name="re_apply_material_to_tailoring",
        description="Apply a confirmed material to update PENDING bullets in a tailored resume.",
        parameters={
            "type": "object",
            "properties": {
                "material_id": {"type": "string"},
                "tailored_resume_id": {"type": "string"},
            },
            "required": ["material_id", "tailored_resume_id"],
        },
        execution_mode="SYNC",
        requires=["material.status in {CONFIRMED, USER_EDITED}"],
        side_effect="WRITE",
        scenes=["GAP_MINING", "TAILOR_EDIT"],
    ))

    # recompute_match (SYNC, tailoring)
    registry.register(ToolSpec(
        name="recompute_match",
        description="Recompute match scores after tailoring changes.",
        parameters={
            "type": "object",
            "properties": {
                "tailored_resume_id": {"type": "string"},
            },
            "required": ["tailored_resume_id"],
        },
        execution_mode="SYNC",
        side_effect="WRITE",
        scenes=["TAILOR_EDIT"],
    ))

    # draft_motivation (SYNC, apply)
    registry.register(ToolSpec(
        name="draft_motivation",
        description="Draft a 'Why are you interested?' response for a job application form.",
        parameters={
            "type": "object",
            "properties": {
                "parsed_jd_id": {"type": "string"},
                "profile_summary": {"type": "string"},
            },
            "required": ["parsed_jd_id"],
        },
        execution_mode="SYNC",
        side_effect="READ",
        scenes=["TAILOR_EDIT"],
    ))

    # classify_email (SYNC, followup)
    registry.register(ToolSpec(
        name="classify_email",
        description="Classify a captured email and extract key information.",
        parameters={
            "type": "object",
            "properties": {
                "email_capture_id": {"type": "string"},
            },
            "required": ["email_capture_id"],
        },
        execution_mode="SYNC",
        side_effect="WRITE",
        scenes=["FOLLOWUP"],
    ))

    # draft_reply (SYNC, followup)
    registry.register(ToolSpec(
        name="draft_reply",
        description="Draft an email reply based on the user's intent.",
        parameters={
            "type": "object",
            "properties": {
                "email_capture_id": {"type": "string"},
                "intent": {"type": "string", "enum": [
                    "accept_interview", "ask_reschedule", "accept_offer",
                    "negotiate_offer", "decline_politely", "request_info",
                ]},
            },
            "required": ["email_capture_id", "intent"],
        },
        execution_mode="SYNC",
        requires=["email_parsed exists"],
        side_effect="WRITE",
        scenes=["FOLLOWUP"],
    ))

    # set_conversation_density (SYNC, all scenes)
    registry.register(ToolSpec(
        name="set_conversation_density",
        description="Temporarily change conversation density when user expresses preference.",
        parameters={
            "type": "object",
            "properties": {
                "density": {"type": "string", "enum": ["ENGAGED", "BALANCED", "QUIET"]},
                "reason": {"type": "string"},
            },
            "required": ["density", "reason"],
        },
        execution_mode="SYNC",
        side_effect="WRITE",
        scenes=["ALL"],
    ))

    return registry
