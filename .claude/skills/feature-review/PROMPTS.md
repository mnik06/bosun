# Briefs

Both are handed to a `general-purpose` agent via the Agent tool. Fill every `<…>` before sending — an unfilled placeholder is a product decision the sub-agent will invent.

## Code-review brief (Phase 1a)

```
Review the checked-out branch `<branch>` for plan <#n — Plan title>.

The acceptance criteria are given below — they are the contract. Do not go re-derive them; if something
reads ambiguous, report it as UNCLEAR rather than resolving it yourself.

ACCEPTANCE CRITERIA
<paste the AC checklist verbatim, ids intact>
Governing design plans: <the plans/NNN-*.md files and sections, by feature area>

Run the `review-bosun` skill end to end — Skill(skill: "review-bosun"). Obey it verbatim, including the
MANDATORY dead-code pass (report-only), the agent version-bump check, and the preflight run on every
package the diff touches. Its Step 2 is already done for you — use the criteria above instead of
re-pulling the PR or issue, but DO read the governing plans/*.md sections named above and the engineering
docs beside the touched modules.

Do not open a browser. A separate agent drives the UI against these same criteria, and duplicating it here
wastes the independent read. Anything you can only settle by opening the screen: report it as UNCLEAR with
what would settle it.

FIX NOTHING. Report only. No edits, no deletions, however obvious.

Return ONLY this, nothing else — no diffs, no file contents, no narration:

[R-1] critical|major|minor | <area> | <one-line problem> | <file:line or "runtime"> | <one-line repro>
[R-2] …

Then three short blocks:
AC coverage: <n> pass / <n> fail / <n> unclear, by criterion id, one line why for each non-pass.
Mechanical: preflight be / fe / agent = pass/fail/not touched (quote failures verbatim), agent version
bumped = yes/no/not needed, dead code orphaned by this branch = the list or "none".
Could not verify: what a local stack could not reach, and why.

Give each [R-n] a file:line whenever you know it — the orchestrator uses those file sets to decide which
fixes can safely run in parallel, and an unlocated finding forces a slower sequential round.

Keep the whole reply under 60 lines. Findings only — the orchestrator will not read your working files.
```

## UI-test brief (Phase 1b)

Runs in parallel with the code review, as its own agent. It is given the criteria and nothing else — no
diff, no file list, no findings from the other agent. Telling it where to look turns an independent check
into a confirmation.

```
Run the `ui-test` skill against the local dev stack running branch `<branch>`.

ACCEPTANCE CRITERIA — this is your entire specification. Assert the criterion, not the application.
<paste the AC checklist verbatim, ids intact>

Target: http://127.0.0.1:5373 — the LOCAL stack running this branch (keep 127.0.0.1, not localhost). The
deployed app runs main and would validate the wrong build. Check what is already listening before starting
anything:
  lsof -nP -iTCP -sTCP:LISTEN | grep -E ":5373|:1506"
Reuse a running server; never spawn a second. To start: `cd be && nvm use && pnpm local` (API on :1506) and
`cd fe && nvm use && pnpm dev` (:5373). Node 24.15 + pnpm 11.8. If this branch adds a migration under
be/drizzle-out/, the local database needs `cd be && pnpm db:migration:run` — ask before running it.

Credentials: the test leader account from .bosun/project.yaml — `$TEST_LEADER_EMAIL` /
`$TEST_LEADER_PASSWORD`, signing in at /login. If they are not set and a login is needed, STOP and ask —
never invent credentials. There is no sign-up; accounts are created by a project leader.

Machine-gated lanes (planning sessions, builds, onboarding and verify all run on an enrolled, online
agent) and provider-gated ones (a real GitHub/Azure DevOps token or App installation) may not finish on a
local stack. Verify up to the boundary, then mark the rest "could not test" with the reason. Never claim a
terminal state you did not see.

FIX NOTHING. Report only. No edits, no commits, however obvious.

Return ONLY this, nothing else:

[R-1] critical|major|minor | <area> | <one-line problem> | <file:line or "runtime"> | <one-line repro>
[R-2] …

Close with one line per acceptance criterion: id → holds | fails | could not test.
```

## Fix brief (Phase 3)

Moved. The fix brief, the locator brief, and the verify brief live in the `fix-bugs` skill's PROMPTS.md
(`.claude/skills/fix-bugs/PROMPTS.md`). Phase 3 delegates to that skill instead of briefing fix agents here.
