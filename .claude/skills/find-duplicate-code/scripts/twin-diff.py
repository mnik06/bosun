#!/usr/bin/env python3
"""Rename-normalized diff of two twin files — gate 2 of the skill.

Usage: twin-diff.py <fileA> <fileB> [--raw]

Erases azure/github/pat and the agent-session tokens (planning/execution/bugfix/
quick-fix/onboarding/integration/build/plan/…) from every identifier,
strips comments and blank lines, then diffs. The surviving differences ARE the
divergence report: a missing guard, an extra field, a different operator on one side
is a tier-A bug, not refactor debt.
"""

import difflib
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from norm import normalize_line  # noqa: E402

if len(sys.argv) < 3:
    sys.exit(__doc__)

a_path, b_path = sys.argv[1], sys.argv[2]
raw_mode = "--raw" in sys.argv

LINE_COMMENT = re.compile(r"^\s*(//|/\*|\*)")


def load(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        src = fh.read().splitlines()
    out = []
    for i, line in enumerate(src, 1):
        s = line.strip()
        if not s or LINE_COMMENT.match(s):
            continue
        out.append((i, s if raw_mode else normalize_line(s)))
    return out


a, b = load(a_path), load(b_path)
a_txt = [t for _, t in a]
b_txt = [t for _, t in b]

ratio = difflib.SequenceMatcher(None, a_txt, b_txt).ratio()
same = sum(bl.size for bl in difflib.SequenceMatcher(None, a_txt, b_txt).get_matching_blocks())

print(f"A  {a_path}  ({len(a_txt)} code lines)")
print(f"B  {b_path}  ({len(b_txt)} code lines)")
print(f"\nsimilarity (normalized): {ratio * 100:.1f}%   shared lines: {same}")
if ratio >= 0.97:
    verdict = "IDENTICAL — extract (tier B), name the destination slice"
elif ratio >= 0.55:
    verdict = "DIVERGED — read every diff line below; each one is a candidate tier-A bug"
elif ratio >= 0.30:
    verdict = ("FORKED — same skeleton, heavy drift. Still one rule in two places if the "
               "declarations line up; merging is a tier-C design call, and the drift is "
               "still worth reading for tier-A bugs")
else:
    verdict = "WEAK — probably not one rule in two places; verify before reporting"
print(f"verdict: {verdict}\n")

diff = difflib.unified_diff(a_txt, b_txt, fromfile="A", tofile="B", lineterm="", n=2)
body = list(diff)
if len(body) <= 3:
    print("(no differences after normalization)")
else:
    print("\n".join(body[:400]))
    if len(body) > 400:
        print(f"\n… {len(body) - 400} more diff lines omitted")
print("\nNOTE: line numbers above are positions in the stripped/normalized text, not the file.")
print("Re-find each difference in the real file before quoting a path:line in the report.")
