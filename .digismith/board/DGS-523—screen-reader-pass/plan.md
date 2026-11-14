# DGS-523 Screen-Reader Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The checklist for Jack's VoiceOver pass exists in the repo, matches what the page really does today, and a unit test keeps it from drifting.

**Architecture:** One Markdown file and one vitest file. No product code. The test reads the checklist and the page sources as text.

**Tech Stack:** Markdown, vitest 5 (page package), `node:fs`. pnpm only.

Spec: `spec.md` in this folder. Source: DGS-481 plan Task 20, corrected against the code on main (see the spec, "Gaps").

## Global Constraints

- Docs and one test only. No change to `app/`, to `EXCEPTIONS.md` or to any config.
- No file under the protected paths (section 13, DEFAULT_PROTECTED) is changed.
- Privacy: the checklist and the test hold patterns only. No real birth date, life length or stat value. The test file reads no profile.
- Jack runs the checklist. No task here claims the pass is done. No task runs `launchctl bootout`, `bootstrap`, `kill` or `kickstart`, or stops the live API. Only the read-only `launchctl print` is allowed.
- Commits are title-only, conventional, no AI attribution, with a pathspec, and a scope that is not the ticket key (the factory scan reads a key scope as a merge). Use scope `nexus-web`.
- Test command: from `scripts/nexus-web`, `pnpm vitest run tests/unit/voiceover-checklist.test.ts`.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/nexus-web/tests/a11y/voiceover-checklist.md` (new) | the checklist Jack runs |
| `scripts/nexus-web/tests/unit/voiceover-checklist.test.ts` (new) | keeps quoted strings in line with the code and keeps private data out |

## Task 1: Guard test first (fails, no checklist yet)

**Files:**
- Create: `scripts/nexus-web/tests/unit/voiceover-checklist.test.ts`

- [ ] **Step 1: Write the test**

```ts
// scripts/nexus-web/tests/unit/voiceover-checklist.test.ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const CHECKLIST = 'tests/a11y/voiceover-checklist.md'

describe('the VoiceOver checklist', () => {
  it('exists with its three parts and the sign-off line', () => {
    expect(existsSync(join(ROOT, CHECKLIST))).toBe(true)
    const t = read(CHECKLIST)
    expect(t).toContain('## Part A: Mac')
    expect(t).toContain('## Part B: iPhone')
    expect(t).toContain('## Part C: the two recorded exceptions')
    expect(t).toMatch(/^Sign-off: _+ \(name, date\)$/m)
  })

  it('has 11, 5 and 2 tick lines in Parts A, B and C', () => {
    const t = read(CHECKLIST)
    const part = (from: string, to?: string) => {
      const a = t.indexOf(from)
      const b = to ? t.indexOf(to) : t.length
      return t.slice(a, b).split('\n').filter(l => l.startsWith('- [ ] ')).length
    }
    expect(part('## Part A: Mac', '## Part B: iPhone')).toBe(11)
    expect(part('## Part B: iPhone', '## Part C')).toBe(5)
    expect(part('## Part C')).toBe(2)
  })

  // every string the checklist quotes must still be what the code says
  it.each([
    ['Skip to the calendar', 'app/pages/index.vue'],
    ['Use the arrow keys to move between weeks', 'app/components/CalendarGrid.vue'],
    ['Calendar loaded.', 'app/components/LifeCalendarView.vue'],
    ['Retrying…', 'app/components/StatePanel.vue'],
    ["role: 'alert'", 'app/components/StatePanel.vue'],
    ['week ${b + 1} of ${BOXES}', 'app/utils/grid-label.ts'],
    ["current: 'this week'", 'app/utils/grid-label.ts'],
    ['weeks lived', 'app/components/StatsBar.vue'],
    ['weeks left', 'app/components/StatsBar.vue'],
  ])('quotes "%s", which is still in %s', (text, file) => {
    expect(read(file)).toContain(text)
    // the checklist quotes the human text, not the code form
    const human = text.replace('week ${b + 1} of ${BOXES}', 'week W of 52').replace("current: 'this week'", 'this week').replace("role: 'alert'", 'alert').replace('Use the arrow keys to move between weeks', 'use the arrow keys')
    expect(read(CHECKLIST)).toContain(human)
  })

  it('does not describe the box by the tooltip (so the checklist line "not read twice" stays true)', () => {
    for (const f of ['GridRows', 'CalendarGrid', 'WeekTooltip']) {
      expect(read(`app/components/${f}.vue`)).not.toContain('aria-describedby')
    }
  })

  it('names both exceptions of EXCEPTIONS.md', () => {
    const ex = read('tests/a11y/EXCEPTIONS.md')
    const t = read(CHECKLIST)
    for (const wcag of ['2.5.8', '1.4.13']) {
      expect(ex).toContain(wcag)
      expect(t).toContain(wcag)
    }
  })

  it('holds no private data', () => {
    const t = read(CHECKLIST)
    expect(t).not.toMatch(/\b(19|20)\d\d-\d\d-\d\d\b/)
    expect(t.toLowerCase()).not.toContain('born')
    expect(t.toLowerCase()).not.toMatch(/life (length|of) \d+/)
    expect(t.toLowerCase()).not.toMatch(/life \d+/)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd scripts/nexus-web && pnpm vitest run tests/unit/voiceover-checklist.test.ts`
Expected: every case fails with ENOENT (no checklist yet), except the tooltip case, which passes (it reads only sources). The "holds no private data" case also fails with ENOENT. If a case fails on the SOURCE side (`toContain(text)` on a code file), the code differs from this plan: fix the string in the test to what the code says, do not change the code.

## Task 2: Write the checklist

**Files:**
- Create: `scripts/nexus-web/tests/a11y/voiceover-checklist.md`

- [ ] **Step 1: Create the file with this content**

````md
# VoiceOver pass for the life dashboard (DGS-481, DGS-523)

Open `https://pazurite.com/`. The iPhone must be on Tailscale. Part A runs on the Mac (Safari or Chrome, VoiceOver on with Cmd+F5). Part B runs on the iPhone (VoiceOver on in Settings, Accessibility, or triple-click the side button if set up). Part C is your decision on the two recorded exceptions.

Tick each line. If a line fails, write the line text and what was wrong under it.
Never write a birth date, an age count or the stat numbers you heard. The page shows your real data. Write "the number was read twice", not the number.

Everything here is a step for Jack. No agent runs these steps, and no agent stops or starts the live API.

## Stopping the API (only for the "API off" lines)

The safe way to hear the alert is the Storybook "StatePanel" stories (error and locked) at `https://pazurite.com/storybook/`. Use them for the alert lines. The live-API stop below is one optional check.

While the API is stopped, Oculus and Nightwatch go down too (they share it). Stop it for as short a time as you can.

The API is a LaunchAgent with KeepAlive on, so a plain kill is restarted within seconds. Only `bootout` keeps it stopped.

```sh
# stop (stays stopped)
launchctl bootout gui/$(id -u)/com.jazurite.digismith.nexus-api
# start again (plist: ~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist
```

Check: `launchctl print gui/$(id -u)/com.jazurite.digismith.nexus-api | head -3` shows the service after the start, and an error after the stop.

## Part A: Mac

- [ ] "Skip to the calendar" is the first stop, and Return on it jumps to the calendar.
- [ ] After the page loads you hear "Calendar loaded." with the weeks lived, weeks left and the percent.
- [ ] The three stats are read as a label with its value: "weeks lived", "weeks left", "lived".
- [ ] Quick Nav is off (press Left and Right arrow together until VoiceOver says "Quick Nav off"). Tab to the grid. You hear a grid with a name that tells you to use the arrow keys.
- [ ] An arrow key moves one week. Each box reads "Age N, week W of 52, D Month YYYY to D Month YYYY", then lived, this week or ahead.
- [ ] Row headers read "Age N". Column headers read "Week 1", "Week 13", "Week 26", "Week 39", "Week 52".
- [ ] Fn+Left and Fn+Right (Home and End) go to the first and last week of the row. Cmd+Fn+Left and Cmd+Fn+Right (first and last box) go to the first and last box. Fn+Up and Fn+Down (Page Up and Page Down) move ten years. On a full keyboard, Home, End, Ctrl+Home, Ctrl+End, Page Up and Page Down do the same.
- [ ] The tooltip shows over the focused box and Escape hides it.
- [ ] The tooltip text is not read a second time after the box name.
- [ ] Alert: open the StatePanel error story (or, optional, stop the API as above and reload). The panel is announced as an alert. Retry is reachable with Tab.
- [ ] Retry (on the live page after you start the API again): you hear "Retrying…" while it works. After it works, focus is on the grid. If you did not stop the API, mark this line "not run".

## Part B: iPhone

- [ ] "Skip to the calendar" is the first stop (swipe right from the top), and double-tap jumps to the calendar.
- [ ] The three stats are read as a label with its value.
- [ ] Touching a box reads "Age N, week W of 52, D Month YYYY to D Month YYYY", then lived, this week or ahead.
- [ ] Swipe right from a box moves to the next box and reads it.
- [ ] The StatePanel error story (or, optional, the live page with the API stopped) is announced as an alert, and double-tap on Retry works.

## Part C: the two recorded exceptions

Read `tests/a11y/EXCEPTIONS.md`. Mark each one accept or reject. A rejection becomes a new ticket (tell the Maestro which one).

- [ ] Accept  [ ] Reject: WCAG 2.5.8 target size on the grid boxes (see EXCEPTIONS.md item 1).
- [ ] Accept  [ ] Reject: WCAG 1.4.13 "hoverable" for the tooltip (see EXCEPTIONS.md item 2).

Sign-off: ______ (name, date)
````

- [ ] **Step 2: Run the test and see it pass**

Run: `cd scripts/nexus-web && pnpm vitest run tests/unit/voiceover-checklist.test.ts`
Expected: all pass. If the tick-count case fails, the parts must hold 11, 5 and 2 lines.
If "quotes ... Retrying…" fails because the file has `…` as a different character, copy the character from `StatePanel.vue`.

- [ ] **Step 3: Run the whole page suite once**

Run: `cd scripts/nexus-web && pnpm vitest run`
Expected: pass; the new file is included. The `built-*` tests skip without a build (unchanged).

- [ ] **Step 4: Check the commands in the checklist against the install**

Run (read-only): `launchctl print gui/$(id -u)/com.jazurite.digismith.nexus-api | head -4`
Expected: the service path is `~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist`. Do NOT run `bootout` or `bootstrap`: those are Jack's steps.

## Task 3: Commit and hand over

- [ ] **Step 1: Commit with a pathspec**

```bash
git add -- scripts/nexus-web/tests/a11y/voiceover-checklist.md scripts/nexus-web/tests/unit/voiceover-checklist.test.ts
git commit -m "docs(nexus-web): add the screen-reader sign-off checklist" -- scripts/nexus-web/tests/a11y/voiceover-checklist.md scripts/nexus-web/tests/unit/voiceover-checklist.test.ts
```

- [ ] **Step 2: Hand over to Jack**

Report: the checklist path, the test result, and the two things only Jack does: run Parts A to C on the Mac and the iPhone, and accept or reject each exception. The ticket stays in Jack's sign-off until he signs the line. Do not mark the ticket done.

## Self-Review (spec coverage)

| Spec item | Where it is built |
|---|---|
| Checklist file, parts and sign-off line | Task 2 |
| Gap 2 (load announcement) | Task 2, Part A line 2 |
| Gap 3 (label and value) | Task 2, Part A line 3, Part B line 2 |
| Gap 4 (tooltip read once) | Task 2, Part A line 9; Task 1 test on `aria-describedby` |
| Gap 5 (Mac and iPhone split) | Task 2, Parts A and B |
| Gap 6 (no real numbers in notes) | Task 2 header; Task 1 "no private data" |
| Gap 7 (drift guard) | Task 1 |
| Gap 8 (accept or reject per exception) | Task 2, Part C |
| Gap 9 (Mac key chords, Quick Nav) | Task 2, Part A lines 4 and 7 |
| Gap 10 (API stop and start procedure, safe Storybook path) | Task 2, "Stopping the API"; Task 2 step 4 |
| Done when 1 and 2 | Task 2 steps 2 and 3 |
| Done when 3 and 4 | Jack, after the merge (Task 3 step 2) |
