# DGS-664 Conductor Flux at the Next Idle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dg conductor flux` renews an idle conductor at any hour; the night window is gone and the checks are the only gate.

**Architecture:** Remove `NIGHT_WINDOW` and `inNightWindow` from `scripts/conductor/flux.ts` and step 0's window check. Sharpen two existing checks (any-status worker tab, three more in-flight words). Change the usage and comment text. First use runs after the merge. No new file in the repo, no new herdr verb, no ClickUp call.

**Tech Stack:** TypeScript run with `node --experimental-strip-types`, vitest, pnpm.

Spec: `spec.md` (same folder as this plan; attached to DGS-664). Section letters D1 to D7 below point to it.

## Global Constraints

- pnpm only (`pnpm test`), never npm.
- The herdr guard in `flux-herdr.ts` does not change: four verbs only (list, get, pane read, prompt). No close, kill, focus, create or key-send verb.
- Skip reason names stay: `status_<x>`, `input_typed`, `input_box_unreadable`, `worker_running:<name>`, `note_running_rows`, `note_waiting_rows`, `note_ticket_in_flight:<KEY>`, `note_stale`, `changed_before_clear`, `refused_target`. Only `outside_night_window` and `checks.night` are removed.
- A maestro card and the sender `digismith-conductor` (unless named) stay refused.
- A dry run sends nothing, ever.
- Reply and comment text: short plain sentences. Times in UTC+7 first.
- Build in a worktree and branch (`DGS-664__...`), never on main. Merge order includes the post-finish hooks (plugin bump, report.html, plan.md commit with a pathspec).
- Nothing in `~/.digismith-depot`, the runbook, memory or the conductor notes is edited by a build task. Task 3 is a first-use task run by the conductor with the Maestro.

## File Structure

- Modify `scripts/conductor/flux.ts`: header comment, delete `NIGHT_WINDOW` and `inNightWindow`, step 0, the `workers` loop, `IN_FLIGHT`.
- Modify `scripts/conductor/flux.test.ts`: remove the night tests, add day, worker-status and in-flight tests.
- Modify `scripts/conductor/flux-cli.ts`: header comment and `FLUX_USAGE`.
- Modify `scripts/conductor/cli.ts`: usage line 36.
- Modify `scripts/conductor/flux-io.test.ts`: add a usage test.

---

### Task 1: The idle rule in the flux module

**Files:**
- Modify: `scripts/conductor/flux.ts` (header lines 1-4 and 11-12, `inNightWindow` near line 99, step 0 near lines 261-268, the `workers` loop in step 5, `IN_FLIGHT` near line 156)
- Test: `scripts/conductor/flux.test.ts`

**Interfaces:**
- Consumes: existing `fluxConductor(target, opts, deps)`, `scanNoteInFlight(text)`, `FluxTarget.workers`.
- Produces: the same exports minus `NIGHT_WINDOW` and `inNightWindow`. `FluxResult.checks` has no `night` key. `scanNoteInFlight` also returns a key for `to do`, `in progress`, `claimed`. A name in `target.workers` that herdr lists in any status skips with `worker_running:<name>`.

- [ ] **Step 1: Write the failing tests**

In `scripts/conductor/flux.test.ts`:

1. Change the import: delete `NIGHT_WINDOW,` and `inNightWindow,` from the first import list.
2. Replace the two constants and the default clock. Delete `const NIGHT = ...` and `const DAY = ...` and add:

```ts
const DAY = new Date("2026-10-13T12:00:00Z"); // 19:00 UTC+7, daytime; after the note (11:50Z) and the last work (10:00Z)
```

In `beforeEach` change `clock = NIGHT;` to `clock = DAY;`.
3. Delete the whole `describe("night window", ...)` block (3 tests) and the test `"outside the night window"` in `describe("skips")`.
4. In `describe("dry run")`, first test: delete the lines `clock = DAY;` and `expect(r.checks.night).toMatch(/outside.*would skip/);`, and add `expect(r.checks).not.toHaveProperty("night");`. Rename the test to `"does every check, sends nothing, reports the plan, works by day"` (same name; keep it).
5. Replace the test `"a worker of the target list that herdr shows working"` with:

```ts
  it.each(["working", "blocked", "idle", "done"])("a worker of the target list that herdr shows %s", async (s) => {
    herdr.agents.push({ name: "dgs-9", pane_id: "w2:p9", agent_status: s, session: "w-1" });
    await skipped("worker_running:dgs-9", {}, target({ workers: ["dgs-9"] }));
  });
  it("a worker name that herdr does not list does not skip", async () => {
    const r = await fluxConductor(target({ workers: ["dgs-9"] }), {}, deps());
    expect(r.result).toBe("fluxed");
  });
```

6. In `describe("pure readers")`, after the `scanNoteInFlight` test, add:

```ts
  it("scanNoteInFlight: to do, in progress and claimed count; merged, parked and negated lines do not", () => {
    const sec = (line: string) => `## new\n- ${line}\n`;
    expect(scanNoteInFlight(sec("DGS-9 in progress"))).toBe("DGS-9");
    expect(scanNoteInFlight(sec("DGS-9 to do, Mode Autonomous"))).toBe("DGS-9");
    expect(scanNoteInFlight(sec("DGS-9 claimed by the scan"))).toBe("DGS-9");
    expect(scanNoteInFlight(sec("DGS-9 merged, was in progress"))).toBeUndefined();
    expect(scanNoteInFlight(sec("No ticket in progress. DGS-9 parked."))).toBeUndefined();
    expect(scanNoteInFlight(`## a\n- DGS-1 in progress\n\n## Session end x (s) 2026\nHandoff: card x\n`)).toBeUndefined();
  });
```

7. Add a day test to `describe("flux")` (after the first test there):

```ts
  it("fluxes by day: no clock check exists", async () => {
    clock = new Date("2026-10-13T05:00:00Z"); // 12:00 UTC+7
    const r = await fluxConductor(target(), {}, deps());
    expect(r.result).toBe("fluxed");
    expect(r.checks).not.toHaveProperty("night");
  });
```

If the run-log test (`"appends one JSON line to the run log when asked"`) reads a file named after the clock date, the new `DAY` date is `2026-10-13`; adjust the expected file name from the old night date (`2026-10-14`) to `2026-10-13`. The `ts` in the log is UTC+7 (`iso7`), so 19:00 UTC+7 stays on 2026-10-13.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/conductor/flux.test.ts`
Expected: FAIL. The new worker-status cases (`idle`, `done`) and the in-flight words fail; "fluxes by day" fails with `outside_night_window` for the 05:00Z clock.

- [ ] **Step 3: Write the minimal implementation**

In `scripts/conductor/flux.ts`:

a. Replace the header comment (lines 1-3) with:

```ts
// DGS-435: the conductor flux, a JOB MODULE. A Nexus scheduler (DGS-456) can call fluxConductor / fluxAll later;
// scripts/conductor/flux-cli.ts is the manual entry. DGS-664: no clock rule; the idle checks are the only gate.
// Everything that touches the world comes in through FluxDeps, and the herdr interface has no verb that closes a tab, a pane or an agent.
```

b. Delete the `NIGHT_WINDOW` constant with its doc comment (lines 11-12) and the `inNightWindow` function with its blank line.

c. Replace step 0:

```ts
    // 0. refused targets
    if (target.agent === SENDER && !opts.named) return skip("refused_target");
```

(Remove the three-line `if (inNightWindow(...)) ... else ...` block that followed it.)

d. In step 5, replace the `workers` loop body so any listed worker counts:

```ts
    if (target.workers?.length) {
      const live = await deps.herdr.list();
      for (const name of target.workers) {
        if (live.some((x) => x.name === name)) return skip(`worker_running:${name}`); // an idle or done tab is a tab not yet closed
      }
    }
```

e. Extend the pattern:

```ts
const IN_FLIGHT = /\b(in flight|in-flight|running|building|being built|in review|under review|reviewing|waiting|awaiting|pending|merging|to do|in progress|claimed)\b/i;
```

Also update the `FluxTarget.workers` doc comment to: `/** Names of this conductor's workers; any of them listed in herdr, in any status, blocks the flux. */`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/conductor/flux.test.ts scripts/conductor/flux-io.test.ts`
Expected: PASS. Then `grep -rn "NIGHT_WINDOW\|inNightWindow\|outside_night_window" scripts/conductor` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add scripts/conductor/flux.ts scripts/conductor/flux.test.ts
git commit -m "feat(dgs-664): flux when idle, not only at night"
```

---

### Task 2: Usage and comment text

**Files:**
- Modify: `scripts/conductor/flux-cli.ts` (header comment lines 1-2, `FLUX_USAGE`)
- Modify: `scripts/conductor/cli.ts:36`
- Test: `scripts/conductor/flux-io.test.ts`

**Interfaces:**
- Consumes: `FLUX_USAGE` exported from `flux-cli.ts`.
- Produces: `FLUX_USAGE` with no "night" and no "override".

- [ ] **Step 1: Write the failing test**

Append inside `flux-io.test.ts` (use its existing imports; add `FLUX_USAGE` to the import from `./flux-cli.ts` if it is not there):

```ts
describe("usage text (DGS-664)", () => {
  it("states the idle rule and no night window or override", () => {
    expect(FLUX_USAGE).not.toMatch(/night|override/i);
    expect(FLUX_USAGE).toMatch(/idle or done/);
    expect(FLUX_USAGE).toMatch(/--dry-run runs every check and sends nothing/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/conductor/flux-io.test.ts -t "usage text"`
Expected: FAIL (the usage still says "only at night").

- [ ] **Step 3: Write the minimal implementation**

In `flux-cli.ts` replace the header comment (lines 1-2) with:

```ts
// dg conductor flux <agent> | --all [--dry-run]: the manual entry to the flux job module (DGS-435).
// There is no clock rule and no override (DGS-664): the idle checks in the module are the gate. A dry run sends nothing, ever.
```

and the third and fourth lines of `FLUX_USAGE`:

```
A conductor fluxes when it is idle or done, has no live worker tab and no open ticket of its own; every check runs, there is no override. --dry-run runs every check and sends nothing.
```

(Keep the `Targets come from ~/.digismith-depot/flux-targets.json ...` line unchanged.)

In `scripts/conductor/cli.ts` line 36 replace `(night only, see flux)` with `(only when idle, see flux)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/conductor && grep -rn "night" scripts/conductor/flux-cli.ts scripts/conductor/cli.ts`
Expected: tests PASS; the grep prints nothing.

- [ ] **Step 5: Commit**

```bash
git add scripts/conductor/flux-cli.ts scripts/conductor/cli.ts scripts/conductor/flux-io.test.ts
git commit -m "docs(dgs-664): flux usage states the idle rule"
```

---

### Task 3: First use (after the merge; conductor and Maestro, not the builder)

**Files:**
- Create: `~/.digismith-depot/flux-targets.json` (machine state, never committed or uploaded)

**Interfaces:**
- Consumes: the merged `dg conductor flux` (plugin reloaded and the global `dg` rebuilt per the merge order's hooks).
- Produces: one run-log row in `~/.digismith-depot/runs/conductor-flux/<date>.jsonl`.

- [ ] **Step 1: Write the target file**

Check the file does not exist first (`ls ~/.digismith-depot/flux-targets.json`), then write:

```json
{
  "token-economics-conductor": {
    "project": "DigiSmith",
    "brief": ".digismith/sessions/b3-maestro/brief.md",
    "note": ".digismith/sessions/b3-maestro/note.md"
  }
}
```

- [ ] **Step 2: Dry run**

Run from the main checkout: `HERDR_WS=w2 node --experimental-strip-types scripts/conductor/cli.ts flux token-economics-conductor --dry-run --json`
Expected: one JSON line, `dry_run: true`, no `checks.night`, `reason` either `dry_run` (all checks passed, `would_send` set) or the first failing check (for example `note_ticket_in_flight:DGS-n`: then the conductor fixes the note per D3 and repeats). No prompt reaches the pane.

- [ ] **Step 3: One real flux, watched**

Only when the dry run says `dry_run`: check the pane input box is empty (`--format ansi`), then run the same command without `--dry-run`.
Expected: `token-economics-conductor: fluxed <before> -> <after> tokens (<old id> -> <new id>)`, exit 0. The Maestro and Jack watch it. A `failed` result (`clear_not_observed`, `verify_failed`) is reported to the Maestro as is; never retry on a hunch.

- [ ] **Step 4: Edit the text outside the repo (conductor, by hand)**

Change: the main-conductor note line "No conductor flux in the daytime", the b3-maestro brief line "fluxed only at night", and one runbook line under the Flux section (git-excluded) that states the idle rule. The Maestro rewrites the memory file `project_conductor-flux-night-rule.md`. No commit for any of these.

- [ ] **Step 5: Hand back**

The ticket stays `in progress`; the Maestro sets it done after he has seen the real flux verify (new session id, reply, idle, old card closed, new card open on the same note).

---

## Self-Review

- Spec coverage: D1 Task 1 steps b, c; D2 Task 1 step d and tests 5; D3 Task 1 step e and test 6; D4 Task 3 step 1; D5 nothing built (spec says no job); D6 Task 1 step a, Task 2, Task 3 step 4; D7 Task 3 steps 2 and 3; tests list covered in Task 1 and 2.
- No placeholders; every name used in a later task (`FLUX_USAGE`, `scanNoteInFlight`, `worker_running`) is defined above.
- Task 1 is the only task that touches behavior; Task 2 is text. Both are small enough for one worker; Task 3 needs a live herdr, so the builder does not run it.

## Definition of Ready

| Item | State |
|---|---|
| Spec | `spec.md`, approved by the Maestro 2026-10-26 (technical, no taste question). Attached to DGS-664. |
| Plan | This file, 2 build tasks and 1 first-use task. Attached to DGS-664. |
| Milestone | None set on the ticket. Proposed: after Dawn (DGS-470, V1.1). Dawn is done, and every other open conductor and Nexus ticket of this kind sits there. Jack or the Maestro sets it. |
| Blockers | None. Files touched: `scripts/conductor/flux*.ts`, `cli.ts`. DGS-577 (build, running) says it has no overlap with `scripts/conductor` per the main-conductor note, but check `git log origin/main -- scripts/conductor` before merge. DGS-498 touches `hooks/` only. |
| Sign-off | **Auto** (confirmed; matches the ticket). It is an internal tool with a fully defined contract, no look, wording for users, personal data or cost. The first live flux is watched by the Maestro as a first-use check, which does not need Jack's acceptance gate. |
| Mode | **Autonomous** proposed (the ticket field shows Autonomous, value 0). The build is two small tasks with tests. Task 3 needs herdr and is done by hand by the conductor, so if the factory claims it the builder stops after Task 2 and reports; it does not run Task 3. Manual is also acceptable if Jack wants to see the first flux himself. |
| Plugin bump | Needed in the merge order (a `scripts/` change in the plugin; hooks 01-03 as in every merge order). |
| Open question for the Maestro | The scheduler-job follow-up (spec D5): ask Jack whether to open it. No ticket opened here. |
