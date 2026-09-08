#!/usr/bin/env bash
# Deploy the bosun backend to Fly.
set -euo pipefail

cd "$(dirname "$0")/.."

ALLOW_DIRTY=0
SKIP_MIGRATIONS=0

usage() {
	cat <<'USAGE'
Usage: pnpm deploy [options]

  --allow-dirty       deploy with uncommitted changes in be/
  --skip-migrations   do not run drizzle-kit migrate before deploying
  -h, --help          show this

Runs unattended. What it is about to migrate and deploy is printed rather than
asked about, so read the two lines under "Applying migrations" and "Deploying"
if you want to know before it happens. The checks that can refuse — a dirty
tree, a failing preflight, a variable missing on Fly — still refuse.
USAGE
}

while [ $# -gt 0 ]; do
	case "$1" in
		--allow-dirty) ALLOW_DIRTY=1 ;;
		--skip-migrations) SKIP_MIGRATIONS=1 ;;
		# Accepted and ignored: it used to suppress the prompts that no longer exist,
		# and failing on it would break the habit of typing it.
		--yes | -y) ;;
		-h | --help) usage; exit 0 ;;
		*) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
	esac
	shift
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\033[31mdeploy: %s\033[0m\n' "$1" >&2; exit 1; }

APP="$(awk -F'"' '/^app *=/ {print $2; exit}' fly.toml)"
[ -n "$APP" ] || die 'could not read the app name from fly.toml'

step "Preparing to deploy $APP"

command -v fly >/dev/null 2>&1 || die 'flyctl is not installed — https://fly.io/docs/flyctl/install'
fly auth whoami >/dev/null 2>&1 || die 'not logged in to Fly — run: fly auth login'

if [ "$ALLOW_DIRTY" = "0" ] && [ -n "$(git status --porcelain -- .)" ]; then
	git status --short -- .
	die 'uncommitted changes in be/ — commit them, or pass --allow-dirty'
fi

step 'Running preflight'
pnpm preflight

# The schema is the only list of what the server needs to boot, so it is read
# from there rather than restated here — a hardcoded copy would drift silently
# and the symptom would be a crash-looping deploy.
step 'Checking the environment Fly will start it with'

required="$(pnpm exec ts-node -r tsconfig-paths/register -e '
import { EnvSchema } from "src/types/EnvSchema";
const result = EnvSchema.safeParse({});
const names = result.success ? [] : [...new Set(result.error.issues.map((i) => String(i.path[0])))];
console.log(names.join("\n"));
')"

provided="$(
	awk '/^\[env\]/{f=1;next} /^\[/{f=0} f && /=/{gsub(/[ \t]/,"");split($0,a,"=");print a[1]}' fly.toml
	fly secrets list --app "$APP" --json 2>/dev/null |
		node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{for(const x of JSON.parse(s||"[]"))console.log(x.name)})'
)"

missing=''
for name in $required; do
	printf '%s\n' "$provided" | grep -qx -- "$name" || missing="$missing $name"
done

if [ -n "$missing" ]; then
	printf 'missing on Fly:%s\n\n' "$missing" >&2
	printf 'set them first, for example:\n  fly secrets set --app %s%s\n' "$APP" \
		"$(for n in $missing; do printf ' %s=...' "$n"; done)" >&2
	die 'the server validates its environment at startup and would crash-loop without these'
fi

echo "all $(printf '%s\n' "$required" | grep -c .) required variables are present"

if [ "$SKIP_MIGRATIONS" = "0" ]; then
	step 'Applying migrations'

	target="$(node -e '
		require("dotenv").config();
		const url = new URL(process.env.DATABASE_URL);
		console.log(`${url.hostname}:${url.port}${url.pathname}`);
	')"

	# The URL comes from the local .env, which is not necessarily the database Fly
	# is pointed at. Nothing here can tell the difference, so it is named loudly and
	# left in the log — it is the only trace of which database was migrated.
	echo "migrating $target"
	pnpm db:migration:run
fi

# --ha=false is load-bearing, not a cost decision: the agent and browser socket
# registries live in process memory, so a second machine would split them and a
# machine would be online on one instance and unreachable on the other. See
# src/services/sockets/registry.service.md.
step 'Deploying'
echo "deploying $APP from $(git rev-parse --short HEAD)"
fly deploy --app "$APP" --ha=false

step 'Verifying'

host="$(fly status --app "$APP" --json 2>/dev/null |
	node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{try{process.stdout.write(JSON.parse(s).Hostname??"")}catch{}})')"
host="${host:-$APP.fly.dev}"

health="$(curl -fsS --retry 20 --retry-delay 3 --retry-all-errors "https://$host/health")" ||
	die "health check never passed — inspect with: fly logs --app $APP"

case "$health" in
	*'"status":"ok"'*) echo "https://$host/health -> $health" ;;
	*) die "health endpoint answered with $health" ;;
esac

running="$(fly status --app "$APP" --json 2>/dev/null |
	node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{const m=JSON.parse(s).Machines??[];console.log(m.filter((x)=>x.state==="started").length)})')"

if [ "$running" != "1" ]; then
	printf '\033[33mwarning: %s machines are running. The socket registries are per-process, so\n' "$running"
	printf 'machines will appear online on one instance and unreachable on the other.\033[0m\n'
fi

step "Deployed $APP"
