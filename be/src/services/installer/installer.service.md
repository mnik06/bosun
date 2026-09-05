# The install script

`assets/install.sh` is the only thing most users will ever run on their own machine, pasted from the
browser. It is served, not shipped: `installer.service` reads it once and substitutes the server URL
and the binary download base at request time, so the script a user pastes always points back at the
deployment that printed it. Nothing about the target machine is known when it is written.

## Why the agent ships as a compiled binary

The install path cannot assume a runtime. A user's VPS may have Node 18, no Node, or no permission to
install one, and every prerequisite is a step that turns a 10-second onboarding into a support
thread. `bun build --compile` embeds the runtime in the artifact, so the script's only dependency is
`curl` and a shell.

The cost is that binaries are architecture-specific, which is why the script branches on `uname -m`
and why every release publishes both `linux-x64` and `linux-arm64`.

## Invariants

**The checksum gate is not optional.** The script downloads `SHA256SUMS` alongside the binary and
refuses to install on a mismatch or a missing entry. A `curl | sh` installer is already asking for a
large amount of trust; without the gate, anyone who can tamper with the download base gets arbitrary
code execution on every machine that enrolls. If the download base is ever moved, it must publish
checksums or this script must stop working — not silently skip the check.

**The agent never installs as root.** It exists to run the user's own tooling — `git`, `gh`, `claude`
— against the user's own repositories and credentials. As root it would read the wrong home
directory and hold far more privilege than the job needs. The script exits rather than continue.

**The enrollment code arrives through the environment, not argv.** On Linux `/proc/<pid>/cmdline` is
world-readable, so a token passed as a flag is visible to every other user on the box for the
lifetime of the process; `/proc/<pid>/environ` is owner-only. `BOSUN_TOKEN` is therefore the
documented path and `--token` exists only for interactive use. The token is single-use and short-TTL,
which bounds the damage either way, but the cheap fix is worth taking.

**Linger must be enabled or the agent dies at logout.** The unit is a *user* unit, so systemd tears
down the whole user manager when the last session ends unless `loginctl enable-linger` has been run.
Failure to enable it is reported and not fatal — a machine that works until logout is still better
than a failed install — but it is the first thing to check when an agent goes offline "by itself".

## What breaks it

- Publishing a release without `SHA256SUMS`: every install fails at the checksum gate, correctly.
- A private download base: GitHub returns 404 to unauthenticated requests, so the script cannot
  fetch the binary at all. The release host has to be readable without credentials.
- Renaming the assets: the script builds the filename from the architecture, so
  `bosun-agent-linux-<arch>` is a contract with the release job, not a convention.

## The run-command guard

The script checks that the downloaded binary actually has a `run` subcommand before it writes a
systemd unit. Until the agent's socket loop lands, installing the unit anyway would leave every new
machine with a service crash-looping every 5 seconds. The guard disappears on its own once `run`
exists.
