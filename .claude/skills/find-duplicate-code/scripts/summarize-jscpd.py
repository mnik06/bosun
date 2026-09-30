#!/usr/bin/env python3
"""Rank a jscpd JSON report so it is triageable.

Usage: summarize-jscpd.py <jscpd-report.json> <pkg-label>

Section 1  directory pairs by total duplicated lines  <- the extraction opportunities
Section 2  biggest individual clones
Section 3  files by total duplicated lines
"""

import json
import os
import sys
from collections import defaultdict

if len(sys.argv) < 2:
    sys.exit(__doc__)

path = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else "?"

if not os.path.exists(path):
    sys.exit(f"no jscpd report at {path} — check the .log file next to it")

with open(path, encoding="utf-8") as fh:
    data = json.load(fh)

dups = data.get("duplicates", [])
stats = data.get("statistics", {}).get("total", {})

# scripts/ -> find-duplicate-code/ -> skills/ -> .claude/ -> repo root
REPO = os.environ.get("REPO_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
REPO = REPO.rstrip("/") + "/"


def rel(p):
    return p.replace(REPO, "")


def d(p):
    return os.path.dirname(rel(p))


print(f"# jscpd — {label}")
print(f"clones: {len(dups)}   duplicated lines: {stats.get('duplicatedLines', '?')}"
      f" / {stats.get('lines', '?')}   ({stats.get('percentage', '?')}%)")
print("\nNOTE: this number is token-level only. A falling percentage is NOT evidence of dedup —")
print("guarding one twin and leaving the other removes the clone and keeps the bug.")
print("Read twins.txt for the forks this file cannot see.\n")

pairs = defaultdict(lambda: {"lines": 0, "n": 0, "ex": None})
files = defaultdict(int)
sized = []

for c in dups:
    f1, f2 = c["firstFile"], c["secondFile"]
    n = c.get("lines", 0)
    key = tuple(sorted((d(f1["name"]), d(f2["name"]))))
    p = pairs[key]
    p["lines"] += n
    p["n"] += 1
    if p["ex"] is None or n > p["ex"][0]:
        p["ex"] = (n, f"{rel(f1['name'])}:{f1['start']}", f"{rel(f2['name'])}:{f2['start']}")
    files[rel(f1["name"])] += n
    files[rel(f2["name"])] += n
    sized.append((n, f"{rel(f1['name'])}:{f1['start']}-{f1['end']}",
                  f"{rel(f2['name'])}:{f2['start']}-{f2['end']}"))

print("\n## 1 — directory pairs by duplicated lines (cluster these into ONE finding each)")
for key, v in sorted(pairs.items(), key=lambda kv: -kv[1]["lines"])[:30]:
    a, b = key
    where = "within" if a == b else "across"
    print(f"\n- {v['lines']:5d} lines / {v['n']:3d} clones  [{where}]")
    print(f"    A: {a}")
    print(f"    B: {b}")
    if v["ex"]:
        print(f"    biggest: {v['ex'][0]} lines — {v['ex'][1]}  ==  {v['ex'][2]}")

print("\n\n## 2 — biggest individual clones")
for n, x, y in sorted(sized, key=lambda s: -s[0])[:40]:
    print(f"- {n:4d} lines  {x}\n              {y}")

print("\n\n## 3 — files by duplicated lines involved")
for f, n in sorted(files.items(), key=lambda kv: -kv[1])[:40]:
    print(f"- {n:5d}  {f}")
