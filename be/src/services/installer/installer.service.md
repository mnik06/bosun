# The install script

`assets/install.sh` is the only thing most users will ever run on their own machine, pasted from the
browser. It is served, not shipped: `installer.service` reads it once and substitutes the server URL
and the binary download base at request time, so the script a user pastes always points back at the
deployment that printed it. Nothing about the target machine is known when it is written.

## One command, from anywhere

The script used to enroll whatever `$PWD` was as the machine's repository, so a machine installed from
the wrong directory had no way back short of deleting it. It now reads nothing from the directory it
runs in and nothing from any repository: `enroll` is called without `--repo`. The repository is
attached from the browser afterwards, and the agent clones it into a directory it owns.

## Two phases in one file

**Root phase** — only when `id -u` is 0. A fresh VPS usually offers nothing but root, and refusing it
turned the first step of onboarding into "create a user and log in again". The invariant was never
"refuse root"; it was "the agent never runs as root". So root does only what needs root:

1. Keeps a copy of the script. Under `curl | sh` it arrived on stdin and cannot be run a second time,
   so a copy saved by hand is used when `$0` is one (it carries the `# bosun-agent installer` marker),
   and otherwise the same script is fetched again from the server that served it.
2. `apt-get install` git, curl, ca-certificates and xz-utils. No other package manager is attempted,
   and the script says what it skipped.
3. Downloads the current LTS node into a temp directory, checksum-verified, and runs
   `npx playwright install-deps chromium` with it — the shared libraries headless Chromium links
   against. A fresh Ubuntu has none of them, and a browser build without them sits in the cache and
   never launches. A failure is reported, not fatal: the agent's `browser` check launches the build
   and names the missing library.
4. `useradd --create-home bosun`, unless `BOSUN_USER` names an existing user (a `BOSUN_USER` that names
   nobody is refused rather than created), then `loginctl enable-linger` and a wait for the user
   manager's socket.
5. Runs the saved copy as that user through a non-login `runuser`, which keeps the exported
   environment. `BOSUN_TOKEN` travels that way — never as an argument, because argv is world-readable
   in `/proc` — along with `XDG_RUNTIME_DIR`, without which `systemctl --user` cannot reach the user
   manager. `cd /` first: root's home is unreadable to that user, and node refuses a working directory
   it cannot read.
6. Runs `bosun-agent setup </dev/tty` as that user, once. The user phase is told to skip it
   (`BOSUN_SKIP_SETUP=1`) so the wizard runs from the shell that holds the operator's terminal.

**User phase** — the script as a non-root user, or the copy root hands over:

- The agent binary, the checksum gate, and `enroll`.
- The current LTS node into `~/.bosun/toolchains/node-<version>`, for the agent's own tooling: the
  default MCP servers are `npx` commands and have to start before any repository exists. Skipped when
  that version is already there.
- Claude Code, with its own installer, when `claude` is neither on the PATH nor in `~/.local/bin`.
- `npx playwright install chromium` into the user's cache.
- `ldd` over that build — the check Playwright itself makes before it launches — and, when libraries
  are unresolved, `sudo … npx playwright install-deps chromium`. The install is meant to leave a
  machine that works without a second command, and those libraries are the one thing a user install
  cannot add. `sudo -n` first; a password prompt only when `/dev/tty` opens. Never under the root
  phase: root installed them before the user existed, and the agent user has no sudo, so a prompt
  there is one nobody can answer — it only checks. Whatever is still missing ends in a `WARNING` line
  with the command, since the next thing to fail would be a verify an hour later.
- `~/.bosun/env`, `~/.bosun/mcp.json` and the unit, with bosun's node and `~/.local/bin` first on the
  unit's `PATH`. A re-run restarts the unit, so it runs the binary and config it just wrote.
  `XDG_RUNTIME_DIR` is forced to `/run/user/<uid>` before any `systemctl --user`: `su <user>` without
  `-` hands over root's `/run/user/0`, which this user cannot enter, and systemctl fails with
  "Operation not permitted". Linger, when the user may enable it, gets the same socket wait as the
  root phase.
- A marked `PATH` line for the install directory in `~/.bashrc` and `~/.profile`, once. The binary
  lives in `~/.local/bin`, which only a login shell adds, so after `su <user>` without `-` —
  root's `PATH`, `~/.bashrc` only — `bosun-agent` was "command not found" while the agent ran fine.
- `bosun-agent setup </dev/tty` when `/dev/tty` opens — stdin is the `curl` pipe, so the prompts
  cannot read from it. Without a terminal the command is printed and the script exits 0.

A non-root user cannot install system packages, so a missing `git` or `curl` is reported by name
rather than failing the install.

## What left the script

Everything that read the repository: `.nvmrc`, `.node-version`, `engines.node`, `packageManager` and
the lockfile sniffing. The repository does not exist when the script runs, and reading only its root
was wrong anyway — a repository whose packages each carry their own `.nvmrc` and has no root
`package.json` got the current LTS and no package manager. The node and package manager a project
needs are now named in `.bosun/project.yaml` and provisioned by the agent
(`agent/src/services/toolchain.service.ts`).

## Why the agent ships as a compiled binary

The install path cannot assume a runtime. A user's VPS may have Node 18, no Node, or no permission to
install one, and every prerequisite is a step that turns a 10-second onboarding into a support
thread. `bun build --compile` embeds the runtime in the artifact, so the agent itself needs only
`curl` and a shell to arrive. The node the script installs is for what the agent runs, not for the
agent.

Binaries are architecture-specific, which is why the script branches on `uname -m` and why every
release publishes both `linux-x64` and `linux-arm64`.

## Invariants

**The checksum gate is not optional.** The script downloads `SHA256SUMS` alongside the binary and
refuses to install on a mismatch or a missing entry, and node's tarball is checked against
`SHASUMS256.txt` from its own release directory. Without the gate, anyone who can tamper with the
download base gets arbitrary code execution on every machine that enrolls. If the download base is
ever moved, it must publish checksums or this script must stop working — not silently skip the check.

**No agent process runs as root.** The root phase never executes the agent binary; every call to it
goes through `runuser`. A `BOSUN_USER` of root, or one with uid 0, is refused.

**The enrollment code arrives through the environment, not argv.** On Linux `/proc/<pid>/cmdline` is
world-readable, so a token passed as a flag is visible to every other user on the box for the
lifetime of the process; `/proc/<pid>/environ` is owner-only. The root phase exports it and uses a
non-login `runuser`, which sets only `HOME`, `SHELL`, `USER` and `LOGNAME`; `sudo` would have stripped
it, and `env BOSUN_TOKEN=…` would have put it back in argv.

**Linger must be enabled or the agent dies at logout.** The unit is a *user* unit, so systemd tears
down the whole user manager when the last session ends unless `loginctl enable-linger` has been run —
and a user created by the root phase never has a session at all. Failure to enable it is reported and
not fatal, but it is the first thing to check when an agent goes offline "by itself".

## What breaks it

- Publishing a release without `SHA256SUMS`: every install fails at the checksum gate, correctly.
- A private download base: GitHub returns 404 to unauthenticated requests, so the script cannot
  fetch the binary at all. The release host has to be readable without credentials.
- Renaming the assets: the script builds the filename from the architecture, so
  `bosun-agent-linux-<arch>` is a contract with the release job, not a convention.
- Removing the marker comment near the top: the root phase then cannot recognise a saved copy, and
  under `curl | sh` refuses whatever the server returned.
- A distribution without `apt-get`: the root phase installs no packages and no Chromium libraries,
  says so, and carries on.
