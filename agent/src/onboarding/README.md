# Onboarding runs on the agent

`onboarding.start` carries a run id and a phase. A **discovery** is a Claude session that reads the
repository and publishes `.bosun/project.yaml`; a **verify** is the agent running that config. The
backend owns the run's state (`be/src/controllers/onboarding/`); this module only does the work and
answers with exactly one `onboarding.done` or `onboarding.error`. Progress never travels as a frame —
every line goes through `POST /agent/onboarding/:runId/steps`, so it is persisted and survives a reload.

## Why discovery reports rather than asks

Nothing in discovery depends on an answer mid-way, and a session that can ask will: on an unattended
run that is a session blocked for good. So it has no `bosun_ask`. What it cannot find it lists with
`report_requirement`; what it has to guess it records with `record_assumption`, citing the file. The
operator fills one form at the end, and verify catches whatever was guessed wrong enough not to run.

A discovery succeeds only when a `publish_config` was **accepted** by the backend. Ending the turn
without one earns one nudge, then the run fails — a run in `needs_input` with no config would ask the
operator for inputs to a config that does not exist.

When the default branch already carries the file, discovery starts from it and publishes the config
as it should be, recording each change as an assumption (AC-38). The published config becomes the
repository's draft; the pull request is what proposes it.

## Why verify is run by the agent

"Ready" has to mean the config ran, not that a session believed it would. Verify resolves the config
(the scratch tree's file, else the draft — never a broken file's fallback), writes the provided env
files, provisions the toolchain, runs every setup step, each app's `codegen`, each app's `migrate`
only when the machine's policy allows, starts the stack through the same `stack.service` a bullet
uses, and only then spends one short Claude turn signing in as each test account. That turn is the
only part that needs a model, so it is the only part that has one. The stack is always stopped.

## Invariants

- **One scratch worktree per run, detached, at `~/.bosun/onboarding/<runId>`.** Cut from the default
  branch after a fetch. The machine's clone gains only worktree metadata; every file a run writes is
  in the scratch tree, and the tree is removed when the run settles or is cancelled.
- **Discovery never pushes.** Its session environment carries `NO_PUSH_GIT_ENV`, which clears every git
  credential helper — the clone's own included — so a push has nothing to authenticate with.
- **A run is in the map before its first await**, so a `hello` sent while the scratch tree is still
  being made names it in `onboardingRunIds`.
- **The run leaves the map before its settling frame is sent.** A discovery's `done` is answered with a
  verify for the same run id; still held, that verify would be dropped as a duplicate.
- **Secret values reach a session's environment and nothing else.** Failure details are step names,
  command output tails and stack log tails — never the environment.

## How a stranded run is settled

Runs survive a dropped socket like bullets do. `hello.onboardingRunIds` names the runs still held; the
backend fails every active run on the machine that is not named and was not touched since the socket
opened, and sends `onboarding.cancel` for any named run it no longer considers active. An agent that
restarts holds nothing, so its runs fail with "the agent restarted" rather than hanging in `verifying`.

## Failure modes

- **No repository attached** — fails before anything runs, with the attach instruction.
- **Scratch checkout cannot be made** — the `git worktree add` error, verbatim.
- **Discovery never publishes a valid config** — fails after one nudge.
- **A verify step fails** — the run fails with that step's label and the tail of its output (≤1500
  characters); the report shows the same step marked failed.
- **A report cannot be posted** — logged on the machine; the run carries on, since the outcome frame is
  what settles it.
