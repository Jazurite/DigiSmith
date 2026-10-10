#!/bin/bash
# Installs workbox-health from the repo (source) into the depot (runtime), DGS-319 / DGS-265.
set -eu
mkdir -p "$HOME/.digismith-depot/bin"
install -m 755 "$(dirname "$0")/workbox-health.sh" "$HOME/.digismith-depot/bin/workbox-health"
echo "installed: $HOME/.digismith-depot/bin/workbox-health"
