---
name: feature-review
description: Orchestrate a full review-and-fix pass over the checked-out feature branch. Spawns two sub-agents — one running review-bosun over the code, one running ui-test against every acceptance criterion on the local dev stack — merges their findings with the user's own hand-written comment list, resolves every ambiguity with the user, then hands the merged list to the `fix-bugs` skill, which groups it and works it off through parallel fix sub-agents behind an approval gate. The main session stays an orchestrator — it never reads the diff, greps the codebase, or drives the browser itself. Use when the user has checked out a feature branch, reviewed it in the UI, and wants their comments merged with an agent review and worked off one at a time.
---

# Feature Review

Main session is the **orchestrator**. It holds four things and nothing else: the plan's acceptance criteria, the merged issue list, the user's rulings, and the approval state. Every diff read, grep, browser drive, and edit happens inside a sub-agent.

This skill owns **review and merge**. The fixing itself is delegated to the project `fix-bugs` skill (`.claude/skills/fix-bugs/`) — do not re-implement grouping, fix briefs, or the commit loop here.

**Hard rules**

- Never read the diff, open source files, grep, or run Playwright in the main thread. If you need to know something about the code, a sub-agent answers it.
- A sub-agent never makes a product decision the user has not ruled on. Ambiguity comes back to the orchestrator, which asks via `AskUserQuestion`, then re-briefs.
- The list lives in this session only. **Re-print the full remaining list at the top of every round** so it survives a context compaction.

## Phase 0 — Intake

1. `git rev-parse --abbrev-ref HEAD` + `git status --short`. Refuse to run on `main`. A dirty tree is fine (it may be the user's own probing) — name it and ask before the first fix commit.
2. Resolve the target plan: the skill argument if given (a GitHub issue number, a bosun plan link, or a pasted AC list), else the branch — plan branches are `bosun/plan/<n>-<slug>` and their commits `<Plan title> — slice <k>: <slice title>`. Capture the plan number `<n>` and title. If nothing resolves, ask for one — the review has no acceptance criteria without it.
3. **Read the plan in the orchestrator**: `gh pr list --head <branch> --state all --json number,body` — the PR body links the plan in bosun and carries `## Acceptance criteria` and `## Decisions taken`; or `gh issue view <m> --json title,body` when a GitHub `plan` issue covers it. The PR body truncates long AC lists ("…and N more, on the plan") — then ask the user to paste the full list from the plan's page in bosun. Extract the **acceptance-criteria checklist** and the governing `plans/NNN-*.md` design plan(s), and keep them for the rest of the session — they are the review contract, the merge yardstick, and the thing every fix brief is checked against. Body only; skip comment threads unless the ACs were amended there.

## Phase 1 — Agent review (sub-agent)

Spawn **two** `general-purpose` agents, in parallel, both with the AC checklist pasted in — they verify against the criteria you extracted, they do not go re-derive them.

- **Code review** — the code-review brief from [PROMPTS.md](PROMPTS.md). Runs `review-bosun`: plan conformance, conventions, dead code, preflight. No browser.
- **UI test** — the UI-test brief from [PROMPTS.md](PROMPTS.md). Runs `ui-test`: drives every acceptance criterion in the browser and sweeps for visual defects. Its brief carries the criteria and nothing else — no diff, no file list, no hint where the risk is, because a tester told where to look stops being an independent check.

Tell the user they are running and that they should finish their own UI pass meanwhile — the passes overlap on purpose.

Each returns a compact numbered list, `[R-1] …`, no file dumps. Both **fix nothing**.

## Phase 2 — Merge

1. Print both agents' lists as one `[R-n]` sequence, code-review findings and UI findings together.
2. Ask the user for their comment list (paste or a file path). Take it verbatim as `[U-n]`.
3. Merge into one numbered list `[F-1] … [F-k]`, each line: `severity | source (mine/agent/both) | one-line problem | file:line if known`. Fold an agent finding and a user comment describing the same defect into one `[F-n]` tagged `both` — never drop the user's wording, it carries intent the agent's repro doesn't.
4. Order by severity, then ask the user to confirm or reorder the list, and to strike anything they don't want fixed.
5. Resolve every ambiguity **now**, before any fix starts — one `AskUserQuestion` per decision, recommended option first, tradeoffs written into the option descriptions. An `[F-n]` whose intended behavior is unsettled is not brief-ready.

## Phase 3 — Fix (delegated to `fix-bugs`)

Invoke `Skill(skill: "fix-bugs")` and stay the orchestrator through its phases. Hand it, in the invocation, everything it would otherwise have to ask for:

- **The queue**: the confirmed `[F-n]` list verbatim, keeping the `[F-n]` numbering — it becomes its `[B-n]`. Carry each item's `file:line` where the review knew it; its locator agent fills the gaps and confirms the rest.
- **The rulings**: the decided behavior for every item settled in Phase 2 step 5, plus the AC ids and verbatim text each item serves.
- **Plan + commit format**: a plain imperative subject naming what was fixed (the repo's own style, e.g. `Hold onboarding, sessions and builds until the clone lands`), no ticket prefix, and **no `Co-Authored-By` trailer** (`be/CLAUDE.md` / `fe/CLAUDE.md` hard rule) — already resolved in Phase 0, so its ticket step is a no-op.
- **Verify commands**: `cd be && nvm use && pnpm preflight`, `cd fe && nvm use && pnpm preflight`, `cd agent && nvm use && pnpm preflight` — run only for the packages the round touched. Node 24.15 (`.nvmrc`) + pnpm 11.8.
- **Conventions**: `be/CLAUDE.md`, `fe/CLAUDE.md`, the `<module>.md` / `README.md` beside the touched modules, and for `agent/` the standing rule that any change there bumps the patch `version` in `agent/package.json` in the same commit.
- **Standing ruling**: fix agents stop before the browser. The user verifies the UI between rounds.

`fix-bugs` groups the list by file overlap, runs the disjoint groups in parallel, verifies once per round, gates on the user, and commits per group. Do not second-guess its grouping or hand it a batch order — it re-groups every round, and new findings the user raises mid-run append to its queue. Two groups that both touch `agent/` both need the version bump — tell it `agent/package.json` is a shared file, so those groups merge.

## Phase 4 — Close out

When the queue empties, run `preflight` on every touched package one final time (via a sub-agent), then report: items fixed, items struck, items deferred, commits added, and anything the review flagged ⚠️ Unclear that a local stack could not confirm.

## Reference

- [PROMPTS.md](PROMPTS.md) — the code-review and UI-test briefs, verbatim. The fix brief lives in `fix-bugs`.
