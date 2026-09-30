#!/usr/bin/env bash
# Gate 2 of the find-dead-code skill: repo-wide reference check for one identifier.
# Usage: verify-symbol.sh <name> [more names...]
# Counts every reference — identifier, string literal, snake_case twin, and dynamic access —
# across agent/, be/, fe/ and the process files. Zero hits outside its own declaration = candidate.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/ -> find-dead-code/ -> skills/ -> .claude/ -> repo root
REPO="${REPO_ROOT:-$(cd "$SCRIPT_DIR/../../../.." && pwd)}"
[ $# -ge 1 ] || { echo "usage: verify-symbol.sh <name> [name...]"; exit 2; }

# camelCase -> snake_case, for DB column / wire-frame checks
snake() { echo "$1" | sed -E 's/([a-z0-9])([A-Z])/\1_\2/g' | tr '[:upper:]' '[:lower:]'; }

EXCLUDES=(
	-g '!node_modules' -g '!dist' -g '!build' -g '!release' -g '!.git'
	-g '!*.lock' -g '!pnpm-lock.yaml' -g '!drizzle-out' -g '!.react-router'
)
CODE=("$REPO/agent/src" "$REPO/be/src" "$REPO/fe/app")

for NAME in "$@"; do
	SNAKE="$(snake "$NAME")"
	echo "════════ $NAME  (snake: $SNAKE) ════════"

	echo "--- code refs (agent/src, be/src, fe/app) ---"
	rg -n --word-regexp "${EXCLUDES[@]}" "$NAME" "${CODE[@]}" 2>/dev/null

	if [ "$SNAKE" != "$NAME" ]; then
		echo "--- snake_case / string refs ---"
		rg -n "${EXCLUDES[@]}" "$SNAKE" "${CODE[@]}" 2>/dev/null
	fi

	echo "--- config / scripts / assets / tooling ---"
	rg -n "${EXCLUDES[@]}" "$NAME" \
		"$REPO/agent" "$REPO/be" "$REPO/fe" --glob '!**/app/**' --glob '!**/src/**' 2>/dev/null | head -40

	echo "--- plans / README / .bosun / CI (deferred != dead) ---"
	rg -ln "${EXCLUDES[@]}" "$NAME" "$REPO/plans" "$REPO/README.md" "$REPO/.bosun" "$REPO/.github" 2>/dev/null | head -20

	CODE_HITS=$(rg -c --word-regexp "${EXCLUDES[@]}" "$NAME" "${CODE[@]}" 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')
	echo "--- total code hits: $CODE_HITS (1 = declaration only, 2 = declaration + barrel) ---"
	echo
done
