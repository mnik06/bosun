# GitHub PAT validation

## Why the six errors are text-matched, not status-coded

GitHub answers an invalid SSO authorization, an org's PAT-restriction policy, a fine-grained token
still awaiting approval, and an ordinary missing scope with the *same* 403 — there is no machine-
readable field that tells them apart, only the English sentence in the body's `message`. `X-GitHub-SSO`
is the one exception: it is a real header, present only for the SSO case, so it is checked first and
makes that branch unambiguous. The other three are matched against wording GitHub is known to use
today; if GitHub changes that wording, the affected connect attempt falls through to `missing_scope`
rather than throwing — a slightly wrong message, not a crash.

## Order matters

`classifyForbidden` checks SSO (header, then a wording fallback for whichever comes back without the
header), then org-restriction, then pending-approval, and only then falls back to `missing_scope`. A
looser check earlier would swallow a more specific one later — "restriction" wording, for instance,
could plausibly appear inside an SSO message too, so the header-backed case is tried first.

## What was rejected

- **A single generic "GitHub refused this token" message.** The ticket asks for six distinct messages
  (AC-6 through AC-11) so a leader knows what to fix without opening GitHub's own docs.
- **Classic-only scope checking done by trying an operation and seeing if it fails.** `X-OAuth-Scopes`
  on `GET /user` states the grant directly; fine-grained tokens carry no such header; their permissions
  are proved by what `listPushableRepositories` actually finds.
