# PAT encryption

## Why this secret is reversible

Every other credential in this codebase is hashed (`key.service.ts`) or minted
short-lived and never stored (`github-app.service.ts`). An Azure DevOps PAT has no
equivalent of a GitHub installation token: there is no App to mint a scoped,
hour-long token from, so the PAT a leader pastes is what a machine's credential
helper is handed, potentially months later. Storing it hashed would make it
useless; it has to come back out, so it is encrypted instead.

## Format and invariants

`iv:authTag:ciphertext`, each hex, AES-256-GCM. The key is `AZURE_PAT_ENCRYPTION_KEY`
— 32 bytes as 64 hex characters, validated by `EnvSchema` the same way every other
secret is. A random IV per encryption, so the same PAT encrypted twice (rotate,
then rotate back) never produces the same ciphertext.

**No key rotation or versioning.** Changing `AZURE_PAT_ENCRYPTION_KEY` makes every
stored PAT undecryptable — `decrypt` throws `PatDecryptionError` rather than
returning garbage. This is a deliberate non-goal (see the plan): rotating the key
means every connected organization re-pastes its token, the same one-time cost as
a leader replacing a PAT that expired.

## What was rejected

- **Hashing, like every other secret here.** A hash cannot be handed to a
  machine's git credential helper — the whole point of storing this one.
- **A per-connection IV derived from its id.** A random IV per call is simpler and
  carries no risk of reuse across connections, at the cost of a few extra bytes
  stored alongside the ciphertext.
