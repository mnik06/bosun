# Enrollment

Enrollment is the one moment a machine's long-lived credential exists in plaintext. Everything here
is shaped by that.

## Why two different secrets

The enrollment token is a *bearer coupon* that a human copies out of a browser and pastes into a
terminal on another box. It is short-lived and single-use because it travels through the least
trustworthy path in the system — a clipboard, a chat window, a screen share. The machine key is what
the agent actually authenticates with on every connect; it never travels through a human.

Collapsing the two — handing the browser the machine key directly — would put a permanent credential
in the same place the throwaway one goes.

## Why the consume is a single conditional UPDATE

`consumeEnrollmentToken` folds the three checks (token exists, unused, unexpired) into the `WHERE`
of the same statement that writes the key hash. Read-then-write would let two concurrent `POST
/enroll` calls with the same token both pass the check and both mint a key — the second silently
overwriting the first, leaving one agent holding a key the server no longer recognises. The single
statement makes "first caller wins" a property of Postgres rather than of timing.

The cost is that a rejected enrollment carries no reason: zero rows updated means *something* was
wrong. `enrollmentRejection` runs only on that path and re-reads the row purely to say which. It is
allowed to be non-atomic because it is diagnostic — the write has already been decided.

**Invariant:** `machine_key_hash` is written exactly once, in the same statement that sets
`token_used_at`. If those ever move apart, a token can mint two keys.

## Why sha256 and not bcrypt

Machine keys are 32 bytes from `crypto.randomBytes`. bcrypt's work factor exists to make brute force
expensive against passwords with maybe 40 bits of entropy; against 256 bits it buys nothing and costs
a slow hash on every WebSocket connect. Comparison is `timingSafeEqual` over the digests.

This reasoning holds only because the key is machine-generated. If a human-chosen credential is ever
accepted here, the hash choice has to change with it.

## Failure modes

- A used or expired code returns 409/410 with a message the agent prints verbatim. The operator's fix
  is always the same: issue a new code in the browser.
- A code that never existed returns 400, not 404, so a scan of the endpoint cannot distinguish
  "wrong code" from "code for a machine that was deleted".
