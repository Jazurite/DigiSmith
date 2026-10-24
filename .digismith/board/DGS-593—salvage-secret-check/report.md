# DGS-593 report: salvage secret check skips harmless source files

Ticket DGS-593 (J.5 follow-up of DGS-585). Branch `DGS-593__salvage-secret-check`, order nw-08.

## What changed
- `packages/cli/src/salvage/secrets.ts`: `secretHits` checks the strict list first, on any extension: `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx` (also as an inner segment, so `server.key.ts` refuses), `id_rsa*`, `id_ed25519*`. Files over 5 MB still refuse.
- The `secret` and `token` name match is skipped for `.ts .tsx .js .mjs .vue .scss .css .md .html`. For `.yml` and `.yaml` only the `token` match is skipped; `secret` stays strict (Maestro ruling on review finding F1). The board snapshot `.digismith/board/<folder>/tokens.json` passes by exact path.
- Strict beats the skip: `.env.ts`, `id_rsa.md`, `server.key.ts` still refuse.
- Message text unchanged: names the file and the pattern, ends "Jack decides".
- Both salvage checks (dirty worktree files and every commit of `main..branch`) call `secretHits`, so one change covers both.

## Tests
- `secrets.test.ts`: pass, refuse and strict-wins cases. `salvage.test.ts`: a committed `nightwatch-tokens.scss` and `token-config.yaml` salvage; a committed `api-token.txt` (even removed later) and `k8s/db-secret.yaml` refuse.
- `pnpm vitest run packages/cli`: see the merge hand-back for the final counts.

## Review
Ticket review round 1: ready to merge, one Minor (F1, yaml). Fixed in `e96ed0b`. Scoped re-review round 2: clean. See `findings.md`.
