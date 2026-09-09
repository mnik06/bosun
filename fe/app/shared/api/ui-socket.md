# The UI socket

## What it is for

The backend pushes state rather than the browser polling for it. This module holds **one** WebSocket
for the whole app and hands every frame to every subscriber; each subscriber validates what it
recognises with its own Zod schema and ignores the rest.

One socket rather than one per slice, because the credential is a single-use ticket bought over HTTPS:
a second socket means a second ticket, a second reconnect loop and a second backlog to reason about.
Keeping the fan-out dumb is what lets `entities/machine` and `entities/plan` both listen without
importing each other — which the slice rules forbid, and which a shared message union would force.

## Why every connection attempt buys a new ticket

The socket cannot carry an `Authorization` header, so the backend authenticates it with a single-use
ticket in the query string that expires within seconds (`be/src/services/tickets/ticket.service.md`).
"Single-use" is the invariant that shapes this file: a ticket cannot be cached, cannot be reused
across a reconnect, and cannot be fetched once at mount. `open()` therefore begins with
`fetchUiTicket()` on the first attempt and on every retry, and a failure to obtain one is treated
exactly like a failure to connect.

That is also why the providers that subscribe are mounted inside the authenticated layout rather than
at the root: `POST /ui/ticket` requires a bearer token, so subscribing above the session would produce
a permanent retry loop of 401s on the login screen.

## The connection invariants

- **`subscribers.size` is checked after the ticket await.** The last subscriber may unmount while the
  ticket is in flight; opening then would leave a socket nobody holds a handle to and nobody closes.
- **`connecting` guards re-entry.** Without it, a subscriber arriving while a ticket request is
  outstanding sees `socket === null` and starts a second connection.
- **`attempt` resets in `onopen`, not in `open()`.** Backoff must grow across a run of failures and
  collapse only when a connection actually succeeds. Resetting at the start of an attempt turns the
  backoff into a fixed one-second retry.
- **`onclose` and a rejected `open()` share one path.** A refused socket, a dropped socket and a
  failed ticket request are the same event as far as recovery goes; separate handlers are how one of
  them ends up silently not retrying.
- **The socket closes when the last subscriber leaves**, and reconnects are not scheduled while there
  are none.
- **The active project is captured before the ticket await and re-checked after it.** The ticket is
  bound to the project that was active when it was bought, and the backend keys the connection by
  that project. Opening with a ticket bought under the previous one would put its frames on the new
  project's screens.
- **A project switch closes the socket.** `subscribeToActiveProject` hangs up rather than filtering,
  for the same reason the backend keys the registry by project: a filter is a check, and a check gets
  forgotten. `onclose` then buys a fresh ticket under the new project.

## Plan subscriptions are re-sent on every open

Machine frames are addressed by project and arrive unasked. Plan frames are not: they carry a
transcript, so the backend sends them only to sockets that have named that plan with a
`plan.subscribe` command, and it keeps that list in the socket's own registry entry.

A reconnect therefore starts with a server that has no memory of what this tab was watching, which is
why `usePlanStream` subscribes from `onOpen` rather than once on mount. Sending it only at mount
produces a chat that works until the first network blip and is then silently dead.

## A dropped frame is the whole error path

Anything that fails to parse, or that no subscriber's schema matches, is discarded. A frame that does
not match means the server sent something this build does not understand; there is nothing the user
can do and nothing useful to render, so the cache keeps its last known-good value until the next valid
push or refetch.
