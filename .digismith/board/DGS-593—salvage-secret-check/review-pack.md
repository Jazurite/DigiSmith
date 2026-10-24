# DGS-593 review pack

Branch `DGS-593__salvage-secret-check`, base `main`. Spec `design.md`, plan `plan.md`. No task packs (small ticket); the Builder did the three tasks inline, test first.

Files changed:
- `packages/cli/src/salvage/secrets.ts`: strict list first, loose `secret`/`token` match skipped for harmless extensions and `.digismith/board/<folder>/tokens.json`.
- `packages/cli/src/salvage/secrets.test.ts`: pass, refuse and strict-wins cases.
- `packages/cli/src/salvage/salvage.test.ts`: committed `nightwatch-tokens.scss` passes; committed `api-token.txt` refuses.

Check:
- Strict beats skip: `.env.ts`, `id_rsa.md`, `server.key.ts`, `cert.pem.md`.
- `tokens.json` skip is path-exact: nested and non-board copies still refuse.
- Message text and 5 MB limit unchanged; strip-types safe (no new syntax).
- Both salvage checks use `secretHits`.

Run: `pnpm vitest run packages/cli` -> 144 files, 2129 tests passed.
