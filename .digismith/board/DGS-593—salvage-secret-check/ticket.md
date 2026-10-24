# DGS-593: Nightwatch: salvage's secret check refuses harmless files named *token*

**Key:** DGS-593
**Source:** ClickUp (`dg clickup get-task DGS-593`)

`dg salvage` refused `scripts/nexus-web/app/assets/nightwatch-tokens.scss` (matches `*token*`). It is a design-token stylesheet, not a secret.

Fix (from the ticket): keep strict on any extension `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, files over 5 MB. The `secret` / `token` name match skips `.ts .tsx .js .mjs .vue .scss .css .md .html .yml .yaml` and the board snapshot `tokens.json` under `.digismith/board/`.
Tests: `nightwatch-tokens.scss` and `.digismith/board/X/tokens.json` pass; `api-token.txt`, `.env.local`, `secrets.json` refuse.
