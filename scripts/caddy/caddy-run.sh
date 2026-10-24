#!/bin/sh
# Starts the depot Caddy for the front door (DGS-325). Gives Caddy only its own variables from .env, never the rest of the file.
set -eu
D="${DIGISMITH_DEPOT:-$HOME/.digismith-depot}"
val() { sed -n "s/^$1=//p" "$D/.env" | head -n 1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"; }   # tolerates CR and one pair of quotes
CLOUDFLARE_API_TOKEN=$(val CLOUDFLARE_API_TOKEN)
[ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "caddy-run: CLOUDFLARE_API_TOKEN is not set in the depot env file" >&2; exit 1; }
export CLOUDFLARE_API_TOKEN
export DIGISMITH_WWW="$D/nexus/www"   # DGS-481: the static page and Storybook; build-www.sh points it at a build folder
export XDG_DATA_HOME="$D/caddy/data" XDG_CONFIG_HOME="$D/caddy/config"
# before the first build there is nothing to serve: point www at an empty placeholder build folder, the same shape build-www.sh makes (never a real www directory, which build-www.sh refuses)
[ -e "$DIGISMITH_WWW" ] || { mkdir -p "$D/nexus/www.d/empty" && ln -s www.d/empty "$DIGISMITH_WWW"; }
[ -n "$DIGISMITH_WWW" ] && [ -d "$DIGISMITH_WWW" ] || { echo "caddy-run: the web root is missing or not a directory: $DIGISMITH_WWW" >&2; exit 1; }   # fail closed: an empty root would serve the current directory
export DIGISMITH_OCULUS_WWW="$D/nexus/oculus"   # DGS-599: the Oculus site (oculus.pazurite.com); build-www.sh points it at a build folder
[ -e "$DIGISMITH_OCULUS_WWW" ] || { mkdir -p "$D/nexus/oculus.d/empty" && ln -s oculus.d/empty "$DIGISMITH_OCULUS_WWW"; }
[ -n "$DIGISMITH_OCULUS_WWW" ] && [ -d "$DIGISMITH_OCULUS_WWW" ] || { echo "caddy-run: the Oculus web root is missing or not a directory: $DIGISMITH_OCULUS_WWW" >&2; exit 1; }   # fail closed
exec "$D/bin/caddy" run --config "$D/caddy/Caddyfile" --adapter caddyfile
