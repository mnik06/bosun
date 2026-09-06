# WebSocket tickets

## Why the browser socket is not authenticated with the bearer token

A browser cannot set headers on a WebSocket handshake. The two remaining options are a cookie or the
query string, and the query string is where the token would land in every reverse proxy's access log,
in browser history and in any error reporter that captures URLs — a long-lived credential leaking
into places nobody audits.

So the query string carries something that is worth almost nothing if it leaks: a ticket that is
valid for seconds and dies the first time it is read. Obtaining one requires the bearer token over
HTTPS (`POST /ui/ticket`), so the real credential never leaves the header.

## The invariants

- **Single use.** `consumeTicket` deletes before it validates. A ticket that has been presented once
  is gone whether or not the presentation succeeded, so a logged URL cannot be replayed.
- **Short life.** `TICKET_TTL_MS` is a handshake budget, not a session length. It only has to cover
  the gap between the POST returning and the socket dialling.
- **Swept, not accumulated.** `issueTicket` drops expired entries first. Without that the map is an
  unbounded leak, because the common path — a ticket that is consumed — is not the only path: a
  ticket issued for a socket the browser never opens is never read again.

## What breaks if you change it

The store is process-local. That is correct exactly as long as the browser's `POST /ui/ticket` and
its subsequent `GET /ui/ws` reach the same process, which today they do because the service runs as a
single instance. **Scaling the backend past one instance breaks this silently** — sockets will be
refused at whatever rate the load balancer spreads the two requests apart, and it will look like an
intermittent network fault rather than a design limit. The fix at that point is a shared store keyed
by ticket, not a longer TTL.

Nothing here is persisted, so a deploy invalidates every outstanding ticket. That is harmless: the
client's reconnect path buys a fresh ticket for every attempt.
