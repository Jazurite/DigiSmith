#!/bin/sh
# Starts the depot Caddy for the front door (DGS-325). Gives Caddy only its own variables from .env, never the rest of the file.
set -eu
D="${DIGISMITH_DEPOT:-$HOME/.digismith-depot}"
val() { sed -n "s/^$1=//p" "$D/.env" | head -n 1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"; }   # tolerates CR and one pair of quotes
CLOUDFLARE_API_TOKEN=$(val CLOUDFLARE_API_TOKEN)
[ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "caddy-run: CLOUDFLARE_API_TOKEN is not set in the depot env file" >&2; exit 1; }
export CLOUDFLARE_API_TOKEN
NEXUS_BASIC_AUTH_HASH=$(val NEXUS_BASIC_AUTH_HASH)
[ -z "$NEXUS_BASIC_AUTH_HASH" ] || export NEXUS_BASIC_AUTH_HASH
export XDG_DATA_HOME="$D/caddy/data" XDG_CONFIG_HOME="$D/caddy/config"
exec "$D/bin/caddy" run --config "$D/caddy/Caddyfile" --adapter caddyfile
