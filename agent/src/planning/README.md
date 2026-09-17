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

## Sessions read a fetched tree, not the machine's checkout

`start` and `say` both resolve `services.repo.readTree()` before spawning, and its path is
the session's cwd. That is a checkout of the current default branch, fetched a moment earlier — not
`config.repoPath`, which is the operator's own working copy and was never refreshed by anything.

This was a correctness bug, not a nicety: every "does X already exist?" a session asks is decided
against the tree it can see, and a tree that is days old answers confidently and wrongly. See
`services/repo.service.md` for why the operator's checkout is not refreshed in place, and
`prompts/shared.ts` `repoState` for what the session is told about the tree it got.

## What a published plan carries for the plans beside it

`publish_plan` sends a **footprint** for every build bullet — the schema, contracts and shared modules
it creates or changes, and the pieces of other approved plans it consumes — and marks bullet 1 as the
**foundation** when it holds every shared piece. The backend compares footprints deterministically when
a plan is approved and decides from them what waits for what; no session is ever asked. That is why
`list_plans` returns the footprints of every approved, unmerged plan in the repository: a plan written
second says `consumes` instead of building a second copy, and waits for one bullet rather than a whole
feature. `set_blockers` is left for the one dependency a footprint cannot say — needing another plan's
whole feature.

The shape lives in `footprint.ts`, mirroring the backend's, with a description on every field because
the model fills it in from the tool schema alone. The rules — every build bullet has one, shared pieces
only in bullet 1, at most six build bullets — are enforced by the backend and returned as a refusal the
session reads and republishes against; the prompt states them so the first publish usually passes.

There used to be a second kind of planning session, which rewrote several confirmed plans around a
shared foundation plan. It is gone: the foundation is a bullet inside the plan that first needs it, so
nothing is rewritten, nobody re-reads a plan they already signed off, and no second grill is run.

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

## An auto plan answers `bosun_ask` for the person

A plan created in auto mode runs the identical grill — same rounds, same one question at a time,
same prompt — but `createAskTool` never registers a pending promise. It takes the **first** option of
each question, which the prompt requires to be the session's own recommendation, and returns it as
the tool result immediately.

That choice of enforcement point is the whole design. Telling the model in the prompt to decide for
itself leaves a session that can still call `bosun_ask` and then block forever on a browser nobody is
watching, and it would block *silently* — the tool-call timeout above is raised precisely so a waiting
question does not resolve on its own. Answering in the tool means the wait cannot happen at all,
whatever the model does.

The question is still emitted as a `plan.question` frame, carrying its answers as `autoAnswers`, and
the backend writes both rows. So the transcript of an auto plan reads exactly like a manual one, and
whether the plan is still waiting stays derivable from the transcript alone — a question written with
no answer beside it is what the browser renders a prompt for.

## Why the MCP server runs in this process

`mcp/server.ts` starts an HTTP server on loopback, on an ephemeral port, one per session. `claude` is handed
a generated `--mcp-config` pointing at it.

It lives in the agent process rather than under `claude` as a stdio server because `bosun_ask` has to
resolve against a `plan.answer` frame arriving on the WebSocket. Same process, no IPC: the pending
promise is in the same map the socket handler can reach. A stdio server would be a child of `claude`,
one hop away from the socket, and every answer would need a second channel to get there.

Loopback is not on the network, but every process on the box shares it, so the config carries a
per-session bearer token and the server rejects anything without it.

## The checkout is served to the session's browser

A planning session has no shell, and the Playwright MCP refuses `file://` navigation. A repository
skill that says "start `python3 -m http.server` and open the prototype" therefore cannot be followed,
and the session stalls asking the person what to do. So each session gets `services/static-server.service.ts`:
the read tree served on loopback at an ephemeral port, and the prompt tells the session to open any
file under that URL instead of starting a server or using `file://`.

Rejected: `--allow-unrestricted-file-access` on the Playwright MCP. It opens every file on the box to
every session — `~/.bosun/env` and the machine's inputs key included — to make one page reachable.
Giving planning `Bash` was rejected for the same read-and-ask reason `Skill` is limited below.

The server answers GET and HEAD only, resolves every path through `realpath` so a symlink cannot lead
out of the checkout, and never serves `.git` or an `.env*` file: loopback is shared with every process
on the machine. It is closed with the session, on every path a session ends by.

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

## A plan is measured by what it covers

Nothing downstream of planning reads the ticket again: bullets build the criteria, verify drives the
criteria, and a requirement that never became one is never built and never missed. A session once
published 22 criteria from a ticket stating 126, and nothing noticed. Two causes, and each has its fix.

**The fetch.** A tracker's default fetch returns the summary and the description. Jira keeps acceptance
criteria and product requirements in custom fields that fetch leaves out, so the session planned from
an overview. The prompt asks for every field, by name, and the comments and linked issues with them.

**The prompt leaned towards less** — never invent requirements, merge criteria, interview only
high-stakes branches, cut scope past six bullets, a styling question is never a question. It now asks
for the opposite: a ledger of every requirement in every source, gaps hunted through product, UI and
architecture lenses, one checkable behaviour per criterion, and an audit — one subagent against the
verbatim sources, one hunting gaps — repeated until a pass finds nothing new. Appearance is still the
project's; what a screen does in every state is the plan's.

**The ledger is enforced by the tool, not asked of the prompt.** Asking is what failed. `publish_plan`
takes `coverage` — one entry per requirement or found gap, with the criteria that deliver it or the
non-goal it became — and `coverage.ts` refuses a plan with a line nothing accounts for, or a criterion
that traces to no line. The tool cannot know a requirement the session never wrote down, but writing
them down is no longer a step it can skip. The ledger is validated against the plan's criteria and then
discarded — it is never rendered into the body or stored anywhere, so a plan's `bodyMd` stays exactly
what the session wrote. Acceptance criteria are the only checklist a plan is built and verified
against. A revision sends `coverage` again only when it re-cuts criteria, so the tool can re-check the
new set traces cleanly.

Rejected: **fetching the ticket in the agent** and inlining it into the prompt. The agent holds no
tracker credential — trackers are the user's MCP servers — and every tracker's field model is its own.

## Invariants

- **One credential, and the conflicting one is stripped.** `CLAUDE_CODE_OAUTH_TOKEN` is the only
  supported credential. `claude-auth.service.ts` removes `ANTHROPIC_API_KEY` from every session it
  spawns, because Claude Code applies its own precedence between the two and a stray key would
  otherwise decide which account a session bills to without anything saying so.
- **Whether the box can authenticate is asked, not inferred.** `preflight.service.ts` runs
  `claude auth status --json` and reports what it says. An earlier version guessed from the presence
  of an environment variable, which called a perfectly working machine red and refused to start
  sessions on it. What it establishes is *presence*, not validity: `claude auth status` answers
  `loggedIn: true` for a token the API rejects, so the check says `credential present` rather than
  `authenticated`. Proving a credential works costs a real turn against the API, which is why it
  lives in `bosun-agent auth set` and `auth status` rather than in a check that runs on every
  reconnect.
- **A red check carries the command's own words.** `exec.service.ts` keeps the exit code, the signal and the
  tail of stderr, and every failing check is logged to the journal as well as sent to the browser.
  These checks are read by someone who cannot see the box; "it failed" is indistinguishable from every
  other cause, and the service environment is where these commands fail while the same command in a
  login shell succeeds. A report that parses is always preferred to the exit status — `auth status`
  answering "not logged in" is an answer, not a broken command.
- **`Skill` is named in the tool list on purpose.** `--tools` replaces the built-in set rather than
  adding to it. Leaving `Skill` out does not hide skills — Claude Code still discovers them and
  loads their descriptions at startup — it only makes them impossible to invoke, which reads to the
  model as a tool that keeps failing. Skills get the session's tools and nothing more, so one that
  shells out fails partway; that is the same read-and-ask limit the rest of the session runs under.
- **The MCP config is a file, not an argv string.** `/proc/<pid>/cmdline` is world-readable, so an
  inline `--mcp-config` would publish this session's loopback bearer token — and any credential in
  the user's own server config — to every other account on the box. That token exists precisely
  because loopback is shared, so putting it in argv would defeat the thing it is there for. The
  config is written to a `0600` file in the temp directory and unlinked when the session closes.
- **A broken `~/.bosun/mcp.json` does not stop planning.** The session still gets bosun's own tools
  and the reason is reported through preflight. A typo in a third-party server's config is not a
  reason for a machine to stop being able to plan.
- **The prompt travels on stdin, never argv.** `/proc/<pid>/cmdline` is world-readable and the input
  is the user's own ticket.
- **A session outlives its socket.** `holdConnection` builds the sessions map once and hands it to
  every connection, so a proxy reaping an idle socket or a backend deploy does not end a grill the
  person is halfway through answering — which is exactly what "the session died while I was at
  lunch" was. Frames produced while nothing is attached go through the `FrameSink`: a question, a
  result and an error are held for the next connection, and the live view — text deltas and activity
  labels — is dropped, because the browser refetches the transcript on reconnect anyway. `hello`
  names every session still held, and the backend fails whatever it has marked `planning` that the
  agent did not name. That is the only thing stopping a plan sitting in `planning` forever, so an
  agent that stops sending `planIds` reintroduces exactly that bug.
- **A session ends on approval, or after 24 hours.** Approving the plan sends `plan.cancel`; nothing
  else ends a session that is behaving. The 24-hour cap in `session.ts` is the backstop, and it is
  the same number as `MCP_TOOL_TIMEOUT` in `sessions/process.ts` on purpose: the tool call a grill
  blocks in must not be able to time out before the session holding it does. A shorter tool timeout
  hands the model `The operation timed out.` and it carries on as though the person had refused to
  answer — which is where a question asked twice and a plan written with no grill behind it both
  come from.
- **The same question is asked once.** `createAskTool` fingerprints a question by its headers, text
  and option labels. A second call while the first is still waiting joins it rather than putting a
  duplicate prompt on the screen; one that repeats a question already answered is handed the answer
  back. A model that re-asks has lost the tool result — a compaction, a restarted turn — and asking
  the person again reads as the grill going in circles.
- **A plan not in auto mode cannot be published before it is grilled.** `publish_plan` refuses until one
  `bosun_ask` has been answered by a person, and the nudge for a turn that ended early says to keep
  grilling rather than to publish. The point of a planning session is that the plan is not the
  model's own first draft; a session that loses the thread and writes one anyway produces something
  that looks reviewed and is not. An auto plan is exempt because its answers are the model's own by
  design, and a revision is exempt because the plan it edits was already grilled into existence.
- **Cancelling reaps the process group.** The child is spawned `detached`, so `SIGTERM` goes to the
  group and takes any subagent with it. A `claude` process outliving its session holds a port and a
  credential.
- **Closing the MCP server resolves its pending questions.** Otherwise `claude` blocks on a promise
  nobody can resolve any more and the process never exits, which is the exact orphan the previous
  invariant exists to prevent.
