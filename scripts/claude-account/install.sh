#!/bin/sh
# Installs claude-account (DGS-224). mkdir and cp only: no sudo, no LaunchAgent, no shell-rc edit.
# The old ~/.local/bin/claude-account is backed up once, with a dated suffix.
set -eu
SRC=$(cd "$(dirname "$0")" && pwd)
BIN="$HOME/.local/bin"; SHARE="$HOME/.local/share/claude-account"
mkdir -p "$BIN" "$SHARE"
if [ -f "$BIN/claude-account" ] && [ ! -e "$BIN/claude-account.before-dgs-224-20261012" ]; then
  cp -p "$BIN/claude-account" "$BIN/claude-account.before-dgs-224-20261012"
fi
cp "$SRC/claude-account" "$BIN/claude-account"; chmod 755 "$BIN/claude-account"
cp "$SRC/sources.conf" "$SHARE/sources.conf"
echo "installed: $BIN/claude-account, $SHARE/sources.conf"
