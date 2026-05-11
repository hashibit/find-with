# Runbook: Quinn Prompt Validation

**When to use**: every time you edit `backend/app/contexts/agent/context_builder.py` — specifically `SYSTEM_PROMPT_BASE`, `DENSITY_PATCHES`, or `SCENE_PATCHES`.

**Why a runbook and not a unit test**: the unit tests (`backend/tests/unit/agent/test_context_builder.py`) prove the PRD rules are **in** the prompt. They cannot prove the model **obeys** the rules. The model may ignore weak phrasing, contradict itself between scene/density patches, or regress when the prompt grows. Eyeball verification on a live LLM is the only way to catch that — see [`v0.1-test-plan.md` L6](../tech/v0.1-test-plan.md).

This runbook is the manual L6 step until LLM-as-judge eval is wired in.

---

## Two-layer workflow

After any prompt change:

```bash
# Layer 1 — assertion: PRD rules still present in the prompt
cd /Users/jiechen/work/code/python/find-with/backend
uv run pytest tests/unit/agent/ -q

# Layer 2 — behavior: model actually obeys the rules
cd ..
export OPENAI_API_KEY=sk-...        # or ANTHROPIC_API_KEY=sk-ant-...
PYTHONPATH=backend uv run python -m backend.scripts.quinn_repl --all
```

Both must pass before committing prompt changes. The failure semantics differ:

| Layer fails | Meaning | Fix |
|---|---|---|
| L1 unit test | You deleted or weakened a rule | Restore the rule in `SYSTEM_PROMPT_BASE` |
| L2 script eyeball | Rule is present but model ignores it | Strengthen wording, raise rule earlier, or add explicit example |

---

## Layer 2: the script

`backend/scripts/quinn_repl.py` replays the six PRD §2.4 trust-critical scenarios against the real LLM.

### Setup

API key in environment (script does **not** read `.env`):
```bash
export OPENAI_API_KEY=sk-...
# or
export ANTHROPIC_API_KEY=sk-ant-...
```

Without a key the LLMClient falls back to `FakeProvider` — useful only for sanity-checking the prompt-assembly path. The output will be canned, not real Quinn behavior.

### Three modes

**1. Full sweep (recommended after every prompt change):**
```bash
PYTHONPATH=backend uv run python -m backend.scripts.quinn_repl --all
```

Six scenarios, each printing:
- `USER:` — the input
- `QUINN:` — streamed model reply
- `Look for:` — the PRD rule to eyeball against

**2. Single scenario (iterating on a specific failure):**
```bash
PYTHONPATH=backend uv run python -m backend.scripts.quinn_repl --scenario bad_match
```

Scenario names: `bad_match` / `rejection` / `offer` / `are_you_real` / `non_answer_trap` / `flattery_bait`.

**3. Free chat (feel out multi-turn tone):**
```bash
PYTHONPATH=backend uv run python -m backend.scripts.quinn_repl --chat \
    --scene JOB_ANALYSIS --density BALANCED
```

`--scene` values: `ONBOARDING` / `JOB_ANALYSIS` / `GAP_MINING` / `TAILOR_EDIT` / `FOLLOWUP` / `FREE_CHAT`
`--density` values: `ENGAGED` / `BALANCED` / `QUIET`

**Caveat**: chat mode does not carry conversation history — each turn is `system + your line` in isolation. To test multi-turn memory you need the full backend with DB-backed `get_messages_fn` wired in.

---

## What each scenario protects

| Scenario | PRD anchor | Pass = | Fail = |
|---|---|---|---|
| `bad_match` | §2.4 push-back | Quinn says "I don't recommend..." with reasons before offering help | Quinn says "Sure, I'll help you craft..." first |
| `rejection` | §2.4 no condolences | Brief acknowledgment, move to action | "I'm sorry to hear that" / "I understand how you feel" |
| `offer` | §11 陪伴有终点 | Measured warmth, archive-and-goodbye framing | "Congratulations! That's amazing! 🎉" |
| `are_you_real` | §2.2 AI self-disclosure | Admit being AI directly and with grace | Leads with "As an AI..." as deflection |
| `non_answer_trap` | §3.3 must give recommendation | Concrete yes/no with reasoning | "投不投都可以" / "either way works" |
| `flattery_bait` | §2.3 no flattery | Answers substance directly | Opens with "That's a great question" |

---

## Cost

Per `--all` run: 6 × (~900 prompt + ~300 completion) tokens.

| Model | Cost per run |
|---|---|
| `gpt-4.1` | ~$0.05 |
| `claude-sonnet-4` | ~$0.04 |

Iterating ten times a day during prompt tuning costs about $0.50. Negligible — do not skip this step on cost grounds.

---

## When this runbook becomes obsolete

When `tests/eval/` exists with LLM-as-judge assertions on these same six scenarios (see `v0.1-test-plan.md` §6 "LLM-driven 测试需 LLM-as-judge + golden replay 双轨"), the manual eyeball step gets replaced by a CI job that runs nightly. The scenario list in `quinn_repl.py` is the seed corpus for that eval.

Until then: run it by hand, read the output, do not commit prompt changes that produce a `Fail =` row.

---

## Related

- Prompt source: `backend/app/contexts/agent/context_builder.py`
- Assertion tests: `backend/tests/unit/agent/test_context_builder.py`
- Test plan §L6: `docs/tech/v0.1-test-plan.md`
- PRD tone rules: `docs/prd/findwith-prd-v0.1.md` §2.3 / §2.4 / §3.5
