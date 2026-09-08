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

## The toolchain the repository asks for

The agent needs no runtime; everything it runs does. A session installs the project, typechecks it,
runs its tests and starts its dev server, and all of that is somebody else's node and somebody else's
package manager. The script therefore provisions both, from the enrolled repository rather than from
a prompt or a default:

- **node** — `.nvmrc`, then `.node-version`, then `engines.node`. The version files come first
  because they are what a developer's own shell obeys; a machine that disagrees with them builds
  differently to every laptop on the team. `>=` is honoured as a floor, an exact or partial version
  as a prefix, and `lts/*` or nothing at all resolves to the current LTS.
- **the package manager** — `packageManager` if the repo declares one, which is also what corepack
  reads, so the version is pinned rather than approximated. Otherwise the lockfile decides: a repo
  with `pnpm-lock.yaml` cannot be installed with npm whatever the field says.

Node is unpacked into `~/.bosun/node` rather than installed system-wide. The script refuses to run as
root, so there is no system prefix to write to, and a bosun-owned copy cannot break whatever the box
already had. That directory goes on the front of the unit's `PATH`, so the service uses the version
the repository asked for even when an older node is on the system path.

The tarball is checksummed against `SHASUMS256.txt` from the same release directory, for the reason
the agent binary is: an unverified `curl | tar` is arbitrary code execution on every machine that
enrolls.

Preflight does **not** check for node or a package manager. It used to, and it was reporting a
prerequisite the installer is responsible for — a red check nobody could act on from the browser.

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
