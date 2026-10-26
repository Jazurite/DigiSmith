# DGS-577 Implementation Plan: the catch-up must not show old state as fresh

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The catch-up shows when the block content last changed, flags old items, says "unknown" when Running cannot be rebuilt, shows warnings in Health, and warns when watched files are newer than the block.

**Architecture:** The state block gets three optional header lines (`Changed:`, `Watch:`, `Running: unknown (...)`). `refresh.ts` writes them, `state.ts` reads them and builds warnings, `catch-up.ts` renders them into the existing Health text. No new template section, no new module except one small mtime helper.

**Tech Stack:** TypeScript run with `node --experimental-strip-types`, vitest, pnpm. Spec: `spec.md` in this folder (approved by Jack through the conductor, 2026-10-26).

## Global Constraints

- Stale age: 2 days (one constant `STALE_AFTER_MS = 2 * 24 * 3600_000` in `scripts/conductor/state.ts`).
- Times are written UTC+7 with `iso7()`.
- The catch-up template (`skills/generate-comment/templates/catch-up.md`) and the `CatchUp` type in `scripts/catch-up.ts` do not change.
- The merge check runs only for project `DigiSmith` and only when `<repoDir>/.git` exists.
- Watch paths: depth 3, at most 2000 entries per path; a missing path is a warning, never an error.
- Old blocks without `Changed:` still parse. Shown as "content time not recorded".
- Warnings still go to stderr too.
- pnpm only. Commit messages are title-only conventional commits, no AI attribution. Push after the final commit.
- Run tests with `pnpm vitest run scripts/conductor` from the repo root.

## File Structure

- `scripts/conductor/state-block.ts`: header parse and render (`Changed`, `Watch`, `Running: unknown`).
- `scripts/conductor/watch.ts` (new): `newestMtime(path)`, the bounded mtime walk.
- `scripts/conductor/refresh.ts`: sets `Changed:`, Running unknown, `runs_on` warning, `Watch:` reuse.
- `scripts/conductor/cli.ts`: `--watch` flag for `state-refresh`.
- `scripts/conductor/state.ts`: reads the new fields, builds the stale and watch warnings, restricts the merge check.
- `scripts/conductor/catch-up.ts`: Health text, visible warnings.
- `docs/conductor-state.md`, `skills/catch-up/SKILL.md`: the plain rule and the new lines.

### Task 1: Block header lines

**Files:**
- Modify: `scripts/conductor/state-block.ts` (`NoteState`, `parseStateBody` header branch, `renderStateBody`)
- Test: `scripts/conductor/state-block.test.ts`

**Interfaces:**
- Produces: `NoteState` gets `changed?: string`, `watch?: string[]`, `runningUnknown?: string`.
  Header text: `Changed: <time>`, `Watch: a, b` (or `none`), `Running: unknown (<reason>)`.
  `renderStateBody` order: Updated, Changed, Conductor, Main, Workers, Watch, Running-unknown line, blank line.

- [ ] **Step 1: Write the failing test** (append to `state-block.test.ts`)

```ts
describe("header lines of DGS-577", () => {
  const body = `Updated: 2026-10-26T10:00+07:00
Changed: 2026-10-24T09:00+07:00
Conductor: c
Watch: /a/note.md, /a/board
Running: unknown (no herdr workspace)

## Running
none

## Waiting for Jack
none

## Decided under the mandate
none

## Parked or failed
none

## Next
none

## Health
- Seats and usage: none
`;
  it("parses Changed, Watch and Running unknown", () => {
    const { state, problems } = parseStateBody(body);
    expect(problems).toEqual([]);
    expect(state.changed).toBe("2026-10-24T09:00+07:00");
    expect(state.watch).toEqual(["/a/note.md", "/a/board"]);
    expect(state.runningUnknown).toBe("no herdr workspace");
  });
  it("round-trips through renderStateBody", () => {
    const { state } = parseStateBody(body);
    expect(parseStateBody(renderStateBody(state)).state).toEqual(state);
  });
  it("rejects a bad Changed time and accepts a block without one", () => {
    expect(parseStateBody(body.replace("2026-10-24T09:00+07:00", "yesterday")).problems[0]).toMatch(/Changed needs a time/);
    expect(parseStateBody(body.replace(/Changed:.*\n/, "")).state.changed).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run scripts/conductor/state-block.test.ts`
Expected: FAIL (`changed` undefined, a "text before the first heading" problem).

- [ ] **Step 3: Implement**

In `NoteState` add:
```ts
  /** when the block content (not the refresh time) last changed */
  changed?: string;
  /** files and folders whose mtime state-refresh compares with `changed` */
  watch?: string[];
  /** set when Running could not be rebuilt: the reason */
  runningUnknown?: string;
```
In `parseStateBody`, in the `section === undefined` branch, add before `else if (u !== undefined)`:
```ts
      const ch = prefixed(line, "Changed:");
      const wa = prefixed(line, "Watch:");
      const ru = prefixed(line, "Running:");
      ...
      else if (ch !== undefined) {
        const t = parseTime(ch);
        if (t) state.changed = t;
        else problems.push(`line ${n}: Changed needs a time like 2026-10-13T14:05+07:00 (got "${ch}")`);
      } else if (wa !== undefined) state.watch = isNone(wa) ? [] : wa.split(",").map((x) => x.trim()).filter(Boolean);
      else if (ru !== undefined) {
        const m = /^unknown \((.*)\)$/.exec(ru);
        if (m) state.runningUnknown = m[1];
        else problems.push(`line ${n}: Running here must read "unknown (<reason>)" (got "${ru}")`);
      }
```
(chain them into the existing `if/else if` ladder). Update the "text before the first heading" problem text to list the new names.
In `renderStateBody` head array:
```ts
    s.updated ? `Updated: ${s.updated}` : "",
    s.changed ? `Changed: ${s.changed}` : "",
    s.conductor ? `Conductor: ${s.conductor}` : "",
    s.main ? `Main: ${s.main}` : "",
    s.workers ? `Workers: ${s.workers.join(", ") || "none"}` : "",
    s.watch ? `Watch: ${s.watch.join(", ") || "none"}` : "",
    s.runningUnknown !== undefined ? `Running: unknown (${s.runningUnknown})` : "",
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run scripts/conductor/state-block.test.ts` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/conductor/state-block.ts scripts/conductor/state-block.test.ts
git commit -m "feat(dgs-577): Changed, Watch and Running unknown lines in the state block"
```

### Task 2: Refresh writes the content time, Running unknown, runs_on warning, Watch

**Files:**
- Modify: `scripts/conductor/refresh.ts` (`RefreshOpts`, herdr block, `state` construction), `scripts/conductor/cli.ts` (`--watch`, usage text)
- Test: `scripts/conductor/refresh.test.ts`, `scripts/conductor/cli.test.ts`

**Interfaces:**
- Consumes: Task 1 `NoteState` fields.
- Produces: `RefreshOpts.watch?: string[]` (undefined = reuse `old.watch`). Helper `bodyKey(s: NoteState): string` = `renderStateBody({ ...s, updated: undefined, changed: undefined, main: undefined })`.

- [ ] **Step 1: Write the failing tests** (in `refresh.test.ts`, reuse its `runner`, `deps`-style helpers; follow how the existing tests call `refreshState`)

```ts
it("keeps Changed when nothing changed, sets it when something did", async () => {
  const first = await refreshState(opts, deps());           // writes the block
  const t1 = first.state.changed;
  const later = { ...deps(), now: () => new Date(NOW.getTime() + 3 * 3600_000) };
  const second = await refreshState(opts, later);
  expect(second.state.updated).not.toBe(first.state.updated);
  expect(second.state.changed).toBe(t1);
  fs.writeFileSync(note, fs.readFileSync(note, "utf-8").replace("Do Y", "Do Z"));
  const third = await refreshState(opts, later);
  expect(third.state.changed).toBe(third.state.updated);
});
it("writes Running unknown, not the old rows, when herdr fails", async () => {
  const r = await refreshState(opts, deps({ herdrFail: true }));
  expect(r.state.running).toEqual([]);
  expect(r.state.runningUnknown).toMatch(/herdr agent list failed|exit/);
});
it("names the conductor card when it has no runs_on", async () => {
  const r = await refreshState({ ...opts, herdrWorkspace: undefined }, depsWithCard({ role: "conductor", name: "digismith-conductor" }));
  expect(r.state.runningUnknown).toMatch(/card digismith-conductor has no runs_on/);
});
it("stores and reuses Watch", async () => {
  const a = await refreshState({ ...opts, watch: ["/x/note.md"] }, deps());
  const b = await refreshState(opts, deps());
  expect(b.state.watch).toEqual(["/x/note.md"]);
});
```
(`depsWithCard` = the existing deps with `listCards: () => [{ card: {...c, started: "2026-10-13T00:00:00Z"}, path: "x" }]`; add it next to the existing helper.)
In `cli.test.ts` add: `state-refresh --watch a,b` passes `watch: ["a","b"]` (follow the existing `--workers` test).

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run scripts/conductor/refresh.test.ts scripts/conductor/cli.test.ts` Expected: FAIL.

- [ ] **Step 3: Implement**

In the herdr `try`, replace the no-workspace throw with a specific reason:
```ts
if (!workspace) throw new Error(conductorCard ? `conductor card ${opts.conductor} has no runs_on and no workspace is pinned (HERDR_WS or --herdr-workspace)` : `no conductor card ${opts.conductor} found and no workspace is pinned (HERDR_WS or --herdr-workspace)`);
```
Replace the `catch` body:
```ts
    runningUnknown = (e as Error).message;
    running = [];
    warnings.push(`Running is unknown: ${runningUnknown}`);
```
(declare `let runningUnknown: string | undefined;` beside `let running`). In the `state` object add `runningUnknown`, `watch: opts.watch ?? old.watch`, and compute `changed` after the object is built:
```ts
const bodyKey = (s: NoteState) => renderStateBody({ ...s, updated: undefined, changed: undefined, main: undefined });
state.changed = old.changed !== undefined && bodyKey(state) === bodyKey(old) ? old.changed : old.changed === undefined && bodyKey(state) === bodyKey(old) ? undefined : state.updated;
```
(Meaning: unchanged with a recorded time keeps it; unchanged with none stays unset, which shows "not recorded"; changed sets now.) Add `watch?: string[]` to `RefreshOpts`. In `renderRefresh` print `Running: unknown (...)` when set. In `cli.ts` add `watch: { type: "string" }`, pass `watch: v.watch === undefined ? undefined : v.watch.split(",").map((x) => x.trim()).filter(Boolean)`, and add `[--watch a,b]` to the usage line plus one sentence: "--watch lists files or folders whose change after the block content is warned about."

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run scripts/conductor` Expected: PASS (fix any existing refresh test that expected "Running is kept as it was").

- [ ] **Step 5: Commit**

```bash
git add scripts/conductor/refresh.ts scripts/conductor/cli.ts scripts/conductor/refresh.test.ts scripts/conductor/cli.test.ts
git commit -m "feat(dgs-577): state-refresh records content time, Running unknown and watch paths"
```

### Task 3: collectState: age flags, watch warnings, merge check limits

**Files:**
- Create: `scripts/conductor/watch.ts`, `scripts/conductor/watch.test.ts`
- Modify: `scripts/conductor/state.ts` (`State.note`, `STALE_AFTER_MS`, note branch, merge block)
- Test: `scripts/conductor/state.test.ts`

**Interfaces:**
- Produces: `newestMtime(p: string): { time: Date; entries: number } | undefined` (file: its mtime; folder: newest file mtime, depth 3, stops at 2000 entries; undefined when the path does not exist).
- `State.note` gets `changed?: string; watch?: string[]`. `collectState` pushes warnings; a Running-unknown block gives `running = [{ worker: "unknown", key: "-", stage: <reason>, since: asOf }]`.

- [ ] **Step 1: Write the failing tests**

`watch.test.ts`:
```ts
it("returns the newest mtime of a folder and undefined for a missing path", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "w577-"));
  fs.mkdirSync(path.join(d, "a/b"), { recursive: true });
  const f = path.join(d, "a/b/x.md");
  fs.writeFileSync(f, "x");
  const t = new Date("2026-10-20T00:00:00Z");
  fs.utimesSync(f, t, t);
  expect(newestMtime(d)?.time.toISOString()).toBe(t.toISOString());
  expect(newestMtime(path.join(d, "nope"))).toBeUndefined();
});
```
`state.test.ts` (follow its existing note-writing helpers; block text from `SAMPLE_BODY` with the lines replaced):
- block with `Changed:` 3 days before `now` gives a warning matching `content unchanged for 3 days`; with `Changed:` 1 day before: no such warning.
- a Waiting row `since` 3 days old gives `Waiting item ... is 3 days old`; a Running row likewise.
- a `Watch:` file with mtime after `Changed:` gives `changed <time>, after the block content`; older: none; missing path: `watch path ... not found`.
- block without `Changed:`: `note.changed` undefined, warning `content change time not recorded`.
- project `Emma`: runner is never called with `git` (assert on recorded calls), no `git log` warning; repoDir without `.git` and project `DigiSmith`: same.
- `Running: unknown (why)` block: `state.running` has the single unknown row.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run scripts/conductor/watch.test.ts scripts/conductor/state.test.ts` Expected: FAIL.

- [ ] **Step 3: Implement**

`watch.ts`:
```ts
// Bounded mtime walk for state-refresh's Watch paths (DGS-577).
import * as fs from "node:fs";
import * as path from "node:path";

const MAX_DEPTH = 3;
const MAX_ENTRIES = 2000;

export function newestMtime(p: string): { time: Date; entries: number } | undefined {
  let st: fs.Stats;
  try {
    st = fs.statSync(p);
  } catch {
    return undefined;
  }
  let newest = st.mtime;
  let entries = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH) return;
    for (const name of fs.readdirSync(dir)) {
      if (++entries > MAX_ENTRIES) return;
      const full = path.join(dir, name);
      let s: fs.Stats;
      try { s = fs.lstatSync(full); } catch { continue; }
      if (s.isFile() && s.mtime > newest) newest = s.mtime;
      if (s.isDirectory()) walk(full, depth + 1);
    }
  };
  if (st.isDirectory()) {
    newest = new Date(0);
    walk(p, 1);
    if (newest.getTime() === 0) newest = st.mtime;
  }
  return { time: newest, entries };
}
```
In `state.ts`: export `STALE_AFTER_MS`; extend `State.note` type; in the block branch set `state.note.changed = s.changed; state.note.watch = s.watch;` and, when `s.runningUnknown` is set, `state.running = [{ worker: "unknown", key: "-", stage: \`Running cannot be read: ${s.runningUnknown}\`, since: state.asOf }]`. After the block branch add a function `ageWarnings(state, now, warnings)`:
- days = `Math.floor(ms / 86_400_000)`.
- `changed` set and older than `STALE_AFTER_MS`: `state block content unchanged for ${days} days (since ${changed}): Parked, Decided and Next may be old`.
- `changed` unset and block found: `state block content change time not recorded (the next refresh that changes it records it)`.
- for each Running and Waiting row (real rows only, skip the unknown row) with `since` older than the limit: `${Running|Waiting} item "${label}" is ${days} days old`.
- for each `watch` path: `newestMtime`; undefined: `watch path ${p} not found`; time later than `Date.parse(changed ?? updated)`: `${p} changed ${iso7(time)}, after the block content (${changed ?? updated}): the block may be behind`.
Wrap the merge section: `if (opts.project === "DigiSmith" && fs.existsSync(path.join(opts.repoDir, ".git")))` around both `git log origin/main` calls, with `else state.sources.git = "skipped"`. Keep the done-list git call under the same guard.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run scripts/conductor` Expected: PASS (adjust old tests that call collectState for a non-DigiSmith project with git; give them `project: "DigiSmith"` and a `.git` folder).

- [ ] **Step 5: Commit**

```bash
git add scripts/conductor/watch.ts scripts/conductor/watch.test.ts scripts/conductor/state.ts scripts/conductor/state.test.ts
git commit -m "feat(dgs-577): age flags, watch-path warnings and a merge check that only runs in a DigiSmith checkout"
```

### Task 4: Catch-up Health shows the content time and the warnings

**Files:**
- Modify: `scripts/conductor/catch-up.ts` (`buildCatchUp`), `scripts/conductor/catch-up-cli.ts` (`realDeps.collectState` passes `project`; unchanged otherwise)
- Test: `scripts/conductor/catch-up.test.ts`, `scripts/conductor/catch-up-cli.test.ts`

**Interfaces:**
- Consumes: `collected.note.updated`, `collected.note.changed`, `collected.note.stale`, `collected.warnings`, refresh warnings.
- Produces: Health Server text ends with `; state block refreshed <UTC+7>, <age> ago; content changed <UTC+7>, <age> ago` (or `content change time not recorded`), then `; warnings: w1; w2; ... (+N more)` with at most 5 shown.

- [ ] **Step 1: Write the failing tests** (in `catch-up.test.ts`, extend the existing "shows the block's age" case)

```ts
it("shows refresh time and content time apart, and the warnings in Health", async () => {
  const collect = async () => ({ ...state, warnings: ["w1", "w2"], note: { updated: "2026-10-13T14:00+07:00", changed: "2026-10-10T09:00+07:00" } });
  const r = await buildCatchUp(opts, { ...deps, collectState: collect, refresh: async () => ["herdr failed"] });
  expect(r.text).toMatch(/refreshed .*, \d+ (min|h) ago; content changed .*, 3 days? ago|content changed .* ago/);
  expect(r.text).toContain("warnings: state-refresh: herdr failed; w1; w2");
});
it("says the content time is not recorded", async () => {
  const collect = async () => ({ ...state, note: { updated: "2026-10-13T14:00+07:00" } });
  expect((await buildCatchUp(opts, { ...deps, collectState: collect })).text).toContain("content change time not recorded");
});
it("caps the warnings at five", async () => {
  const collect = async () => ({ ...state, warnings: ["a", "b", "c", "d", "e", "f", "g"] });
  expect((await buildCatchUp(opts, { ...deps, collectState: collect })).text).toContain("(+2 more)");
});
```
Reuse the file's existing `opts`, `deps`, `state` fixtures (read the neighbouring test to match names).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run scripts/conductor/catch-up.test.ts` Expected: FAIL.

- [ ] **Step 3: Implement**

Add a small `ago(ms)` helper (`< 90 min` shows `N min`, `< 48 h` shows `N h`, else `N days`). Replace the `if (updated) {...}` block:
```ts
const parts: string[] = [];
if (updated) parts.push(`state block refreshed ${toUtc7(new Date(updated))}, ${ago(now.getTime() - Date.parse(updated))} ago${collected.note?.stale ? ", OLDER than the newest merge" : ""}`);
const changed = collected.note?.changed;
if (updated) parts.push(changed ? `content changed ${toUtc7(new Date(changed))}, ${ago(now.getTime() - Date.parse(changed))} ago` : "content change time not recorded");
const all = [...warnings, ...(state.warnings ?? [])];
if (all.length) parts.push(`warnings: ${all.slice(0, 5).join("; ")}${all.length > 5 ? ` (+${all.length - 5} more)` : ""}`);
if (parts.length) state.health = { ...state.health, server: `${state.health.server}; ${parts.join("; ")}` };
```
(Move the `for (const w of state.warnings ?? []) warnings.push(w)` line after this block so warnings are not counted twice; `warnings` here already holds the `state-refresh:` entries.) Keep the stderr output in `main()`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run scripts/conductor` Expected: PASS (update the old "state block updated ... old" expectation).

- [ ] **Step 5: Commit**

```bash
git add scripts/conductor/catch-up.ts scripts/conductor/catch-up-cli.ts scripts/conductor/catch-up.test.ts scripts/conductor/catch-up-cli.test.ts
git commit -m "feat(dgs-577): the catch-up Health shows content time and warnings"
```

### Task 5: Docs and the skill text

**Files:**
- Modify: `docs/conductor-state.md`, `skills/catch-up/SKILL.md`
- Test: `scripts/conductor/catch-up-skill.test.ts` (extend only if it asserts the changed sentence)

- [ ] **Step 1:** In `docs/conductor-state.md` add after the first paragraph: "The depot block is the only state the catch-up reads. A project note (for example `Workspace/Emma/.../note.md`) is not read. A conductor with a project note passes it to `--watch`; the catch-up then warns when that file is newer than the block content."
- [ ] **Step 2:** In the routine command add `[--watch <project note>,<board folder>]` and one sentence on it. In "What the refresh does" replace "Running is kept as it was" with: "When herdr cannot be read or no workspace is known (a card without `runs_on` counts), the block says `Running: unknown (<reason>)` and has no Running rows."
- [ ] **Step 3:** Replace the "Age and the warning" section: describe `Updated:` (refresh time), `Changed:` (content time, kept when a refresh changes nothing), the 2-day flag, the watch warning, the merge check (DigiSmith project in a checkout only), and the Health `warnings:` list (first five).
- [ ] **Step 4:** In `skills/catch-up/SKILL.md` replace the last paragraph's first sentence with the new Health shape and say: a `warnings:` list or a `content changed ... N days ago` line is part of the output; say it in one line after the catch-up if a warning names a stale block or Running unknown.
- [ ] **Step 5:** Run `pnpm vitest run scripts/conductor/catch-up-skill.test.ts`, then the full `pnpm vitest run scripts/conductor`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add docs/conductor-state.md skills/catch-up/SKILL.md scripts/conductor/catch-up-skill.test.ts
git commit -m "docs(dgs-577): the depot block is the only state the catch-up reads"
```

### Task 6: Data check and end-to-end proof (no code)

- [ ] **Step 1:** `grep runs_on ~/.digismith-depot/sessions/Emma/cards/*emma-conductor*` (read only). If missing, the Emma conductor adds `runs_on: herdr w3:p1` to its card; this plan does not edit the card.
- [ ] **Step 2:** Run `node --experimental-strip-types scripts/conductor/cli.ts state-refresh --project Emma --conductor emma-conductor --watch <project note>,<board folder> --dry-run` and check the output shows no Running-unknown line.
- [ ] **Step 3:** Run the catch-up for Emma from the plugin cache after the release; Health must show both times and any watch warning.

## Self-Review

- Spec decisions 1-8 map to Tasks 1-2 (1, 4, 7), 3 (3, 6), 4 (2, 5), 5 (8). Task 6 covers the runs_on data gap.
- Names used across tasks: `changed`, `watch`, `runningUnknown`, `STALE_AFTER_MS`, `newestMtime`, `bodyKey` are the same everywhere.
- No placeholders; test helper names (`deps`, `opts`, `state`, `depsWithCard`) come from the existing test files and the task says to match them.

## Definition of Ready

| Check | Result |
|---|---|
| Spec | Done, approved by Jack through the conductor on 2026-10-26. |
| Plan | Done: 5 code and docs tasks plus one data check. |
| Milestone | Not set on the ticket by this refinement. Proposed: Dawn (V1), because the catch-up is the Maestro's daily view and the report came from a live project (Emma). The conductor confirms or corrects it. |
| Blockers | None. DGS-462 (merged) is the base. No other ticket touches `refresh.ts`, `state.ts`, `catch-up.ts` that I found; the conductor should check for a parallel DGS-557 or DGS-498 edit of `scripts/conductor/`. |
| Mode | Autonomous. Confirmed: the contract is fully defined, tests prove it, nothing needs Jack mid-build. |
| Sign-off | Auto. Confirmed: internal tool; the only wording is Health text (`content changed ...`, `Running is unknown`) which the spec fixes. The release carries a plugin version bump (all readers need the new header parser). |
| Open data step | The `emma-conductor` card's `runs_on` (Task 6). Not a blocker for the build. |
