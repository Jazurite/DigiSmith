# DGS-481 Life Dashboard on Nexus — Implementation Report

Ticket: **DGS-481** · Date: 2026-10-17

## Summary

Version 1 of Jack's private life dashboard is live at https://pazurite.com/ (tailnet only): the Life Calendar widget, a life in weeks drawn as 90 rows of 52 boxes, served as static files by Caddy and fed by an encrypted-at-rest profile through a Hono API on the Nexus server. Plan tasks 1 to 18 are built and merged in three steps (STOP-1, a dot-folder hotfix, STOP-2); tasks 19 (Keychain) and 20 (screen-reader sign-off) wait for Jack.

## What was built

| Tasks | What |
|---|---|
| 1-2 | The Nexus API moved onto Hono; `power-metrics` kept (old response bytes stored as a fixture); one JSON log line per request from `logger.ts` only, plus a no-console test |
| 3 | `scripts/nexus-shared`: day helpers, the strict Zod life-calendar schema, the life math (box 51 absorbs the extra day, 29 February counts as 1 March, current box neither lived nor ahead) |
| 4-6 | AES-256-GCM profile crypto, the file key provider (mode 600, never overwritten, `keychain` fails closed), PGlite store (folder mode 700), the seed step (prints nothing on success, a field name on failure, never changes the input file) |
| 7 | `GET /api/v1/life-calendar` with coded errors (503 `profile_missing`, `profile_invalid`, `key_unavailable`, `internal_invalid`; 400; 404; 405) and a no-secret-in-logs test |
| 8 | Caddy serves the page, `/storybook/` and caching (index no-cache, hashed assets immutable, gzip/zstd) |
| 9-12 | Nuxt 4 static page: tokens (vermilion accent, dark mode), state panels, the grid with stats and legend, tooltip, keyboard (roving tab stop) and touch |
| 13 | `build-www.sh` (atomic symlink switch, nothing deleted) and `health-check.mjs`; the first deploy |
| 14 | Storybook, one story per widget state, served at `/storybook/` |
| 15-18 | Playwright end-to-end tests against a stub API, axe accessibility checks (light and dark), visual baselines, Core Web Vitals budgets |

## Tests

| Suite | Result |
|---|---|
| Root (includes nexus-api and nexus-shared) | 168 files, 2440 tests pass |
| nexus-web unit | 16 files, 98 tests pass; typecheck clean |
| End to end (desktop and phone, stub API) | 30 passed, 6 skipped by design |
| Accessibility (axe, light and dark, every state and all 144 story checks) | 165 passed, 1 skipped, 0 violations, no allow-list |
| Visual regression | 72 baselines, 72 passed, 44 skipped; run twice with no update |
| Caddy config check (throwaway Caddy) | 46 PASS, 0 FAIL |
| Core Web Vitals, 4x-slowed phone | LCP about 1.7 s, INP 112 to 152 ms, CLS 0, Lighthouse TBT about 52 ms |
| Core Web Vitals, desktop | LCP under 0.6 s, INP under 200 ms, CLS 0, TBT 0 |

Visual baselines are valid only on the Workbox with Playwright 1.64.1. All tests and stories use the fake profile only.

## Fixes found by review and by the live deploy

- Key provider raised raw Node errors with the key path: now only a coded `KeyError`.
- Caddy web root failed open when unset; `caddy-run.sh` now creates a placeholder symlink and fails closed.
- Live deploy hotfix: `file_server { hide .* }` hid every file because the web root sits under the `.digismith-depot` dot-folder. The hide was removed, the test web root now sits under a dot-folder, and `build-www.sh` refuses a build containing a dotfile.
- `build-www.sh` hardening: stale `www.next`, post-switch check, built-page check before the switch; `install.sh` never deletes a real directory.
- Screen readers: the ruler's week headers now carry real column indexes; the date no longer has a prohibited `aria-label`; a persistent live region replaces the per-state ones; Retry uses `aria-disabled`.
- Touch readout survived pointer-leave and clears on a tap outside the grid; Escape dismisses a hover tooltip.
- Mobile blocking time: the grid is drawn in chunks of 10 rows on idle callbacks (TBT 220 ms to about 52 ms) with an aria-hidden spacer that keeps the layout stable.
- One tab stop in the grid while rows are still drawing (reactive roving stop).
- The Storybook build wrote Vite configs and build-machine paths into its output: `build-www.sh` now leaves out `logs/` and `project.json`, refuses any output containing a machine path, and a plugin strips the repo path from the bundle.

## The Storybook shim

Task 14's Storybook never rendered (`NUXT_E1001`, `@storybook-vue/nuxt` 10.0.1 against Nuxt 4.6.1). A small shim in `.storybook/preview.ts` fixes it. It affects Storybook only, never the page. Remove it when the module supports Nuxt 4.6. The first deploy used `SKIP_STORYBOOK=1`, so Storybook has not been served yet.

## Open items for Jack

- **Tooltip "hoverable" (WCAG 1.4.13):** the tooltip has `pointer-events: none`. It is dismissible and persistent, but not hoverable. The options are in `tests/a11y/EXCEPTIONS.md` and the Task 16 report.
- **Small ruler labels:** the week labels are 9 px under 380 px wide and 8 px under 340 px. Not an AA failure, but small; a design choice.
- **DGS-522 (task 19):** the Keychain key provider and its probe.
- **DGS-523 (task 20):** screen-reader sign-off by Jack.
- **Taste points:** the vermilion accent, row labels every 10 years, and the stat labels ("weeks lived", "weeks left", "lived") are the Designer's recommendations, pending Jack.
- **The plain profile file:** `~/.digismith-depot/nexus/profile.private.json` still exists after the seed. Deleting it is Jack's decision.
- **Known small items:** the skeleton assumes 90 rows, so a different life length shifts the layout below the grid; header names from Hono are lowercase (`cache-control`), equivalent over HTTP.

## Review

Every task had a spec and quality review. Two opus whole-branch reviews (tasks 1 to 13, tasks 14 to 18) found no Critical issue; their Important findings are fixed and re-reviewed.
