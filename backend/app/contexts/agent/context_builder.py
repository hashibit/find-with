"""ContextBuilder — assembles LLM messages from conversation history + scene context.

§7.1: system prompt + density patch + scene patch + rolling_summary + last_k messages + hydrated context.
§7.2: token budget = model.max - reserve(2048), last_k_window + rolling_summary + retrieved_materials(top_8).
"""

from __future__ import annotations

import logging
from typing import Any

from app.llm.provider import LLMMessage

logger = logging.getLogger(__name__)

TOKEN_BUDGET = 128_000 - 2048  # GPT-4.1 context minus reserve
LAST_K = 8  # Default last messages to include

# System prompt base (F-901)
SYSTEM_PROMPT_BASE = """You are Quinn, a warm and knowledgeable career coach built into the FindWith browser extension.

Your personality:
- Encouraging but honest — never sugarcoat, but always frame feedback constructively
- You remember everything the user tells you across conversations
- You're an expert at reading between the lines of job descriptions
- You NEVER fabricate achievements or experiences — if you don't know something, you ask
- You respect the user's decision-making autonomy — present options, don't decide for them

Your core mission: Help the user find the right job and present their best authentic self.

Current conversation guidelines:
- Be concise unless the user wants depth (check density setting)
- When you identify a potential "shining point" in what the user says, extract it as a material
- Always trace claims back to user-provided evidence
"""

# Density patches
DENSITY_PATCHES = {
    "ENGAGED": "\nThe user wants detailed, thorough responses. Elaborate freely.",
    "BALANCED": "\nBalance depth with brevity. 2-3 paragraphs max per response.",
    "QUIET": "\nThe user wants minimal interruption. Keep responses to 1-2 sentences. Only speak when you have something important.",
}

# Scene patches per conversation kind
SCENE_PATCHES = {
    "ONBOARDING": "\n\n## Current Scene: Deep Profile Building\nYou're helping the user build their career profile. Ask probing questions to surface achievements. Use mine_shining_point when you hear something impressive.",
    "JOB_ANALYSIS": "\n\n## Current Scene: Job Analysis\nYou're analyzing a specific job with the user. Present match results, highlight strengths, call out gaps honestly. If GAP_HARD_BLOCK exists, recommend against applying unless the user has strong reasons.",
    "GAP_MINING": "\n\n## Current Scene: Gap Mining\nThe user is working on a tailored resume and you've identified gaps. Ask targeted questions to uncover relevant experience. Use mine_shining_point for each gap you help fill.",
    "TAILOR_EDIT": "\n\n## Current Scene: Resume Tailoring\nThe user is editing their tailored resume. Help with bullet point refinement. Every edit preserves provenance. Use edit_bullet for modifications.",
    "FOLLOWUP": "\n\n## Current Scene: Follow-up\nYou're helping the user manage post-application communication. Classify emails, draft replies, and keep the radar updated.",
    "FREE_CHAT": "\n\n## Current Scene: Open Chat\nGeneral career conversation. Be helpful and natural.",
}


class ContextBuilder:
    """Assembles the full message array for LLM calls."""

    def __init__(self, get_messages_fn=None, get_profile_fn=None, get_context_fn=None):
        """Initialize with data fetching functions (injected for testability)."""
        self._get_messages = get_messages_fn
        self._get_profile = get_profile_fn
        self._get_context = get_context_fn

    async def build(
        self,
        conversation_id: str,
        user_id: str,
        conversation_kind: str = "FREE_CHAT",
        anchor_id: str | None = None,
        density: str = "BALANCED",
    ) -> list[LLMMessage]:
        """Build the full message list for the LLM."""
        messages: list[LLMMessage] = []

        # 1. System prompt = base + density patch + scene patch
        system = SYSTEM_PROMPT_BASE
        system += DENSITY_PATCHES.get(density, DENSITY_PATCHES["BALANCED"])
        system += SCENE_PATCHES.get(conversation_kind, SCENE_PATCHES["FREE_CHAT"])

        messages.append(LLMMessage(role="system", content=system))

        # 2. Rolling summary (if exists)
        if self._get_messages:
            history = await self._get_messages(conversation_id, limit=LAST_K)
            rolling_summary = await self._get_rolling_summary(conversation_id)

            if rolling_summary:
                messages.append(LLMMessage(
                    role="system",
                    content=f"## Conversation Summary (earlier messages)\n{rolling_summary}",
                ))

            # 3. Last K messages
            for msg in history:
                messages.append(LLMMessage(
                    role=msg.get("role", "user"),
                    content=msg.get("text", ""),
                ))

        # 4. Scene context (profile snapshot, JD, etc.)
        if self._get_context and anchor_id:
            context_data = await self._get_context(conversation_kind, anchor_id, user_id)
            if context_data:
                messages.insert(1, LLMMessage(
                    role="system",
                    content=f"## Scene Context\n{context_data}",
                ))

        return messages

    async def _get_rolling_summary(self, conversation_id: str) -> str | None:
        """Fetch rolling summary for a conversation."""
        # Will be implemented with DB access in later sprint
        return None
