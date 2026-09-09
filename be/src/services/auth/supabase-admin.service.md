# The admin Supabase client

## Why it is a separate module

`supabase-auth.service.ts` answers one question — *who does this token belong to?* — and the
publishable key is enough for it. `EnvSchema` refuses a secret key in that slot on purpose.

Creating a member's account is not that. It needs `auth.admin.createUser`, which needs the **secret
key**, and that key can mint, modify and delete any account in the Supabase project. Putting it on
the client every request already reaches would mean a stolen backend process could rewrite the auth
schema, when all it ever needed was `getUser`.

So the privilege is contained by construction rather than by discipline:

- Two modules, two clients, two keys. The token-resolution path never holds the secret key
- This module exposes `createUser` and nothing else. `deleteUser`, `updateUserById` and
  `listUsers` are all one line away and all deliberately absent — the surface is the blast radius
- `SUPABASE_SECRET_KEY` is a Fly **secret**, never a `fly.toml` `[env]` entry
- `logger.plugin.ts` redacts `password`, so the generated credential cannot reach a log line

## Invariants

- **`email_confirm: true`.** There is no transactional mail in this product. A member who had to
  click a confirmation link nobody sent would never be able to sign in.
- **The generated password crosses the wire exactly once.** It is returned by
  `POST /projects/:projectId/members` and never stored, hashed or re-derivable. A leader who loses it
  removes the member and adds them again.
- **The network call happens outside the transaction** that writes the `users` row and the
  membership. Holding a database connection across Supabase's latency ties up the pool; and a failed
  write after a created account is the lesser of the two failures — see below.

## Failure modes

- **`status: 'exists'`.** The address has a Supabase account we have never seen sign in, so there is
  no `users` row to attach a membership to and no way to reach its id without listing the whole
  directory. The controller answers 409 and asks for that person to sign in once. Guessing which
  account to adopt is the alternative, and it is worse.
- **An orphaned Supabase account.** `createUser` succeeded and the transaction that follows it
  failed. The account exists with no `users` row and no membership, which is exactly the state a
  never-signed-in account is in anyway: harmless, and repaired by retrying the create, which then
  takes the `exists` branch.
- **A 5xx or a timeout from Supabase** is reported as 503, never as a bad request. The leader retries;
  nothing here decides that an address is invalid because the auth service was down.
