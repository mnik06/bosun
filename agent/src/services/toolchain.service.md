# Toolchains: the node and package manager a config names

`install.sh` used to read the repository's `.nvmrc`, `engines.node` and `packageManager` at install
time and put one node on the unit's `PATH`. That broke twice over: the repository no longer exists when
the installer runs, and reading only the root is exactly what fails on a repository whose packages each
carry their own `.nvmrc` and have no root `package.json`. The version now comes from
`.bosun/project.yaml`'s `toolchain`, and the agent provisions it when a worktree, a stack or a session
needs it.

## Layout

```
~/.bosun/toolchains/
  node-24.15.0/            the release tarball, unpacked (bin/node, bin/npm, …)
  pnpm-11.8.0/
    package/               the registry tarball, unpacked
    bin/pnpm               shim: exec '<node-24.15.0>/bin/node' '<package>/bin/pnpm.mjs' "$@"
```

`ensure` returns those `bin` directories and callers put them first on `PATH` with
`withToolchainPath` — for setup steps, stack apps and the `claude` session alike, so all three run the
same node. The package manager's shims come before node's own `bin`: node ships an npm, and behind it a
config naming `npm@11` would run whichever npm that node bundled. The agent's own LTS node from the installer is a separate directory that nothing here
touches.

## Invariants

- **Nothing is installed unverified.** node is checked against `SHASUMS256.txt` from the same release
  directory; a package manager against the registry's `dist.integrity`, and only a `sha512` entry
  counts. A missing checksum is a refusal, never a skip. Every session, setup step and app on the
  machine runs these binaries, so an unverified tarball is arbitrary code execution on the box.
- **A directory under its final name is complete.** Tarballs are unpacked into a `.tmp-*` directory
  beside the target and renamed into place, so a crash mid-extract leaves litter, not a toolchain that
  looks present and fails on its first command. A node directory is reused only if its `bin/node
  --version` answers the exact version; a package manager only if its `package.json` says that version.
- **One download per version at a time.** Concurrent `ensure` calls for the same node or package
  manager share one in-flight promise. A rename that loses a race to another process is accepted when
  the winner left a usable directory.
- **Shims name their node.** A shim is rewritten whenever its content differs, because a config that
  moves to a newer node keeps the same package-manager directory.
- **Failures read as one line.** The detail names the step — the download and its status, the checksum,
  the extraction — and never carries a stack, because it becomes a queue's failure reason.

## What it does not do

- Version ranges. The schema accepts only exact versions: a range resolves to whatever is newest the day
  a machine provisions it, and two machines on one config would build differently.
- Yarn Berry. `yarn@2+` is not distributed as a plain registry package with a `bin`; a config naming it
  fails with "declares no executable" rather than installing something else.
- Garbage collection. Old versions stay until `~/.bosun` is removed with the machine.
