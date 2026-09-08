#!/bin/sh
# Bosun agent installer. Downloads the agent binary, enrolls this machine, and
# supervises it with a user-level systemd unit.
set -eu

SERVER_URL="${BOSUN_SERVER:-__BOSUN_SERVER_URL__}"
DOWNLOAD_BASE="${BOSUN_DOWNLOAD_BASE:-__BOSUN_DOWNLOAD_BASE__}"
TOKEN="${BOSUN_TOKEN:-}"
INSTALL_DIR="${BOSUN_INSTALL_DIR:-$HOME/.local/bin}"
REPO_PATH="${BOSUN_REPO_PATH:-$PWD}"
BIN="$INSTALL_DIR/bosun-agent"
NODE_DIR="$HOME/.bosun/node"
NODE_DIST="${BOSUN_NODE_DIST:-https://nodejs.org/dist}"

die() { echo "bosun: $1" >&2; exit 1; }
note() { echo "bosun: $1"; }

sha256_of() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | awk '{print $1}'
	else
		die "no sha256sum or shasum available to verify the download"
	fi
}

[ -n "$TOKEN" ] || die "no enrollment code. Rerun as: curl -fsSL $SERVER_URL/install.sh | BOSUN_TOKEN=<code> sh"

# The agent runs the user's own tooling (git, gh, claude) against the user's own
# repos and credentials. As root it would both be more dangerous and see the
# wrong home directory.
[ "$(id -u)" != "0" ] || die "refusing to install as root — run as the user that owns the repos"

[ "$(uname -s)" = "Linux" ] || die "only Linux is supported (found $(uname -s))"

case "$(uname -m)" in
	x86_64 | amd64) ARCH="x64" ;;
	aarch64 | arm64) ARCH="arm64" ;;
	*) die "unsupported architecture $(uname -m)" ;;
esac

ASSET="bosun-agent-linux-$ARCH"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

note "downloading $ASSET"
curl -fsSL "$DOWNLOAD_BASE/$ASSET" -o "$TMP/$ASSET" || die "could not download $DOWNLOAD_BASE/$ASSET"
curl -fsSL "$DOWNLOAD_BASE/SHA256SUMS" -o "$TMP/SHA256SUMS" || die "could not download the checksum list"

EXPECTED="$(awk -v a="$ASSET" '$2 == a || $2 == "*"a {print $1}' "$TMP/SHA256SUMS")"
[ -n "$EXPECTED" ] || die "no checksum published for $ASSET"

ACTUAL="$(sha256_of "$TMP/$ASSET")"
[ "$EXPECTED" = "$ACTUAL" ] || die "checksum mismatch for $ASSET — refusing to install"

mkdir -p "$INSTALL_DIR"
mv "$TMP/$ASSET" "$BIN"
chmod 755 "$BIN"
note "installed $BIN"

BOSUN_TOKEN="$TOKEN" "$BIN" enroll --server "$SERVER_URL" --repo "$REPO_PATH"

# ---------------------------------------------------------------------------
# The toolchain the repository asks for
#
# The agent itself needs no runtime — it is a compiled binary — but every session
# it runs does: the project's install, its typecheck, its tests, its dev server.
# Which node and which package manager those need is stated by the repository, so
# it is read from there rather than guessed at or asked about.
# ---------------------------------------------------------------------------

PKG_JSON="$REPO_PATH/package.json"

# The first of `.nvmrc`, `.node-version`, `engines.node` that exists wins, in that
# order: the version files are what a developer's own shell obeys, so a machine
# that disagrees with them is a machine that builds differently to every laptop.
node_request() {
	if [ -f "$REPO_PATH/.nvmrc" ]; then
		head -n1 "$REPO_PATH/.nvmrc"
	elif [ -f "$REPO_PATH/.node-version" ]; then
		head -n1 "$REPO_PATH/.node-version"
	elif [ -f "$PKG_JSON" ]; then
		tr -d ' \t\n' < "$PKG_JSON" | sed -n 's/.*"engines":{[^}]*"node":"\([^"]*\)".*/\1/p'
	fi
}

# `>=24.15`, `^24`, `v24.15.0`, `24` and `lts/*` all reduce to the digits, plus a
# note of whether newer is acceptable. `lts/*` and anything unparseable leave it
# empty, which means "the current LTS".
NODE_REQ="$(node_request | tr -d ' \r')"
case "$NODE_REQ" in
	'>='*) NODE_MIN=1 ;;
	*) NODE_MIN=0 ;;
esac
NODE_WANT="$(printf '%s' "$NODE_REQ" | sed -n 's/^[^0-9]*\([0-9][0-9.]*\).*/\1/p' | sed 's/\.$//')"
NODE_MAJOR="${NODE_WANT%%.*}"

node_major_of() { printf '%s' "$1" | sed 's/^v//' | cut -d. -f1; }

# Satisfied is not the same as identical. A pinned `24.15.0` wants that build; a
# `>=24.15` wants anything from 24 up, and reinstalling under it would replace a
# working newer node with an older one.
node_satisfies() {
	have="$(printf '%s' "$1" | sed 's/^v//')"

	[ -n "$NODE_WANT" ] || return 0

	if [ "$NODE_MIN" = "1" ]; then
		[ "$(node_major_of "$have")" -ge "$NODE_MAJOR" ] 2>/dev/null && return 0

		return 1
	fi

	case "$have" in
		"$NODE_WANT" | "$NODE_WANT".*) return 0 ;;
	esac

	return 1
}

# nodejs.org publishes its index newest-first, so the first line that matches is
# the newest build satisfying the request.
resolve_node_version() {
	index="$(curl -fsSL "$NODE_DIST/index.json" 2>/dev/null)" || return 1

	if [ -z "$NODE_WANT" ]; then
		printf '%s' "$index" | tr '{' '\n' | grep '"lts":"' |
			sed -n 's/.*"version":"v\([0-9.]*\)".*/\1/p' | head -n1

		return 0
	fi

	esc="$(printf '%s' "$NODE_WANT" | sed 's/\./\\./g')"

	if [ "$NODE_MIN" = "1" ]; then
		printf '%s' "$index" | tr '{' '\n' | sed -n 's/.*"version":"v\([0-9.]*\)".*/\1/p' |
			while read -r candidate; do
				[ "$(node_major_of "$candidate")" -ge "$NODE_MAJOR" ] 2>/dev/null || continue
				printf '%s\n' "$candidate"
				break
			done

		return 0
	fi

	printf '%s' "$index" | tr '{' '\n' |
		sed -n "s/.*\"version\":\"v\($esc\|$esc\.[0-9.]*\)\".*/\1/p" | head -n1
}

install_node() {
	version="$(resolve_node_version)"
	[ -n "$version" ] || die "could not work out which node to install for ${NODE_REQ:-this repo}"

	tarball="node-v$version-linux-$ARCH.tar.gz"
	note "installing node $version into $NODE_DIR"

	curl -fsSL "$NODE_DIST/v$version/$tarball" -o "$TMP/$tarball" ||
		die "could not download $NODE_DIST/v$version/$tarball"
	curl -fsSL "$NODE_DIST/v$version/SHASUMS256.txt" -o "$TMP/NODESUMS" ||
		die "could not download node's checksum list"

	expected="$(awk -v a="$tarball" '$2 == a {print $1}' "$TMP/NODESUMS")"
	[ -n "$expected" ] || die "no checksum published for $tarball"
	[ "$expected" = "$(sha256_of "$TMP/$tarball")" ] ||
		die "checksum mismatch for $tarball — refusing to install"

	rm -rf "$NODE_DIR"
	mkdir -p "$NODE_DIR"
	tar -xzf "$TMP/$tarball" -C "$NODE_DIR" --strip-components=1
}

# `packageManager` is the declaration corepack itself reads, so it is the one that
# matches what the repository is developed with. The lockfile is the fallback,
# because a repo with a pnpm lock and no field still cannot be installed with npm.
package_manager_request() {
	if [ -f "$PKG_JSON" ]; then
		spec="$(tr -d ' \t\n' < "$PKG_JSON" | sed -n 's/.*"packageManager":"\([^"]*\)".*/\1/p')"

		if [ -n "$spec" ]; then
			printf '%s' "$spec"

			return 0
		fi
	fi

	if [ -f "$REPO_PATH/pnpm-lock.yaml" ]; then
		printf 'pnpm'
	elif [ -f "$REPO_PATH/yarn.lock" ]; then
		printf 'yarn'
	fi
}

install_package_manager() {
	spec="$1"
	name="${spec%%@*}"

	# An unpinned request is satisfied by whatever is already there; a pinned one
	# is not, because the version is the point of pinning it.
	if [ "$name" = "$spec" ] && command -v "$name" >/dev/null 2>&1; then
		return 0
	fi

	# corepack is what the `packageManager` field is for, and it pins the exact
	# version. It is unbundled from newer node, so npm is the fallback rather than
	# the failure.
	if command -v corepack >/dev/null 2>&1; then
		corepack enable --install-directory "$NODE_DIR/bin" >/dev/null 2>&1 || true

		if corepack prepare "$spec" --activate >/dev/null 2>&1; then
			note "activated $spec with corepack"

			return 0
		fi
	fi

	if npm install -g "$spec" >/dev/null 2>&1; then
		note "installed $spec with npm"

		return 0
	fi

	note "could not install $spec — install it yourself, or sessions will fail at the install step"
}

provision_toolchain() {
	if command -v node >/dev/null 2>&1 && node_satisfies "$(node --version)"; then
		note "node $(node --version | sed 's/^v//') already satisfies ${NODE_REQ:-this repo}"
	elif [ -x "$NODE_DIR/bin/node" ] && node_satisfies "$("$NODE_DIR/bin/node" --version)"; then
		note "node $("$NODE_DIR/bin/node" --version | sed 's/^v//') already installed for bosun"
	else
		install_node
	fi

	if [ -x "$NODE_DIR/bin/node" ]; then
		PATH="$NODE_DIR/bin:$PATH"
		export PATH
	fi

	pm="$(package_manager_request)"
	[ -n "$pm" ] || return 0

	install_package_manager "$pm"
}

provision_toolchain


# The agent's Claude credential lives here and never leaves the box. Seeded empty
# rather than left missing, so there is one documented file to edit rather than a
# guess about where the service reads its environment from.
ENV_FILE="$HOME/.bosun/env"
if [ ! -f "$ENV_FILE" ]; then
	mkdir -p "$HOME/.bosun"
	cat > "$ENV_FILE" <<'ENVFILE'
# Bosun agent environment, read by the systemd unit.
#
# Written by `bosun-agent auth set` and `bosun-agent mcp add`. Editing by hand
# works too; the agent re-reads this file on every Refresh.
ENVFILE
	note "seeded $ENV_FILE"
fi
# Custom MCP servers, merged into every planning session alongside bosun's own.
# Kept here rather than in the repo's .mcp.json: this file holds credentials and
# the repo gets committed.
MCP_FILE="$HOME/.bosun/mcp.json"
if [ ! -f "$MCP_FILE" ]; then
	mkdir -p "$HOME/.bosun"
	cat > "$MCP_FILE" <<'MCPFILE'
{
  "mcpServers": {}
}
MCPFILE
	note "seeded $MCP_FILE — add MCP servers there; put their tokens in $ENV_FILE and reference them as \${VAR}, then hit Refresh in bosun"
fi

chmod 700 "$HOME/.bosun"
chmod 600 "$ENV_FILE"
chmod 600 "$MCP_FILE"

case ":$PATH:" in
	*":$INSTALL_DIR:"*) ;;
	*) note "add $INSTALL_DIR to your PATH to run bosun-agent directly" ;;
esac

if [ "${BOSUN_SKIP_SERVICE:-0}" = "1" ]; then
	note "skipping service install (BOSUN_SKIP_SERVICE=1)"
	exit 0
fi

if ! command -v systemctl >/dev/null 2>&1; then
	note "no systemd here — start the agent yourself with: $BIN run"
	exit 0
fi

# Guard against installing a unit for a build that predates the run command.
if ! "$BIN" --help 2>/dev/null | grep -qE '^[[:space:]]+run'; then
	note "this agent build has no 'run' command yet — skipping the service"
	exit 0
fi

# `systemctl --user` sources no shell rc, so the unit sees a minimal PATH and
# none of the tooling the agent shells out to. Resolving the tools here, in the
# shell that is doing the install, is what makes a machine that passes preflight
# by hand also pass it under the service.
SERVICE_PATH="$INSTALL_DIR"
if [ -x "$NODE_DIR/bin/node" ]; then
	SERVICE_PATH="$NODE_DIR/bin:$SERVICE_PATH"
fi
for tool in node pnpm git gh claude; do
	tool_path="$(command -v "$tool" 2>/dev/null || true)"
	[ -n "$tool_path" ] || continue
	tool_dir="$(dirname "$tool_path")"
	case ":$SERVICE_PATH:" in
		*":$tool_dir:"*) ;;
		*) SERVICE_PATH="$SERVICE_PATH:$tool_dir" ;;
	esac
done
SERVICE_PATH="$SERVICE_PATH:/usr/local/bin:/usr/bin:/bin"

command -v claude >/dev/null 2>&1 || note "claude is not on this shell's PATH — planning sessions will fail preflight"

UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/bosun-agent.service" <<UNIT
[Unit]
Description=Bosun agent
After=network-online.target

[Service]
ExecStart=$BIN run
Environment=PATH=$SERVICE_PATH
# Leading '-' so a machine with no credential yet still starts and reports that
# through preflight, instead of the unit refusing to launch with nothing to see.
EnvironmentFile=-%h/.bosun/env
# on-failure, not always: deleting a machine in bosun makes the agent disable
# this unit and exit 0, and Restart=always would fight that and restart-loop it
# against a 401 forever. A crash still restarts.
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT

# Without linger the user manager is torn down on logout, taking the agent with it.
loginctl enable-linger "$(id -un)" >/dev/null 2>&1 || note "could not enable linger — the agent will stop when you log out"

systemctl --user daemon-reload
systemctl --user enable --now bosun-agent.service

note "agent running. Follow it with: journalctl --user -u bosun-agent -f"
note ""
note "Next: give this machine a Claude credential."
note "  1. on your own machine (it needs a browser):  claude setup-token"
note "  2. here:                                      $BIN auth set"
