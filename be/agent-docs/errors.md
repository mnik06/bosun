# Errors

Centralized in `src/api/errors/`: one error class and one handler, registered with
`server.setErrorHandler(errorHandler)` in `build-server.ts`. Throw anywhere; the handler turns it into
the response. **No per-route `try/catch` for error shaping.**

```
src/api/errors/
├── HttpError.ts        # statusCode + message + { cause?, details? }
└── error.handler.ts    # the global handler
```

There is no `ApplicationError` hierarchy and no numeric error-code enum. A service that wraps a
provider throws its own error class, defined in the service file — `GithubError`
(`github-app.service.ts`), `GithubPatError`, `AzureError`, `PatDecryptionError`. A controller helper
translates it to an `HttpError` (`controllers/github/shared/github-errors.ts` → `toGithubHttpError`,
`github-pat-errors.ts`, `controllers/azure/shared/azure-errors.ts`). No service throws
`HttpError` — controllers decide what the client sees.

## `HttpError`

```ts
new HttpError(statusCode, message, { cause?, details? })
```

- `message` is written for the person using the app — it is sent verbatim
- `cause` preserves the underlying error for the log
- `details` is spread **beside** `message` in the body, for a refusal the client acts on field by
  field: `repositories/save-config.ts` sends every config issue, `github-pat-errors.ts` sends the
  `ssoUrl` the form links to

## How the handler responds

- Logs every error with `req.log.error(error)`
- `HttpError` → its `statusCode`, body `{ ...details, message }`
- Any other error carrying a `statusCode` (Fastify's own schema-validation errors) → that status and
  its message, **unless** it is 5xx
- Everything else → `500`, body `{ message: 'Internal server error' }`. Only an unplanned 5xx is
  collapsed: a message we wrote ourselves cannot leak internals, and the client needs it to tell
  "retry later" from "your request was wrong"
- Unmatched routes get `404 { message: 'Not found' }` from `setNotFoundHandler` in `build-server.ts`

## Rules

### Throw `HttpError` for anything the client should see

```ts
if (!machine) throw new HttpError(404, 'Machine not found');
```

Or use `orNotFound(promise, message)` from `src/utils/general.ts` around a repo call that returns
`null`. A bare `throw new Error(...)` for an expected failure turns into a generic 500.

### Pick the status by what the caller may know

- **404** for a row the caller's project does not own — the same answer as a row that does not
  exist, so guessing ids reveals nothing. Same for a project the caller is not a member of
- **403** for a role the caller lacks in a project they are in (`requireLeader`) — they already know
  the resource is there, and hiding it would leave the browser unable to tell "gone" from "not
  allowed"
- **401** for a missing or bad credential
- **400** for a missing `X-Project-Id` or a request the domain refuses; **409** for a conflict

### Don't catch just to reshape

Let errors propagate. `try/catch` only to recover, to add a `cause`, or to translate a provider
error into a domain `HttpError`:

```ts
// controllers/github/shared/github-errors.ts
if (error instanceof GithubError) {
	return new HttpError(error.status === 401 ? 400 : 502, error.message, { cause: error });
}
```

A provider refusing is a fact the leader can act on, so its words reach the browser as a 502 rather
than collapsing into "Internal server error".

### Never put a secret in a message or `details`

The body is sent as-is and the error is logged. A PAT, token or generated password never appears
in either; `logger.plugin.ts` redacts known fields but cannot redact a message string.

### Outside a request there is no handler

A socket frame handler, a timer or a fire-and-forget promise has no `errorHandler` behind it. Catch
and log there (`request.log.error({ error, machineId, type }, …)` in `agent/ws.route.ts`), and never
leave a rejection unhandled — it takes the process down. See [sockets.md](./sockets.md).
