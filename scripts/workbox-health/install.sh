#!/bin/bash
# Installs workbox-health from the repo (source) into the depot (runtime), DGS-319 / DGS-265.
set -eu
mkdir -p "$HOME/.digismith-depot/bin"
install -m 755 "$(dirname "$0")/workbox-health.sh" "$HOME/.digismith-depot/bin/workbox-health"
install -m 644 "$(dirname "$0")/drift-check.ts" "$HOME/.digismith-depot/bin/drift-check.ts"
cat > "$HOME/.digismith-depot/bin/drift-check" <<'WRAP'
#!/bin/bash
# DGS-498: runs the drift-check.ts copy that sits next to this file (the .ts needs the Node flag).
exec node --experimental-strip-types "$(dirname "$0")/drift-check.ts" "$@"
WRAP
chmod 755 "$HOME/.digismith-depot/bin/drift-check"
echo "installed: $HOME/.digismith-depot/bin/workbox-health"
echo "installed: $HOME/.digismith-depot/bin/drift-check"
