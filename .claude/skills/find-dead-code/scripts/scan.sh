#!/usr/bin/env bash
# Machine pass for the find-dead-code skill.
# Usage: scan.sh [agent|be|fe]        (no arg = all three)
# Writes raw output to $OUT_DIR and prints the paths. Read the files, do NOT trust them —
# every hit still has to clear the 3 gates in SKILL.md.
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/ -> find-dead-code/ -> skills/ -> .claude/ -> repo root
REPO="${REPO_ROOT:-$(cd "$SKILL_DIR/../../../.." && pwd)}"
OUT_DIR="${OUT_DIR:-${SCRATCHPAD:-/tmp}/dead-code}"
TARGET="${1:-all}"

mkdir -p "$OUT_DIR"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 24.15.0 >/dev/null 2>&1
echo "node $(node -v)"

run_knip() {
	local pkg="$1"
	echo "==> knip $pkg (first run downloads knip via pnpm dlx; can take a few minutes)"
	( cd "$REPO/$pkg" && pnpm dlx knip \
		--config "$SKILL_DIR/knip-$pkg.json" \
		--no-exit-code \
		--reporter markdown ) > "$OUT_DIR/knip-$pkg.md" 2> "$OUT_DIR/knip-$pkg.err"
	echo "    -> $OUT_DIR/knip-$pkg.md  (stderr: knip-$pkg.err)"
}

if [ "$TARGET" = "all" ] || [ "$TARGET" = "agent" ]; then run_knip agent; fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "be" ]; then run_knip be; fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "fe" ]; then run_knip fe; fi

echo "==> dataflow pass (fields that are referenced everywhere but never written; several minutes)"
python3 "$SKILL_DIR/dead-fields.py" "$REPO" > "$OUT_DIR/dead-fields.txt" 2>&1
echo "    -> $OUT_DIR/dead-fields.txt  (section A = strong candidates)"

echo "==> grep sweeps (things knip cannot see)"
{
	echo "### commented-out code blocks (>=1 line of commented statement)"
	rg -n '^\s*//\s*(const|let|function|export|import|if |await |return |class )' \
		"$REPO/fe/app" "$REPO/be/src" "$REPO/agent/src" 2>/dev/null | head -200

	echo
	echo "### always-false / disabled conditions"
	rg -n 'if\s*\(\s*false|&&\s*false|\|\|\s*false\s*\)|return\s+null;\s*//\s*(disabled|unused|dead)' \
		"$REPO/fe/app" "$REPO/be/src" "$REPO/agent/src" 2>/dev/null | head -100

	echo
	echo "### not-implemented / stub bodies"
	rg -n "not implemented|NotImplemented|TODO: remove|@deprecated|DEPRECATED" \
		"$REPO/fe/app" "$REPO/be/src" "$REPO/agent/src" 2>/dev/null | head -100

	echo
	echo "### drizzle table exports (cross-check each against code refs)"
	rg -n '^export const \w+ = pgTable' "$REPO/be/src/services/drizzle/schema.ts" 2>/dev/null

	echo
	echo "### BE route registrations (cross-check each for an FE or agent caller)"
	rg -n "(app|fastify|server)\.(get|post|put|patch|delete)\(" "$REPO/be/src/api/routes" \
		--glob '!**/schemas/**' -A1 2>/dev/null | head -300

	echo
	echo "### wire frame types — each needs a sender on one side and a handler on the other"
	rg -oN --no-filename "type: z\.literal\('[a-z_.]+'\)" "$REPO/be/src/types" "$REPO/agent/src" 2>/dev/null \
		| sed -E "s/.*'([a-z_.]+)'.*/\1/" | sort -u | while read -r frame; do
			n=$(rg -c --fixed-strings "'$frame'" "$REPO/be/src" "$REPO/agent/src" "$REPO/fe/app" \
				-g '!**/*.test.*' 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')
			echo "$n	$frame"
		done | sort -n | head -60

	echo
	echo "### agent MCP tools — each should be named by a prompt"
	rg -oN --no-filename "name: '[a-z_]+'" "$REPO/agent/src" -g '**/mcp/**' 2>/dev/null \
		| sed -E "s/name: '([a-z_]+)'/\1/" | sort -u | while read -r tool; do
			n=$(rg -c --fixed-strings "$tool" "$REPO/agent/src/prompts" 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')
			echo "$n	$tool"
		done | sort -n

	echo
	echo "### package.json scripts (cross-check each for a caller in CI/deploy/docs)"
	for pkg in agent be fe; do
		python3 -c 'import json, sys; [print(f"{sys.argv[2]}: {k}: {v}") for k, v in json.load(open(sys.argv[1])).get("scripts", {}).items()]' \
			"$REPO/$pkg/package.json" "$pkg" 2>/dev/null
	done
} > "$OUT_DIR/sweeps.txt" 2>&1
echo "    -> $OUT_DIR/sweeps.txt"

echo
echo "done. outputs in $OUT_DIR"
echo "READ dead-fields.txt SECTION A FIRST — reference counting cannot reach those."
