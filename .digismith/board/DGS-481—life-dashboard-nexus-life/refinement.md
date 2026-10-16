# DGS-481 refinement result (Refiner: dgs-481-refine, 2026-10-16)

Epic: DGS-481 (Life Calendar version 1), initiative DGS-503. Spec: `design.html`. Plan: `plan.md` (20 tasks, one per ticket). Design reference: `ui-design.md`, `mock.html`.
All tickets are plain tasks in J.0: Pavilion, linked to DGS-481 with `dg clickup add-link` (read back: 27 links on the epic, 24 of them new). Version 1 tickets are in `refinement`, later items in `backlog`.

## Version 1, ranked (build order)

| Rank | Key | Title | Size | Priority | Sign-off | Depends on | Plan |
|---|---|---|---|---|---|---|---|
| 1 | DGS-504 | Move the Nexus API onto Hono (power-metrics unchanged) | M | high | Auto | none | Task 1 |
| 2 | DGS-505 | Add a fixed-field request logger to the API | S | high | Auto | DGS-504 | Task 2 |
| 3 | DGS-506 | Add the shared schema, day helpers and life math | M | high | Auto | DGS-504 | Task 3 |
| 4 | DGS-507 | Encrypt the profile: AES-256-GCM module and the file key provider | S | high | Auto | DGS-504 | Task 4 |
| 5 | DGS-508 | Store the encrypted profile in PGlite (data folder mode 700) | S | high | Auto | DGS-507 | Task 5 |
| 6 | DGS-509 | Seed step: read the private input, encrypt it, store it | S | high | Auto | DGS-506, DGS-507, DGS-508 | Task 6 |
| 7 | DGS-510 | Add GET /api/v1/life-calendar and prove no secret reaches a log | M | high | Auto | DGS-504, DGS-505, DGS-506, DGS-507, DGS-508 | Task 7 |
| 8 | DGS-511 | Caddy serves the page, Storybook and caching headers | S | high | Auto | none | Task 8 |
| 9 | DGS-512 | Nuxt app: scaffold, colour tokens and page shell | M | high | Jack | DGS-506 | Task 9 |
| 10 | DGS-513 | Page data: typed client, error mapping and state panels | M | high | Jack | DGS-510, DGS-512 | Task 10 |
| 11 | DGS-514 | Calendar grid, stats and legend | M | high | Jack | DGS-512, DGS-513 | Task 11 |
| 12 | DGS-515 | Tooltip, keyboard and touch on the grid | M | high | Jack | DGS-514 | Task 12 |
| 13 | DGS-516 | Build script, health check and first deploy of version 1 | M | high | Auto | DGS-505, DGS-509, DGS-510, DGS-511, DGS-515 | Task 13 |
| 14 | DGS-517 | Storybook: one story per state, served at /storybook/ | M | normal | Auto | DGS-515, DGS-516 | Task 14 |
| 15 | DGS-518 | End-to-end tests with a stub API (Playwright) | M | normal | Auto | DGS-515 | Task 15 |
| 16 | DGS-519 | Accessibility gate: axe, keyboard and contrast tests | M | normal | Auto | DGS-517, DGS-518 | Task 16 |
| 17 | DGS-520 | Visual regression baselines for every story | M | normal | Auto | DGS-517 | Task 17 |
| 18 | DGS-521 | Core Web Vitals budgets: Lighthouse CI and web-vitals tests | M | normal | Auto | DGS-515, DGS-518 | Task 18 |
| 19 | DGS-522 | Keychain key provider and its probe (needs Jack) | M | normal | Jack | DGS-509, DGS-516 | Task 19 |
| 20 | DGS-523 | Screen-reader pass and accessibility sign-off (Jack) | S | normal | Jack | DGS-519 | Task 20 |

Why this order: a working, deployed version 1 exists after rank 13 (DGS-516). Ranks 1 to 8 are the API, the encrypted profile and Caddy (no UI). Ranks 9 to 12 are the page. Rank 13 builds, deploys and health-checks it with the file key. Ranks 14 to 18 are the quality gates (Storybook, end to end, accessibility, visual regression, Core Web Vitals) and can run in parallel after rank 12. Rank 19 (Keychain) and 20 (screen-reader sign-off) wait for Jack.

Priority: high = on the path to a deployed version 1 (ranks 1 to 13); normal = gates and the morning items (14 to 20); low = later.

## Later items (backlog, low, linked to DGS-481)

| Key | Title | Status | Priority | Sign-off | Why it waits |
|---|---|---|---|---|---|
| DGS-524 | Life phases on the grid (school, work, ...) | backlog | low | Jack | Phases need data only Jack can give (the chapters and their dates) and his taste for the colours. Version 1 ships without them. |
| DGS-525 | Events and milestones on the grid | backlog | low | Jack | Needs a place to store events (a table beside the profile), a way to add them, and Jack's taste for how a marker looks. |
| DGS-526 | More dashboard widgets (first: the Mac verdict, DGS-466) | backlog | low | Jack | The page shell and the widget frame are ready for it (a 12-column main). Which widgets, in which order, is Jack's choice. |
| DGS-527 | Put a CDN in front of the dashboard | backlog | low | Jack | Jack: "I'll handle CDN later". Version 1 is served by Caddy on the tailnet. Do not start without his word: the data is private, so what may be cached or exposed must be decided first. |

## Not ready, and why

- **DGS-522 Keychain provider and probe:** needs Jack. He loads the probe LaunchAgent and decides about the key file. Also unknown until the probe runs: with automatic login the login Keychain may stay locked after a reboot. Until it passes, the file key stays (with the backup limit in the spec, section 8).
- **DGS-523 Screen-reader pass:** a manual checklist for Jack. It also needs his decision on the two recorded accessibility exceptions (tiny box targets; a tooltip that is not hoverable).
- **DGS-516 First deploy:** the builder writes the scripts and tests; the Maestro runs the runbook (restarts of the Nexus API and Caddy, the seed run). The ticket is done when the health check says `ok`.
- **The four later items:** no spec, no sizes. They need Jack's data and taste, and each goes through concept and refinement first.
- **Taste points, pending Jack** (the Designer's recommendations are built in and marked in DGS-512, DGS-513, DGS-514): accent colour (vermilion #e8401c, dark #ff5a3c); row labels every 10 years with a decade gap; stat labels "weeks lived", "weeks left", "lived". These do not block the build.

## For the Maestro to decide or know

1. **Sign-off for the profile tickets.** DGS-507, DGS-508, DGS-509, DGS-510 touch personal data. DGS-488 lists personal data under "Jack"; the brief says Auto for API, database, routing and infrastructure. I marked them Auto because Jack already decided the design (PGlite, AES-256-GCM, file key tonight, seed run by the deploy). Change the mark if you want his yes on each.
2. **Locked-panel wording.** The Designer's text says "Unlock the Keychain on the Workbox". The first deploy uses the key file, so the plan uses "Check the key on the Workbox" (in DGS-513, marked pending Jack).
3. **Designer's example date.** `ui-design.md` shows "12 Oct 2026 – 18 Oct 2026" as an example tooltip. The counting rule, the API and the Designer's own `mock.html` give 15 Oct 2026 – 21 Oct 2026 for this week. The plan and tests use the rule.
4. **Two Vitest versions.** The repo root has Vitest 2.1. `@nuxt/test-utils` 4.3.3 needs Vitest 4 or newer, so the page package carries Vitest 5.0.5 and the root excludes it. A repo-wide upgrade is a separate decision.
5. **Spec text that changed in the plan** (small, written back into `design.html`): the pointer box is found from the event target, not by arithmetic; `NEXUS_KEY_PROVIDER` defaults to `file` without a wrapper change until DGS-522.
6. **Things I could not check without installing** (each has a first step in the plan that checks it and says what to do if it differs): `createAdaptorServer` in `@hono/node-server` 2.1.5; Hono's HEAD handling and an explicit charset in `c.json()`; the PGlite 0.5.10 query API; the `@nuxtjs/storybook` commands and framework name; the `web-vitals` 6.2.3 browser file name; Lighthouse CI against the stub server.
7. **Milestone.** I did not assign a milestone to the new tickets (not in the brief). They need one (Dawn or V1.1 DGS-470) if the rule applies.
8. **Privacy checks.** The real profile file was never opened. Every test, story, fixture and ticket uses the fake profile (born 1990-01-01, life 90 years, today 2026-10-16). The input file stays in plain text until Jack deletes it; the seed step never deletes it. The tooltip date ranges reveal the birth date to anyone who can see the page or the JSON (Jack's decision A).
9. **Branch state.** Spec, plan, `ui-design.md` and `mock.html` are committed on `DGS-481__life-dashboard-nexus-life`. Nothing is merged or pushed. `.impeccable/` (hook config from the design-hook ignores) is untracked and not committed.
