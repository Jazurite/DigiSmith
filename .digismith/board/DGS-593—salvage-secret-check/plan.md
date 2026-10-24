# DGS-593 plan: salvage secret check skips harmless source files

Spec: `design.md` in this folder. Branch `DGS-593__salvage-secret-check`. Small ticket: no task packs. Test first in each task.

### Task 1: Tests for the new rule

Files: `packages/cli/src/salvage/secrets.test.ts`.

- Change the old `tokens.test.ts` case: it now passes (`.ts` skip).
- Add pass cases: `nightwatch-tokens.scss`, `.digismith/board/DGS-1—x/tokens.json`, `secret-notes.md`, each skip extension.
- Add refuse cases: `api-token.txt`, `secrets.json`, `x.p12`, `x.pfx`, `id_rsa`, `id_rsa.pub`, `id_ed25519`, nested and non-board `tokens.json`.
- Add strict-wins cases: `.env.ts`, `id_rsa.md`, `server.key.ts`, with their pattern labels.
- Run `pnpm vitest run packages/cli/src/salvage/secrets.test.ts`: the new cases fail.

### Task 2: Implement the rule in secrets.ts

Files: `packages/cli/src/salvage/secrets.ts`.

- Split `NAME` into a strict list (`.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx` also as inner segment, `id_rsa*`, `id_ed25519*`) and a loose list (`secret`, `token`).
- Check strict first. Then skip the loose list for the harmless extensions and the board `tokens.json` path. Then the 5 MB check.
- Keep `secretHits`, `secretFiles`, `notSalvagedMessage` signatures and the message text. Strip-types safe.
- Task 1 tests pass.

### Task 3: Committed-files check test and full run

Files: `packages/cli/src/salvage/salvage.test.ts`.

- Add a case: a commit on the branch with `nightwatch-tokens.scss` passes; a commit with `api-token.txt` refuses (temp repos and temp bare remote, no real push).
- Run the salvage tests and the cli smoke test (`pnpm vitest run packages/cli`).
