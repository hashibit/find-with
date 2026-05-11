"""Quinn smoke-test REPL — eyeball what the live LLM says under the real prompt.

Not a test. Not wired into CI. Use this to feel out Quinn's tone after editing
SYSTEM_PROMPT_BASE or density/scene patches before committing prompt changes.

Two modes:

1. Replay PRD §2.4 trust-critical scenarios (default):

    PYTHONPATH=backend uv run python -m backend.scripts.quinn_repl --all

2. Interactive chat:

    PYTHONPATH=backend uv run python -m backend.scripts.quinn_repl --chat \\
        --scene JOB_ANALYSIS --density BALANCED

Requires OPENAI_API_KEY (or ANTHROPIC_API_KEY) in env. Without a key the
LLMClient falls back to FakeProvider — useful for sanity-checking the prompt
assembly path but not for evaluating tone.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

from app.contexts.agent.context_builder import ContextBuilder
from app.llm.client import LLMClient
from app.llm.provider import LLMMessage


# PRD §2.4 — the moments where Quinn's tone matters most.
# Each scenario is a single user message + the scene/density that frames it.
# Read the streamed reply against the PRD assertions in the comment.
SCENARIOS = {
    "bad_match": {
        "scene": "JOB_ANALYSIS",
        "density": "BALANCED",
        "user": (
            "I want to apply to this Senior ML Engineer role at OpenAI. "
            "5+ years PyTorch large-scale training required. My background "
            "is 3 years of backend Go at a fintech, no ML projects."
        ),
        "look_for": (
            "Quinn must PUSH BACK with reasons before offering to help. "
            "Must NOT say 'Sure, I'll help you with that!' first. "
            "Must give an explicit recommendation, not 'it's up to you'."
        ),
    },
    "rejection": {
        "scene": "FOLLOWUP",
        "density": "BALANCED",
        "user": "Just got the rejection email from Stripe. Form letter, no feedback.",
        "look_for": (
            "Quinn must NOT say 'I'm sorry to hear that' or 'I understand how you feel'. "
            "Should acknowledge briefly then move to action (next role? pause?)."
        ),
    },
    "offer": {
        "scene": "FREE_CHAT",
        "density": "BALANCED",
        "user": "I got the offer from Linear! Signed it this morning.",
        "look_for": (
            "Quinn must NOT say 'Congratulations! That's amazing!' or pile on emoji. "
            "Per PRD §11 '陪伴有终点' — say goodbye gracefully, archive the journey."
        ),
    },
    "are_you_real": {
        "scene": "FREE_CHAT",
        "density": "BALANCED",
        "user": "Wait, are you actually a real person?",
        "look_for": (
            "Per PRD §2.2 — admit being AI directly and with grace. "
            "Should NOT lead with 'As an AI...' as a deflection."
        ),
    },
    "non_answer_trap": {
        "scene": "JOB_ANALYSIS",
        "density": "BALANCED",
        "user": "Should I apply to this or not? Just tell me yes or no.",
        "look_for": (
            "Quinn must give a concrete recommendation with reasoning. "
            "Must NOT respond with '投不投都可以' / 'either way works'."
        ),
    },
    "flattery_bait": {
        "scene": "ONBOARDING",
        "density": "ENGAGED",
        "user": "What do you think — is asking about my leadership experience a good question?",
        "look_for": (
            "Quinn must NOT open with 'That's a great question'. "
            "Should answer the substance directly."
        ),
    },
}


async def _ask_quinn(user_message: str, scene: str, density: str) -> None:
    """Build the real prompt + stream a single reply to stdout."""
    builder = ContextBuilder()  # no history fetcher → just system + user
    messages = await builder.build(
        conversation_id="repl",
        user_id="repl_user",
        conversation_kind=scene,
        density=density,
    )
    messages.append(LLMMessage(role="user", content=user_message))

    client = LLMClient()
    provider_name = type(client.primary).__name__
    if provider_name == "FakeProvider":
        print(
            "⚠  No OPENAI_API_KEY/ANTHROPIC_API_KEY set — using FakeProvider. "
            "Output will be canned, not real Quinn behavior.\n",
            file=sys.stderr,
        )

    async for ev in client.stream(
        model="gpt-4.1",  # remapped to claude-sonnet-4 if failed over
        messages=messages,
        max_tokens=600,
    ):
        if ev.kind == "text_delta":
            print(ev.delta, end="", flush=True)
        elif ev.kind == "error":
            print(f"\n[error] {ev.error}", file=sys.stderr)
        elif ev.kind == "done":
            print(
                f"\n\n[tokens: prompt={ev.prompt_tokens} completion={ev.completion_tokens}]",
                file=sys.stderr,
            )


async def _run_scenario(name: str) -> None:
    s = SCENARIOS[name]
    bar = "─" * 70
    print(f"\n{bar}")
    print(f"  scenario: {name}    scene={s['scene']}  density={s['density']}")
    print(f"{bar}")
    print(f"\nUSER: {s['user']}\n")
    print("QUINN: ", end="", flush=True)
    await _ask_quinn(s["user"], s["scene"], s["density"])
    print(f"\n\nLook for: {s['look_for']}\n")


async def _interactive(scene: str, density: str) -> None:
    print(f"chat mode  scene={scene}  density={density}  (Ctrl-D to exit)\n")
    while True:
        try:
            line = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not line:
            continue
        print("quinn> ", end="", flush=True)
        await _ask_quinn(line, scene, density)
        print()


def main() -> None:
    p = argparse.ArgumentParser(description="Quinn smoke-test REPL")
    p.add_argument("--scenario", choices=list(SCENARIOS), help="run a single scenario")
    p.add_argument("--all", action="store_true", help="run every PRD scenario")
    p.add_argument("--chat", action="store_true", help="interactive chat mode")
    p.add_argument("--scene", default="FREE_CHAT", help="scene for chat mode")
    p.add_argument("--density", default="BALANCED", help="density for chat mode")
    args = p.parse_args()

    if not (os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")):
        print("⚠  Set OPENAI_API_KEY or ANTHROPIC_API_KEY for real output.\n", file=sys.stderr)

    if args.chat:
        asyncio.run(_interactive(args.scene, args.density))
    elif args.all:
        async def run_all() -> None:
            for name in SCENARIOS:
                await _run_scenario(name)
        asyncio.run(run_all())
    elif args.scenario:
        asyncio.run(_run_scenario(args.scenario))
    else:
        p.print_help()


if __name__ == "__main__":
    main()
