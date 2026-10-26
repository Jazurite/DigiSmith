# DGS-627 Running counters tick every second: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Running rows count every second (Duration, phase time, Elapsed, the run page's current step and budget bar), only while the tab is visible and a shown run is running; otherwise the page clock stays at 30 s. Only the time text re-renders.

**Spec:** `.digismith/board/DGS-627—tick-every-second/spec.md` (decisions D1 to D8). Read it first.

**Tech Stack:** Nuxt 4.6.1 / Vue 3.5.44 (web), Vitest with `@nuxt/test-utils` (happy-dom), Playwright 1.64.1 (e2e, axe, visual), pnpm.

## Setup (inside this worktree only)

```
pnpm install --frozen-lockfile
pnpm --filter @digismith/clickup-client build
```

## Global Constraints

- pnpm only. Commits: title-only conventional commits, no AI attribution, `git commit -m "<title>" -- <paths>`.
- No change to the CLI, the API, Caddy, DNS, LaunchAgents or settings. Web files only (`scripts/nexus-web`).
- The counter is NOT a live region: no `aria-live`, `role="status"` or `role="timer"` in the Duration cell, the strip or the budget card.
- `phaseTime`, `stepTime`, `fmtDuration`, `fmtMinutes` and their "-" rules do not change.
- Tests use fake timers or `page.clock`. No real ClickUp, herdr or live API.
- NEVER run `visual:update`. A visual baseline file must not change. If `pnpm visual` fails, the cause is a ticking number: freeze the clock in that spec (Task 3); do not update a baseline.
- Test command for the web unit tests (run from the repo root): `pnpm --dir scripts/nexus-web exec vitest run <path>`; full: `pnpm --dir scripts/nexus-web exec vitest run` (DGS-613 baseline: 372 tests, 35 files, plus the new ones).

---

### Task 1: The clock: `isRunning` and `useNow` with two rates

**Files:**
- Modify: `scripts/nexus-web/app/utils/oc-format.ts`
- Modify: `scripts/nexus-web/app/utils/oc-format.test.ts`
- Modify: `scripts/nexus-web/app/utils/use-now.ts`
- Modify: `scripts/nexus-web/app/utils/use-now.test.ts`

**Interfaces:**
- Produces: `isRunning(r: Pick<RunRow, 'state'>): boolean` (oc-format.ts); `FAST_MS = 1_000`, `SLOW_MS = 30_000`, `NOW_KEY: InjectionKey<Ref<number>>`, `useNow(opts?: { fast?: MaybeRefOrGetter<boolean> }): Ref<number>` (use-now.ts).

- [ ] **Step 1: Write the failing tests**

In `oc-format.test.ts` add `it('isRunning is true for healthy, blocked and stalled only', ...)`: `isRunning({ state })` is `true` for `healthy`, `blocked`, `stalled` and `false` for `lost`, `ended`.

Replace `use-now.test.ts` with these tests (all `vi.useFakeTimers()`, system time `2026-10-22T03:00:00.000Z`, a `scope = effectScope()` per test, `afterEach` stops the scope, restores real timers and the `visibilityState` property). Helper in the file: `setVisibility(v: 'visible' | 'hidden')` does `Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })` then `document.dispatchEvent(new Event('visibilitychange'))`.

1. `moves every 30 s when nothing is running`: `useNow()` (no option). After `advanceTimersByTime(29_999)` the value is unchanged; after 1 more ms it is `start + 30_000`.
2. `moves every second while fast is on and the tab is visible`: `fast = ref(true)`, `useNow({ fast })`. After `advanceTimersByTime(3_000)` the value is `start + 3_000`.
3. `restarts at once when fast switches on, and goes back to 30 s when it switches off`: start `fast = ref(false)`; `advanceTimersByTime(10_000)`; set `fast.value = true`: the value is `start + 10_000` at once (no advance); `advanceTimersByTime(1_000)` gives `+11_000`. Set `fast.value = false`; `vi.getTimerCount()` is 1; `advanceTimersByTime(29_000)` leaves the value at `start + 11_000` ... (it does not move before 30 s), `advanceTimersByTime(1_000)` moves it.
4. `falls back to 30 s in a hidden tab and restarts at once when the tab returns`: `fast = ref(true)`; `setVisibility('hidden')`; `advanceTimersByTime(5_000)` leaves the value unchanged; `advanceTimersByTime(25_000)` moves it once; `setVisibility('visible')`: the value is the current `Date.now()` at once and `advanceTimersByTime(1_000)` moves it by 1 s.
5. `starts hidden: the first rate is 30 s`: call `setVisibility('hidden')` before `useNow({ fast: ref(true) })`; no change after 29 s.
6. `never runs two timers`: after every switch in tests 3 and 4, `expect(vi.getTimerCount()).toBe(1)`.
7. `stops its timer and its listener with the scope`: spy `document.removeEventListener`; `scope.stop()`; `vi.getTimerCount()` is 0, the spy was called with `'visibilitychange'`, and a later `setVisibility('visible')` plus 60 s changes nothing.
8. `follows a getter for fast`: `useNow({ fast: () => flag.value })` with `flag = ref(true)` ticks every second.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --dir scripts/nexus-web exec vitest run app/utils/use-now.test.ts app/utils/oc-format.test.ts`
Expected: FAIL (`isRunning` is not exported; `useNow` ignores `fast`).

- [ ] **Step 3: Implement**

`oc-format.ts`: replace the private `RUNNING` use with an exported function; `phaseTime` calls it.

```ts
const RUNNING = new Set(['healthy', 'blocked', 'stalled'])
// A run counts as running in these three states; an ended or lost run never does.
export const isRunning = (r: Pick<RunRow, 'state'>): boolean => RUNNING.has(r.state)
```
and in `phaseTime`: `if (!isRunning(r) || r.phase === null || r.phaseSince === null) return null`.

`use-now.ts` (keep the file's comment style; no code outside this shape):

```ts
import { computed, getCurrentInstance, getCurrentScope, onScopeDispose, provide, ref, toValue, watch } from 'vue'
import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue'

export const FAST_MS = 1_000
export const SLOW_MS = 30_000
export const NOW_KEY: InjectionKey<Ref<number>> = Symbol('oculus-now')

// A ref of Date.now(). It moves every second while the tab is visible and `fast` is true (a shown run is running),
// otherwise every 30 s, so ages on screen keep counting between polls. Inside a component it is also provided as NOW_KEY.
// Client only: during prerender no timer and no listener start, so the generate process has nothing live to leak.
export function useNow(opts: { fast?: MaybeRefOrGetter<boolean> } = {}): Ref<number> {
  const now = ref(Date.now())
  if (getCurrentInstance()) provide(NOW_KEY, now)
  if (import.meta.client) {
    const visible = ref(document.visibilityState !== 'hidden')
    const rate = computed(() => (visible.value && toValue(opts.fast) === true ? FAST_MS : SLOW_MS))
    let timer: ReturnType<typeof setInterval> | undefined
    // sync: a change of rate restarts the one timer in the same tick; the new rate shows the right time at once
    watch(rate, (ms) => {
      clearInterval(timer)
      now.value = Date.now()
      timer = setInterval(() => { now.value = Date.now() }, ms)
    }, { immediate: true, flush: 'sync' })
    const onVisibility = (): void => { visible.value = document.visibilityState !== 'hidden'; if (visible.value) now.value = Date.now() }
    document.addEventListener('visibilitychange', onVisibility)
    if (getCurrentScope()) onScopeDispose(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) })
  }
  return now
}
```
Check on the `immediate` run: `now.value = Date.now()` there is harmless (same value as the `ref` just made).

Update every existing caller that passes a number: `grep -rn "useNow(" scripts/nexus-web/app` shows only `useNow()` calls in pages and `OcAttentionSummary.vue`, so nothing else changes in this task.

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --dir scripts/nexus-web exec vitest run app/utils/use-now.test.ts app/utils/oc-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git commit -m "feat(oculus): the page clock ticks every second while a run is running" -- scripts/nexus-web/app/utils/oc-format.ts scripts/nexus-web/app/utils/oc-format.test.ts scripts/nexus-web/app/utils/use-now.ts scripts/nexus-web/app/utils/use-now.test.ts
```

---

### Task 2: `OcTick` and the cells: only the time text re-renders

**Files:**
- Create: `scripts/nexus-web/app/components/oc/OcTick.vue`
- Create: `scripts/nexus-web/app/components/oc/tick.test.ts`
- Modify: `scripts/nexus-web/app/components/oc/RunsTable.vue`, `WorkersTable.vue`, `PhaseTable.vue`, `PipelineBar.vue`, `BudgetCard.vue`
- Modify: `scripts/nexus-web/app/pages/oculus/runs.vue`, `index.vue`, `run.vue`
- Modify: `scripts/nexus-web/app/components/oc/BudgetCard.stories.ts` (add one story only if needed, see Step 3)

**Interfaces:**
- Consumes: `useNow`, `NOW_KEY`, `isRunning` (Task 1).
- Produces: `<OcTick :now-ms?>` with scoped slot `{ nowMs: number }`. `nowMs` becomes OPTIONAL (`nowMs?: number`) on `RunsTable`, `WorkersTable`, `PhaseTable`, `PipelineBar`; `BudgetCard` gets `phaseSince?: string | null` and `nowMs?: number`.

- [ ] **Step 1: Write the failing tests** in `app/components/oc/tick.test.ts` (header comment `// scripts/nexus-web/app/components/oc/tick.test.ts`; imports `mountSuspended` from `@nuxt/test-utils/runtime`, `defineComponent, h, nextTick, provide, ref` from `vue`, `runsFixture` from `../../../tests/oculus-fixtures`, `NOW_KEY` from `../../utils/use-now`):

1. `OcTick passes the injected clock to its slot`: a host component provides `now = ref(Date.parse('2026-10-22T03:00:00Z'))` under `NOW_KEY` and renders `h(OcTick, null, { default: ({ nowMs }) => String(nowMs) })`. After `now.value += 1000` and `await nextTick()` the text is the new number.
2. `OcTick uses the nowMs prop and ignores the clock`: with `:now-ms="5"` the slot gets 5 even after the injected ref moves.
3. `RunsTable: a tick changes the Duration text and does not update the table`: host provides `now` under `NOW_KEY`, renders `h(RunsTable, { runs: runsFixture().runs, onVnodeUpdated: spy })`, where `spy = vi.fn()`. First running row's `td[data-label="Duration"] [aria-hidden="true"]` text is `0:50:00 · building 0:14` at the start time (fixture: row 1 started 02:10:00, phase since 02:46:00, clock 03:00:00). After `now.value += 1000` and `await nextTick()` it is `0:50:01 · building 0:14`; after `+= 59_000` more it is `0:51:00 · building 0:15`. `expect(spy).not.toHaveBeenCalled()` after all three moves. The host's own render function runs once (a counter in the host).
4. `RunsTable: an ended row has no OcTick and keeps its frozen time`: an `ended` fixture row shows `fmtDuration(elapsedSec)` before and after a tick.
5. `RunsTable with a nowMs prop is frozen`: `mountSuspended(RunsTable, { props: { runs, nowMs: Date.parse('2026-10-22T03:00:00Z') } })` shows `0:50:00` whatever the real clock does (this is the story path).
6. `WorkersTable: Elapsed counts with the clock` (same pattern as 3, one assertion).
7. `PipelineBar: only the current step ticks`: steps from the run fixture; current step `.dur` is `0:50` at 03:00:00 and `0:51` after `+= 60_000`; a done step's `.dur` does not change; the `.sr` text of the current step is `(current, 51 min so far)`.
8. `BudgetCard: the minutes follow the clock when phaseSince is given`: `budget = { phase: 'building', limitMin: 45, elapsedMin: 41, ... }`, `phaseSince = '2026-10-22T02:19:00.000Z'`, clock `03:00:00Z`: text `building 0:41 of 45 min`; after `+= 4 * 60_000` text `building 0:45 of 45 min`, the bar width `100%`; after `+= 60_000` it contains `(over budget)`. Without `phaseSince` the text stays `building 0:41 of 45 min` whatever the clock does.
9. `no live region in the cells`: the mounted RunsTable, PipelineBar and BudgetCard contain no `[aria-live]`, `[role="status"]`, `[role="timer"]` element.

Also add to `app/pages/oculus/pages.test.ts` (read how it mocks `useNow`/polls first; it already mounts `Runs`): `Runs page: the fast clock is on only when a shown run is running`. Mock `useNow` with `mockNuxtImport` is NOT needed: instead spy `FAST_MS`/`SLOW_MS` through the timers: with `vi.useFakeTimers()` mount the page with the runs fixture, `vi.getTimerCount()` includes one interval; `vi.advanceTimersByTime(2_000)` moves the Duration text by 2 s. With a fixture holding only `ended` and `lost` rows the Duration text does not move after 2 s and moves after 30 s. If this test is awkward under `mountSuspended`, assert the same through the `fast` getter: extract it as `const anyRunning = (runs: RunRow[]) => runs.some(isRunning)` in `oc-format.ts`, unit-test that (`anyRunning([]) === false`), and keep the page test to the one running case.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --dir scripts/nexus-web exec vitest run app/components/oc/tick.test.ts app/pages/oculus/pages.test.ts`
Expected: FAIL (`OcTick.vue` does not exist).

- [ ] **Step 3: Implement**

`OcTick.vue`:

```vue
<script setup lang="ts">
import { computed, inject } from 'vue'
import { NOW_KEY } from '../../utils/use-now'

// Renderless: the slot runs in this component's render, so a tick of the page clock re-renders only the time text inside it, never the table around it.
// A story or a test passes nowMs and the clock is fixed; a page passes nothing and the injected page clock is used.
const props = defineProps<{ nowMs?: number }>()
const clock = inject(NOW_KEY, null)
const now = computed(() => props.nowMs ?? clock?.value ?? Date.now())
defineSlots<{ default(p: { nowMs: number }): unknown }>()
</script>

<template><slot :now-ms="now" /></template>
```
(Slot prop names: write `:nowMs="now"` if Vue's camelCase slot prop is needed; the slot destructures `{ nowMs }`. Make the test 1 pass with whichever form works.)

Tables and cards (keep the existing helper functions; change only where `nowMs` is read):
- `RunsTable.vue`: `defineProps<{ runs: RunRow[]; nowMs?: number }>()`. The Duration `td` becomes: a row with `r.endedAt` renders the static markup with `durationCell(r, 0)` (an ended row never reads the clock: `totalSec` returns `elapsedSec`, `phaseTime` returns null for `ended`); every other row wraps the same markup in `<OcTick :now-ms="nowMs" v-slot="{ nowMs: t }">` and calls `durationCell(r, t)`. Put the shared markup in a tiny local template block or duplicate the 4 lines; do not change classes or attributes (baselines).
- `WorkersTable.vue`: `nowMs?: number`; the Elapsed `td` is `<OcTick :now-ms="nowMs" v-slot="{ nowMs: t }">{{ elapsed(w, t) }}</OcTick>`; a row with `endedAt` renders `elapsed(w, 0)` without OcTick.
- `PhaseTable.vue`: `nowMs?: number`; the Oldest `td` text wrapped in OcTick, same pattern.
- `PipelineBar.vue`: `nowMs?: number`. Replace the `rows` computed so it no longer reads the clock: it maps each step to `{ s }`. In the template, for `s.state === 'current'` render the `.sr` and `.dur` spans inside `<OcTick :now-ms="nowMs" v-slot="{ nowMs: t }">` using `stepTime(s, t)`; for other steps call `stepTime(s, 0)` (a done step reads only `durationSec`; a waiting or lost step returns null). Keep `durText`, `srText`, class names, the `live` class and the DOM order exactly (baselines).
- `BudgetCard.vue`: props `budget`, `phaseSince?: string | null`, `nowMs?: number`. Move `elapsed`, `over`, `pct` into one function `view(now: number)` and render the body inside `<OcTick :now-ms="nowMs" v-slot="{ nowMs: t }">` with `v-for="v in [view(t)]"` only if needed. `view`: `elapsed = phaseSince && Number.isFinite(Date.parse(phaseSince)) ? Math.max(0, Math.floor((now - Date.parse(phaseSince)) / 60_000)) : budget.elapsedMin ?? 0`. `active` (phase, limit and `budget.elapsedMin` all present) stays computed from the prop and does not read the clock. Output markup and classes unchanged.
- `pages/oculus/runs.vue`: `const nowMs = useNow({ fast: () => (poll.data.value?.runs ?? []).some(isRunning) })` and remove `:now-ms="nowMs"` from `<OcRunsTable>` (the const is then unused: call `useNow(...)` without storing it; it still provides `NOW_KEY`).
- `pages/oculus/index.vue`: `useNow({ fast: () => (oc.overview.value?.workers ?? []).some(isRunning) })`; remove `:now-ms` from `OcPhaseTable` and `OcWorkersTable`.
- `pages/oculus/run.vue`: `useNow({ fast: () => (run.value ? isRunning(run.value.row) : false) })` (declare it after `run`); remove `:now-ms` from `OcPipelineBar`; add `:phase-since="run.row.phaseSince"` to `<OcBudgetCard>`.
- `attention.vue` and `OcAttentionSummary.vue` stay `useNow()` (30 s). They still pass or inject the clock as before; leave them.
- Stories keep passing `nowMs` (a number): nothing to change in `RunsTable.stories.ts`, `PipelineBar.stories.ts`. `BudgetCard.stories.ts` passes no `phaseSince`: nothing to change.

- [ ] **Step 4: Run the tests and the type check**

```
pnpm --dir scripts/nexus-web exec vitest run app/components app/pages app/utils
pnpm --dir scripts/nexus-web typecheck
```
Expected: PASS; typecheck clean. Run the full `pnpm --dir scripts/nexus-web exec vitest run` once (DGS-613 baseline 372 tests plus the new ones; nothing else fails).

- [ ] **Step 5: Commit**

```
git add scripts/nexus-web/app/components/oc/OcTick.vue scripts/nexus-web/app/components/oc/tick.test.ts
git commit -m "feat(oculus): only the time text re-renders on a tick" -- scripts/nexus-web/app/components/oc scripts/nexus-web/app/pages/oculus
```

---

### Task 3: Browser: freeze the clock where seconds are asserted, and prove the tick

Needs Tasks 1 and 2.

**Files:**
- Create: `scripts/nexus-web/tests/e2e/freeze-clock.ts`
- Modify: `scripts/nexus-web/tests/e2e/oculus.spec.ts`
- Modify: `scripts/nexus-web/tests/a11y/oculus-axe.spec.ts`
- Modify: `scripts/nexus-web/tests/visual/oculus-mobile.spec.ts`

- [ ] **Step 1: Write the failing e2e tests** (they fail before Task 1 and 2 are in; here they must be written first against the new helper)

`freeze-clock.ts`:

```ts
import type { Page } from '@playwright/test'

// page.clock.install lets fake time run on, so a one-second counter would change a screenshot or a text check while it is taken.
// Fixing Date.now keeps every timer running but makes each tick write the same time.
export async function freezeClock(page: Page, iso: string): Promise<void> {
  await page.clock.install({ time: new Date(iso) })
  await page.clock.setFixedTime(new Date(iso))
}
```

In `oculus.spec.ts` add (the file's `beforeEach` installs the clock at `2026-10-22T03:00:00Z`; these tests use it, with no freeze, and move time with `runFor`):

```ts
test('Runs: the Duration counts every second while a run is running', async ({ page }) => {
  await page.goto(`${stub.url}/runs/`)
  const first = page.locator('tbody tr').first().locator('td[data-label="Duration"] [aria-hidden="true"]')
  await expect(first).toHaveText(/^0:50:0[0-1] · building 0:14$/)   // fake time runs on between install and the first read
  const before = await first.textContent()
  await page.clock.runFor(1000)
  const after = await first.textContent()
  expect(after).not.toBe(before)
  await page.clock.runFor(2000)
  await expect(first).not.toHaveText(after!)
  await expect(page.locator('td[data-label="Duration"] [aria-live], td[data-label="Duration"] [role="status"], td[data-label="Duration"] [role="timer"]')).toHaveCount(0)
})

test('Runs: a hidden tab goes back to the 30 s clock and comes back to one second', async ({ page }) => {
  await page.goto(`${stub.url}/runs/`)
  const first = page.locator('tbody tr').first().locator('td[data-label="Duration"] [aria-hidden="true"]')
  const setVisibility = (v: 'visible' | 'hidden') => page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    document.dispatchEvent(new Event('visibilitychange'))
  }, v)
  await setVisibility('hidden')
  const hiddenAt = await first.textContent()
  await page.clock.runFor(5_000)
  expect(await first.textContent()).toBe(hiddenAt)        // no per-second tick while hidden
  await page.clock.runFor(25_000)
  expect(await first.textContent()).not.toBe(hiddenAt)    // the 30 s clock still moves it
  await setVisibility('visible')
  const backAt = await first.textContent()
  await page.clock.runFor(1_000)
  expect(await first.textContent()).not.toBe(backAt)
})

test('Run page: the current step and the budget text move on the minute', async ({ page }) => {
  await page.goto(`${stub.url}/run/?id=builder-20261022T021000-a1b2c3`)
  const current = page.getByRole('list', { name: /pipeline/i }).locator('li').nth(2).locator('.dur')
  await expect(current).toHaveText('0:50')
  await page.clock.runFor(60_000)
  await expect(current).toHaveText('0:51')
})
```
(The fixture's budget phase since is `02:46:00`; check the actual stub numbers with a first run and set the budget text assertion to what the stub gives at the start and after +60 s. Do not guess: read the rendered text, then assert it.)

Switch the specs that assert or screenshot seconds to the frozen clock:
- `oculus.spec.ts`: the two DGS-613 tests (`Runs: the Duration cell shows the running phase and its time`, `Run page: the strip shows durations...`) call `await freezeClock(page, '2026-10-22T03:00:00Z')` first (a second `install` is not allowed: use a fresh `page` state by calling `freezeClock` only in a `test.describe` of its own, or call `page.clock.setFixedTime(new Date('2026-10-22T03:00:00Z'))` alone, because `beforeEach` already installed the clock). Use `setFixedTime` alone in `oculus.spec.ts`.
- `oculus-axe.spec.ts` test `the Duration cell and the strip read times in words`: replace its `page.clock.install(...)` line with `await freezeClock(page, '2026-10-22T03:00:00Z')`.
- `oculus-mobile.spec.ts`: replace `await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })` with `await freezeClock(page, '2026-10-22T03:00:00Z')`.

- [ ] **Step 2: Run them and see the new ones fail on main's code, pass on this branch**

Run: `pnpm --dir scripts/nexus-web exec playwright test tests/e2e/oculus.spec.ts -g "counts every second|hidden tab|move on the minute"` after `pnpm --dir scripts/nexus-web generate` (the e2e script runs `generate` first; the `-g` form needs it done once).
Expected on this branch: PASS. (To see the red state, `git stash` is NOT allowed: temporarily check out `main`'s `use-now.ts` with `git show main:scripts/nexus-web/app/utils/use-now.ts`, regenerate, run, and put the file back; skip this if time is short. The unit tests in Task 1 already prove red/green.)

- [ ] **Step 3: Commit**

```
git add scripts/nexus-web/tests/e2e/freeze-clock.ts
git commit -m "test(oculus): the counters tick every second and the tests freeze the clock" -- scripts/nexus-web/tests/e2e scripts/nexus-web/tests/a11y/oculus-axe.spec.ts scripts/nexus-web/tests/visual/oculus-mobile.spec.ts
```

---

### Task 4: The full browser gate, with no baseline change

Needs Tasks 1 to 3. Cost: about 40 minutes (DGS-613 ran it once on its last commit: e2e 82 passed 6 skipped; a11y 515 passed 1 skipped; visual 238 passed 210 skipped; web Vitest 372 of 372). Run it ONCE, on the final commit. Run a command in the foreground or in a pane the Builder watches; each of `e2e`, `a11y` starts `pnpm generate` itself.

**Files:** none expected. Only a spec fix if a gate step fails because of a ticking number.

- [ ] **Step 1: Web unit tests and types**

```
pnpm --dir scripts/nexus-web exec vitest run
pnpm --dir scripts/nexus-web typecheck
```
Expected: all pass (372 plus the new tests).

- [ ] **Step 2: Browser gate**

```
pnpm --dir scripts/nexus-web e2e:install
pnpm --dir scripts/nexus-web e2e
pnpm --dir scripts/nexus-web a11y
pnpm --dir scripts/nexus-web exec nuxt generate && pnpm --dir scripts/nexus-web build-storybook
pnpm --dir scripts/nexus-web visual
```
Expected: e2e and a11y pass (a11y includes the axe specs, light and dark, with `reducedMotion: 'reduce'`: they must pass UNCHANGED, which proves axe is unchanged); visual passes.

- [ ] **Step 3: Prove no baseline changed**

Run: `git status --short scripts/nexus-web/tests/visual`
Expected: empty output. If a baseline differs, a ticking number leaked in: find the spec that does not use `freezeClock`, fix it as in Task 3, rerun `pnpm --dir scripts/nexus-web visual`. NEVER run `visual:update`.

- [ ] **Step 4: Commit any spec fix, then stop**

If Step 3 needed a fix: `git commit -m "test(oculus): freeze the clock in the remaining spec" -- <the spec path>`. Otherwise nothing to commit.

## After the merge (conductor, not the Builder)

1. `sh scripts/nexus-web/build-www.sh` (publishes dist/site, see the spec's "First use").
2. Check the live tick without a human: a one-off Playwright script in the scratchpad (not in the repo) opens `https://oculus.pazurite.com/runs/`, reads the first running row's Duration text, waits 3 s of real time, reads it again, and checks it moved 2 to 4 s. Needs a running run (the conductor's own `conductor` row counts). If the Workbox cannot reach the site headless, or no run is running, report "not verified" with the reason.
