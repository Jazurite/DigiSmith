# workbox-health

`drift-check.ts` finds line-ending (CRLF) and mode drift in tracked files (DGS-498). It is read-only.

**Sweep (DGS-557).** The Nexus scheduler job `drift-sweep` runs `drift-check.ts --sweep` from `~/.digismith-depot/bin/` every 10 minutes. It checks every checkout under `~/Workspace` (30 s limit per repo) and writes `~/.digismith-depot/observability/drift-sweep.json`. It adds a line to `drift.csv` only when a repo's result changed. It exits 0 when the sweep ran, even if it found drift. The SessionStart alarm reads the state file and prints one `drift alarm (sweep ...)` line for the other drifting repos, or `drift sweep has not run since ...` when the state is older than 60 minutes. By hand: `node --experimental-strip-types ~/.digismith-depot/bin/drift-check.ts --sweep`.
