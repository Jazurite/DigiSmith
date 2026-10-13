#!/bin/sh
# Installs the Caddy front door files into the depot (DGS-265: the repo holds the source, the depot runs it).
# Run: sh scripts/caddy/install.sh. Puts the pinned Caddy binary, the Caddyfile, caddy-run and a rendered LaunchAgent plist in the depot.
# It never loads a service and never writes to ~/Library/LaunchAgents: Jack does that.
# DEPOT, CADDY_URL and CADDY_SHA256 can be overridden for tests only.
set -eu
SRC=$(cd "$(dirname "$0")" && pwd)
DEPOT="${DEPOT:-$HOME/.digismith-depot}"
CADDY_URL="${CADDY_URL:-https://caddyserver.com/api/download?os=darwin&arch=amd64&p=github.com/caddy-dns/cloudflare&version=v2.11.7}"
CADDY_SHA256="${CADDY_SHA256:-f7f2a3cb2b913d4a68eecb8462384306e7248be2719eedcd8b768606b821763f}"
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
mkdir -p "$DEPOT/bin" "$DEPOT/caddy/data" "$DEPOT/caddy/config" "$DEPOT/caddy/logs"
if [ -x "$DEPOT/bin/caddy" ] && [ "$(sha "$DEPOT/bin/caddy")" = "$CADDY_SHA256" ]; then
  echo "caddy binary already at the pinned hash"
else
  TMPBIN=$(mktemp "${TMPDIR:-/tmp}/caddy-download.XXXXXX")
  trap 'rm -f "$TMPBIN"' EXIT
  curl -fsSL --max-time 300 -o "$TMPBIN" "$CADDY_URL"
  GOT=$(sha "$TMPBIN")
  [ "$GOT" = "$CADDY_SHA256" ] || { echo "install: SHA-256 mismatch (got $GOT, want $CADDY_SHA256); nothing installed" >&2; exit 1; }
  chmod 755 "$TMPBIN"; mv "$TMPBIN" "$DEPOT/bin/caddy"
fi
cp "$SRC/caddy-run.sh" "$DEPOT/bin/caddy-run"; chmod 755 "$DEPOT/bin/caddy-run"
cp "$SRC/Caddyfile" "$DEPOT/caddy/Caddyfile"
sed "s|@DEPOT@|$DEPOT|g" "$SRC/com.jazurite.digismith.caddy.plist.tmpl" > "$DEPOT/caddy/com.jazurite.digismith.caddy.plist"
echo "installed: $DEPOT/bin/caddy, $DEPOT/bin/caddy-run, $DEPOT/caddy/Caddyfile, $DEPOT/caddy/com.jazurite.digismith.caddy.plist"
echo "no service loaded. Jack's step J6 loads it (see the DGS-325 plan)."
