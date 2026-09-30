"""Domain-token normalization shared by twins.py and twin-diff.py.

The Bosun codebase forks one rule into per-provider and per-session copies that
differ only by a token: azure / github / pat on the provider side (Azure DevOps vs
GitHub PAT connections, guards, snapshot services, webhooks), and planning /
execution / bugfix / quick-fix / onboarding / integration / build / plan on the
agent-session and wire-frame side. Erasing that token from every identifier is
what makes the forks comparable — jscpd cannot see them otherwise.
"""

import re

_CAMEL = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")
_SEP = re.compile(r"[-_./\s]+")

# multi-segment phrases, erased first (longest first)
PHRASES = [
    "azure-devops",
    "github-pat",
    "quick-fix",
]

# single segments erased anywhere
TOKENS = {
    "azure", "devops", "github", "pat", "gh",
    "bugfix", "quickfix", "onboarding", "planning", "plan", "execution",
    "integration", "build", "summary", "ask",
}


def segments(name: str) -> list[str]:
    parts = _SEP.split(_CAMEL.sub("-", name))
    return [p.lower() for p in parts if p]


def normalize(name: str) -> str:
    """kebab-case name with every domain token erased. '' when nothing survives."""
    s = "-".join(segments(name))
    for phrase in PHRASES:
        s = s.replace(phrase, "-")
    kept = [p for p in s.split("-") if p and p not in TOKENS]
    return "-".join(kept)


_IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def normalize_line(line: str) -> str:
    """Same erasure applied to every identifier in a source line."""
    return _IDENT.sub(lambda m: normalize(m.group(0)) or "_", line)
