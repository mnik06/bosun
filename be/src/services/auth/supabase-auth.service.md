# Resolving a bearer token

## Why the token is resolved remotely

`resolveToken` asks Supabase Auth who a token belongs to (`GET /auth/v1/user`) instead of verifying
its signature locally. A signature only proves the token was minted and has not lapsed. An account
deleted or banned two minutes ago still carries a perfectly valid signature until its access token
expires, and every request in that window would be admitted. Asking the issuer is authoritative about
the account **as it exists right now**, and it is indifferent to whether the project signs with a
shared secret or an asymmetric key pair.

The price is one network round-trip per authenticated request, which puts Supabase Auth's uptime and
latency inside ours. That is a knowing trade, and the reason the failure taxonomy below exists.

## The failure taxonomy — the invariant that matters

`ResolvedToken` has three arms, and which arm a failure lands in is the single most consequential
decision in this file:

- `rejected` — Supabase answered, and its answer was "no". Becomes `401`.
- `unavailable` — we never got an answer. Becomes `503`.
- `ok` — Supabase answered with a user that has an email.

**A failure must never become `ok`.** The classification is therefore an allowlist, not a denylist:
only the HTTP statuses in `REJECTED_STATUSES` — the ones on which Supabase has actually adjudicated
the token — produce `rejected`. Anything else at all (a `5xx`, a `429`, a DNS failure, an aborted
socket, a thrown exception from inside `supabase-js`) falls through to `unavailable`. Inverting that
— treating "not obviously an outage" as a rejection — would mislabel our own incidents as the
caller's bad credentials, and the shape of the code is what stops a future edit from doing so.

The `try/catch` around the whole call is part of the same invariant. `supabase-js` returns network
errors as `AuthRetryableFetchError` values rather than throwing, but "rather than throwing" is a
library implementation detail, not a contract. An escaping throw would otherwise reach the error
handler as an unclassified `500`, which is at least still closed — but it would lose the distinction
the `503` exists to communicate.

## Why there is a fetch timeout

Neither `supabase-js` nor Node's `fetch` imposes a deadline. Without `AbortSignal.timeout`, a Supabase
Auth instance that accepts the connection and then stalls holds the request open indefinitely, and
under load every Fastify connection ends up parked on the same stall. The timeout converts that into
an `unavailable`, which is a fast, honest `503`.

`AUTH_TIMEOUT_MS` is deliberately short. It is a liveness bound, not a patience budget: if resolution
has not come back in that window, the round-trip has already cost more than the request is worth.

## What is not here

- **No caching.** A short-TTL cache keyed by the token would remove most of these round-trips, at the
  cost of delaying revocation by exactly that TTL — which is the property the whole design was chosen
  to buy. Add it only against a measured latency problem, and state the revocation delay when you do.
- **No secret key.** `getUser` needs nothing beyond the publishable key (the `anon` key, in Supabase's
  older naming). The secret key — `service_role`, previously — would hand the backend blanket
  authority over the auth schema in exchange for nothing, so `EnvSchema` refuses to boot on one. That
  guard only catches the `sb_secret_` format: legacy `anon` and `service_role` keys are both JWTs and
  cannot be told apart by shape, so a legacy pair still has to be got right by hand.
- **No `users` row.** Provisioning is the caller's job (`controllers/auth/resolve-request-user.ts`);
  this service stays a wrapper over the identity provider and knows nothing about our schema.
