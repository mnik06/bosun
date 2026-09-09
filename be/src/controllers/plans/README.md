# Planning sessions

## The state machine

A plan has three states and only two ways out of the first one.

```
                 plan.done  + invariants hold ──► ready
planning ────────┤
                 plan.error, a failed invariant,
                 or the agent socket dropping   ──► failed (with a reason)
```

`planning` is entered by `startPlan` the moment the session is dispatched, before the agent has said
anything, so the plan appears on the list immediately. It is left exactly once: `finishPlan` and
`failPlan` both write a terminal status, and nothing writes `planning` back.

**There is no state for "waiting on a human."** A plan is waiting when its status is `planning` and
the last `question` message has no `answer` with the same `questionId`. The transcript already holds
that fact; a column would be a second copy of it, and the two would drift the first time a frame was
missed.

That is also why an auto plan's answers are ordinary `answer` rows. The session on the machine
answered its own question and has already moved on, so `recordPlanFrame` writes the question and the
`autoAnswers` riding on the same frame as two messages. A question left without one would render a
prompt in the browser for a tool call that returned long ago.

## Why a refusal writes nothing

`startPlan` checks ownership, status, the `claude-cli` and `claude-credential` preflight results and
the presence of a live agent socket **before** the insert. A plan row created against a machine that
cannot host a session has no way to reach a terminal state: nothing on the other end will ever send
`plan.done` or `plan.error` for it, so it sits in `planning` until somebody notices.

The one write that survives a failed dispatch is deliberate: if the socket closes between the check
and the send, the row exists and is immediately marked `failed`, because at that point the user has
already been told a plan was created.

## Two fan-outs, different audiences

- `plan.updated` and `plan.deleted` go to **every socket the owner has open**, because the plans list
  has to stay live without being subscribed to any one plan.
- `plan.text`, `plan.activity`, `plan.question`, `plan.message` and `plan.artifact` go **only to
  sockets that subscribed to that plan**. They are high-volume, they carry a transcript, and they mean
  nothing on any other screen.

Subscribing is an authorization decision, not a routing one — `ui/ws.route.ts` resolves the plan
through the owner-scoped repo before adding the socket, or any signed-in account could name somebody
else's plan id and receive its whole transcript.

## Text is buffered, not persisted per delta

`plan-text.service.ts` accumulates `plan.text` deltas in process memory and `recordPlanFrame` flushes
them into one assistant message when the session does something else. A thirty-minute grill emits
thousands of deltas; a row each makes a table nobody can read, and the browser already has the live
text from the same frames.

The buffer is process-local and deliberately not durable. Losing it costs the tail of one assistant
turn on a backend restart, and the session is being failed on that restart anyway, because the agent
socket went with it.

## The plan is published whole, or not at all

`publishPlan` takes the entire artifact in one call — title, body, every AC, every bullet with the
codes it claims — and writes it in one transaction. Publishing it piece by piece put a plan with two
of its four bullets in front of whoever was watching, and made a revision a diff against whatever the
last session happened to write. Republishing is therefore the revision mechanism: send the plan as it
should now be, and what is missing from the payload is deleted.

Two things survive a republish deliberately. Slices are matched by `ordinal` and ACs by `code`, so a
plan already queued keeps the rows its runs point at; and `acs.implemented` / `acs.verified` are
never written by a publish, because resetting them would hand a queue criteria it has already met.

## The every-AC-in-exactly-one-bullet invariant

Two places enforce it, and they enforce different halves:

- `publishPlan` rejects an artifact where an AC is claimed twice, claimed by nothing, or claimed by a
  bullet under a code that does not exist. Repairing a double claim afterwards is not possible
  without guessing which bullet meant it.
- `finishPlan` refuses to mark a plan `ready` while any AC is unclaimed, and records which ones in
  `failureReason`. An AC no bullet delivers is invisible work, not a cosmetic gap.

The `acs.sliceId` foreign key is `on delete set null` so a bullet removed by a republish cannot take
its criteria with it silently.

## Criteria are ticked by sessions, never by the browser

`acs.implemented` is ticked by the build bullet that owns the criterion, `acs.verified` by the verify
bullet that drove it. `acGateFailure` refuses to settle a run whose criteria are not ticked: a build
bullet that finishes with one of its own unticked has not delivered it, and a verify bullet that
finishes with one unverified has not driven the feature — which is also why no pull request is opened
for such a plan. The browser renders both boxes read-only; a click there would be a claim about work
nobody did.

## Plan frames are handled one at a time

`agent/ws.route.ts` puts plan frames on a promise chain per socket and leaves everything else off it.
Two reasons, both real: `plan_messages.seq` comes from `max(seq) + 1` and has a unique index, so
overlapping appends collide; and an answer recorded before the question it answers is a transcript
that cannot be replayed in order. Pongs stay off the queue because a round-trip time measured from
behind a database write is measuring the wrong thing.

## A dropped agent socket ends every session on that machine

`failMachinePlans` runs from the socket's `close` handler. A grill is answered over that socket, so
one that has gone cannot receive an answer to a question already in flight. Leaving the plan in
`planning` would mean a chat that renders a question nobody is listening for. The agent kills its own
`claude` processes on the same event, so the two sides agree without needing to negotiate.
