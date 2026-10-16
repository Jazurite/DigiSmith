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
(cd "$WEB" && pnpm vitest run tests/unit/built-page.test.ts) || { echo "build-www: the built-page check failed" >&2; exit 1; }   # the check skips itself without .output/public, so it runs only after generate
mkdir -p "$NEW"
cp -R "$WEB/.output/public/." "$NEW/"
# the Caddyfile has no `hide .*` (a web root under a dot-folder needs that), so a dotfile in the build would be served: refuse it before the switch
if [ -n "$(find "$NEW" -name '.*' ! -path "$NEW" | head -n 1)" ]; then echo "build-www: the build output contains a dotfile or dot-folder; not switching www" >&2; exit 1; fi
if [ "${SKIP_STORYBOOK:-}" != 1 ]; then
  (cd "$WEB" && pnpm build-storybook) || { echo "build-www: the Storybook build failed" >&2; exit 1; }
  mkdir -p "$NEW/storybook"
  # logs/ (the Vite configs with the build machine's absolute paths) and project.json are build diagnostics: they are left out at copy time, never deleted
  find "$WEB/storybook-static" -mindepth 1 -maxdepth 1 ! -name logs ! -name project.json -exec cp -R {} "$NEW/storybook/" \;
  if [ -n "$(find "$NEW/storybook" -name '.*' | head -n 1)" ]; then echo "build-www: the Storybook output contains a dotfile or dot-folder; not switching www" >&2; exit 1; fi
  # fail closed: nothing that names the build machine may be published
  if [ -n "$(find "$NEW/storybook" \( -name logs -o -name project.json -o -name '*.config.*' \) | head -n 1)" ]; then echo "build-www: the Storybook output contains logs/, project.json or a *.config.* file; not switching www" >&2; exit 1; fi
  REPO_ROOT="$(git -C "$WEB" rev-parse --show-toplevel 2>/dev/null || true)"
  set -- -e /Users/ -e "$WEB"
  [ -z "$REPO_ROOT" ] || set -- "$@" -e "$REPO_ROOT"
  if [ -n "$(grep -rIlF "$@" "$NEW/storybook" | head -n 1)" ]; then echo "build-www: the Storybook output holds an absolute build path (/Users/, the web folder or the repo root); not switching www" >&2; exit 1; fi
fi
# one rename: make a new symlink next to the old one, then move it over (-h: do not follow the old symlink)
ln -sfn "www.d/$STAMP" "$NEXUS/www.next"
mv -fh "$NEXUS/www.next" "$LINK"
[ "$(readlink "$LINK")" = "www.d/$STAMP" ] || { echo "build-www: the www link was not switched to www.d/$STAMP" >&2; exit 1; }
echo "build-www: $LINK -> www.d/$STAMP"
