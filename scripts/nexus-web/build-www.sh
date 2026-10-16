#!/bin/sh
# Builds the page (and Storybook when it is built) from this repo checkout into the depot (DGS-481).
# The result goes to $DEPOT/nexus/www.d/<stamp>/ and the symlink $DEPOT/nexus/www is pointed at it with one rename, so Caddy
# never sees a half-built site. Old build folders are kept: nothing is deleted here (deletes need Jack).
# Env: DEPOT (default ~/.digismith-depot), SKIP_STORYBOOK=1 (page only), WEB (the web folder, tests only), STAMP (tests only).
set -eu
WEB="${WEB:-$(cd "$(dirname "$0")" && pwd)}"
DEPOT="${DEPOT:-$HOME/.digismith-depot}"
case "$DEPOT" in *'|'*|*'&'*|*'<'*|*'>'*|*'"'*|*'$'*|*'`'*|*'\'*) echo "build-www: DEPOT may not contain | & < > \" \$ \` or a backslash" >&2; exit 1;; esac
NEXUS="$DEPOT/nexus"
LINK="$NEXUS/www"
if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then echo "build-www: $LINK is a real directory; move it away first (Jack decides)" >&2; exit 1; fi
STAMP="${STAMP:-$(date +%Y%m%d%H%M%S)}"
NEW="$NEXUS/www.d/$STAMP"
mkdir -p "$NEXUS/www.d"
[ ! -e "$NEW" ] || { echo "build-www: $NEW already exists" >&2; exit 1; }

(cd "$WEB" && pnpm generate) || { echo "build-www: the page build failed" >&2; exit 1; }
mkdir -p "$NEW"
cp -R "$WEB/.output/public/." "$NEW/"
if [ "${SKIP_STORYBOOK:-}" != 1 ]; then
  (cd "$WEB" && pnpm build-storybook) || { echo "build-www: the Storybook build failed" >&2; exit 1; }
  mkdir -p "$NEW/storybook"
  cp -R "$WEB/storybook-static/." "$NEW/storybook/"
fi
# one rename: make a new symlink next to the old one, then move it over (-h: do not follow the old symlink)
ln -s "www.d/$STAMP" "$NEXUS/www.next"
mv -fh "$NEXUS/www.next" "$LINK"
echo "build-www: $LINK -> www.d/$STAMP"
