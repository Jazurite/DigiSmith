#!/bin/sh
# Gets a Let's Encrypt STAGING certificate for pazurite.com and opencode.pazurite.com by DNS challenge (DGS-325, task 4).
# Loopback only (127.0.0.1:18443), skip_install_trust, temp data dir, no sudo, no service. The token is read like caddy-run.sh does and never printed.
# Run: sh scripts/caddy/staging-cert.sh   (CADDY_BIN defaults to the depot Caddy)
set -eu
D="${DIGISMITH_DEPOT:-$HOME/.digismith-depot}"
SRC=$(cd "$(dirname "$0")" && pwd)
CADDY_BIN="${CADDY_BIN:-$D/bin/caddy}"
val() { sed -n "s/^$1=//p" "$D/.env" | head -n 1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"; }
CLOUDFLARE_API_TOKEN=$(val CLOUDFLARE_API_TOKEN)
[ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "staging-cert: CLOUDFLARE_API_TOKEN is not set in the depot env file" >&2; exit 1; }
export CLOUDFLARE_API_TOKEN
T=$(mktemp -d "${TMPDIR:-/tmp}/caddy-staging.XXXXXX")
export XDG_DATA_HOME="$T/data" XDG_CONFIG_HOME="$T/config"
LOG="$T/caddy.log"
"$CADDY_BIN" run --config "$SRC/Caddyfile.staging" --adapter caddyfile >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT INT TERM
i=0
while [ $i -lt "${WAIT_SECONDS:-240}" ]; do
  n=$(grep -c 'certificate obtained successfully' "$LOG" || true)
  [ "$n" -ge 2 ] && { echo "OK: staging certificates obtained for both names"; grep -E 'certificate obtained successfully' "$LOG" | sed -E 's/.*"identifier":"([^"]*)".*/  obtained: \1/'; exit 0; }
  kill -0 $PID 2>/dev/null || break
  i=$((i+2)); sleep 2
done
echo "FAILED: no certificate. Caddy errors (the token is never logged):" >&2
grep -E '"level":"(error|warn)"' "$LOG" | cut -c1-600 | tail -8 >&2
exit 1
