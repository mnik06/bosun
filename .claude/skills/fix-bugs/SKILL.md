---
name: fix-bugs
description: Work off a list of bugs on the checked-out branch through parallel fix sub-agents. The main session becomes an orchestrator - it takes the bug list, sends one read-only locator agent to map every bug to its file set, groups the bugs into non-overlapping groups, spawns one fix agent per group (in parallel when the groups are provably disjoint), runs a single verify pass over the merged result, then commits one commit per group behind a user approval gate. It never reads the diff, greps, or edits anything itself. The session stays resident, so more bugs can be dripped in and are appended to the queue. Use when the user pastes bugs to fix, says "fix these", "here are some bugs", "work this list off", or when another skill delegates a merged issue list.
---

# Fix Bugs

Main session is the **orchestrator**. It holds four things and nothing else: the bug queue, the user's rulings, the group map, and the approval state. Every read, grep, edit, and test run happens inside a sub-agent.

**Hard rules**

- Never open source files, grep, or edit in the main thread. If you need to know something about the code, a sub-agent answers it.
- **Group first, then parallelize.** Two bugs whose file sets touch belong to the SAME group and one agent. Only whole groups run in parallel. Never split a group across agents.
- A sub-agent never makes a product decision the user has not ruled on. Ambiguity comes back to the orchestrator, which asks via `AskUserQuestion`, then re-briefs.
- One commit per group, path-scoped, behind an approval gate. Never commit before the user answers.
- The queue lives in this session only. **Re-print the full remaining queue at the top of every round** so it survives a context compaction.

## Phase 0 - Intake

1. `git rev-parse --abbrev-ref HEAD` + `git status --short`. On the default branch: say so and offer to branch before any fix. A dirty tree is fine - name it and ask before the first commit.
2. **Take the bug list verbatim** as `[B-1] … [B-n]` - paste, file path, or a list handed over by a calling skill. Never reword a bug; the user's phrasing carries intent. Ask for severity only if the ordering is not obvious.
3. **Detect the verify command once** (orchestrator, cheap): read `package.json` scripts / `Makefile` / `CLAUDE.md`. Prefer a single `preflight`-style script; else compose typecheck + lint + unit tests. Note per-side commands in a monorepo, plus any toolchain preamble the repo's CLAUDE.md mandates (node version, package manager). If nothing resolves, ask once and reuse the answer all session.
4. **Ticket, optional.** Resolve one from `git log <default>..HEAD --format='%s'` if the commits carry a ticket id. Found → use the repo's own commit format and pull the ticket's acceptance criteria as fix context. Not found → ask once; on "none", use a plain conventional-commit subject and move on. Never block on a ticket.
5. Restate the queue back to the user, numbered, in the order you will work it.

## Phase 1 - Locate (one sub-agent)

Spawn ONE read-only locator agent with the locator brief from [PROMPTS.md](PROMPTS.md), carrying the whole queue. It maps each `[B-n]` to a file:line set plus a suspected root cause and returns a compact table - no fixes, no edits, no file dumps.

Do not skip this pass to save a round. Grouping on bug text alone is a guess, and a wrong guess is two agents editing one file.

## Phase 2 - Group

1. Build groups as **connected components over the locator's file sets**: bugs sharing any file, or any module those files import from, land in one group. An unlocated bug is its own group and runs alone.
2. A group whose bugs depend on each other's outcome stays one group, worked in order by one agent.
3. Cap the round at **3 groups in parallel**. Extra groups wait for the next round - beyond three, the review burden lands on the user all at once.
4. Print the group map: one line per group listing its `[B-n]`s and its file set, plus one line on why the groups cannot collide. Let the user shrink or re-split it. Never widen a batch on your own after they answer.
5. **Resolve every ambiguity now**, before any agent spawns - one `AskUserQuestion` per decision, recommended option first, tradeoffs in the option descriptions. A bug whose intended behavior is unsettled is not brief-ready and does not go into the round.

## Phase 3 - Fix rounds

Each round: re-print the remaining queue, propose the round's groups, spawn, verify, gate, commit.

1. **Spawn** one `general-purpose` agent per group, in parallel, in a single message, each with the fix brief from [PROMPTS.md](PROMPTS.md) - fully specified: the bugs, the decided behavior, the file set, and **the other groups' file sets as off-limits**. Agents implement + unit tests and **stop before any verify run and before the browser**; concurrent typechecks over a half-edited tree produce phantom failures, and UI verification is the user's.
2. **Verify once.** When the whole batch is back, spawn one agent with the verify brief from [PROMPTS.md](PROMPTS.md) to run the Phase 0 verify command over the merged tree. Failures route back to the owning group as a re-spawn, not to the user.
3. **Report short** - a few lines per group. Surface only what changes the user's next action: a decision an agent had to make, a ruling that conflicts with the code, something to eyeball. If two agents report the same file despite the grouping, say so loudly and confirm neither clobbered the other before committing anything.
4. **Approval gate.** Wait. Start no new round.
   - Approved → commit **one commit per group**, path-scoped to that agent's reported files: `git add <files>` then the Phase 0 commit format.
   - Rejected / more feedback → re-spawn the **same** group with the feedback appended. Numbers never change.
   - Partially approved → commit the approved groups, keep the rest open.
   - Deferred → move to the end of the queue, keep the numbers.

## Phase 4 - Standing queue

The session stays open. New bugs arriving mid-round are appended as new `[B-n]` and acknowledged - **never interrupt a running round**, never reuse a number. They join the next round's locate + group pass, where the queue is re-ordered. When the queue empties, report: bugs fixed, struck, deferred, commits added, and anything an agent flagged that only the user can confirm.

## Reference

- [PROMPTS.md](PROMPTS.md) - the locator, fix, and verify briefs, verbatim.
