"""PromptRegistry — §14.3: versioned prompt management.

Prompt files live in backend/app/prompts/templates/.
Each file MUST contain a version comment on line 1: `# version: N`
CI lint: if file content changes but version number doesn't → fail.
"""

import hashlib
import re
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent / "templates"

_registry: dict[str, dict] = {}


def _parse_version(content: str) -> int:
    """Extract version number from first line."""
    match = re.match(r"^#\s*version:\s*(\d+)", content)
    if not match:
        raise ValueError("Prompt file must start with '# version: N'")
    return int(match.group(1))


def load_prompt(name: str) -> str:
    """Load a prompt template by name (filename without extension)."""
    if name in _registry:
        return _registry[name]["content"]

    path = PROMPTS_DIR / f"{name}.txt"
    if not path.exists():
        raise FileNotFoundError(f"Prompt template not found: {path}")

    content = path.read_text(encoding="utf-8")
    version = _parse_version(content)
    content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]

    _registry[name] = {
        "content": content,
        "version": version,
        "hash": content_hash,
        "path": str(path),
    }

    return content


def get_prompt_version(name: str) -> int:
    """Get the version of a loaded prompt."""
    if name not in _registry:
        load_prompt(name)
    return _registry[name]["version"]


def lint_prompts() -> list[str]:
    """Check all prompt files have valid version headers. Returns list of errors."""
    errors = []
    if not PROMPTS_DIR.exists():
        return errors

    for path in PROMPTS_DIR.glob("*.txt"):
        try:
            content = path.read_text(encoding="utf-8")
            _parse_version(content)
        except ValueError as e:
            errors.append(f"{path.name}: {e}")

    return errors
