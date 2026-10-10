# Depot resource: ensure a headless browser on the VPS for visual checks

**ClickUp:** **DGS-313** (list Imperium, backlog; proposed home in the ticket); key written back by the DGS-165 sweep, 2026-10-10.

**Status:** Idea only, confirmed live. No design yet.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

The VPS had no browser, and the Claude in Chrome extension was not connected. Visual checks of an
ephemeral preview (digit parity between the old and new hero, banner visibility, screenshots)
needed `npx playwright install chromium` (it used 658 MB, not the estimated ~150 MB) plus
`npx playwright install-deps chromium` (15 apt libraries, run as root). Both needed Jack's OK
mid-task.

## The idea

A `digismith:depot` resource `ensure-headless-browser`: check for a working Chromium (`ldd` shows
no missing libraries), install it only with Jack's OK, report the real size first, and expose a
small runner for the reusable scripts written live (load a preview URL with a timezone, read
element state, count `setInterval` calls through an init-script wrapper, run the A/B Tasty
variation, take screenshots at desktop and mobile widths).
