"""L1 unit tests for ContextBuilder + SYSTEM_PROMPT_BASE.

These tests assert the *prompt assembly* contract — they do not invoke an LLM.
The goal is to catch silent drift between the prompt and PRD §2.3 (tone do/don't),
§2.4 (key-moment behaviors), §3.5 (density switch), and §7.1 (message assembly).

If a future refactor removes one of the PRD-mandated rules from the system prompt
or breaks density/scene routing, these tests must fail.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.contexts.agent.context_builder import (
    ContextBuilder,
    DENSITY_PATCHES,
    SCENE_PATCHES,
    SYSTEM_PROMPT_BASE,
)


# ---------------------------------------------------------------------------
# SYSTEM_PROMPT_BASE: encodes PRD §2.3 do/don't. These are the rules that
# matter for product trust — if they're not in the prompt, Quinn will drift.
# ---------------------------------------------------------------------------

class TestSystemPromptEncodesPRD:
    def test_identifies_as_quinn(self):
        assert "Quinn" in SYSTEM_PROMPT_BASE

    def test_states_north_america_job_seeker_context(self):
        """PRD §1.1 — target market is North American job seekers."""
        assert "North America" in SYSTEM_PROMPT_BASE

    def test_forbids_canned_empathy(self):
        """PRD §2.3 — '我理解你的感受' style is banned."""
        assert "I understand how you feel" in SYSTEM_PROMPT_BASE
        # Must be in a banned-list context, not as an example to follow.
        assert "NEVER use" in SYSTEM_PROMPT_BASE

    def test_forbids_as_an_ai_opener(self):
        """PRD §2.3 — '作为 AI...' is banned unless user directly asks."""
        assert "As an AI" in SYSTEM_PROMPT_BASE
        assert "unless the user directly asks" in SYSTEM_PROMPT_BASE

    def test_forbids_flattery_opener(self):
        """PRD §2.3 — no '不奉承用户'."""
        assert "great question" in SYSTEM_PROMPT_BASE.lower()

    def test_forbids_sorry_to_hear_that(self):
        """PRD §2.4 — when user gets rejection, don't say 'I'm sorry to hear that'."""
        assert "I'm sorry to hear that" in SYSTEM_PROMPT_BASE

    def test_forbids_gushy_offer_congrats(self):
        """PRD §2.4 — on offer, NOT '恭喜！太棒了！'."""
        assert "Congratulations! That's amazing!" in SYSTEM_PROMPT_BASE

    def test_caps_exclamation_marks(self):
        """PRD §2.3 — 一段对话最多一个感叹号."""
        assert "one exclamation mark" in SYSTEM_PROMPT_BASE

    def test_restricts_emoji_usage(self):
        """PRD §2.3 — 几乎不用 emoji."""
        assert "Almost no emoji" in SYSTEM_PROMPT_BASE

    def test_requires_reason_with_recommendation(self):
        """PRD §3.3 — '给建议必须给原因'; 'it's up to you' is forbidden."""
        assert "must include the reason" in SYSTEM_PROMPT_BASE
        assert "non-answers" in SYSTEM_PROMPT_BASE

    def test_forbids_helping_user_make_obvious_mistake(self):
        """PRD §2.4 — push back BEFORE helping when user is about to err.

        The current production prompt previously said 'present options, don't
        decide for them' — which encourages exactly the wrong behavior. Guard
        against regressing to that wording.
        """
        assert "push back" in SYSTEM_PROMPT_BASE.lower()
        assert "I don't recommend you apply to this" in SYSTEM_PROMPT_BASE
        # Anti-regression: the old (wrong) phrasing must NOT come back.
        assert "present options, don't decide for them" not in SYSTEM_PROMPT_BASE

    def test_forbids_fabrication(self):
        """PRD §5.4.4 — '永远不允许 Quinn 凭空创作经历'."""
        # Stated as a positive rule ("only from real user-provided material")
        # and a negative rule ("never fabricate experiences").
        assert "never fabricate" in SYSTEM_PROMPT_BASE.lower()
        assert "user-provided material" in SYSTEM_PROMPT_BASE

    def test_forbids_auto_submit_and_auto_send(self):
        """PRD §1.3 — final Submit/Send must be the user's action."""
        assert "Never auto-submit" in SYSTEM_PROMPT_BASE
        assert "Never auto-send" in SYSTEM_PROMPT_BASE

    def test_no_pretending_to_remember_beyond_context(self):
        """PRD §2.3 — '不假装记得超出系统记忆范围的事'.

        Anti-regression: the old prompt said 'you remember everything the user
        tells you across conversations' which is a lie Quinn must not tell.
        """
        assert "you remember everything" not in SYSTEM_PROMPT_BASE.lower()
        assert "do not pretend to remember" in SYSTEM_PROMPT_BASE.lower()

    def test_grateful_goodbye_on_offer_acceptance(self):
        """PRD §1.2 — 陪伴有终点; on offer acceptance Quinn exits."""
        assert "goodbye" in SYSTEM_PROMPT_BASE.lower()


# ---------------------------------------------------------------------------
# Density patches (§3.5). Three discrete modes, must be distinguishable.
# ---------------------------------------------------------------------------

class TestDensityPatches:
    def test_has_three_modes(self):
        assert set(DENSITY_PATCHES.keys()) == {"ENGAGED", "BALANCED", "QUIET"}

    def test_engaged_invites_proactive_probing(self):
        """PRD §3.5 — 健谈档: 主动追问、深度引导."""
        patch = DENSITY_PATCHES["ENGAGED"]
        assert "probe" in patch.lower() or "elaborate" in patch.lower()

    def test_balanced_forbids_volunteering(self):
        """PRD §3.5 — 标准档: '不主动开口，用户问什么答什么'."""
        patch = DENSITY_PATCHES["BALANCED"]
        # Must explicitly tell Quinn not to proactively add content.
        assert "not volunteer" in patch.lower() or "do not volunteer" in patch.lower()

    def test_quiet_forbids_initiating(self):
        """PRD §3.5 — 安静档: '完全被动'."""
        patch = DENSITY_PATCHES["QUIET"]
        assert "1-2 sentences" in patch
        assert "do not initiate" in patch.lower() or "stay out of the way" in patch.lower()

    def test_patches_are_distinct(self):
        """Each density patch must be unique — silent dedup would lose meaning."""
        values = list(DENSITY_PATCHES.values())
        assert len(set(values)) == len(values)


# ---------------------------------------------------------------------------
# Scene patches: one per conversation kind. Each must steer Quinn to the
# right behavior for that PRD module.
# ---------------------------------------------------------------------------

class TestScenePatches:
    def test_all_prd_scenes_present(self):
        required = {
            "ONBOARDING",       # PRD §4.1 deep profile
            "JOB_ANALYSIS",     # PRD §4.2 + §2/§4
            "GAP_MINING",       # PRD §5.4.2
            "TAILOR_EDIT",      # PRD §5.4.3
            "FOLLOWUP",         # PRD §6
            "FREE_CHAT",        # default
        }
        assert required.issubset(SCENE_PATCHES.keys())

    def test_onboarding_mentions_shining_point_mining(self):
        """PRD §1.3 — '指认型闪光点发现' is the differentiator."""
        assert "mine_shining_point" in SCENE_PATCHES["ONBOARDING"]

    def test_job_analysis_calls_out_hard_block(self):
        """PRD §4.2 — Quinn must recommend against on hard mismatch."""
        assert "GAP_HARD_BLOCK" in SCENE_PATCHES["JOB_ANALYSIS"]

    def test_tailor_edit_preserves_provenance(self):
        """PRD §5.4.4 — every edit preserves provenance."""
        patch = SCENE_PATCHES["TAILOR_EDIT"]
        assert "provenance" in patch.lower()

    def test_followup_includes_radar_update(self):
        """PRD §6.4 — follow-up state must reach the radar."""
        patch = SCENE_PATCHES["FOLLOWUP"]
        assert "radar" in patch.lower()


# ---------------------------------------------------------------------------
# ContextBuilder.build() — message assembly contract (§7.1).
# ---------------------------------------------------------------------------

@pytest.fixture
def builder_no_io():
    """ContextBuilder with no injected fetchers — exercises the pure prompt path."""
    return ContextBuilder()


@pytest.fixture
def builder_with_messages():
    """ContextBuilder where get_messages returns 3 turns."""
    get_messages = AsyncMock(return_value=[
        {"role": "user", "text": "hi"},
        {"role": "assistant", "text": "hey"},
        {"role": "user", "text": "I'm looking at a PM role"},
    ])
    return ContextBuilder(get_messages_fn=get_messages)


class TestBuild:
    async def test_first_message_is_system(self, builder_no_io):
        out = await builder_no_io.build(
            conversation_id="c1", user_id="u1",
            conversation_kind="FREE_CHAT", density="BALANCED",
        )
        assert out[0].role == "system"
        assert "Quinn" in out[0].content

    async def test_system_includes_density_and_scene_patches(self, builder_no_io):
        """The composed system message = BASE + density + scene patch."""
        out = await builder_no_io.build(
            conversation_id="c1", user_id="u1",
            conversation_kind="JOB_ANALYSIS", density="QUIET",
        )
        sys_msg = out[0].content
        assert SYSTEM_PROMPT_BASE in sys_msg
        assert DENSITY_PATCHES["QUIET"] in sys_msg
        assert SCENE_PATCHES["JOB_ANALYSIS"] in sys_msg

    async def test_unknown_density_falls_back_to_balanced(self, builder_no_io):
        out = await builder_no_io.build(
            conversation_id="c1", user_id="u1",
            conversation_kind="FREE_CHAT", density="WILD_GUESS",
        )
        assert DENSITY_PATCHES["BALANCED"] in out[0].content

    async def test_unknown_scene_falls_back_to_free_chat(self, builder_no_io):
        out = await builder_no_io.build(
            conversation_id="c1", user_id="u1",
            conversation_kind="DOES_NOT_EXIST", density="BALANCED",
        )
        assert SCENE_PATCHES["FREE_CHAT"] in out[0].content

    async def test_density_quiet_does_not_leak_balanced_text(self, builder_no_io):
        """Distinct density patches must not co-occur — silent multi-patch bug."""
        out = await builder_no_io.build(
            conversation_id="c1", user_id="u1",
            conversation_kind="FREE_CHAT", density="QUIET",
        )
        sys_msg = out[0].content
        assert DENSITY_PATCHES["QUIET"] in sys_msg
        assert DENSITY_PATCHES["BALANCED"] not in sys_msg
        assert DENSITY_PATCHES["ENGAGED"] not in sys_msg

    async def test_history_appended_after_system(self, builder_with_messages):
        out = await builder_with_messages.build(
            conversation_id="c1", user_id="u1",
            conversation_kind="FREE_CHAT", density="BALANCED",
        )
        # [0] system, then history in order.
        assert out[0].role == "system"
        assert out[1].role == "user" and out[1].content == "hi"
        assert out[2].role == "assistant" and out[2].content == "hey"
        assert out[3].role == "user" and "PM role" in out[3].content

    async def test_no_fetchers_yields_system_only(self, builder_no_io):
        """With nothing injected, build returns just the system message."""
        out = await builder_no_io.build(
            conversation_id="c1", user_id="u1",
            conversation_kind="FREE_CHAT", density="BALANCED",
        )
        assert len(out) == 1
        assert out[0].role == "system"

    async def test_scene_context_inserted_between_system_and_history(self):
        """When anchor_id + get_context fetcher present, scene context lands at index 1."""
        get_messages = AsyncMock(return_value=[
            {"role": "user", "text": "tell me about it"},
        ])
        get_context = AsyncMock(return_value="JD: Senior PM at Stripe")
        builder = ContextBuilder(
            get_messages_fn=get_messages,
            get_context_fn=get_context,
        )
        out = await builder.build(
            conversation_id="c1", user_id="u1",
            conversation_kind="JOB_ANALYSIS", anchor_id="job_42",
            density="BALANCED",
        )
        assert out[0].role == "system"
        assert out[1].role == "system"
        assert "Scene Context" in out[1].content
        assert "Stripe" in out[1].content
        # History follows.
        assert out[2].role == "user"

    async def test_get_messages_called_with_last_k_limit(self, builder_with_messages):
        """§7.2 — last_k window. Builder must request exactly LAST_K messages."""
        from app.contexts.agent.context_builder import LAST_K
        await builder_with_messages.build(
            conversation_id="c1", user_id="u1",
            conversation_kind="FREE_CHAT", density="BALANCED",
        )
        builder_with_messages._get_messages.assert_awaited_once_with("c1", limit=LAST_K)
