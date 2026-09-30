---
name: do-work
description: "Execute a unit of work end-to-end: implement it with its unit tests, then validate with preflight (typecheck + lint + unit tests + duplication; agent adds build). Does not touch the browser — UI verification belongs to the ui-test skill. Use when user wants to do work, build a feature, fix a bug, or implement a phase from a plan."
---

# Do Work

Execute a complete unit of work: build it, unit-test it, validate it.

**Do not open a browser.** UI verification belongs to the `ui-test` skill, run by a separate agent
with a fresh context that has not seen this implementation — the check is only worth anything if its
author did not write the code. Finish here and hand off.

## Workflow

### 1. Understand the task

Read any referenced plan or sub-issue. Explore the codebase to understand the relevant files, patterns, and conventions — `be/CLAUDE.md` and `fe/CLAUDE.md` for the package you touch, and any `<module>.md` / `README.md` beside the modules you change. If the task is ambiguous, ask the user to clarify scope before proceeding.

Building UI? Open the nearest existing screens and the primitives in `fe/app/shared/ui/` — that is the shipped design, and you consume it rather than rebuild it. Tokens come from `fe/app/theme.ts` (`theme.css` is generated from it). For a surface that does not exist yet, the plan's `### Screen layout` is its intended layout.

### 2. Implement

Implement the task End-to-End

**Touching `agent/`?** Bump the patch `version` in `agent/package.json` in the same change — machines are only offered an agent change through a new version. A wire frame changed on one side of a mirrored pair (`be/src/types/*-frames.ts` / `protocol.ts` ↔ their `agent/src/` twins) changes on the other side too.

### 3. Unit tests — only where they earn it

**No test is the default.** Coverage is not a goal, and "this file has no test" is not a defect. Before writing any test, answer three questions about the code under test:

1. **Can it break on its own?** Could it fail for a reason other than someone deliberately editing the declaration it mirrors — a branch, a boundary, ordering, parsing, math, a derived value, a mapper, a state transition, an async or error path, an invariant spanning two files?
2. **Is it fragile?** Many branches or edge cases, several callers depending on it, or rules a future reader would not infer from the code?
3. **Is a silent break critical?** Wrong data rendered or written, a credential or token path, a connection/lifecycle path (socket reconnect, session teardown, machine enrollment), permissions or project scoping, a migration, data loss?

Write the test **only when (1) is yes AND (2) or (3) is yes.** Otherwise write none.

- **Passes the gate:** schedulers, state machines, reducers, resolvers, classifiers, parsers, comparison and diff logic, validation rules, retry/backoff and claim logic, frame routing, anything that decides what gets written to the database or sent to a machine.
- **Fails the gate — never test:** design tokens and theme files, Zod schema shapes, repos and query builders, constant and config tables, barrels, exact copy, thin wrappers, pass-through controllers, components that only render props.
- Tests ship **with** the code, in the same commit — never "later", never a follow-up.
- Name the behaviors you intend to cover before writing them, in one short list. If nothing in the change passes the gate, say so in the summary and write nothing — that is a valid outcome, not a gap.
- Cover behavior, not implementation: the branches, boundaries, and error paths of the logic you touched. A test that only restates the code it calls is not coverage.
- Meeting an existing test that fails the gate, in code you are already touching: **delete it** rather than update it.

### 4. Document what the code cannot say

A module a reader cannot follow from the code alone gets a `<module>.md` beside it, or a `README.md`
for a folder that only makes sense as a whole. State machines, schedulers, reconnect/liveness
protocols, multi-step async flows, non-obvious invariants.

Write **why it is shaped this way, the invariants that must hold, what breaks if you change them, how
its failure modes surface, and what was tried and rejected.** Never restate the API — the signatures
are the API, and a paraphrase of them rots on the first refactor while still looking authoritative.

Touching a module that already has one? Update it in the same commit. A stale engineering doc is
worse than none, because it gets believed.

Most work needs no doc. Say which it is rather than writing one out of duty.

### 5. Validate

Run the feedback loop and fix any issue until it passes cleanly, in every package you touched. `preflight` runs typecheck, lint, the unit tests — including the ones you just wrote — and the jscpd duplication check.

For be/:
```
pnpm preflight
```

For fe/:
```
pnpm preflight
```

For agent/ (same gates, plus `build`; bump the patch `version` in `agent/package.json`):
```
pnpm preflight
```

A failing test is a failing loop. Never comment out, `skip`, or weaken a test to get a green run — fix the code, or fix the test if the test was wrong, and say which.

## When you're done

Report what you built, the files you touched, and anything the task left undecided that you had to
choose. Name what needs driving in the UI; leave the driving to `ui-test`.
