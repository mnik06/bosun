# Briefs

All three go to a `general-purpose` agent via the Agent tool. Fill every `<…>` before sending - an unfilled
placeholder is a decision the sub-agent will invent.

## Locator brief (Phase 1)

One agent for the WHOLE queue. Read-only. Its table is what the grouping is built on, so a missing file set
costs a serialized round.

```
Locate the code behind each bug below on branch `<branch>`. READ ONLY - no edits, no fixes, however obvious.

BUGS
[B-1] <the user's wording, verbatim>
[B-2] …

Project context: <repo layout in one line - e.g. "fe/ React+Vite, be/ Fastify+drizzle">.
Conventions live in <CLAUDE.md / agent-docs paths>; read only what you need to place the code.

For each bug: find where the behavior is produced, not merely where it is displayed. Name the file:line you
would have to EDIT to fix it - that is what the orchestrator groups on. If a bug plainly needs edits in more
than one place, list every place.

Also name, per bug, the shared modules those files import from that a fix would plausibly touch (a shared
hook, reducer, engine, repository, schema). Two bugs that meet in a shared module must be fixed by one agent,
and only you can see that.

If a bug is underspecified - the code offers more than one defensible behavior - say so in the UNCLEAR block
instead of picking one.

Return ONLY this, nothing else - no diffs, no file contents, no narration:

[B-1] <file:line, comma-separated if several> | shared: <modules, or none> | cause: <one line> | confidence: high|low
[B-2] …

UNCLEAR: <bug id → the question the user must answer>, or "none".
NOT FOUND: <bug id → what you searched and what would settle it>, or "none".

Keep the whole reply under 40 lines.
```

## Fix brief (Phase 3)

One agent per GROUP. A group may hold several bugs - they are in one group precisely because they share files.

```
Fix the bugs in this group on branch `<branch>`. Nothing else - a fix outside this group breaks the user's
per-group approval gate and its path-scoped commit.

GROUP <id> - <n> bug(s), fix them in the order given:

[B-<n>] <one-line title>
  Symptom: <what the user observed, concretely, in their words>
  Root cause (as located): <cause, or "unconfirmed - confirm before changing anything">
  Decided behavior: <exactly what it must do after the fix - the user ruled on this, do not redesign it>
  Where it lives: <file:line list from the locator>
[B-<m>] … <repeat per bug in the group>

Acceptance criteria these serve: <AC ids + verbatim text, or "none - the decided behavior above is the spec">
Out of scope: <adjacent defects that are their own [B-n]; leave them alone>
Running concurrently - DO NOT EDIT: <the other groups' file sets, or "nothing, you are the only agent
  running">. If a fix genuinely requires touching one of those files, STOP and report that instead of
  editing it - the orchestrator will re-run this group sequentially.

Steps:
1. Confirm each root cause in the code before editing. If the real cause differs from the one above, or the
   decided behavior turns out to be impossible or to contradict the code, STOP and report back - do not pick
   a behavior yourself. Product decisions are the user's.
2. Implement the fixes, honoring the conventions in <CLAUDE.md / agent-docs paths for the side you touch>.
3. Unit tests ship with each fix: cover the branch that was broken. Pure styling/copy/config needs none - say
   which it is. Never skip, comment out, or weaken a test to get green.
4. STOP THERE. Do not run typecheck, lint, or the test suite - other agents are editing this same tree right
   now and their half-written files would fail your run. A single verify pass runs after the whole batch
   lands. Do not open a browser. Do not commit or stage - the orchestrator commits your files by path.

Return <=12 lines:
- Per bug: what was actually wrong, one line, if it differed from the brief.
- Files changed - the COMPLETE list, one line each: path - what changed. The orchestrator commits exactly
  this list, so a file you forget to name stays uncommitted.
- Tests added: names, or why none.
- Anything the user should eyeball, or a decision you were forced to make.
```

## Verify brief (Phase 3, after the batch lands)

One agent, once per round, over the merged tree.

```
Run the verification suite on branch `<branch>` and report. Fix nothing unless step 3 applies.

Commands, in order - run every side that this round touched:
<the Phase 0 verify command(s), verbatim, including any toolchain preamble>

Touched in this round: <file list from every group's agent>

1. Run them. Do not edit source to make them pass.
2. If everything is clean, report "clean" and stop.
3. If a failure is a pure mechanical artifact of the round - an unused import left behind, a formatter nit,
   a stale type import - fix exactly that and re-run. Anything with behavior in it: do NOT fix it, report it.
4. For each real failure, name the file:line and which of the touched files it belongs to, so the
   orchestrator can route it back to the group that wrote it.

Return <=15 lines:
- <command> → pass | fail, with the verbatim failure text for each failure (trimmed to the essential lines).
- Mechanical fixes you made, if any: file - what.
- Failures → owning file, one line each.
```
