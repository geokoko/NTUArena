#!/usr/bin/env bash
# Boots the full Docker Compose stack in a throwaway project and checks that
# it works end to end through Nginx: the frontend is served, an account can
# register and log in, and a four-player Arena tournament pairs, scores and
# survives a full stack restart with its pairing worker still running.
# The stack and its volume are removed on exit.
#
# Usage: APP_MODE=prod scripts/smoke-test.sh   (APP_MODE=dev for the dev server)
# Needs docker compose, curl and jq. Values come from .env.example unless
# ENV_FILE is set. The stack uses the fixed container names and port 80 from
# docker-compose.yml, so stop any other NTUArena stack first.
# SMOKE_KEEP=1 leaves the stack running for inspection.
set -euo pipefail

cd "$(dirname "$0")/.."

export APP_MODE="${APP_MODE:-prod}"
case "$APP_MODE" in
	prod) export NODE_ENV=production CORS_ORIGIN="${CORS_ORIGIN:-http://localhost}" ;;
	dev) export NODE_ENV=development ;;
	*) echo "APP_MODE must be prod or dev" >&2; exit 2 ;;
esac
# The scenario acts as the mock admin that AUTH_ENABLED=false provides.
export AUTH_ENABLED=false
export PAIRING_SETTLE_MS="${PAIRING_SETTLE_MS:-2000}"
ENV_FILE="${ENV_FILE:-.env.example}"
PROJECT="${SMOKE_PROJECT:-ntuarena-smoke}"
BASE="${BASE:-http://localhost}"

compose() { docker compose -p "$PROJECT" --env-file "$ENV_FILE" "$@"; }

log() { echo "==> $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

cleanup() {
	local status=$?
	if [ "$status" -ne 0 ]; then
		compose ps -a || true
		compose logs --no-color --tail=150 || true
	fi
	if [ "${SMOKE_KEEP:-0}" != 1 ]; then
		compose down -v --remove-orphans >/dev/null 2>&1 || true
	fi
	exit "$status"
}
trap cleanup EXIT

api() {
	local method="$1" path="$2" body="${3:-}"
	if [ -n "$body" ]; then
		curl -fsS -X "$method" "$BASE$path" -H 'Content-Type: application/json' -d "$body"
	else
		curl -fsS -X "$method" "$BASE$path"
	fi
}

# wait_until <what> <seconds> <command...>
wait_until() {
	local what="$1" timeout="$2"
	shift 2
	local deadline=$((SECONDS + timeout))
	until "$@" >/dev/null 2>&1; do
		[ "$SECONDS" -lt "$deadline" ] || fail "timed out after ${timeout}s waiting for $what"
		sleep 2
	done
}

games() { api GET "/api/tournaments/$tournament/games"; }
active_games() { games | jq '[.[] | select(.isFinished | not)] | length'; }
game_count_is() { [ "$(games | jq length)" -eq "$1" ] && [ "$(active_games)" -eq "$2" ]; }

check_frontend() {
	local index scripts
	index="$(curl -fsS "$BASE/")"
	grep -q '<div id="root">' <<<"$index" || fail "index.html has no React root"
	scripts="$(grep -oE '<script[^>]+src="/[^"]+"' <<<"$index" | sed -E 's/.*src="([^"]+)"/\1/')"
	[ -n "$scripts" ] || fail "index.html references no scripts"
	for script in $scripts; do
		curl -fsS -o /dev/null "$BASE$script" || fail "frontend script $script is not served"
	done
	# The dev server serves the bundle even when compilation failed.
	if [ "$APP_MODE" = dev ] && compose logs --no-color frontend | grep -q 'Failed to compile'; then
		fail "the React dev server failed to compile"
	fi
}

log "Building and starting the $APP_MODE stack"
compose up -d --build

wait_until "the backend through Nginx" 300 curl -fsS "$BASE/health"
wait_until "the frontend through Nginx" 300 curl -fsS "$BASE/"
check_frontend
log "Frontend served"

suffix="$(date +%s)"
api POST /api/auth/register "{\"username\":\"smoke$suffix\",\"email\":\"smoke$suffix@example.com\",\"password\":\"smoke-password-1\"}" >/dev/null
token="$(api POST /api/auth/login "{\"username\":\"smoke$suffix\",\"password\":\"smoke-password-1\"}" | jq -r '.token // empty')"
[ -n "$token" ] || fail "login returned no token"
log "Registered and logged in"

user_ids=()
for entry in Anna:1850 Nikos:1790 Eleni:1720 Giorgos:1680; do
	name="${entry%%:*}"
	handle="$(tr '[:upper:]' '[:lower:]' <<<"$name")$suffix"
	user_ids+=("$(api POST /api/admin/users "{\"username\":\"$handle\",\"email\":\"$handle@example.com\",\"role\":\"player\",\"globalElo\":${entry#*:},\"firstName\":\"$name\",\"lastName\":\"Smoke\"}" | jq '.id')")
done
tournament="$(api POST /api/admin/tournaments/create '{"name":"Smoke test","tournLocation":"CI","timeControl":"5+3","durationMs":3600000}' | jq -r '.id')"
api POST "/api/admin/tournaments/$tournament/participants/bulk-add" "{\"userIds\":[$(IFS=,; echo "${user_ids[*]}")]}" >/dev/null
api POST "/api/admin/tournaments/$tournament/start" >/dev/null
wait_until "both boards to be paired" 60 game_count_is 2 2
log "Tournament $tournament paired two boards"

board_game() { games | jq -r --argjson board "$1" '.[] | select((.isFinished | not) and .boardNumber == $board) | .id'; }
first="$(board_game 1)"
second="$(board_game 2)"
[ -n "$first" ] && [ -n "$second" ] || fail "expected active games on boards 1 and 2"

api POST "/api/games/$first/result" '{"result":"white"}' >/dev/null
# Its players just met, so they must not be paired again on their own.
sleep $((PAIRING_SETTLE_MS / 1000 + 3))
game_count_is 2 1 || fail "expected one active game after the first result"
standings() { api GET "/api/tournaments/$tournament/standings" | jq -c '[.[] | [.score, .wins, .draws, .losses]] | sort'; }
before_restart="$(standings)"
[ "$before_restart" = '[[0,0,0,0],[0,0,0,0],[0,0,0,1],[1,1,0,0]]' ] || fail "unexpected standings $before_restart"
log "Result recorded"

log "Restarting the stack on the same volume"
compose down
compose up -d
wait_until "the backend after restart" 300 curl -fsS "$BASE/health"
[ "$(standings)" = "$before_restart" ] || fail "standings changed across the restart: $(standings)"
game_count_is 2 1 || fail "the active game did not survive the restart"

api POST "/api/games/$second/result" '{"result":"draw"}' >/dev/null
# All four players are free and have new opponents, so the restarted worker
# has to pair them.
wait_until "the restarted worker to pair new opponents" 60 game_count_is 4 2
[ "$(standings)" = '[[0,0,0,1],[0.5,0,1,0],[0.5,0,1,0],[1,1,0,0]]' ] || fail "unexpected standings $(standings)"
log "Stack survived the restart and kept pairing"

log "Smoke test passed ($APP_MODE)"
