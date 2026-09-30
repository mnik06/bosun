#!/usr/bin/env python3
"""Rename-normalized twin finder — the part jscpd is structurally blind to.

Usage: twins.py [repo_root]

Section A  renamed file twins   (different basenames, same normalized name)
Section B  same-name files across slices
Section C  symbol twins         (same normalized function/const name in >=2 files)
Section D  cross-package mirrors (be <-> agent <-> fe: same basename, or a "Mirror" comment)
"""

import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from norm import normalize  # noqa: E402

# scripts/ -> find-duplicate-code/ -> skills/ -> .claude/ -> repo root
REPO = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
ROOTS = [("fe", "fe/app"), ("be", "be/src"), ("agent", "agent/src")]

SKIP_DIRS = {
    "node_modules", "dist", "build", "release", ".react-router",
    "drizzle-out", "+types", "__generated__",
}
SKIP_FILES = {"schema.ts"}  # be/src/services/drizzle/schema.ts — table decls, not logic

# names too generic to mean anything once normalized
NAME_STOP = {
    "index", "types", "type", "constants", "utils", "util", "schema", "schemas",
    "queries", "api", "config", "helpers", "helper", "lib", "main", "handler",
    "hooks", "ui", "consts", "model", "models", "context", "provider",
}
SYMBOL_STOP = NAME_STOP | {
    "get", "list", "run", "build", "create", "update", "handle", "loader", "action",
    "meta", "default", "component", "page", "layout", "error-boundary", "route",
}

DECL = [
    re.compile(r"^export\s+(?:async\s+)?function\s+([A-Za-z_]\w*)"),
    re.compile(r"^export\s+(?:const|let)\s+([A-Za-z_]\w*)\s*[:=]"),
    re.compile(r"^(?:async\s+)?function\s+([A-Za-z_]\w*)"),
    re.compile(r"^(?:const|let)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?[\(<]"),
]

# Nothing inside one package is an eslint-enforced twin in bosun. The deliberate
# duplication is ACROSS packages (be <-> agent wire schemas, fe mirrors of be
# limits) and is reported in section D, never merged. Add a pattern here only for
# a recorded ruling (see REFERENCE.md § by-design duplication).
BY_DESIGN: tuple = ()


def walk():
    for pkg, rel in ROOTS:
        base = os.path.join(REPO, rel)
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                if not fn.endswith((".ts", ".tsx")):
                    continue
                if fn.endswith((".test.ts", ".test.tsx", ".d.ts")) or fn in SKIP_FILES:
                    continue
                full = os.path.join(dirpath, fn)
                yield pkg, full, os.path.relpath(full, REPO)


def lines_of(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read().splitlines()
    except OSError:
        return []


def by_design(rel):
    return any(p.search(rel) for p in BY_DESIGN)


def tag(rel):
    return " [BY-DESIGN?]" if by_design(rel) else ""


files = []
for pkg, full, rel in walk():
    src = lines_of(full)
    files.append({
        "pkg": pkg, "path": full, "rel": rel, "n": len(src), "src": src,
        "base": os.path.splitext(os.path.basename(rel))[0],
    })

print(f"# twins.py — {len(files)} source files scanned under fe/app + be/src + agent/src\n")

# ---------------------------------------------------------------- sections A/B
groups = defaultdict(list)
for f in files:
    key = normalize(f["base"])
    if not key or key in NAME_STOP:
        continue
    groups[(f["pkg"], key)].append(f)

renamed, samename = [], []
for (pkg, key), members in groups.items():
    if len(members) < 2:
        continue
    if len({os.path.dirname(m["rel"]) for m in members}) < 2:
        continue
    (renamed if len({m["base"] for m in members}) > 1 else samename).append((pkg, key, members))

renamed.sort(key=lambda g: -min(m["n"] for m in g[2]))
samename.sort(key=lambda g: -min(m["n"] for m in g[2]))


def dump(groups_, title, note, limit):
    """Candidates first; groups made entirely of leave-list files collapse to one line."""
    cand = [g for g in groups_ if not all(by_design(m["rel"]) for m in g[2])]
    leave = [g for g in groups_ if g not in cand]
    print(f"\n## {title}")
    print(note)
    if not cand:
        print("  (no candidates)")
    for pkg, key, members in cand[:limit]:
        sizes = [m["n"] for m in members]
        print(f"\n- [{pkg}] `{key}`  ({len(members)} files, {min(sizes)}-{max(sizes)} lines)")
        for m in sorted(members, key=lambda x: -x["n"]):
            print(f"    {m['rel']}  ({m['n']}){tag(m['rel'])}")
    if len(cand) > limit:
        print(f"\n  … {len(cand) - limit} more candidate groups omitted")
    if leave:
        print(f"\n  --- {len(leave)} group(s) entirely inside the by-design leave-list "
              f"(recorded rulings) — do NOT propose merging these:")
        for pkg, key, members in leave:
            print(f"    [{pkg}] {key} ×{len(members)}")


dump(renamed, "SECTION A — renamed file twins (jscpd CANNOT see these)",
     "Different basenames that collapse to one name once the domain token is erased.\n"
     "Run twin-diff.py on every pair before writing a finding.", 60)
dump(samename, "SECTION B — same-name files across slices",
     "Name-based only — check contents before calling any of these duplication.", 40)

# ------------------------------------------------------------------ section C
sym = defaultdict(list)
for f in files:
    for i, line in enumerate(f["src"], 1):
        for pat in DECL:
            m = pat.match(line)
            if not m:
                continue
            raw = m.group(1)
            key = normalize(raw)
            if not key or key in SYMBOL_STOP or len(key) < 5:
                break
            sym[key].append((f, raw, i))
            break

clusters = []
for key, hits in sym.items():
    if len({h[0]["rel"] for h in hits}) < 2:
        continue
    clusters.append((key, hits, len({h[1] for h in hits}) > 1))

# renamed symbol twins first — those are the expensive ones
clusters.sort(key=lambda c: (not c[2], -len(c[1])))

print("\n\n## SECTION C — symbol twins (same rule declared in >=2 files)")
print("`RENAMED` = the names differ, so token matching never reported it.\n"
      "`SAME` = the same helper retyped — check be/src/utils/general.ts, fe/app/shared/lib and\n"
      "agent/src/utils.ts before extracting.")
if not clusters:
    print("  (none)")
cand_c = [c for c in clusters if not all(by_design(h[0]["rel"]) for h in c[1])]
leave_c = [c for c in clusters if c not in cand_c]
for key, hits, is_renamed in cand_c[:80]:
    kind = "RENAMED" if is_renamed else "SAME   "
    print(f"\n- {kind} `{key}`  ({len(hits)} declarations)")
    for f, raw, i in sorted(hits, key=lambda h: h[0]["rel"]):
        print(f"    {f['rel']}:{i}  {raw}{tag(f['rel'])}")
if len(cand_c) > 80:
    print(f"\n  … {len(cand_c) - 80} more candidate clusters omitted")
if leave_c:
    print(f"\n  --- {len(leave_c)} cluster(s) entirely inside the by-design leave-list — not findings:")
    for key, hits, _ in leave_c:
        print(f"    {key} ×{len(hits)}")


# ------------------------------------------------------------------ section D
MIRROR = re.compile(r"//.*\bMirror(s|ed)\b")

by_base = defaultdict(list)
for f in files:
    if f["base"] in NAME_STOP:
        continue
    by_base[f["base"].lower()].append(f)

print("\n\n## SECTION D — cross-package mirrors (be <-> agent, plus self-declared mirrors)")
print("Separate packages share no code, so these are duplicated ON PURPOSE — never propose\n"
      "merging them. What matters is whether both sides still AGREE: run twin-diff.py --raw\n"
      "on each pair. A frame, field or limit present on one side only is a tier-A bug\n"
      "(protocol drift), unless the file itself explains the asymmetry.")
# be <-> agent only: same-name be/fe pairs are a controller and the feature that
# calls it, not a mirror. fe mirrors of be declare themselves (list below).
pairs = [(b, m) for b, m in by_base.items() if {"be", "agent"} <= {x["pkg"] for x in m}]
if not pairs:
    print("  (no same-name files across be and agent)")
for base, members in sorted(pairs):
    print(f"\n- `{base}`")
    for m in sorted(members, key=lambda x: x["rel"]):
        print(f"    {m['rel']}  ({m['n']})")

print("\n### files that declare themselves a mirror")
hits = 0
for f in files:
    for i, line in enumerate(f["src"], 1):
        if MIRROR.search(line):
            hits += 1
            print(f"    {f['rel']}:{i}  {line.strip()[:140]}")
if not hits:
    print("  (none)")
