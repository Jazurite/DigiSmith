#!/bin/sh
# Installs opencode-boot and its payload into the depot (DGS-265: the repo holds the source, the depot runs it).
# Run from anywhere in the repo or a worktree: sh scripts/opencode-boot/install.sh
set -eu
SRC=$(cd "$(dirname "$0")/../.." && pwd)
DEPOT="$HOME/.digismith-depot"; PAY="$DEPOT/opencode/boot"
MAIN=$(cd "$SRC" && dirname "$(git rev-parse --path-format=absolute --git-common-dir)")   # the main checkout, also when run from a worktree
mkdir -p "$DEPOT/bin" "$PAY/prompts"
cp "$SRC/scripts/opencode-boot/opencode-boot.py" "$DEPOT/bin/opencode-boot"; chmod 755 "$DEPOT/bin/opencode-boot"
cp "$SRC/.opencode/maestro/opencode.json" "$PAY/opencode.json"
cp -R "$SRC/.opencode/prompts/." "$PAY/prompts/"
cp "$SRC/.opencode/safety/maestro-safety.js" "$SRC/.opencode/safety/maestro-safety-v2.js" "$SRC/.opencode/safety/tokenreply-key-v2.js" "$PAY/"
printf '%s\n' "$MAIN" > "$PAY/project"
echo "installed: $DEPOT/bin/opencode-boot (payload $PAY, project $MAIN)"
