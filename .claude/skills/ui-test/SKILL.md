---
name: ui-test
description: Drive a feature in a real browser against its acceptance criteria and hunt for UI defects — clipping, overlap, dead space, misalignment, unreachable controls. Reports findings; never fixes them. Use when a slice or feature needs its UI verified, or when the user says "UI test this", "drive the UI", or a verify session needs its browser pass.
allowed-tools: Bash, Read, Grep, Glob, Skill, ToolSearch, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_fill_form, mcp__playwright__browser_select_option, mcp__playwright__browser_press_key, mcp__playwright__browser_hover, mcp__playwright__browser_file_upload, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_wait_for, mcp__playwright__browser_evaluate, mcp__playwright__browser_console_messages, mcp__playwright__browser_network_requests, mcp__playwright__browser_resize, mcp__playwright__browser_tabs
---

# UI Test

Drive the feature in a real browser, check every acceptance criterion, and find what is wrong with
the UI. **You report. You never fix.** No code edits, no commits — a separate agent works your
findings, and if you fix a defect while testing it has nothing to reproduce.

## Step 0 — load the browser tools FIRST

**Do this before anything else.** Playwright's tools are *deferred*: they are available but not
loaded, so they will not appear in your tool list until you ask for them by name. An agent that
skips this step concludes the browser is unreachable and reports the UI as unverifiable — which is
worse than useless, because it looks like a finding.

```
ToolSearch(query: "select:mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot,mcp__playwright__browser_click,mcp__playwright__browser_type,mcp__playwright__browser_fill_form,mcp__playwright__browser_select_option,mcp__playwright__browser_press_key,mcp__playwright__browser_take_screenshot,mcp__playwright__browser_wait_for,mcp__playwright__browser_console_messages,mcp__playwright__browser_network_requests,mcp__playwright__browser_resize")
```

If that returns no match, stop and say so plainly — do not substitute reading code.

## Step 1 — reach the app

- **Target URL** comes from whoever invoked you. Locally that is the fe dev server at
  `http://127.0.0.1:5373` talking to be at `http://127.0.0.1:1506` — keep `127.0.0.1`, not
  `localhost`. In a bosun session the stack comes up through `stack_up`, which answers with each
  app's URL; use the one it gave. Never invent a port, never fall back to the deployed app, never
  start your own dev server.
- **Credentials:** there is no sign-up — accounts exist because a project leader created them.
  `.bosun/project.yaml` names the test account: a **leader**, signing in at `<fe url>/login`, with
  its email and password in `$TEST_LEADER_EMAIL` and `$TEST_LEADER_PASSWORD`. Read them with
  `printenv` and never quote them. If they are not set, **stop and ask the user for credentials** —
  never invent them, never guess a path, never create an account. A criterion that needs a
  **developer** (not a leader) needs a second account: ask for it too, or mark those criteria
  could not test.
- Navigate, sign in, pick the project the criteria concern in the project switcher, and confirm the
  entry screen renders before testing anything.
- If the app does not respond, stop and report it as blocked. Never claim a criterion verified
  without opening it.

## Step 2 — drive every acceptance criterion, screen by screen

You are given the acceptance criteria. They are the specification — **assert the criterion, not the
application.** If the app does something reasonable that the criterion does not describe, the
criterion wins and that is a finding.

**Group them before you drive anything.** Sort every criterion by the screen and state it needs — the
machines list, a machine's detail page, the plans board, a plan's page on a given tab, a planning
chat mid-question, settings, the empty state. Then work one screen at a time: reach that state
**once**, and check every criterion that lives there before you navigate away. Re-reaching the same
state per criterion is the single biggest waste in a UI pass.

Within a screen, for each criterion:

1. `browser_snapshot` so you act on real elements.
2. Perform the actions the criterion describes.
3. Compare what happened to what the criterion demands.
4. Verdict: **holds** / **fails** / **could not test** (with the reason).

Watch `browser_console_messages` and `browser_network_requests` throughout. A console error or a
4xx/5xx call is a finding even when the screen looks correct — silent failures are how a broken
save endpoint survives for weeks behind a green UI. The app is live over a WebSocket: a state that
only appears after a reload, and not by push, is a finding too.

Some criteria sit behind things a browser cannot conjure: an enrolled, **online machine** running
the agent (planning sessions, builds, onboarding, verify), a real GitHub or Azure DevOps token or App
installation, a push notification. Drive up to that boundary, then mark the rest **could not test**
with what it needs. Never claim a terminal state you did not see.

An acceptance criterion you cannot observe in the browser is not a pass. Say which it is and what
would cover it instead.

**This is the only browser pass this feature gets.** Nothing runs after you to catch what you skip,
and nothing re-drives the feature once the fixes land — so finish the list.

## Step 3 — sweep for UI defects

Independent of the criteria, hunt for what nobody wrote down. Check at **1280×720**
(`browser_resize`) — one viewport, not a matrix:

- text clipped, truncated, or overflowing its container
- elements overlapping or colliding
- a list, table or board that does not fill the viewport — dead space below the last row, or a fixed
  height leaving the page short
- a horizontal scrollbar on the page itself
- table headers misaligned with their body cells; columns that drift between rows
- a primary control below the fold
- focus ring invisible or trapped
- a loading state that never resolves, or a flash of empty state before data
- layout shift after load
- inconsistent spacing, sizing, or wording against the rest of the app
- controls that look interactive but do nothing
- a control a developer can see but the backend refuses (leader-only actions must be hidden from a
  developer)

For anything visual, compare against the nearest existing screens and the primitives in
`fe/app/shared/ui/` — those are the current design, and they are in this branch. A screen that did
not exist before is judged against the plan's `### Screen layout`, if the plan has one.

## Step 4 — report

Severity-ordered. **Screenshot the findings only** — a criterion that holds needs no image, and
capturing one for every step is dead weight. Each finding carries both a screenshot and a written
repro: the screenshot is for the human, and the fix agent cannot use an image.

```
### <one-line defect title>
- **Severity:** critical | major | minor
- **Criterion:** AC-<n>, or "sweep" when nothing specified it
- **Repro:** exact steps from a signed-in entry screen
- **Expected:** what the criterion says, or what the rest of the app does
- **Actual:** what you observed — verbatim error text, console and network excerpts
- **Evidence:** <screenshot path>
```

Close with a table: each acceptance criterion → holds / fails / could not test, plus what you could
not reach and why. Never quietly drop a criterion.

## Hard rules

- Never edit code, never commit, never open a PR.
- Never report a criterion as holding if you did not observe it in the browser.
- One failure does not end the run — carry on through every remaining criterion.
- Being thorough beats being fast. A criterion "passes" only when every part of it was observed.
- One pass. You are not called twice, and there is no re-test after the fixes — everything you do not
  check here ships unchecked.
