# DGS-627: Running counters tick every second (spec)

Sign-off: Auto. Mode: Autonomous. Written 2026-10-26 (UTC+7), refinement only.

## Problem

Jack, 2026-10-25: "the counter should automatically tick themselves, right?"

Today one page clock, `useNow()` in `scripts/nexus-web/app/utils/use-now.ts`, moves every 30 s. The Duration cell shows `h:mm:ss`, so it jumps 30 s at a time. It reads as "not ticking".

## What the code does today (checked)

- `useNow(everyMs = 30_000)` is a `setInterval` that sets a `ref(Date.now())`. It is client-only. It is called by `pages/oculus/runs.vue`, `index.vue`, `run.vue`, `attention.vue` and by `OcAttentionSummary.vue`.
- Each page passes `nowMs` as a prop to `RunsTable`, `WorkersTable`, `PhaseTable`, `AttentionTable`, `PipelineBar`. Every one of them reads `nowMs` in its own render. So one tick re-renders the page and the whole table (up to 100 rows x 11 cells).
- `BudgetCard.vue` does NOT use the page clock. Its minutes (`budget.elapsedMin`) are computed by the CLI view (`packages/cli/src/oculus/views.ts`, floor of now minus `row.phaseSince`) and arrive with each poll. So the bar moves only on a poll.
- `RunsTable.vue` Duration cell: `fmtDuration(sec)` is `h:mm:ss` (counts every second); the phase part `phaseTime()` is whole minutes. `PipelineBar.vue` and the budget text show `h:mm` (whole minutes).
- A row with `endedAt` shows frozen `elapsedSec`. `endedAt` is set only when state is `ended` (`derive.ts` line 53). A `lost` row has `endedAt = null` and still counts up today.
- `oc-format.ts` has `const RUNNING = new Set(['healthy','blocked','stalled'])`, private, used by `phaseTime`.

## Decisions

### D1. Two rates

The page clock runs every **1000 ms** only while BOTH are true:

1. the page is visible: `document.visibilityState === 'visible'`;
2. at least one run the page shows is running (D2).

Otherwise it runs every **30 000 ms** (today's rate, so ages such as "stale 5m" keep moving).

### D2. "A shown run is running"

New helper in `app/utils/oc-format.ts`: `isRunning(r: Pick<RunRow, 'state'>): boolean` = `state` is `healthy`, `blocked` or `stalled`. `phaseTime` uses the same helper (the private `RUNNING` set is exported through it). A phase is NOT required: a Maestro or conductor run (phase `null`) is running, and its Duration counts.

Per page, "shown" means:

| Page | The fast clock is on when |
|---|---|
| `runs.vue` | `poll.data.value?.runs.some(isRunning)` |
| `index.vue` | `oc.overview.value?.workers.some(isRunning)` (Active workers table; its Elapsed is `h:mm:ss`) |
| `run.vue` | `run.value !== null && isRunning(run.value.row)` |
| `attention.vue` | never (ages are in minutes): stays at 30 s |

An `ended` or `lost` row never turns the fast clock on. While the fast clock is on, a `lost` row's text still follows the clock (as today). No data yet (before the first poll) means false.

### D3. Rate changes (one timer, no doubles)

`useNow` becomes `useNow(opts?: { fast?: MaybeRefOrGetter<boolean> })` with the fixed constants `FAST_MS = 1_000` and `SLOW_MS = 30_000` (exported, so tests name them).

- One `visible` ref, set from `document.visibilityState` and updated by ONE `visibilitychange` listener on `document`.
- `rate = computed(() => visible.value && toValue(opts.fast) ? FAST_MS : SLOW_MS)`.
- `watch(rate, restart, { immediate: true, flush: 'sync' })`. `restart` does: `clearInterval(timer)`, `now.value = Date.now()` (a change of rate or a return to the tab shows the right time at once), then `timer = setInterval(tick, rate)`. `flush: 'sync'` makes the restart happen in the same tick as the change.
- A hidden tab with the fast clock on goes to 30 s. When the tab is visible again, the watcher sees `rate` change and restarts at once. If the rate does not change (visible again, no running run), nothing restarts but `now` is still refreshed by the listener (`if (visible.value) now.value = Date.now()`).
- Cleanup, once, on `onScopeDispose` (only when `getCurrentScope()`): `clearInterval(timer)` and `document.removeEventListener('visibilitychange', ...)`.
- Client only (`import.meta.client`): during prerender no timer and no listener start, as today. During prerender `visible` is `true` and nothing is read from `document`.
- Timer count is always 0 or 1 per `useNow` call. A test proves it with `vi.getTimerCount()`.

### D4. Only the time text re-renders

Today the parent reads `nowMs` in its template, so the table re-renders every tick. New design:

- `useNow` also does `provide(NOW_KEY, now)` when it runs inside a component (`getCurrentInstance()`). `NOW_KEY` is an exported `InjectionKey<Ref<number>>`.
- New component `app/components/oc/OcTick.vue`: renderless, one prop `nowMs?: number`, one scoped slot `{ nowMs: number }`. It does `const clock = inject(NOW_KEY, null)` and `const now = computed(() => props.nowMs ?? clock?.value ?? Date.now())`. Its render is `slots.default?.({ nowMs: now.value })`. The slot function runs in OcTick's render, so only OcTick tracks the clock. The parent table never reads the ref, so it does not re-render on a tick.
- The tables and cards use `<OcTick v-slot="{ nowMs }">` around the time text only. `nowMs` stays an OPTIONAL prop on the tables: a story or a test passes a number (the clock is fixed, see D6), a page passes nothing and OcTick uses the injected clock.
- Rows that never change are not ticking: in `RunsTable` and `WorkersTable` a row with `endedAt` renders the frozen text without OcTick (`v-if="r.endedAt"` / `v-else`). In `PipelineBar` only the `current` step is wrapped. `BudgetCard` is wrapped as one block (it is one card).
- Cost: with 100 rows all running, a tick re-renders 100 OcTick instances, each a few string formats (microseconds). The table, the page, the filters and the nav do not re-render. The unit test (D7) checks that the table's own `onVnodeUpdated` does not fire on a tick. No measurement is claimed beyond that.
- The `.sr` text under the Duration cell changes with the clock too. It is not a live region (D5).

### D5. What changes on screen, and what does not

| Element | Format | Changes |
|---|---|---|
| Runs: Duration (`h:mm:ss`) | unchanged | every second |
| Runs: phase minute `building 0:14` | unchanged (minutes) | on the exact minute (was: up to 30 s late) |
| Active workers: Elapsed (`h:mm:ss`) | unchanged | every second |
| Phase table: Oldest (`h:mm:ss`) | unchanged | follows the page clock: every second while a worker runs, else 30 s |
| Run page: current step `h:mm` | unchanged | on the exact minute |
| Run page: Budget text and bar | unchanged format | on the exact minute, now client-side (see D8) |
| Ages `ageOf` (Attention, top bar, summary) | unchanged | stay on the 30 s clock |

No seconds are added to minute fields. The ticket says the strip and the budget "change once a minute"; they now do it on the minute, not up to 30 s late. If Jack wants seconds in them, that is a new taste ticket.

Accessibility rules from DGS-613 stay:
- the counter is NOT a live region: no `aria-live`, no `role="status"`, no `role="timer"` anywhere in the Duration cell, the strip or the budget card;
- no per-second announcements. The `.sr` words are read when the user reaches the cell;
- the "-" rules and `phaseTime` / `stepTime` return values are unchanged;
- `prefers-reduced-motion`: the per-second text has no animation, so nothing needs to change. The axe and e2e specs already run with `reducedMotion: 'reduce'`; they must pass unchanged.

### D6. Budget bar ticks on the client

`BudgetCard` gets one new optional prop `phaseSince: string | null` (default `null`) and `nowMs?: number`. When the card is active (phase, limit and elapsed present) and `phaseSince` parses, `elapsed = max(0, floor((nowMs - Date.parse(phaseSince)) / 60000))`, computed inside `OcTick`; otherwise `elapsed = budget.elapsedMin` as today. `run.vue` passes `:phase-since="run.row.phaseSince"`. The CLI sets `elapsedMin` from the same `row.phaseSince` (views.ts line 197), so the two agree on every poll. The story `BudgetCard` passes no `phaseSince`, so its baselines do not change.

### D7. Tests

Unit (Vitest, fake timers):
- `use-now.test.ts`: slow rate, fast rate, switching, hidden tab, return to visible, timer count, cleanup, no listener leak. Names are in the plan.
- `oc-format.test.ts`: `isRunning`.
- `OcTick` and `RunsTable` tests: a tick changes the Duration text and does not update the table component.

Browser (Playwright, `page.clock`):
- New e2e: `Runs: the Duration counts every second` with `page.clock.runFor(1000)`; a hidden-tab check with `visibilityState` overridden; no `aria-live` inside the Duration cell.
- axe: unchanged specs must pass (`pnpm a11y`).

### D8. How the visual baselines stay unchanged

A ticking number must not change any baseline.
- Story baselines (`tests/visual/stories.spec.ts`): the Oculus stories pass `nowMs` as a number (`NOW` in the story files), so OcTick uses the prop and never the clock. `BudgetCard` stories pass no `phaseSince`. No change.
- Page baselines (`tests/visual/oculus-mobile.spec.ts`, four pages) and the e2e/a11y specs that assert seconds: `page.clock.install({ time })` lets fake time run on, so a 1 s tick would move `0:50:00` to `0:50:01` during a screenshot. Fix: a helper `freezeClock(page, iso)` in `tests/e2e/fixtures.ts`? No: a new file `tests/e2e/freeze-clock.ts` that does `await page.clock.install({ time })` then `await page.clock.setFixedTime(time)`. `setFixedTime` makes `Date.now()` return the fixed time while timers keep running (Playwright 1.64.1), so ticks fire and write the same value. The text is the same for any real elapsed time.
- Specs to switch to `freezeClock`: `oculus-mobile.spec.ts` (the `install` line), `oculus-axe.spec.ts` test "the Duration cell and the strip read times in words", `oculus.spec.ts` tests that assert `0:50:00`, `0:50`, `50 min` (the Duration cell test and the strip test). Any other test that fails on a second-level text in the gate gets the same helper.
- Proof: `pnpm --dir scripts/nexus-web visual` passes with NO baseline file changed (`git status --short scripts/nexus-web/tests/visual` is empty). The plan never runs `visual:update`.

## Out of scope

- No seconds in minute fields. No change to the 10 s / 5 s polls. No API or CLI change. No change to Caddy, DNS, LaunchAgents or settings.
- `AttentionTable`, `OcAttentionSummary` and the top bar keep the 30 s clock.
- A `lost` row counting up forever is existing behavior; not changed here.

## First use (conductor, after the merge)

1. `sh scripts/nexus-web/build-www.sh` (publishes the dist/site).
2. Verify on `https://oculus.pazurite.com/runs/` without a human: a headless Chromium (Playwright from `scripts/nexus-web`, already installed for the e2e) opens the page, waits for a row, reads the first running row's Duration `[aria-hidden="true"]` text, waits 3 s of real time, reads it again, and checks that the second value is 2 to 4 seconds later than the first. This needs at least one running run; if none is running, the check is "not testable now" and is retried when a worker runs (the conductor's own session is a running `conductor` row, so one is usually there). There is no existing live-site Playwright spec, so this is a one-off script in the scratchpad, not a repo test. The page is behind Tailscale/Caddy; if the headless browser cannot reach it from the Workbox, say so and do not claim it passed.
