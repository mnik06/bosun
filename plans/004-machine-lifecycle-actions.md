# Plan: Machine lifecycle — delete, refresh, pause

_Bosun plan #004 · depends on 003_

## Overview

Three controls on a machine, each meaning something different on the remote box.

- **Delete** — the machine is gone. The agent on the VPS shuts itself down, disables its service and
  discards its credentials. It does not come back.
- **Refresh** — re-run the preflight checks now, without waiting for a reconnect.
- **Pause** — the machine stays connected but bosun will not dispatch to it. Reversible from the
  browser.

Delete and pause differ in exactly one way that matters: **pause is reversible remotely, delete is
not.** A paused agent still holds its socket, so resuming is a frame on a live connection. A deleted
agent has exited, so bringing that machine back needs someone at a terminal on the VPS. That
asymmetry is inherent — bosun can only reach a machine through a socket the machine opened.

**Success in one sentence:** you delete a machine in the browser and the agent process on the VPS is
gone seconds later, with nothing left to reconnect.

## Acceptance criteria

**Delete**

- [ ] **AC-1** — Deleting an online machine terminates the agent process on the VPS within 10s.
- [ ] **AC-2** — After deletion the systemd unit is disabled, so the agent does not return on reboot.
- [ ] **AC-3** — After deletion `~/.bosun/config.json` no longer exists on the VPS.
- [ ] **AC-4** — The row is removed and the machine disappears from every open browser within 2s.
- [ ] **AC-5** — Deleting an **offline** machine succeeds; when that agent next reconnects it is rejected, exits, and disables its own service without operator action.
- [ ] **AC-6** — Deletion removes the socket from the registry; a later ping cannot reach a dead entry.
- [ ] **AC-7** — Deleting requires confirmation in the UI, and the dialog states that reconnecting the machine requires terminal access to that box.

**Refresh**

- [ ] **AC-8** — Refresh re-runs the nine checks on the VPS and the checklist updates without the socket reconnecting.
- [ ] **AC-9** — A check whose state changed on the box (a repo made dirty, a tool installed) reports its new value after a refresh.
- [ ] **AC-10** — Refresh on an offline machine returns a clear error and changes nothing.
- [ ] **AC-11** — The UI shows the refresh in flight and settles when the new checklist arrives.

**Pause**

- [ ] **AC-12** — Pausing sets the machine to `paused` in every open browser within 2s, and the agent stays connected.
- [ ] **AC-13** — Ping against a paused machine returns a clear "machine paused" error, distinct from "machine offline".
- [ ] **AC-14** — Resuming returns it to `online` and ping works again.
- [ ] **AC-15** — A paused machine whose agent reconnects comes back `paused`, not `online`.
- [ ] **AC-16** — The agent is told it is paused, and logs it, rather than inferring it from silence.

## Architecture

### How it works

Three new frames from the BE to the agent, and one new status.

```ts
// BE -> agent
{ type: "refresh" }
{ type: "pause" }
{ type: "resume" }
{ type: "shutdown", reason: string }
```

**Refresh** is the simple one: the agent re-runs `collectPreflight` and sends `preflight`, exactly as
it does on connect. No new agent state.

**Pause** is bosun-side state that the agent is told about. The `paused` status lives on the row and
survives reconnects, so a paused machine that restarts is still paused — the status is a property of
the machine, not of the socket. The agent is notified so that when there is work to dispatch it can
stop taking it locally, and so its log explains why it is idle.

**Delete** is the one with a remote effect. The BE sends `shutdown`, waits briefly for the agent to
act, then closes the socket and deletes the row. The agent, on `shutdown`: disables its own systemd
unit, removes `config.json`, and exits 0.

### Two paths to termination, because the agent may be offline

If the machine is deleted while its agent is disconnected, there is no socket to send `shutdown` on.
That agent will wake up later and try to reconnect with a key that no longer exists.

So the **401 on connect is itself a termination signal**. An agent that is refused authentication has
been revoked — retrying cannot fix it, and retrying forever is how a deleted machine turns into a
process that reconnects every 30 seconds until someone notices. On a `401` the agent disables its
service, removes its config and exits.

This is a deliberate change to plan 001's rule that every failure retries. A 401 is not a transient
failure; a refused connection with a valid-looking key means the credential was destroyed on purpose.
Network errors, 5xx and dropped sockets all still retry unchanged.

### The systemd unit has to change

`Restart=always` means systemd restarts the agent no matter why it exited — including a deliberate
shutdown. The unit becomes:

```ini
Restart=on-failure
```

A crash still restarts. A clean exit stays exited. `systemctl --user disable` on top of that stops it
returning after a reboot.

**This is why deletion cannot be fully reliable for already-installed agents.** Anything installed
before this change still has `Restart=always` and will be restarted by systemd after it exits — it
will then hit the 401 path, exit again, and loop at systemd's restart interval. Those machines need
`install.sh` re-run, or the unit edited by hand.

### Schema changes

```
machines
  status  -- gains 'paused': pending | online | offline | paused
```

No new column. `paused` is a status because a machine is in exactly one of these states, and a
separate boolean would allow `offline + paused` combinations whose meaning nobody has defined.

### API contract

```ts
DELETE /machines/:id            -> 204 | 404
POST   /machines/:id/refresh    -> 202 | 409 { error: "machine offline" } | 404
POST   /machines/:id/pause      -> 200 { machine } | 404
POST   /machines/:id/resume     -> 200 { machine } | 404
POST   /machines/:id/ping       -> 202 | 409 "machine offline" | 409 "machine paused" | 404
```

### Screen layout

- `Machine detail` — a menu beside Ping with Refresh, Pause/Resume, and Delete
- `Delete confirmation` — a modal naming the machine, stating that the agent will be shut down and
  that reconnecting it later needs terminal access to that box
- `Paused machine` — an amber dot and a banner offering Resume

## Key decisions

- **Delete terminates the agent; pause does not.** Delete is destructive and complete — no orphan
  process left polling a backend that no longer knows it. Pause is a reversible bosun-side state,
  which is only possible because the socket stays up.
- **A 401 on connect terminates the agent.** The only way a deleted-while-offline machine can stop
  itself. It narrows plan 001's unconditional retry loop, deliberately.
- **`Restart=on-failure`, not `always`.** Without it the agent cannot exit on purpose, and delete
  becomes a restart loop.
- **`paused` is a status, not a flag.** Prevents undefined combinations like offline-and-paused.
- **Pause is announced to the agent** rather than enforced only at the BE, so the agent's own logs
  explain why it is doing nothing.
- **No remote start.** Bosun reaches a machine only through a socket that machine opened. A stopped
  agent is unreachable by construction, which is the same property that means bosun holds no
  credentials to anyone's infrastructure.

## Non-goals

- Removing the agent binary from the VPS — delete stops and de-credentials it; the file stays
- Starting or rebooting a machine remotely, which the architecture forbids
- Bulk actions across machines
- An audit log of who did what
- Re-enrolling a deleted machine from the browser

## Blockers & dependencies

- **Blocked by:** plan 003 — every action must be scoped to an owner before it can be exposed.
- A VPS to verify AC-1 through AC-5 on. Deletion's remote effect cannot be tested against a local
  agent, because the systemd behaviour is the thing under test.
- Agents installed before this plan keep `Restart=always` until `install.sh` is re-run on them.

## Slices

- [ ] **Phase 1: Refresh and pause** — AC-8 … AC-16
- [ ] **Phase 2: Delete** — AC-1 … AC-7

### Phase 1 — Refresh and pause

No destructive behaviour, so it lands first and the round-trip machinery gets exercised by something
harmless.

- `be/src/types/protocol.ts` and `agent/src/protocol.ts` — `refresh`, `pause`, `resume`
- `be/` — routes and controllers; `paused` in the status enum and the ping guard
- `agent/` — handlers: re-run preflight on `refresh`, log and hold state on `pause`/`resume`
- `agent/` — re-send its paused state on reconnect so the BE and agent agree
- `fe/` — the action menu, the paused visual state, in-flight refresh

Proof: break a check on the box, hit Refresh, watch it turn red without a reconnect; pause, confirm
ping is refused with a paused error, resume, confirm it works.

### Phase 2 — Delete

- `be/` — `DELETE /machines/:id`: send `shutdown`, terminate the socket, delete the row, announce
- `be/` — reject a revoked agent's reconnect with `401` (already the behaviour; now load-bearing)
- `agent/` — on `shutdown` and on `401`: `systemctl --user disable --now`, remove config, exit 0
- `be/assets/install.sh` — `Restart=on-failure`
- `agent/src/run.md` — the two termination paths and why 401 is not retried
- `fe/` — confirmation modal, removal from the list

Proof: delete an online machine and watch the VPS process disappear and stay gone across a reboot;
delete an offline one, start its agent, watch it exit on its own.

## Risks

- **Agents installed before this plan cannot be cleanly deleted.** `Restart=always` fights the exit.
  They restart-loop against a 401 until reinstalled. Worth a one-line note in the UI until enough
  time has passed.
- **A half-completed delete leaves a running agent with no row.** If the BE dies between sending
  `shutdown` and deleting, the agent stops but the row remains; if it dies after deleting but the
  frame never arrived, the agent loops until the 401 path catches it. The 401 path is what makes the
  second case self-correcting, which is why it is required rather than a nicety.
- **`shutdown` is fire-and-forget.** The BE does not wait for confirmation, because a machine that
  has already vanished from the network would block the request. AC-1's 10s is a property of a
  healthy connection, not a guarantee.
- **Pause is only as strong as the checks that honour it.** Today the only dispatch is ping. Every
  future command has to consult the same guard, or pause quietly stops meaning anything.

## Decisions taken

_(populated during the build)_
