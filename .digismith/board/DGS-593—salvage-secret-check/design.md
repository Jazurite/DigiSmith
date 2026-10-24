# DGS-593 spec: salvage secret check skips harmless source files

## Problem
`secretHits` in `packages/cli/src/salvage/secrets.ts` matches `/secret/i` and `/token/i` on the file name for any extension. Design tokens (`nightwatch-tokens.scss`) and board snapshots (`tokens.json`) stop `dg salvage`. The rule is safe but too wide.

## Rule (one function, `secretHits`)
Both salvage checks (the worktree files and every commit of `main..branch`) call `secretHits`, so one change covers both.

1. **Strict list, any extension, checked first and always wins:**
   - `.env*` (name starts with `.env`)
   - `*.pem`, `*.key`, `*.p12`, `*.pfx`
   - `id_rsa*`, `id_ed25519*` (name starts with it)
   - Size over 5 MB (unchanged; checked for every file not already hit by name).
2. **Name match, skipped for harmless files:** `secret` and `token` (case-insensitive) on the base name. The match is skipped when:
   - the extension is one of `.ts .tsx .js .mjs .vue .scss .css .md .html` (both matches skipped), or
   - the extension is `.yml` or `.yaml` (only the `token` match is skipped; `secret` stays strict, because yaml holds real secret stores such as Kubernetes Secret manifests; ruling of the Maestro on review finding F1), or
   - the file is `tokens.json` directly under `.digismith/board/<folder>/` (path match `^\.digismith/board/[^/]+/tokens\.json$` — board folders hold no nested level for this file).
3. Every other file with `secret` or `token` in its name still refuses (`api-token.txt`, `secrets.json`, `TOKEN`).

## Strict beats the extension skip
The strict list is tested first. So `.env.ts`, `id_rsa.md` and `server.key.ts` still refuse: `.env.ts` starts with `.env`; `id_rsa.md` starts with `id_rsa`; `server.key.ts` is not `*.key` by extension, so it needs its own rule: the strict key list also matches `.key`, `.pem`, `.p12`, `.pfx` as an inner dot-segment (`/\.(pem|key|p12|pfx)(\.|$)/i`). Result: `server.key.ts` refuses with pattern `*.key`.

## Message
Unchanged: `not salvaged: <path> (matches <pattern>), ...; Jack decides`. New labels: `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`.

## Tests (secrets.test.ts, test first)
- Pass: `token-config.yaml`, `tokens.yml`, `scripts/nexus-web/app/assets/nightwatch-tokens.scss`, `.digismith/board/DGS-1—x/tokens.json`, `tokens.test.ts`, `secret-notes.md`, and the other skip extensions.
- Refuse: `secrets.yaml`, `secrets.yml`, `db-secret.yaml`, `k8s/db-secret.yaml`, `secret-token.yaml` (label `*secret*`), `api-token.txt`, `.env.local`, `secrets.json`, `TOKEN`, `x.p12`, `x.pfx`, `id_rsa`, `id_rsa.pub`, `id_ed25519`, over 5 MB.
- Strict wins: `.env.ts`, `id_rsa.md`, `server.key.ts`.
- `tokens.json` outside `.digismith/board/<folder>/` (`src/tokens.json`, `.digismith/board/a/b/tokens.json`) refuses.
- A `salvage.test.ts` case: the committed-files check passes a `nightwatch-tokens.scss` commit and refuses an `api-token.txt` commit.

## Out of scope
No change to salvage flow, messages, or the 5 MB limit. Code stays strip-types safe.
