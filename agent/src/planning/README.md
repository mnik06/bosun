# Planning sessions

## What this folder is

A planning session is a `claude` process running in the machine's own checkout, driven from the
browser. This folder is everything the agent needs to start one, talk to it, and reap it. Nothing
here writes to the user's repository, and nothing here stores a credential.

The four modules split by responsibility: `process` owns the child, `stream` owns its stdout,
`mcp` owns the tools it calls, `session` is the glue that wires those to the WebSocket. `prompt` is
the text bosun sends as the session's first turn.

`prompts/planning.ts` is a generalized port of the `plan-me` skill, and it is inlined rather than installed
into `.claude/skills/` — writing there would dirty the working tree and trip the `git-clean`
preflight, and a skill that fails to load leaves a generic session nobody notices. Generalized means
it names no path and no library: it discovers whatever specification material and component library
the repository actually has, and does nothing when there is none. Every project-specific fixture in
the original — a spec path, a named UI kit, a design prototype, a standing-criteria library, the
GitHub and Jira halves — became either discovery or a bosun tool.

## Why the CLI and not the Agent SDK

The CLI adds no npm dependency to a binary that is compiled with `bun build --compile`, and the same
harness will have to drive unattended execution later. One stream parser and one process model for
both halves of the product beats two.

The cost is the contract: `--output-format stream-json` is a shape, not a typed package. `stream-parser.ts`
therefore recognises the frames it knows and **drops everything else with a log line**. A new event
type in a future `claude` release must not be able to kill a grill, so there is no `default: throw`.
`services/preflight.service.ts` reports the CLI's major version for the same reason.

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

`mcp/server.ts` starts an HTTP server on loopback, on an ephemeral port, one per session. `claude` is handed
a generated `--mcp-config` pointing at it.

It lives in the agent process rather than under `claude` as a stdio server because `bosun_ask` has to
resolve against a `plan.answer` frame arriving on the WebSocket. Same process, no IPC: the pending
promise is in the same map the socket handler can reach. A stdio server would be a child of `claude`,
one hop away from the socket, and every answer would need a second channel to get there.

Loopback is not on the network, but every process on the box shares it, so the config carries a
per-session bearer token and the server rejects anything without it.

## Activity comes from two narrators

A recon sweep runs for minutes and produces no prose, so the activity line is the only thing telling
the browser the session is alive. Most of that work happens inside a subagent, and its frames arrive
on the same stream carrying `parent_tool_use_id`.

Those frames are **shown, but attributed** — `Exploring the codebase — read 47 files`, on their own
counters. The two obvious alternatives are both wrong: folding them into the session's counters makes
a session that read ten files claim it read a hundred, and dropping them the way subagent *text* is
dropped leaves one static line for four minutes, which is the silence the activity line exists to
prevent.

Counting is keyed by the label a tool renders, not by the tool's name. `Grep` and `Glob` both read as
"searched the codebase", and separate counters made the number visibly count backwards as the two
interleaved.

## Invariants

- **One credential, and the conflicting one is stripped.** `CLAUDE_CODE_OAUTH_TOKEN` is the only
  supported credential. `claude-auth.service.ts` removes `ANTHROPIC_API_KEY` from every session it
  spawns, because Claude Code applies its own precedence between the two and a stray key would
  otherwise decide which account a session bills to without anything saying so.
- **Whether the box can authenticate is asked, not inferred.** `preflight.service.ts` runs
  `claude auth status --json` and reports what it says. An earlier version guessed from the presence
  of an environment variable, which called a perfectly working machine red and refused to start
  sessions on it. A token that is present but refused is reported apart from no token at all: the
  first is an expired token needing `claude setup-token` again, the second is an unfilled env file,
  and a box that looks configured and still fails is where an operator otherwise stops looking.
- **A red check carries the command's own words.** `exec.service.ts` keeps the exit code, the signal and the
  tail of stderr, and every failing check is logged to the journal as well as sent to the browser.
  These checks are read by someone who cannot see the box; "it failed" is indistinguishable from every
  other cause, and the service environment is where these commands fail while the same command in a
  login shell succeeds. A report that parses is always preferred to the exit status — `auth status`
  answering "not logged in" is an answer, not a broken command.
- **The prompt travels on stdin, never argv.** `/proc/<pid>/cmdline` is world-readable and the input
  is the user's own ticket.
- **A session dies with its socket.** `connection/socket.ts` cancels every session when the
  connection drops. A
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
