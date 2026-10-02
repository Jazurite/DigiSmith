# Plans should run Theme Check with the recommended config against a baseline

**Status:** Finding, confirmed live. No design yet.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

In the market repos, `theme/.theme-check.yml` uses `extends: :nothing`, so `shopify theme check`
reports "no offenses" whatever the change does. Theme Check also needs `pnpm install
--frozen-lockfile` first (`theme/node_modules` was missing). On EMKT-810 PH the worker ran
`--config theme-check:recommended` on the touched file before and after (12 existing offenses, no
new ones), which is the useful signal.

## The idea

writing-plans' Shopify guidance: install first, take a recommended-config baseline on the touched
files, then compare after the edit. Report "no new offenses", not "no offenses".
