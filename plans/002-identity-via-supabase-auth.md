# Plan: Identity via Supabase Auth

_Bosun plan #002 · depends on 001_

## Overview

Email-and-password signup and login, with **Supabase Auth as the identity provider**. Bosun never
sees a password, never issues a token and never stores a session. The browser talks to Supabase for
authentication and to the BE for everything else, presenting the Supabase access token as a bearer
credential the BE hands back to Supabase to resolve into a user.

Our database keeps a `users` row per person, joined to Supabase's `auth.users` by `sub_id`. That row
is what the rest of the product references — plan 003 hangs machines off it.

**Success in one sentence:** you sign up with an email and password, land on the machines page, and
every request the browser makes carries a token the backend resolves to a user before it will answer.

## Acceptance criteria

**Signing in**

- [ ] **AC-1** — `/signup` creates an account with email and password and lands on the machines page already authenticated.
- [ ] **AC-2** — `/login` authenticates an existing account and lands on the machines page.
- [ ] **AC-3** — Signing up with an email that already exists shows a clear error and creates nothing.
- [ ] **AC-4** — Logout clears the session; reloading the page leaves you signed out.
- [ ] **AC-5** — Visiting a protected page while signed out redirects to `/login`; visiting `/login` while signed in redirects to the machines page.

**The backend's view**

- [ ] **AC-6** — A request with no `Authorization` header to any `/machines` route returns `401`.
- [ ] **AC-7** — A token with a valid shape but a bad signature returns `401`.
- [ ] **AC-8** — An expired token returns `401`; the browser refreshes it through `supabase-js` and the retried request succeeds without the user noticing.
- [ ] **AC-9** — A token belonging to a user deleted in Supabase is rejected immediately, without waiting for the token to expire.
- [ ] **AC-10** — When Supabase Auth is unreachable, protected routes fail with `503` and a clear message rather than admitting the request or hanging indefinitely.

**Our user row**

- [ ] **AC-11** — The first authenticated request from a new Supabase account creates one `users` row with its `sub_id`, and concurrent first requests still produce exactly one row.
- [ ] **AC-12** — `GET /me` returns the caller's `users` row.
- [ ] **AC-13** — Deleting the account in Supabase removes the `users` row by cascade.

**Transport**

- [ ] **AC-14** — CORS is an explicit origin allowlist; a request from an unlisted origin is refused.
- [ ] **AC-15** — `/ui/ws` is authenticated by a single-use, short-lived ticket obtained over HTTPS, and a connection without one is rejected.

## Architecture

### How it works

`supabase-js` runs in the browser and owns the whole session lifecycle: sign-up, sign-in, storage,
and silent refresh before expiry. The BE has no login endpoint, no password column and no session
table, because it is not the identity provider.

On every request the browser attaches the current access token as `Authorization: Bearer <jwt>`. The
BE resolves it with `supabase.auth.getUser(jwt)`, which asks Supabase Auth who the token belongs to.

This is deliberately **not** local signature verification. Checking a signature proves only that the
token was issued and has not expired — a user deleted or banned five minutes ago still presents a
perfectly valid token until it lapses. Asking Supabase is authoritative about the account as it
exists right now, and it works regardless of whether the project signs with a shared secret or
asymmetric keys.

The price is a network round-trip on every authenticated request, which makes Supabase Auth's
availability part of ours. A short-lived cache keyed by the token would remove most of those calls
at the cost of delaying revocation by its TTL; it is not in this plan, and the tradeoff should be
made against a real latency measurement rather than in advance.

The verified `sub` claim is the Supabase user id. `users` is provisioned **just in time**: the first
authenticated request from an unknown `sub` inserts the row. The alternative — a trigger on
`auth.users` — is the documented Supabase pattern but couples signup to our schema, and a failing
trigger blocks account creation entirely.

WebSockets cannot carry an `Authorization` header from a browser. Rather than putting a long-lived
token in a query string where it lands in every proxy log, the browser posts to `/ui/ticket` with its
bearer token and receives a single-use ticket valid for a few seconds, which it presents as
`/ui/ws?ticket=…`.

### Screen layout

- `Signup` — email · password · submit · link to login
- `Login` — email · password · submit · link to signup
- `App shell` — the existing machines pages, plus the signed-in email and a logout control

### Schema changes

One table. `sub_id` references the Supabase primary key, which is the only column Supabase guarantees
will not change.

```
users
  id          text primary key            -- "u_" + nanoid
  sub_id      uuid not null unique        -- references auth.users(id) on delete cascade
  email       text not null
  created_at  timestamptz not null default now()
```

The foreign key crosses into the `auth` schema, which `drizzle-kit` does not manage. The column is
declared in the Drizzle schema; the constraint is added in the generated migration by hand-editing
**that migration only** — the schema file remains the source of truth for everything else.

### API contract

```ts
GET  /me                    Authorization: Bearer <jwt>   -> { id, email, createdAt }
POST /ui/ticket             Authorization: Bearer <jwt>   -> { ticket, expiresAt }
GET  /ui/ws?ticket=<t>                                    -> 101 | 401

// every existing /machines route now requires the bearer token
```

`/enroll`, `/agent/ws`, `/install.sh` and `/health` stay unauthenticated — they are the agent's and
the installer's surface, and they authenticate with the machine key or nothing at all.

### New libs

- `@supabase/supabase-js` (BE) — `auth.getUser` only, built with the **anon** key; the BE still
  reaches Postgres through Drizzle and never uses supabase-js for data
- `@supabase/supabase-js` (FE) — auth only

## Key decisions

- **Supabase Auth is the identity provider.** Bosun stores no password hash and mints no session, so
  the entire credential-handling surface — reset flows, rate limiting, breach response — is not ours.
  This amends plan 001's "supabase-js is not used at all": it is now used in the browser, for auth,
  and nowhere else.
- **`auth.getUser(jwt)`, not local signature verification.** Authoritative about the account's
  current state, so a deleted or banned user loses access immediately instead of at token expiry. It
  also removes any dependency on which signing algorithm the project uses. The cost — a round-trip
  per request, and Supabase Auth being in our availability path — is accepted knowingly, and is the
  reason AC-10 pins down what happens when that call fails.
- **The BE builds its Supabase client with the anon key.** `getUser` needs nothing more. A service
  role key would grant the backend blanket authority over the auth schema for no benefit.
- **Just-in-time provisioning of `users`, not a database trigger.** A trigger that fails blocks
  signup; a JIT insert that fails fails one request.
- **Bearer token, not a cookie.** `supabase-js` already manages and refreshes the token, and a bearer
  header has no CSRF surface and no cross-origin `SameSite` negotiation between the Fly backend and
  the browser app.
- **A short-lived ticket for `/ui/ws`.** Query strings are logged by proxies; a token that is
  single-use and expires in seconds is worth little if it leaks.
- **No RLS.** The BE is the only client of this database and connects as a privileged role, so RLS
  would add policy surface without adding enforcement. It becomes relevant only if something else
  ever connects.

## Non-goals

- OAuth providers, magic links, MFA
- Enforcing email verification before use
- A bosun-hosted password reset UI — Supabase's own flow covers it
- Teams, orgs, roles, sharing a machine between accounts
- Row Level Security policies
- Rate limiting and account lockout beyond what Supabase applies

## Blockers & dependencies

- **Blocked by:** plan 001.
- Supabase Auth enabled on the existing project, with email/password sign-in on.
- The project URL and anon key, as `SUPABASE_URL` / `SUPABASE_ANON_KEY` on the BE and
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` on the FE. Both are public values and the anon key
  is safe in the frontend bundle.

## Slices

- [ ] **Phase 1: Sign in and out** — AC-1 … AC-5
- [ ] **Phase 2: The backend trusts the token** — AC-6 … AC-13
- [ ] **Phase 3: Lock the transport** — AC-14, AC-15

### Phase 1 — Sign in and out

Browser-only. The BE is untouched and still trusts everyone.

- `fe/` — `shared/api/supabase.ts` client; `features/auth/` with signup, login and logout mutations
- `fe/` — `/signup` and `/login` views, Mantine form + zod
- `fe/` — session context, redirect rules both ways, signed-in email and logout in the shell
- `fe/` — axios request interceptor attaching the access token

Proof: sign up, reload, still signed in; log out, reload, redirected to `/login`.

### Phase 2 — The backend trusts the token

- `be/` — `services/auth/supabase-auth.service.ts`: the anon-key client, `getUser`, and mapping its
  failure modes onto `401` versus `503`
- `be/` — `users` schema, repo, JIT provisioning controller
- `be/` — an auth hook that verifies the token, provisions the user and decorates `request.user`
- `be/` — the hook applied to `/machines` and `/me`; `/enroll`, `/agent/ws`, `/install.sh`,
  `/health` explicitly excluded
- `be/src/services/auth/supabase-auth.service.md` — why resolution is remote, and what happens when
  Supabase is down

Proof: a request with no token gets 401; with a tampered token, 401; with a valid one, `/me` returns
a row that exists exactly once after ten concurrent first requests.

### Phase 3 — Lock the transport

- `be/` — CORS origin allowlist from env; `POST /ui/ticket`; `/ui/ws` requiring a valid ticket
- `fe/` — fetch a ticket before opening the socket, and on every reconnect

Proof: the browser still updates live; a socket opened without a ticket is refused; a request from an
unlisted origin is blocked.

## Risks

- **The `auth.users` foreign key couples our migrations to Supabase's schema.** It is the documented
  pattern and buys cascade deletes, but it means our database cannot be restored independently of
  theirs. Referencing only the primary key is what keeps this tolerable.
- **Supabase Auth is now in the request path.** An outage there takes every authenticated route with
  it, and its latency is added to each one. This is the accepted cost of authoritative resolution;
  the mitigation, if it ever bites, is a short-TTL token cache that trades revocation speed for
  independence.
- **`getUser` failures must not fail open.** A network error resolving a token has to become a `503`,
  never a pass. This is the single most dangerous line of code in the plan.
- **Existing machine rows have no owner.** They are unreachable once plan 003 lands and must be dealt
  with in that migration, not this one.

## Decisions taken

_(populated during the build)_
