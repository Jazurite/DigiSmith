# DGS-523 Screen-reader pass and accessibility sign-off: spec

Written 2026-11-14 17:20 UTC+7. Ticket: DGS-523 (ClickUp 14zcebrvzuh). Part of DGS-481. Sign-off: Jack. Size S. Depends on DGS-519 (done: the axe, keyboard and contrast tests exist).
Source design: `DGS-481—life-dashboard-nexus-life/design.html`, section 12, and its plan Task 20. This spec checks Task 20 against the code on main today and fixes the gaps.

## Goal

Jack can run one short VoiceOver checklist on the life dashboard, on the Mac and on his iPhone, and decide on the two recorded accessibility exceptions. The builder only writes the checklist. Jack does the pass, so the ticket stays Sign-off: Jack.

## What exists today (main)

- `scripts/nexus-web/tests/a11y/EXCEPTIONS.md` exists (from DGS-519). It records two exceptions and says both need Jack's sign-off:
  1. WCAG 2.5.8 target size on the grid boxes.
  2. WCAG 1.4.13 "hoverable" on the tooltip.
- `scripts/nexus-web/tests/a11y/voiceover-checklist.md` does not exist. This ticket creates it.
- The page is `app/pages/index.vue`. Other pages (Oculus, Nightwatch) share the app but are out of scope: the checklist covers the life dashboard only.
- What a screen reader meets on the dashboard, read from the code:
  - A first link "Skip to the calendar" (`index.vue`) that targets `#calendar`.
  - Three stats as definition pairs: term then value ("weeks lived", "weeks left", "lived") (`StatsBar.vue`, `StatItem.vue`).
  - One polite live region for the widget. On load it says "Calendar loaded. N weeks lived, N weeks left, N.N% lived." While loading it says "Loading your calendar…" (`LifeCalendarView.vue`).
  - A grid, `role="grid"`, named "Your life in weeks. One row per year of age, 52 boxes per row. Use the arrow keys to move between weeks." Row headers "Age N". Column headers "Week 1", "Week 13", "Week 26", "Week 39", "Week 52" (`CalendarGrid.vue`).
  - Each box: `role="gridcell"` with the name "Age N, week W of 52, D Month YYYY to D Month YYYY, lived | this week | ahead" (`utils/grid-label.ts`).
  - Keys: arrows, Home, End, Ctrl+Home, Ctrl+End, Page Up and Page Down (10 rows), Escape (`utils/grid-nav.ts`, `CalendarGrid.vue`).
  - The tooltip (`role="tooltip"`) shows on focus and hover. The box is deliberately NOT `aria-describedby` the tooltip, because the tooltip text equals the box name and would be read twice. The touch readout is a live region that repeats the box name.
  - Error and locked panels use `role="alert"`; Retry shows "Retrying…" while busy; after a successful Retry, focus moves to the grid (`StatePanel.vue`, `LifeCalendar.vue`).

## Gaps in Task 20 of the DGS-481 plan

1. The path is short in the ticket. The file goes to `scripts/nexus-web/tests/a11y/voiceover-checklist.md`, beside `EXCEPTIONS.md`.
2. The plan checklist does not cover the load announcement ("Calendar loaded. ..."). It is the first thing a user hears after the skip link, so it gets a line.
3. The plan checklist reads the stat values as "weeks lived N" pairs. The code reads term, then value. The line says "label and value".
4. The plan checklist does not say that the tooltip must not be read twice. It gets a line (this is the reason for the choice in `CalendarGrid.vue`).
5. The iPhone has no arrow keys. Task 20 sends the same keyboard lines to both devices. The checklist splits into a Mac part (keyboard) and an iPhone part (swipe and touch, with the touch readout).
6. A failure note may be tempted to quote what VoiceOver read, and the live page shows Jack's real numbers. The checklist tells Jack to write the failing line number and what was wrong, never the numbers or dates he heard (privacy rule of DGS-481).
7. The plan has no guard against the checklist drifting from the code. A small unit test pins the strings the checklist quotes to their source files.
8. The plan leaves the exceptions line as one tick. Jack accepts or rejects each exception, so the checklist has one accept or reject line per exception, and says that a rejection becomes a new ticket (Jack or the Maestro files it; the builder does not).

9. A MacBook has no Home, End or Page keys, and Ctrl+Left and Ctrl+Right switch Spaces. VoiceOver Quick Nav also takes the arrow keys. The checklist adds a Quick Nav off line and writes each key as the Mac chord: Home = Fn+Left, End = Fn+Right, first and last box = Cmd+Fn+Left and Cmd+Fn+Right (the code accepts `ctrlKey` or `metaKey`, `CalendarGrid.vue:121`), Page Up and Page Down = Fn+Up and Fn+Down.
10. The plan says "turn the API off" with no procedure. The API is the LaunchAgent `com.jazurite.digismith.nexus-api` (plist `~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist`, KeepAlive on). A kill alone restarts it. The checklist gives `launchctl bootout gui/$(id -u)/com.jazurite.digismith.nexus-api` to stop and `launchctl bootstrap gui/$(id -u) <plist>` to start. Oculus and Nightwatch go down meanwhile. These are Jack's steps only; the builder never runs `launchctl` against the live service. The safe way to hear the alert is the Storybook StatePanel stories; the live stop is one optional check.

## Behaviour

### Checklist file

`voiceover-checklist.md` has these parts, in order:

1. Header with how to run: URL `https://pazurite.com/`, the iPhone on Tailscale, Mac (Safari or Chrome, VoiceOver on with Cmd+F5), iPhone (Settings, Accessibility, VoiceOver, or triple-click the side button if set up). Then a "Stopping the API" section with the two launchctl commands and the warnings above. Tick each line. On a failure write the line and what was wrong. Never write a birth date, an age count or the stat numbers you heard.
2. Part A, Mac, 11 lines: skip link; load announcement; stats as label and value; grid announced with its name; arrow keys read the box name; row and column headers; Home, End, Ctrl+Home, Ctrl+End, Page Up, Page Down; Escape hides the tooltip; the tooltip is not read twice; API off, the panel is announced as an alert and Retry is reachable; after a good Retry focus lands on the grid and "Retrying…" was heard while it worked.
3. Part B, iPhone, 5 lines: skip link; stats; touching a box reads its name; swiping right moves to the next box and reads its name; API off, alert and Retry (double-tap works).
4. Part C, the two exceptions, 2 lines: accept or reject target size; accept or reject the tooltip that is not hoverable. Each line holds only the WCAG number, a name and "see EXCEPTIONS.md item N" (the file stays unchanged).
5. Sign-off line: name and date, filled in by Jack.

Each Part A or B line is one observable result. A line states the text VoiceOver should read in a pattern (`Age N, week W of 52, ...`), not a real value.

### Guard test

`tests/unit/voiceover-checklist.test.ts` runs in the normal `vitest run`. It reads the checklist and the sources it quotes and checks:

- the checklist exists and has the three parts and the sign-off line;
- each quoted string appears in its source file (skip link text in `index.vue`; the grid name in `CalendarGrid.vue`; the box name pattern pieces in `grid-label.ts`; "Retrying…" and the alert role in `StatePanel.vue`; the load announcement start in `LifeCalendarView.vue`);
- the checklist names both exceptions as in `EXCEPTIONS.md` (both start with the WCAG numbers 2.5.8 and 1.4.13 in that file);
- the checklist holds no real-looking date (`\b(19|20)\d\d-\d\d-\d\d\b`) and no "life length" figure: it contains no `born` and no `life 90` text.

## Out of scope

- Running the checklist (Jack).
- Changing the page, the grid labels or `EXCEPTIONS.md`. If Jack's pass finds a failure, it becomes a new ticket.
- Oculus and Nightwatch pages.
- Any CI job for VoiceOver. It cannot be automated.

## Privacy

The checklist and the test use patterns only. No real birth date, life length or stat value appears. The test file uses no profile at all.

## Done when

1. `tests/a11y/voiceover-checklist.md` exists in `scripts/nexus-web`, with the parts above.
2. The guard test passes in `pnpm vitest run` from `scripts/nexus-web`.
3. Jack has worked through the checklist on the Mac and on the iPhone and signed the line. (This last part is Jack's. It happens after the merge. The ticket stays in his sign-off.)
4. Jack has accepted or rejected each exception. A rejection becomes a new ticket.
