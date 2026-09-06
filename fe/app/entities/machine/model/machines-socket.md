# The machines socket

## What it is for

The backend pushes machine state changes rather than the browser polling for them. This provider
holds one WebSocket for the whole app, validates every frame with `UiMsgSchema`, and writes the
result straight into the React Query cache — so `useMachinesQuery` and `useMachineQuery` re-render
from a push without a refetch. Ping round-trip times are not query data (they are transient
measurements, not server state), so they live in this provider's own context instead.

## Why every connection attempt buys a new ticket

The socket cannot carry an `Authorization` header, so the backend authenticates it with a single-use
ticket in the query string that expires within seconds (`be/src/services/tickets/ticket.service.md`).
"Single-use" is the invariant that shapes this file: a ticket cannot be cached, cannot be reused
across a reconnect, and cannot be fetched once at mount. `open()` therefore begins with
`fetchUiTicket()` on the first attempt and on every retry, and a failure to obtain one is treated
exactly like a failure to connect — it schedules a retry.

That is also why the provider is mounted inside the authenticated layout rather than at the root:
`POST /ui/ticket` requires a bearer token, so mounting it above the session would produce a permanent
retry loop of 401s on the login screen.

## The reconnect invariants

- **`disposed` is checked after every await and before every timer.** React runs effects twice in
  development and unmounts on navigation; without the flag, a ticket fetch that resolves after
  teardown opens a socket nobody will ever close.
- **`attempt` resets in `onopen`, not in `open()`.** Backoff must grow across a run of failures and
  collapse only when a connection actually succeeds. Resetting it at the start of an attempt would
  turn the backoff into a fixed one-second retry.
- **`onclose` and a rejected `open()` share one path.** A refused socket, a dropped socket and a
  failed ticket request are the same event as far as recovery goes, and giving them separate
  handlers is how one of them ends up silently not retrying.

## A dropped frame is the whole error path

`onmessage` parses and validates, and discards anything that fails. A frame that does not match the
schema means the server sent something this build does not understand; there is nothing the user can
do about it and nothing useful to render, so it is dropped rather than surfaced. The cache simply
keeps its last known-good value until the next valid push or refetch.
