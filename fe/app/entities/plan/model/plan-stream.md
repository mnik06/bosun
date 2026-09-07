# The plan stream

## Two sources for one conversation

A running grill produces far more text than is worth storing, so the transcript arrives on two
channels that this hook reconciles into one list.

- **`plan.text` deltas** are forwarded and dropped by the backend. They exist so prose appears as it
  is produced, and they are held here in `streamingText`.
- **`plan.message` frames** are the persisted rows. The backend appends one assistant message holding
  everything produced since the last tool call, question or terminal frame — that boundary is the only
  point at which a block of prose is known to be finished.

So the same words arrive twice, in that order. `streamingText` is cleared on the arriving
`plan.message` rather than on a timer, which is what keeps the text from being rendered twice for the
frame between them, and keeps it on screen continuously rather than blinking out and back.

Persisting the deltas instead would turn a thirty-minute session into thousands of rows nobody can
read. That is why a reload shows the flushed blocks and not the exact keystroke-level history.

## Why the pending question is derived, not stored

There is no "awaiting answer" column. A plan is waiting when its status is `planning` and its
transcript's last `question` has no `answer` carrying the same `questionId`
(`lib/pending-question.ts`).

That is what makes closing a tab mid-grill safe: reopening replays the transcript from the same
source that rendered it live, finds the same pending question, and answering it still works. A
separate column would be a second place for the same fact to live, and the two would drift the first
time a frame was missed.

Answers are matched **by `questionId`, never by position**. Two questions can be outstanding in the
transcript at once when one was asked before an earlier answer landed, and matching by order retires
the wrong one.

## State is adjusted during render, not in an effect

Navigating between two plans reuses this component. The buffer is reset by comparing `state.planId`
with the argument during render; clearing it in an effect would paint one plan's stream underneath the
other's transcript for a frame, and the lint rule that forbids it is describing a real bug here rather
than a style preference.
