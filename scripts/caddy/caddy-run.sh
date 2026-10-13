#!/bin/sh
# Starts the depot Caddy for the front door (DGS-325). Gives Caddy only its own variables from .env, never the rest of the file.
set -eu
D="${DIGISMITH_DEPOT:-$HOME/.digismith-depot}"
val() { sed -n "s/^$1=//p" "$D/.env" | head -n 1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"; }   # tolerates CR and one pair of quotes
CLOUDFLARE_API_TOKEN=$(val CLOUDFLARE_API_TOKEN)
[ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "caddy-run: CLOUDFLARE_API_TOKEN is not set in the depot env file" >&2; exit 1; }
export CLOUDFLARE_API_TOKEN
NEXUS_BASIC_AUTH_HASH=$(val NEXUS_BASIC_AUTH_HASH)
if [ -z "$NEXUS_BASIC_AUTH_HASH" ]; then
  # Caddy refuses to start with an empty basic_auth hash, which would take the OpenCode front door down too (DGS-324).
  # Without a login set, /api/* gets a hash of a random password nobody knows: every login fails, nothing else changes.
  NEXUS_BASIC_AUTH_HASH=$("$D/bin/caddy" hash-password --plaintext "$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" 2>/dev/null) || NEXUS_BASIC_AUTH_HASH=
  # second fallback if hashing fails: a fixed bcrypt hash of a random password that was never kept
  [ -n "$NEXUS_BASIC_AUTH_HASH" ] || NEXUS_BASIC_AUTH_HASH='$2a$14$UdHp.mZ0CVCTgd00ChgrtOHXaMxESFvZxxcFDxDNvIFsxwe8K3ZZi'
  echo "caddy-run: NEXUS_BASIC_AUTH_HASH is not set in the depot env file; /api/* rejects every login" >&2
fi
export NEXUS_BASIC_AUTH_HASH
export XDG_DATA_HOME="$D/caddy/data" XDG_CONFIG_HOME="$D/caddy/config"
exec "$D/bin/caddy" run --config "$D/caddy/Caddyfile" --adapter caddyfile
