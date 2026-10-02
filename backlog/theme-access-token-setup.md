# Shopify CLI theme access token setup without Claude handling the token

**Status:** Idea only, confirmed live. No design yet.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

Jack wanted `shopify theme dev` on the VPS and asked Claude to generate `shopify.theme.toml`, then
pasted the IN Theme Access token in chat. Claude must not write tokens into files, so it wrote the
toml without a password, excluded it via `.git/info/exclude` (the repo did not ignore it), and gave
Jack a `read -rsp` one-liner to insert the token himself. The pasted token should be rotated.

## The idea

Document (or script) this flow: generate `theme/shopify.theme.toml` with `[environments.<market>]`,
`store` and `path`; add it to `.git/info/exclude` when the repo does not ignore it; then hand Jack
the hidden-input command. Never ask for the token in chat. Consider adding `shopify.theme.toml` to
each market repo's `.gitignore` through a normal PR.
