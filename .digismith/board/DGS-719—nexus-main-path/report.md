# DGS-719 One main-checkout path for the Nexus API — Implementation Report

Ticket: DGS-719 (Urgent, Mode Manual). Branch DGS-719__nexus-main-path from origin/main b9ccd97f (not moved). Head 87b9467e.

## What changed
- **One module** `scripts/nexus-api/src/main-checkout.ts`: `MAIN_CHECKOUT` (env `DIGISMITH_MAIN_CHECKOUT`, else `~/Workspace/Engineering/Jazurite/DigiSmith`), `MAIN_CLI`, `checkMainCheckout()`, `missingCliMessage()`.
- **API:** `scheduler/registry.ts` and `oculus-reader.ts` import it. (`nightwatch-reader.ts` from the plan does not exist in the repo.)
- **Missing CLI:** `server.ts` logs ONE error line at start (`main_checkout_missing`, detail `main checkout CLI missing: <path> (set DIGISMITH_MAIN_CHECKOUT)`); `GET /api/v1/jobs` carries the same text as `warning`. The API still starts.
- **Other references:** `autonomous/observers-real.ts` (own constant, same env var) and its help text in `autonomous/index.ts`; `herdr-bootstrap.sh` `DG_DIR` and `consult.ts` `DEFAULT_REMOTE_REPO` honour `DIGISMITH_MAIN_CHECKOUT` with the Engineering default; `runner.ts` ssh repo whitelist allows exactly that one expression. Tests pin all of it.

## Tests (87b9467e, forks pool 2)
- scripts/nexus-api 477/477; packages/cli/src/autonomous 977/978; scripts/conductor 349/349; scripts/herdr 25/25.
- The one failure, `guardrails.test.ts` "sets scan_every_minutes to 15", fails the same on origin/main b9ccd97f (git archive copy). Out of scope.

## Not changed (for the Maestro)
- `scripts/herdr/com.jazurite.herdr-castle.plist:8` WorkingDirectory still holds the old path.
- `ssh workbox` runs a non-interactive shell (zsh reads only ~/.zshenv): `DIGISMITH_MAIN_CHECKOUT` set only in ~/.zshrc is not seen by the remote catch-up. Safe: it uses the default.

## After the merge (conductor, after the Maestro's approval)
See plan.md "After the merge". Protected paths touched: scripts/nexus-api/src/scheduler/ (registry.ts, routes.ts, types.ts + tests), packages/cli/src/autonomous/ (index.ts, observers-real.ts + test).
