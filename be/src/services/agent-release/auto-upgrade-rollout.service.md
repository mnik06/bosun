# Unattended agent upgrades

A machine with `auto_upgrade` on is offered a new agent build without anybody pressing Refresh.
`startAutoUpgradeSweep` (`src/controllers/machines/auto-upgrade-sweep.ts`) runs every 10 minutes, and
this service decides which offers it is allowed to make. The agent side needs nothing new: it already
defers while sessions run, verifies the download, and rolls back a build that never connects
(`agent/src/services/upgrade.service.ts`).

## Why it is gated this hard

The `hello` handler deliberately offers upgrades on `refresh` only, because offering on connect turns
one bad release into a fleet-wide outage nobody chose. The sweep reopens that risk, so it has four
guards:

- **Opt-in per machine.** Default off. A leader turns it on in the machine's "Agent updates" card.
- **Soak.** A version is offered unattended only after it has been the current release for
  `SOAK_MS` (1h), counted from the first sweep that found a machine due for it. Refresh stays immediate, so the machines
  people upgrade by hand are the canary. A pinned `AGENT_EXPECTED_VERSION` skips the soak, because it
  is the rollback lever and a rollback that waited an hour would leave the fleet on the bad build.
- **Trickle.** At most `MAX_OFFERS_PER_SWEEP` offers per sweep. A broken build takes minutes to show as
  broken (probation deadline, rollback, reconnect), and the cap keeps the halt ahead of most machines.
- **Halt.** A version that failed on `HALT_AFTER_FAILURES` distinct machines is no longer offered
  unattended. A failure is an `upgrade.declined` that is retryable and not queued: either the install
  failed or the machine already rolled that build back. Non-retryable refusals (not a packaged binary,
  already on that version) are about the machine, not the release, so they do not count.

## Per-machine bookkeeping

- **Offered** (machine → version): one offer per connection. A deferred offer is held by the agent
  *process*, so repeating it would only produce the same "queued" banner every sweep. A `connect` hello
  clears it, because a new process has forgotten what it was holding. Refresh offers are recorded here
  too, so the sweep does not repeat them.
- **Refused** (machine + version): any decline that is not a deferral. Asking again unforced cannot
  change the answer, and repeating it would put a decline banner in the UI every 10 minutes.

How a rollback gets detected: the machine rolls back, reconnects with `connect` (which clears
*offered*), the next sweep offers the version again, and the agent declines it as blocked. That
decline is what counts as the failure.

## Failure modes

- **Everything is in memory.** A backend restart forgets the soak clock (this only delays offers) and
  the halt. The machines that already failed block the version locally, so a restart costs at most
  `HALT_AFTER_FAILURES` more machines a rollback before the version is halted again. Persisting this
  was rejected: the socket registry is in memory too, and the deploy is `--ha=false`.
- **A halt is logged once at `error`**: `agent build failed on too many machines; no longer offering it
  unattended`. Nothing clears it except a restart or a new release. Refresh (with "Install anyway")
  still works for a person who knows the build is fine.
- Offers are never forced. Forcing unblocks a version the machine rolled back, and only an operator
  should make that call.
