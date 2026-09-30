#!/usr/bin/env bash
# Machine pass for the find-duplicate-code skill.
# Usage: scan.sh [agent|be|fe]        (no arg = all three)
# Writes raw output to $OUT_DIR. Read the files, do NOT trust them — every cluster
# still has to clear the 4 gates in SKILL.md.
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/ -> find-duplicate-code/ -> skills/ -> .claude/ -> repo root
REPO="${REPO_ROOT:-$(cd "$SKILL_DIR/../../../.." && pwd)}"
OUT_DIR="${OUT_DIR:-${SCRATCHPAD:-/tmp}/dup-scan}"
TARGET="${1:-all}"

mkdir -p "$OUT_DIR"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 24.15.0 >/dev/null 2>&1
echo "node $(node -v)"

run_jscpd() {
	local pkg="$1" src="$2"
	local bin="$REPO/$pkg/node_modules/.bin/jscpd" config=()
	echo "==> jscpd $pkg"
	# Fallback for a package whose node_modules is not installed yet: borrow be's
	# binary and config so all three are still measured alike.
	if [ ! -x "$bin" ]; then
		bin="$REPO/be/node_modules/.bin/jscpd"
		config=(--config "$REPO/be/.jscpd.json")
	fi
	if [ ! -x "$bin" ]; then
		echo "    !! jscpd not installed — run 'pnpm install' in $pkg (or be)" | tee "$OUT_DIR/clones-$pkg.txt"
		return
	fi
	# .jscpd.json supplies minTokens/ignore/threshold; exit code is the 5% gate,
	# which we deliberately ignore here.
	( cd "$REPO/$pkg" && "$bin" "$src" "${config[@]}" \
		--reporters json --output "$OUT_DIR/jscpd-$pkg" ) > "$OUT_DIR/jscpd-$pkg.log" 2>&1
	python3 "$SKILL_DIR/summarize-jscpd.py" \
		"$OUT_DIR/jscpd-$pkg/jscpd-report.json" "$pkg" > "$OUT_DIR/clones-$pkg.txt" 2>&1
	echo "    -> $OUT_DIR/clones-$pkg.txt  (raw json: jscpd-$pkg/, log: jscpd-$pkg.log)"
}

if [ "$TARGET" = "all" ] || [ "$TARGET" = "agent" ]; then run_jscpd agent src; fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "be" ]; then run_jscpd be src; fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "fe" ]; then run_jscpd fe app; fi

echo "==> rename-normalized twins (the forks jscpd cannot see)"
python3 "$SKILL_DIR/twins.py" "$REPO" > "$OUT_DIR/twins.txt" 2>&1
echo "    -> $OUT_DIR/twins.txt  (SECTION A + C = the high-value output, D = mirrors to diff)"

echo "==> grep sweeps"
{
	echo "### layer policy — the boundaries rules that decide where an extraction may live"
	rg -n -A 3 "^const (FSD_POLICIES|BE_POLICIES)" "$REPO/fe/eslint.config.js" "$REPO/be/eslint.config.mjs" 2>/dev/null
	rg -n -B 2 "captured: \{ slice:" "$REPO/fe/eslint.config.js" 2>/dev/null

	echo
	echo "### what the shared homes already export (check before calling anything new)"
	rg -n '^export (async )?(function|const) ' "$REPO/be/src/utils/general.ts" "$REPO/agent/src/utils.ts" 2>/dev/null
	rg -n '^export ' "$REPO/fe/app/shared/lib/index.ts" "$REPO/fe/app/shared/ui/index.ts" 2>/dev/null

	echo
	echo "### hand-rolled helpers that the shared homes may already own"
	rg -n '^\s*(const|function) (trim|pad|parse|same|clamp|clip|group|uniq|chunk|format|to[A-Z])\w*\s*[=(]' \
		"$REPO/fe/app" "$REPO/be/src" "$REPO/agent/src" -g '!**/*.test.*' 2>/dev/null | head -80

	echo
	echo "### module-level constants redeclared across files (same name, same literal)"
	rg -n '^(export )?const [A-Z][A-Z0-9_]+ = [0-9_]+;?$' "$REPO/be/src" "$REPO/agent/src" "$REPO/fe/app" \
		-g '!**/*.test.*' 2>/dev/null | sort -t: -k3 | head -80

	echo
	echo "### repeated drizzle select projections (compare neighbours)"
	rg -n '^const columns = \{|\.innerJoin\(|\.leftJoin\(' "$REPO/be/src/repos" 2>/dev/null | head -60

	echo
	echo "### fe form schemas (Mantine form + zod — compare sibling features)"
	rg -n 'z\.object\(' "$REPO/fe/app/features" -g '**/model/**' 2>/dev/null | head -60

	echo
	echo "### agent session modules (shared plumbing belongs in agent/src/sessions/)"
	wc -l "$REPO"/agent/src/*/session.ts 2>/dev/null
	rg -n 'stderr|killProcessGroup|spawnClaudeSession' "$REPO/agent/src" -g '!**/sessions/**' -g '!**/*.test.*' -l 2>/dev/null

	echo
	echo "### parallel feature dirs (each pair is a candidate cluster)"
	ls -d "$REPO"/fe/app/features/*/ "$REPO"/fe/app/widgets/*/ "$REPO"/fe/app/views/*/ \
		"$REPO"/be/src/controllers/*/ "$REPO"/be/src/repos/*/ "$REPO"/be/src/services/*/ \
		"$REPO"/agent/src/*/ 2>/dev/null | sed "s#$REPO/##"
} > "$OUT_DIR/sweeps.txt" 2>&1
echo "    -> $OUT_DIR/sweeps.txt"

echo
echo "done. outputs in $OUT_DIR"
echo "READ twins.txt SECTION A AND C FIRST — token matching cannot reach those forks."
