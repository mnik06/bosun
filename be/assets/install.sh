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

# The agent's Claude credential lives here and never leaves the box. Seeded empty
# rather than left missing, so there is one documented file to edit rather than a
# guess about where the service reads its environment from.
ENV_FILE="$HOME/.bosun/env"
if [ ! -f "$ENV_FILE" ]; then
	mkdir -p "$HOME/.bosun"
	cat > "$ENV_FILE" <<'ENVFILE'
# Bosun agent environment, read by the systemd unit.
#
# Run `claude setup-token` on your OWN machine (it needs a browser, this box has
# none) and paste the one-year token it prints here:
# CLAUDE_CODE_OAUTH_TOKEN=
ENVFILE
	note "seeded $ENV_FILE — run \`claude setup-token\` on your own machine, paste the token in, then hit Refresh on the machine in bosun"
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
