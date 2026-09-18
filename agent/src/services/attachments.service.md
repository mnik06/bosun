# Chat attachments

A person can attach files to a message in a plan's chat or its bug-fixing chat. This service is how
those files reach the `claude` session the message is for.

## Why the files are fetched, not carried on the frame

`plan.say`, `bugfix.start` and `bugfix.say` carry each file as `{ id, name, mediaType, size }` only.
The bytes are fetched from `GET /agent/attachments/:id` with the machine key before the turn is
handed to the session. A message can hold 20 MB, and a WebSocket frame is one write: that much base64
queued ahead of the backend's protocol ping is a machine marked dead for being busy. The frame stays
resendable — the row outlives it.

## What the session is given

Every file is written to `~/.bosun/attachments/<plan id | bug-fixing session id>/<attachment id>-<name>`
and listed in the turn's text by path. PNG, JPEG, GIF and WebP up to 3.5 MB are *also* sent inline as
image blocks on the same stream-json turn, so the model sees a screenshot without a tool call.

- **Outside every worktree.** A bug-fixing round commits everything in its tree; a screenshot must
  never land on the branch. Sessions are spawned with `--add-dir ~/.bosun/attachments`, because under
  `--permission-prompts none` a `Read` outside the working directory that would have prompted is
  refused instead
- **Paths even for inline images.** An image block is gone from view once the conversation compacts;
  the path is how the session looks again
- **The inline cap is below the API's 5 MB per image once base64 has inflated it.** A block over the
  limit fails the whole turn, not the one image. Larger images are still listed and `Read` scales them
- **The file name is untrusted.** `attachmentFileName` keeps a conservative character set and
  prefixes the id, so a name cannot leave the directory or collide with another file

## Invariants

- **`stageTurn` never rejects.** A file that cannot be fetched is named in the turn text with the
  reason, so what the person wrote still reaches the session and it can say what it has not seen
- **Turns are delivered in the order they arrived.** Frames are routed concurrently, and a turn
  waits on its downloads, so a text-only line sent right after a screenshot would otherwise overtake
  it. Planning and bug-fixing sessions each keep a `turns` promise chain for this. In a bug-fixing
  session the start is the first link, so a message sent while the first turn's files are still
  downloading waits for the process instead of being told the session is gone
- **A session's directory goes with the session.** `release` runs on every teardown, including a
  cancel that lands while the first turn is still staging — that path checks `cancelled` before it
  spawns, or it would leave a `claude` nothing holds a handle to

## Failure modes

- An agent older than 4.0.8 strips `attachments` from the frame and the session never sees the files.
  The backend refuses such a message with a 409 naming the version (`CHAT_ATTACHMENT_MIN_AGENT_VERSION`)
  rather than letting it be dropped silently
- A download that hangs is cut off after 60 s and reported in the turn like any other failed file
