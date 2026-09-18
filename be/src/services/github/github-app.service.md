# The GitHub App

## Why the credential lives here

A machine runs sessions with `Bash` over repository code and tracker content. It is the place a
prompt injection executes, which makes it the worst place for a long-lived personal token that
reaches every repository its owner can — the `gh` login machines used to hold. The App's private key
is worth more than any one of those tokens, but it sits in a process that runs no untrusted code, and
what reaches a box is an installation token for one repository that expires within the hour.

## Invariants

- **This module is the only reader of `GITHUB_APP_PRIVATE_KEY`.** Like `SUPABASE_SECRET_KEY`, it is
  validated by `EnvSchema`, set as a Fly secret, and exposed only through what this service offers:
  minting for one repository, pull-request writes and one file write. Nothing here lists or touches a
  repository outside an installation bosun has recorded.
- **An installation is proven by the installer's own authorization.** The callback's
  `installation_id` is a query parameter anyone can type. `connectInstallation` exchanges the `code`
  GitHub issued for a user token, asks `GET /user/installations` with it, and records the installation
  only if it is listed. The user token is used for that one request and discarded. Without this, a
  leader of one project could attach another organization's installation and clone its code.
- **An App already installed on an account is connected by authorization alone.** GitHub answers the
  install page for such an account with the installation's settings, which never redirect back — so
  without this an organization that already has the App could never be added to a project (or to a
  second one). *Already installed on GitHub?* sends the leader to `login/oauth/authorize`; the callback
  arrives with a `code` and no `installation_id`, and `importInstallations` records every installation
  that authorization lists. Same bar as a new install: nothing is recorded that the leader's own GitHub
  account cannot reach, and recording one grants no machine anything until a repository is added.
- **The App must be installable on any account** (*Make public* in its advanced settings) to go on an
  organization other than the account that owns it. With *Only on this account*, GitHub's install page
  never offers the organization at all.
- **The `state` names a user and a project and expires in 30 minutes.** An HMAC keyed off the client
  secret; a callback forwarded to someone else or replayed into another project is refused.
- **Minted tokens name their repository by id and their permissions explicitly.** Three shapes, each
  as narrow as its caller allows: `metadataToken` (`metadata: read` — the attach flow's defensive
  re-check, which only confirms a repository is still reachable), `repositoryToken` (`contents:
  write` — a machine's git credential, which has no business calling the Pulls API), and
  `installationToken` (`contents: write` + `pull_requests: write`, the union every other REST call in
  this module needs — opening/editing a pull request, pointing a branch, reading or writing a file).
  A caller resolves one of these once per repository and passes that same token into every call it
  makes, rather than this module minting narrower per operation the way it used to. Tokens are cached
  in memory until five minutes before expiry and never written anywhere.
- **The credential route takes no repository argument.** It answers for the machine's own
  `repository_id`, so there is nothing a session could ask for that reaches somebody else's.
- **This module never decides which token source a repository uses.** `installationToken` and
  `repositoryToken` both take an `installationId` the caller already resolved — `gitProviderFor`
  (`controllers/line/shared/git-provider-for.ts`) is what looks at a repository's own columns and
  decides between minting here and decrypting a stored personal access token, then hands every REST
  function in this module the same shape either way: `{ token, githubRepoId, ... }`. See
  `github-pat.service.md` for the token this module never reads.

## Failure modes

- A `GithubError` carries GitHub's status and message and reaches the browser as a 502 (400 for a
  refused authorization code) — an App removed from an organization is something the leader fixes.
- A backend restart drops the token cache; the next fetch mints again.
- A repository removed from the installation fails at the next mint with GitHub's 422, surfacing as
  the push failing on the machine and as the picker no longer listing it.

## What was rejected — and the one exception since disclosed

- **A personal token per project, stored encrypted, as the primary connection.** Reaches every
  repository its owner can, and would sit in the database — rejected as the default path for exactly
  that reason. Accepted as a disclosed **fallback**, for a project member who cannot get the App
  installed: `github-pat.service.ts` validates and `github_pat_connections` stores the encrypted
  token, never read by this module. `gitProviderFor` decides per repository whether a mint from here
  or a decrypted PAT answers a call, and the connect screen names the long-lived-token risk this
  module's own tokens never carry. See `github-pat.service.md`.
- **Trusting `installation_id` after checking the installation's account against the project.**
  Accounts are not bosun's to vouch for; only the installing user's own authorization says they can
  reach the installation.
