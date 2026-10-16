# Onboarding runs

A run belongs to a repository and a machine. **Discovery** happens once per repository; **verify**
happens once per machine. A run keeps the phase it was started as and moves through statuses:

```
discover:  discovering ──► needs_input ──► verifying ──► ready
verify:                    needs_input ──► verifying ──► ready
config:    discovering ──────────────────────────────► ready
                 └────────────── failed ◄───────┘
```

A **config** run regenerates the repository's config and nothing else. The agent runs it as an
ordinary discovery (the frame says `discover`; an agent knows only two phases), but bosun settles it
at `ready` the moment the session ends with a published config: no inputs, no verify. It is left
out of `latestForMachine`, so the machine's onboarding, its inputs and the verify that
`maybeStartVerify` would start all stay with the run before it — regenerating a config that a
schema change wiped must not make an onboarded machine look new. It still holds the port range and
counts as the machine's one active run while it lasts. Its requirements and assumptions stay on its
own row: the latest *discovery* is what a second machine copies.

## Instructions compile into the config

Nobody writes the config. A leader writes **instructions** — free text, like a system prompt — and
saving them (`repositories/save-instructions.ts`) starts a config run on the first online machine
attached to the repository; the config is what that run compiles from them. The structured config
stays because verify, worktrees and the stack read it deterministically; it is internal.

- **The instructions travel with the run.** `onboarding.start` carries them, and the run row keeps the
  copy it was sent. On publish, bosun replaces whatever `Notes:` the model wrote with that copy,
  verbatim (`shared/config-notes.ts`), and records it as `repositories.config_compiled_from`. The
  run's copy, not the repository's: instructions edited mid-run leave the config marked out of date
  instead of passing an older compile off as current. An agent too old to read the field still
  publishes a config whose notes bosun overwrites, so every session reads the leader's words.
- **Out of date** is `instructions !== config_compiled_from` with instructions present. Saving with no
  machine online, a config run already in flight, or a machine that refuses the run still saves; the
  response says why nothing started, and the leader's Generate button is the retry. Nothing starts
  the run later on its own — a machine coming online does not.
- **A run rewrites the instructions.** `publish_config` carries the session's own version, written
  for a person; it becomes the notes, `config_compiled_from` and — only while the repository still
  holds the instructions the run started from — `repositories.instructions`. An edit made mid-run is
  newer than the rewrite, so it stays and the config reads as out of date against it. An older agent
  sends none, and the run's copy is used as before.
- With no instructions at all the model's own notes stand.

## Why it is shaped this way

- **Discovery reports; it never asks.** Nothing in it waits on a person: what it cannot find it
  reports as a requirement, what it has to guess it records as an assumption. The operator fills one
  form at the end instead of watching a session for half an hour.
- **Verify starts itself.** `maybeStartVerify` is called wherever an input can land — an env set, a
  session secret, the migration policy, a discovery finishing, the machine reconnecting — and starts
  verify the moment `missingRequirements` is empty. The form and the automatic start read the same
  function, so the browser cannot show "done" while verify waits, or the other way round.
- **Satisfied is decided from key names.** The env-set summaries and session-secret names bosun
  already holds, against the required keys. No value is ever needed to decide it, and none is held.
  The migration policy counts only once somebody chose it (`policy.confirmed`).
- **Verify is run by the agent, not judged by a session.** Only the sign-in uses a model. "Ready"
  means the steps ran through the same `stack_up` a bullet uses.
- **A second machine takes the latest discovery's requirements** — the latest discovery that actually
  published a config — and needs only its own inputs and a verify.

## Invariants

- **A run starts only once the clone has landed** (`repositoryCloning`). `machines.repository_id` is
  written when the attach is asked for, and the agent has no tree until the clone finishes; a run
  started in between fails on the machine at once with "this machine has no repository attached".
  `cloned_repository_id` is what the agent last reported holding — set by `repo.attached` and by
  every `hello` that names a repository — so a reply lost with its socket is repaired on reconnect.
- **Verify runs on bosun's default branch, and waits while a discovery onboarded another one**
  (`shared/base-branch.ts`). A discovery that finds the provider's default branch is a stub records
  `suggested_base_branch` and writes its config for that branch; until a leader makes it the
  repository's `default_branch_override`, `maybeStartVerify` does nothing and an explicit verify is
  refused, because the config would run on a tree it was not written for. `repositories.default_branch`
  stays the provider's and is refreshed on every attach; the repo layer returns
  `coalesce(override, default_branch)` as `defaultBranch`, so plans, worktrees, pull requests and
  onboarding all follow the override without knowing it exists. Changing it re-sends the attach to
  every clone (to re-point `origin/HEAD`) and names the branch on `onboarding.start`, so a verify
  started meanwhile does not race the re-point. An agent older than `MIN_BASE_BRANCH_AGENT_VERSION`
  ignores both and is refused onboarding while an override is set.
- **One active run per machine.** Onboarding owns the fixed port range 3900–3909, below every build's
  range, which is only collision-free because of this.
- **A run is admitted like a drive** (`onboardingAdmission`), against every slot and lane the
  machine's builds hold, and counts as one against everything the scheduler admits beside it
  (`../line/schedule.ts`).
- **Outcomes come from what the backend recorded.** A discovery that reports done without a config
  that validated fails with "ended without publishing a valid config".
- **Agent reports are accepted only for an active run on the calling machine** (`getActiveRunForMachine`),
  so a late write from a settled session cannot reopen it.
- **A stranded run is settled on `hello`.** The agent names the runs it holds; any other active run on
  that machine whose last activity predates the connection is failed, and a run the agent holds that
  bosun no longer considers active is cancelled. The last step's timestamp counts as activity, because
  a verify is dispatched long after its row was created.

## Progress

Each step may carry `progress`, 0 to 1 within the run's current phase. Verify's is exact: once the
config is resolved the agent counts every step it will report as finished, and each finished step moves
the count. Discovery's is an estimate: the agent's own milestones (checkout ready, config accepted) and
the session's `report_step` estimates, clamped so it never moves backwards and never reaches 1 before
the run settles. The browser maps the phase's progress onto one bar — discovery, waiting for inputs,
verify — so the number an operator sees only ever grows.

## Failure surfacing

Every step the agent reports lands in `steps` with its status and output tail, and every change is
announced as `onboarding.updated` so the browser refetches. A failed run carries `failure_reason`.
