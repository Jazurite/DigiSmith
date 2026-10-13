#!/bin/sh
# Installs the Nexus API into the depot (DGS-265: the repo holds the source, the depot runs it).
# Run: sh scripts/nexus-api/install.sh. Copies the API source, writes the wrapper (with this machine's node path), renders the LaunchAgent plist,
# and stages the sudoers rule for the one fixed powermetrics command. It never uses sudo, never loads a service, never writes outside $DEPOT.
# Jack installs the sudoers rule and the LaunchAgent himself (steps printed at the end). DEPOT can be overridden (tests).
set -eu
SRC=$(cd "$(dirname "$0")" && pwd)
DEPOT="${DEPOT:-$HOME/.digismith-depot}"
case "$DEPOT" in *'|'*|*'&'*|*'<'*|*'>'*) echo "install: DEPOT may not contain | & < >" >&2; exit 1;; esac
NODE=$(command -v node) || { echo "install: node not found" >&2; exit 1; }
case "$NODE" in *'|'*|*'&'*|*'<'*|*'>'*) echo "install: node path may not contain | & < >" >&2; exit 1;; esac
USER_NAME=$(id -un)

mkdir -p "$DEPOT/bin" "$DEPOT/nexus-api/src" "$DEPOT/nexus/logs"
for f in "$SRC"/src/*.ts; do
  case "$f" in *.test.ts) continue;; esac
  cp "$f" "$DEPOT/nexus-api/src/"
done
sed -e "s|@NODE@|$NODE|g" -e "s|@DEPOT@|$DEPOT|g" "$SRC/nexus-api.sh.tmpl" > "$DEPOT/bin/nexus-api"
chmod 755 "$DEPOT/bin/nexus-api"
sed "s|@DEPOT@|$DEPOT|g" "$SRC/com.jazurite.digismith.nexus-api.plist.tmpl" > "$DEPOT/nexus/com.jazurite.digismith.nexus-api.plist"
"$NODE" --experimental-strip-types "$DEPOT/nexus-api/src/print-sudoers.ts" "$USER_NAME" > "$DEPOT/nexus/digismith-nexus.sudoers"
chmod 644 "$DEPOT/nexus/digismith-nexus.sudoers"
if command -v visudo >/dev/null 2>&1; then
  visudo -cf "$DEPOT/nexus/digismith-nexus.sudoers" >/dev/null || { echo "install: the staged sudoers rule does not pass visudo -cf" >&2; exit 1; }
fi

echo "installed: $DEPOT/nexus-api/src, $DEPOT/bin/nexus-api, $DEPOT/nexus/com.jazurite.digismith.nexus-api.plist, $DEPOT/nexus/digismith-nexus.sudoers"
echo "no service loaded, no sudoers file installed. Jack's steps (J2a, J3 to J6) are in the DGS-324 plan:"
echo "  cat $DEPOT/nexus/digismith-nexus.sudoers"
