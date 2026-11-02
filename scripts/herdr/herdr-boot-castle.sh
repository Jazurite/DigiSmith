#!/bin/bash
# DGS-683 proposal. Installs as ~/.local/bin/herdr-boot-castle.sh (the conductor installs it; see README.md).
# Starts ONLY the session Castle (conductors). The Floor is herdr-boot.sh.
# After it is up, run herdr-bootstrap.sh once (it sets the layout up).
export HOME=/Users/workbox
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
[ -x "$HOME/.local/bin/claude-account" ] && eval "$("$HOME/.local/bin/claude-account" env 2>/dev/null)"
exec "$HOME/.local/bin/herdr" --session Castle server
