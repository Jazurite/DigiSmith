#!/bin/sh
# Installs the Nexus API and its runtime dependencies into the depot (DGS-265: the repo holds the source, the depot runs it).
# Run: sh scripts/nexus-api/install.sh. Copies the API source, writes the wrapper (with this machine's node path), renders the LaunchAgent plist,
# and stages the sudoers rule for the one fixed powermetrics command. It never uses sudo, never loads a service, never writes outside $DEPOT.
# Jack installs the sudoers rule and the LaunchAgent himself (steps printed at the end). DEPOT can be overridden (tests).
set -eu
SRC=$(cd "$(dirname "$0")" && pwd)
DEPOT="${DEPOT:-$HOME/.digismith-depot}"
case "$DEPOT" in *'|'*|*'&'*|*'<'*|*'>'*|*'"'*|*'$'*|*'`'*|*'\'*) echo "install: DEPOT may not contain | & < > \" \$ \` or a backslash" >&2; exit 1;; esac
NODE=$(command -v node) || { echo "install: node not found" >&2; exit 1; }
case "$NODE" in *'|'*|*'&'*|*'<'*|*'>'*|*'"'*|*'$'*|*'`'*|*'\'*) echo "install: node path may not contain | & < > \" \$ \` or a backslash" >&2; exit 1;; esac
USER_NAME=$(id -un)

mkdir -p "$DEPOT/bin" "$DEPOT/nexus-api/src/scheduler" "$DEPOT/nexus/logs"
for f in "$SRC"/src/*.ts; do
  case "$f" in *.test.ts) continue;; esac
  cp "$f" "$DEPOT/nexus-api/src/"
done
for f in "$SRC"/src/scheduler/*.ts; do
  case "$f" in *.test.ts) continue;; esac
  cp "$f" "$DEPOT/nexus-api/src/scheduler/"
done
cp "$SRC/package.json" "$DEPOT/nexus-api/package.json"
# DGS-481: the shared schema sits next to the API in the depot, so ../../nexus-shared/ resolves the same as in the repo.
mkdir -p "$DEPOT/nexus-shared"
for f in "$SRC"/../nexus-shared/*.ts; do
  case "$f" in *.test.ts) continue;; esac
  cp "$f" "$DEPOT/nexus-shared/"
done
cp "$SRC/../nexus-shared/package.json" "$DEPOT/nexus-shared/package.json"
cp "$SRC/seed-profile.ts" "$DEPOT/nexus-api/seed-profile.ts"
# the shared files import zod: point them at the API's node_modules (one install, no second copy)
P="$DEPOT/nexus-shared/node_modules"
if [ -L "$P" ]; then rm "$P"; elif [ -e "$P" ]; then echo "install: $P is a real directory; move it away first (Jack decides)" >&2; exit 1; fi
ln -s ../nexus-api/node_modules "$P"
# DGS-481: the API now has runtime dependencies. DGS_SKIP_PNPM=1 is for tests only (they link node_modules instead).
if [ "${DGS_SKIP_PNPM:-}" != 1 ]; then
  command -v pnpm >/dev/null 2>&1 || { echo "install: pnpm not found" >&2; exit 1; }
  (cd "$DEPOT/nexus-api" && pnpm install --prod --ignore-workspace) || { echo "install: pnpm install failed" >&2; exit 1; }
fi
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
