#!/bin/sh
# bosun-agent installer
#
# Installs the agent, enrolls this machine and supervises it with a user-level
# systemd unit. Run it from any directory, as root or as the user the agent will
# run as. As root it creates that user and installs what only root can; the agent
# itself never runs as root.
set -eu

SERVER_URL="${BOSUN_SERVER:-__BOSUN_SERVER_URL__}"
DOWNLOAD_BASE="${BOSUN_DOWNLOAD_BASE:-__BOSUN_DOWNLOAD_BASE__}"
TOKEN="${BOSUN_TOKEN:-}"
NODE_DIST="${BOSUN_NODE_DIST:-https://nodejs.org/dist}"
AGENT_USER="${BOSUN_USER:-bosun}"
MARKER='# bosun-agent installer'

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

[ "$(uname -s)" = "Linux" ] || die "only Linux is supported (found $(uname -s))"

case "$(uname -m)" in
	x86_64 | amd64) ARCH="x64" ;;
	aarch64 | arm64) ARCH="arm64" ;;
	*) die "unsupported architecture $(uname -m)" ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# nodejs.org publishes its index newest-first, so the first LTS entry is the
# current LTS. Nothing here reads a repository: there is none yet, and the node a
# project needs is provisioned later by the agent from `.bosun/project.yaml`.
resolve_lts_version() {
	curl -fsSL "$NODE_DIST/index.json" 2>/dev/null | tr '{' '\n' | grep '"lts":"' |
		sed -n 's/.*"version":"v\([0-9.]*\)".*/\1/p' | head -n1
}

# Returns non-zero with a note instead of dying: neither phase is worthless
# without node, and a failed download is not a reason to leave a machine
# unenrolled. The tarball is checksummed for the reason the agent binary is: an
# unverified `curl | tar` is arbitrary code execution.
fetch_node() {
	version="$1"
	dest="$2"
	tarball="node-v$version-linux-$ARCH.tar.gz"

	curl -fsSL "$NODE_DIST/v$version/$tarball" -o "$TMP/$tarball" ||
		{ note "could not download $NODE_DIST/v$version/$tarball"; return 1; }
	curl -fsSL "$NODE_DIST/v$version/SHASUMS256.txt" -o "$TMP/NODESUMS" ||
		{ note "could not download node's checksum list"; return 1; }

	expected="$(awk -v a="$tarball" '$2 == a {print $1}' "$TMP/NODESUMS")"
	[ -n "$expected" ] || { note "no checksum published for $tarball"; return 1; }
	[ "$expected" = "$(sha256_of "$TMP/$tarball")" ] ||
		{ note "checksum mismatch for $tarball — refusing to install it"; return 1; }

	rm -rf "$dest.partial"
	mkdir -p "$dest.partial"

	if ! tar -xzf "$TMP/$tarball" -C "$dest.partial" --strip-components=1; then
		rm -rf "$dest.partial"
		note "could not unpack $tarball"

		return 1
	fi

	rm -rf "$dest"
	mv "$dest.partial" "$dest"
	rm -f "$TMP/$tarball"
}

# ---------------------------------------------------------------------------
# Root phase
#
# A fresh VPS usually offers nothing but root. The invariant was never "refuse
# root", it was "the agent never runs as root", so root does the few things only
# it can — system packages, the libraries headless Chromium links against, a user
# for the agent — and hands everything else to that user.
# ---------------------------------------------------------------------------

apt_install() {
	if ! command -v apt-get >/dev/null 2>&1; then
		note "no apt-get here — skipped installing git, curl, ca-certificates and the libraries headless Chromium needs; install them with this system's package manager"

		return 0
	fi

	note "installing git, curl, ca-certificates and xz-utils"

	if ! { DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null &&
		DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl ca-certificates xz-utils >/dev/null; }; then
		note "apt-get could not install git, curl, ca-certificates, xz-utils — install them yourself"
	fi
}

# The browser build itself is per user and installed later, but the shared
# libraries it links against are system packages. A fresh Ubuntu has none of
# them, and without them the build sits in the cache and never launches.
chromium_libraries() {
	command -v apt-get >/dev/null 2>&1 || return 0

	version="$(resolve_lts_version || true)"

	if [ -z "$version" ] || ! fetch_node "$version" "$TMP/node-deps"; then
		note "skipped the libraries headless Chromium needs — run \`bosun-agent setup\` as $AGENT_USER afterwards; its browser step prints the exact root command"

		return 0
	fi

	note "installing the system libraries headless Chromium needs"

	if ! PATH="$TMP/node-deps/bin:$PATH" npx -y playwright install-deps chromium >"$TMP/install-deps.log" 2>&1; then
		tail -n 5 "$TMP/install-deps.log" >&2 || true
		note "playwright install-deps chromium failed — the browser check will name what is missing"
	fi
}

ensure_agent_user() {
	[ "$AGENT_USER" != "root" ] || die "BOSUN_USER=root — the agent never runs as root; name another user"

	if id -u "$AGENT_USER" >/dev/null 2>&1; then
		note "installing for the existing user $AGENT_USER"
	elif [ -n "${BOSUN_USER:-}" ]; then
		die "BOSUN_USER=$BOSUN_USER names no user on this machine"
	else
		shell=/bin/sh
		[ ! -x /bin/bash ] || shell=/bin/bash
		useradd --create-home --shell "$shell" "$AGENT_USER" || die "could not create the user $AGENT_USER"
		note "created the user $AGENT_USER"
	fi

	[ "$(id -u "$AGENT_USER")" != "0" ] || die "$AGENT_USER has uid 0 — the agent never runs as root"
}

# Linger starts the user manager asynchronously, and `systemctl --user` fails
# until its socket exists.
wait_for_user_manager() {
	waited=0

	while [ ! -S "/run/user/$1/systemd/private" ] && [ "$waited" -lt 15 ]; do
		sleep 1
		waited=$((waited + 1))
	done
}

# Runs a command as the agent user without a login shell, which keeps the
# exported environment: that is how the enrollment code reaches the user phase
# without ever being an argument, since argv is world-readable in /proc.
as_agent_user() {
	if command -v runuser >/dev/null 2>&1; then
		runuser -u "$AGENT_USER" -- "$@"
	else
		su "$AGENT_USER" -s /bin/sh -c '"$0" "$@"' -- "$@"
	fi
}

root_phase() {
	note "running as root — the agent will be installed for the user $AGENT_USER"

	# Arrived on stdin under `curl | sh`, so there is no file to run a second time
	# as the agent user. A copy saved by hand is used as it is; otherwise the same
	# script is fetched again from the server that served it.
	script="$TMP/install.sh"

	if [ -f "$0" ] && grep -q "^$MARKER" "$0" 2>/dev/null; then
		cp "$0" "$script"
	else
		curl -fsSL "$SERVER_URL/install.sh" -o "$script" || die "could not fetch $SERVER_URL/install.sh again to run it as $AGENT_USER"
		grep -q "^$MARKER" "$script" || die "$SERVER_URL/install.sh did not return the installer"
	fi

	# The agent user reads the copy from root's temp directory.
	chmod 755 "$TMP"
	chmod 644 "$script"

	apt_install
	chromium_libraries
	ensure_agent_user

	uid="$(id -u "$AGENT_USER")"
	home="$(getent passwd "$AGENT_USER" | cut -d: -f6)"
	[ -n "$home" ] || die "could not find the home directory of $AGENT_USER"

	# Without linger the user manager exists only while somebody is logged in as
	# that user — which, for a user nobody logs in as, is never.
	if loginctl enable-linger "$AGENT_USER" >/dev/null 2>&1; then
		wait_for_user_manager "$uid"
	else
		note "could not enable linger for $AGENT_USER — the agent will not stay up without a login session"
	fi

	# `systemctl --user` finds the user manager through these. A non-login
	# `runuser` does not set them, and the unit install would fail without them.
	XDG_RUNTIME_DIR="/run/user/$uid"
	DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus"
	BOSUN_TOKEN="$TOKEN"
	BOSUN_SERVER="$SERVER_URL"
	BOSUN_DOWNLOAD_BASE="$DOWNLOAD_BASE"
	BOSUN_SKIP_SETUP=1
	BOSUN_ROOT_PHASE=1
	export XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS BOSUN_TOKEN BOSUN_SERVER BOSUN_DOWNLOAD_BASE BOSUN_SKIP_SETUP BOSUN_ROOT_PHASE

	# Root's own directory is unreadable to the agent user, and node refuses to
	# start in a working directory it cannot read.
	cd /

	as_agent_user sh "$script" || die "installing for $AGENT_USER failed — see above"

	unset BOSUN_TOKEN
	bin="${BOSUN_INSTALL_DIR:-$home/.local/bin}/bosun-agent"

	# Once, from here rather than from the user phase: this shell is the one that
	# holds the terminal the operator is typing into.
	if ( : </dev/tty ) 2>/dev/null; then
		as_agent_user "$bin" setup </dev/tty ||
			note "setup did not finish — run it again any time: runuser -u $AGENT_USER -- $bin setup"
	else
		note "no terminal attached — finish with: runuser -u $AGENT_USER -- $bin setup"
	fi
}

# ---------------------------------------------------------------------------
# User phase
#
# Everything that is the agent user's own: the agent, its node, Claude, a browser
# build, the unit. It reads nothing from any repository — the repository is
# attached from the browser later, and the agent clones it.
# ---------------------------------------------------------------------------

INSTALL_DIR="${BOSUN_INSTALL_DIR:-$HOME/.local/bin}"
BIN="$INSTALL_DIR/bosun-agent"
TOOLCHAINS="$HOME/.bosun/toolchains"
NODE_DIR=""
SERVICE_PATH=""

# Reported by name, never fatal: without root there is no installing them, and
# an enrolled machine that says what it lacks is better than no machine.
report_missing_packages() {
	missing=""

	for tool in git curl; do
		command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
	done

	[ -z "$missing" ] ||
		note "missing system packages:$missing — as root: apt-get install -y$missing (a repository cannot be cloned without git)"
}

install_agent() {
	asset="bosun-agent-linux-$ARCH"

	note "downloading $asset"
	curl -fsSL "$DOWNLOAD_BASE/$asset" -o "$TMP/$asset" || die "could not download $DOWNLOAD_BASE/$asset"
	curl -fsSL "$DOWNLOAD_BASE/SHA256SUMS" -o "$TMP/SHA256SUMS" || die "could not download the checksum list"

	expected="$(awk -v a="$asset" '$2 == a || $2 == "*"a {print $1}' "$TMP/SHA256SUMS")"
	[ -n "$expected" ] || die "no checksum published for $asset"
	[ "$expected" = "$(sha256_of "$TMP/$asset")" ] || die "checksum mismatch for $asset — refusing to install"

	mkdir -p "$INSTALL_DIR"
	mv "$TMP/$asset" "$BIN"
	chmod 755 "$BIN"
	note "installed $BIN"

	BOSUN_TOKEN="$TOKEN" "$BIN" enroll --server "$SERVER_URL"
}

# The agent's own node, not a project's: the default MCP servers are `npx`
# commands and have to start before any repository exists.
install_node() {
	version="$(resolve_lts_version || true)"

	if [ -z "$version" ]; then
		note "could not find the current LTS node at $NODE_DIST — MCP servers that run through npx will not start"

		return 0
	fi

	if [ -x "$TOOLCHAINS/node-$version/bin/node" ]; then
		note "node $version already installed"
	elif fetch_node "$version" "$TOOLCHAINS/node-$version"; then
		note "installed node $version into $TOOLCHAINS/node-$version"
	else
		return 0
	fi

	NODE_DIR="$TOOLCHAINS/node-$version"
}

install_claude() {
	if command -v claude >/dev/null 2>&1 || [ -x "$HOME/.local/bin/claude" ]; then
		note "claude already installed"

		return 0
	fi

	if ! command -v bash >/dev/null 2>&1; then
		note "no bash here to run the Claude Code installer — install claude yourself"

		return 0
	fi

	note "installing Claude Code"
	curl -fsSL https://claude.ai/install.sh | bash ||
		note "could not install Claude Code — install it with: curl -fsSL https://claude.ai/install.sh | bash"
}

install_browser() {
	[ -n "$NODE_DIR" ] || return 0

	note "installing the Chromium build sessions drive"

	if ! PATH="$NODE_DIR/bin:$PATH" npx -y playwright install chromium >"$TMP/playwright.log" 2>&1; then
		tail -n 3 "$TMP/playwright.log" >&2 || true
		note "could not install Chromium — \`bosun-agent setup\` offers to try again"
	fi
}

# `ldd` over the build is the check Playwright makes before it launches anything,
# so a library named here is one the browser tool would refuse to start without.
unresolved_libraries() {
	build="$(find "$1" -maxdepth 3 -type f \( -name headless_shell -o -name chrome-headless-shell -o -name chrome \) 2>/dev/null | head -n1)"
	[ -n "$build" ] || return 0

	ldd "$build" "$(dirname "$build")"/*.so 2>/dev/null | awk '/=> not found/ {print $1}' | sort -u | xargs
}

# A password prompt only when sudo needs one and there is a terminal to type it
# into; a non-interactive install without passwordless sudo cannot elevate.
can_sudo() {
	command -v sudo >/dev/null 2>&1 || return 1
	! sudo -n true 2>/dev/null || return 0
	( : </dev/tty ) 2>/dev/null || return 1

	note "the libraries headless Chromium links against need root — sudo will ask for your password"
	sudo -v </dev/tty
}

# Only root can add system packages, so a user install lacks them unless it asks
# for root itself. Under the root phase they went in before this user existed, and
# this user has no sudo to ask with: it only checks, and says so loudly.
chromium_libraries_as_user() {
	[ "${PLAYWRIGHT_BROWSERS_PATH:-}" != "0" ] || return 0

	cache="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
	missing="$(unresolved_libraries "$cache")"
	[ -n "$missing" ] || return 0

	if [ "${BOSUN_ROOT_PHASE:-0}" != "1" ] && [ -n "$NODE_DIR" ] && command -v apt-get >/dev/null 2>&1 && can_sudo; then
		note "installing the system libraries headless Chromium needs"

		sudo env "PATH=$NODE_DIR/bin:$PATH" npx -y playwright install-deps chromium >"$TMP/install-deps.log" 2>&1 ||
			tail -n 5 "$TMP/install-deps.log" >&2 || true

		missing="$(unresolved_libraries "$cache")"
		[ -n "$missing" ] || return 0
	fi

	note "WARNING: Chromium cannot start, missing: $missing"
	note "install them as a user with sudo: sudo env \"PATH=${NODE_DIR:-<node dir>}/bin:\$PATH\" npx -y playwright install-deps chromium"
}

seed_files() {
	mkdir -p "$HOME/.bosun"

	# The agent's Claude credential lives here and never leaves the box. Seeded
	# empty rather than left missing, so there is one documented file to edit rather
	# than a guess about where the service reads its environment from.
	env_file="$HOME/.bosun/env"

	if [ ! -f "$env_file" ]; then
		cat > "$env_file" <<'ENVFILE'
# Bosun agent environment, read by the systemd unit.
#
# Written by `bosun-agent setup`, `bosun-agent auth set` and `bosun-agent mcp add`.
# Editing by hand works too; the agent notices a change within a few seconds.
ENVFILE
		note "seeded $env_file"
	fi

	# Custom MCP servers, merged into every session alongside bosun's own. Kept
	# here rather than in a repository's .mcp.json: this file holds credentials and
	# a repository gets committed.
	mcp_file="$HOME/.bosun/mcp.json"

	if [ ! -f "$mcp_file" ]; then
		cat > "$mcp_file" <<'MCPFILE'
{
  "mcpServers": {}
}
MCPFILE
		note "seeded $mcp_file"
	fi

	chmod 700 "$HOME/.bosun"
	chmod 600 "$env_file" "$mcp_file"
}

# `systemctl --user` sources no shell rc, so the unit sees a minimal PATH. It is
# resolved here, with bosun's own node and ~/.local/bin — where Claude Code
# installs itself — first, so the service finds what this install put down even
# though this shell has not picked it up.
resolve_service_path() {
	SERVICE_PATH="$INSTALL_DIR:$HOME/.local/bin"
	[ -z "$NODE_DIR" ] || SERVICE_PATH="$NODE_DIR/bin:$SERVICE_PATH"

	for tool in git gh claude; do
		tool_path="$(command -v "$tool" 2>/dev/null || true)"
		[ -n "$tool_path" ] || continue
		tool_dir="$(dirname "$tool_path")"

		case ":$SERVICE_PATH:" in
			*":$tool_dir:"*) ;;
			*) SERVICE_PATH="$SERVICE_PATH:$tool_dir" ;;
		esac
	done

	SERVICE_PATH="$SERVICE_PATH:/usr/local/bin:/usr/bin:/bin"
}

install_service() {
	if [ "${BOSUN_SKIP_SERVICE:-0}" = "1" ]; then
		note "skipping service install (BOSUN_SKIP_SERVICE=1)"

		return 0
	fi

	if ! command -v systemctl >/dev/null 2>&1; then
		note "no systemd here — start the agent yourself with: $BIN run"

		return 0
	fi

	unit_dir="$HOME/.config/systemd/user"
	mkdir -p "$unit_dir"
	cat > "$unit_dir/bosun-agent.service" <<UNIT
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
# continue, not the default stop: the kernel killing one process in this unit
# for memory must not stop the agent and every session it holds. Bullets run in
# scopes of their own and are held to their limits there first.
OOMPolicy=continue

[Install]
WantedBy=default.target
UNIT

	uid="$(id -u)"
	user="$(id -un)"

	# `su <user>` without `-` keeps the caller's XDG_RUNTIME_DIR — root's
	# /run/user/0, which this user cannot enter — and `systemctl --user` then fails
	# with "Operation not permitted". Only this user's own directory reaches its
	# manager.
	XDG_RUNTIME_DIR="/run/user/$uid"
	DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus"
	export XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS

	# Without linger the user manager is torn down on logout, taking the agent with
	# it. Under the root phase it is already enabled, and this is a no-op.
	if loginctl enable-linger "$user" >/dev/null 2>&1; then
		wait_for_user_manager "$uid"
	else
		note "could not enable linger — the agent will stop when you log out"
	fi

	if ! systemctl --user daemon-reload; then
		note "no user manager is running for $user — as root: loginctl enable-linger $user; then as $user: XDG_RUNTIME_DIR=/run/user/$uid systemctl --user enable --now bosun-agent.service"

		return 0
	fi

	# restart, not only enable --now: a re-run replaces the binary and the unit, and
	# an agent left running is still the old build with the old config.
	systemctl --user enable bosun-agent.service >/dev/null 2>&1 || true

	if ! systemctl --user restart bosun-agent.service; then
		note "the agent did not start — see: journalctl --user -u bosun-agent"

		return 0
	fi

	note "agent running. Follow it with: journalctl --user -u bosun-agent -f"
}

# Once per file; the trailing marker is how a re-run knows the line is there.
append_to_rc_files() {
	for rc in "$HOME/.bashrc" "$HOME/.profile"; do
		! grep -qF "$2" "$rc" 2>/dev/null || continue
		printf '\n%s %s\n' "$1" "$2" >> "$rc"
	done
}

# Only a login shell puts ~/.local/bin on the PATH, and only where ~/.profile
# says so. `su <user>` without `-` keeps root's PATH and reads ~/.bashrc alone, so
# `bosun-agent` was not found there although the agent itself was running. The
# same shell has no XDG_RUNTIME_DIR, or root's, and every `systemctl --user` this
# script prints fails with "Failed to connect to user scope bus".
add_to_shell_path() {
	append_to_rc_files \
		"case \":\$PATH:\" in *\":$INSTALL_DIR:\"*) ;; *) PATH=\"$INSTALL_DIR:\$PATH\" ;; esac" \
		'# added by the bosun-agent installer'
	append_to_rc_files \
		'[ "${XDG_RUNTIME_DIR:-}" = "/run/user/$(id -u)" ] || [ ! -d "/run/user/$(id -u)" ] || export XDG_RUNTIME_DIR="/run/user/$(id -u)"' \
		'# bosun-agent installer: user manager'

	case ":$PATH:" in
		*":$INSTALL_DIR:"*) ;;
		*) note "added $INSTALL_DIR to the PATH in ~/.bashrc and ~/.profile — open a new shell to run bosun-agent directly" ;;
	esac
}

user_phase() {
	cd "$HOME" 2>/dev/null || cd /

	report_missing_packages
	install_agent
	install_node
	install_claude
	install_browser
	chromium_libraries_as_user
	seed_files
	resolve_service_path
	install_service
	add_to_shell_path

	[ "${BOSUN_SKIP_SETUP:-0}" != "1" ] || return 0

	# Stdin is the `curl` pipe, so the wizard's prompts read from the terminal
	# itself. Without one there is nobody to answer them, and that is not a failure.
	if ( : </dev/tty ) 2>/dev/null; then
		PATH="$SERVICE_PATH" "$BIN" setup </dev/tty ||
			note "setup did not finish — run it again any time: $BIN setup"
	else
		note "no terminal attached — finish with: $BIN setup"
	fi
}

if [ "$(id -u)" = "0" ]; then
	root_phase
else
	user_phase
fi
