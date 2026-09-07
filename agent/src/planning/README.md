# Planning sessions

## What this folder is

A planning session is a `claude` process running in the machine's own checkout, driven from the
browser. This folder is everything the agent needs to start one, talk to it, and reap it. Nothing
here writes to the user's repository, and nothing here stores a credential.

The four modules split by responsibility: `process` owns the child, `stream` owns its stdout,
`mcp` owns the tools it calls, `session` is the glue that wires those to the WebSocket. `prompt` is
the text bosun sends as the session's first turn.

## Why the CLI and not the Agent SDK

The CLI adds no npm dependency to a binary that is compiled with `bun build --compile`, and the same
harness will have to drive unattended execution later. One stream parser and one process model for
both halves of the product beats two.

The cost is the contract: `--output-format stream-json` is a shape, not a typed package. `stream.ts`
therefore recognises the frames it knows and **drops everything else with a log line**. A new event
type in a future `claude` release must not be able to kill a grill, so there is no `default: throw`.
`preflight.ts` reports the CLI's major version for the same reason.

## `bosun_ask` and the tool-call timeout

Headless `claude` cannot answer `AskUserQuestion` — `--permission-prompt-tool` refuses anything
requiring user interaction, and that is a hard limit rather than a setting. So the grill does not use
it. Bosun exposes its own `bosun_ask` MCP tool: the model calls it, the call blocks until the browser
answers, and the answer comes back as the tool result. An ordinary MCP tool call is not an
interaction-requiring builtin, so nothing denies it.

**This only works because the tool-call timeout is raised.** The CLI's default cap is one minute; a
question waiting on a human routinely outlives that, and past it the model receives
`The operation timed out.` and carries on as though the human had refused to answer. `process.ts`
sets `MCP_TOOL_TIMEOUT` for the session. Changing that constant to something a person cannot beat
breaks the entire mechanism, and it breaks it silently — the session keeps running, it just stops
listening.

## Why the MCP server runs in this process

`mcp.ts` starts an HTTP server on loopback, on an ephemeral port, one per session. `claude` is handed
a generated `--mcp-config` pointing at it.

It lives in the agent process rather than under `claude` as a stdio server because `bosun_ask` has to
resolve against a `plan.answer` frame arriving on the WebSocket. Same process, no IPC: the pending
promise is in the same map the socket handler can reach. A stdio server would be a child of `claude`,
one hop away from the socket, and every answer would need a second channel to get there.

Loopback is not on the network, but every process on the box shares it, so the config carries a
per-session bearer token and the server rejects anything without it.

## Invariants

- **Exactly one credential reaches the session.** `process.ts` strips every supported credential
  variable from the child environment and then sets the one that was resolved. Without that, Claude
  Code picks its own precedence between two variables and the mode bosun reported at preflight is not
  the mode the session actually authenticated with.
- **The prompt travels on stdin, never argv.** `/proc/<pid>/cmdline` is world-readable and the input
  is the user's own ticket.
- **A session dies with its socket.** `run.ts` cancels every session when the connection drops. A
  grill is answered over that socket, so one that has gone cannot deliver an answer to a question
  already in flight; keeping the process alive across a reconnect would leak it and its port. The
  backend fails those plans on the same event, which is what stops a plan sitting in `planning`
  forever.
- **Cancelling reaps the process group.** The child is spawned `detached`, so `SIGTERM` goes to the
  group and takes any subagent with it. A `claude` process outliving its session holds a port and a
  credential.
- **Closing the MCP server resolves its pending questions.** Otherwise `claude` blocks on a promise
  nobody can resolve any more and the process never exits, which is the exact orphan the previous
  invariant exists to prevent.
