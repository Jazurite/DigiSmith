# DGS-551 Lifecycle Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every moment a skill, a hook or the factory runs sends one `dg steward event`, so no status is moved by hand and the Steward is the one status writer.

**Architecture:** A new `--hook` flag makes `dg steward event` safe to call from a skill (silent for non-ClickUp profiles, never a non-zero exit). Skills and the factory order text get one command line per moment. The factory's in-process `in progress` write calls the Steward library. A wiring test and a guard test hold the table and the "one path" rule in place.

**Tech Stack:** TypeScript (run with `node --experimental-strip-types`), vitest, yargs, Markdown skill files. pnpm only.

Spec: `.digismith/board/DGS-551—lifecycle-hooks-send-steward-its/spec.md` (sections quoted below as "spec N").

## Global Constraints

- Hook command shape, exact: `dg steward event <event> --ticket <Key> --hook --by <who>` (plus `--sha <sha>` for `merged`).
- `<Key>` rule, copied from the token steps: board folder name, else branch name with `^([A-Za-z]+-[0-9]+)(__|-|$)`, first group uppercased. No key: skip silently.
- Every hook block in a skill ends with the sentence: `A non-zero exit never blocks: print a warning and go on.`
- No hook sends `shaped`, `approved`, `accepted`, `completed`, `discard`, `close`, `filed`, `discovery-started`, `release-started`, `released`.
- No second status writer. The only allowed non-Steward writers: scan claim (`autonomous/scan.ts` W1), its rollback (W2), `autonomous/schedule-release.ts` (W6).
- Tests use mocks and fakes (`FakeTracker`), never live ClickUp, never a live `dg steward event`.
- Never change DGS-731 (the status flow SOP). Skill text, README and comments that point at the status flow cite DGS-731, never DGS-488. No `Co-Authored-By` or Claude footer in commits. Title-only conventional commits, scope `steward` for code and `skills` for skill text. Never the scope `dgs-551`.
- Run tests from `packages/cli`: `pnpm vitest run <file>`.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/cli/src/steward/index.ts` | modify | `--hook` flag, `defaultDeps({quiet, cwd})`, hook-mode exit codes |
| `packages/cli/src/steward/index.test.ts` | modify | tests for the flag |
| `packages/cli/src/autonomous/steward-started.ts` | create | `sendStarted(deps, ticket)`: the factory's `started` through the Steward library |
| `packages/cli/src/autonomous/steward-started.test.ts` | create | its test |
| `packages/cli/src/autonomous/observers-real.ts` | modify | `makeWriters` routes `in progress` to the Steward |
| `packages/cli/src/autonomous/observers-real.test.ts` | modify | routing test |
| `packages/cli/src/autonomous/index.ts` | modify | passes `startViaSteward` into `makeWriters` |
| `packages/cli/src/autonomous/order.ts` / `order.test.ts` | modify | order step 1 text |
| `packages/cli/src/steward/hook-wiring.test.ts` | create | one row per hook point of spec 3 |
| `packages/cli/src/steward/status-writers.test.ts` | create | the guard test (spec 6.3) |
| `skills/bootstrap/SKILL.md`, `skills/adopt/SKILL.md` | modify | `refinement-started` |
| `skills/subagent-driven-development/SKILL.md`, `skills/executing-plans/SKILL.md`, `skills/init/SKILL.md` | modify | `started`, `review-started` |
| `skills/reviewer/SKILL.md` | modify | reword the Steward moments sentence only (no hook: the Reviewer stays read-only; Maestro, ticket review F1) |
| `skills/finishing-a-development-branch/SKILL.md` | modify | `merged`, `documented` |
| `skills/report-implementation/SKILL.md` | modify | `documented` |
| `packages/cli/src/steward/types.ts`, `rules.ts`, `rules.test.ts`, `event.test.ts` | modify | the Maestro-only event `completed` (Task 8) |
| `packages/cli/src/steward/README.md` | modify | "Who sends what", the `completed` row |
| `.digismith/board/DGS-551—lifecycle-hooks-send-steward-its/maestro-rule.md` | create | drafted Maestro gate rule |
| `.digismith/board/DGS-551—lifecycle-hooks-send-steward-its/runbook-edit.md` | create | drafted runbook change for W5 |

---

### Task 1: The `--hook` flag

**Files:**
- Modify: `packages/cli/src/steward/index.ts` (`defaultDeps`, `guarded`, `createStewardCommand` `event` builder and handler)
- Test: `packages/cli/src/steward/index.test.ts`

**Interfaces:**
- Consumes: `runEvent(deps, ticket, input, dryRun)`, `UsageError`, `readStewardProfile(cwd)`.
- Produces: `defaultDeps(opts?: { quiet?: boolean; cwd?: string }): EventDeps` (`quiet` silences the "JIRA tracker not built yet" line); `createStewardCommand(depsFactory: (opts?: { quiet?: boolean }) => EventDeps, ...)`; the CLI option `--hook` (boolean, default false).

- [ ] **Step 1: Write the failing tests** (append inside `describe("dg steward", ...)` in `index.test.ts`; add `import { defaultDeps } from "./index.ts";` at the top)

```ts
  it("--hook: a usage error prints one line and exits 0", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(new FakeTracker(snapshot("refinement"))).parse(["steward", "event", "approved", "--ticket", "DGS-1", "--hook"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(err.mock.calls.flat().join("\n")).toMatch(/--quote/);
  });
  it("--hook: a refusal keeps its stderr line and exits 0", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(new FakeTracker(snapshot("refinement"))).parse(["steward", "event", "started", "--ticket", "DGS-1", "--hook", "--by", "worker"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(err.mock.calls.flat().join("\n")).toMatch(/refused started/);
  });
  it("--hook with no tracker prints nothing", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await cli(null).parse(["steward", "event", "started", "--ticket", "DGS-1", "--hook"]);
    expect(log).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });
  it("defaultDeps quiet: a jira profile prints nothing and has no tracker", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "stprof-"));
    fs.mkdirSync(path.join(cwd, ".digismith"));
    fs.mkdirSync(path.join(cwd, "profiles"));
    fs.writeFileSync(path.join(cwd, ".digismith", "config.yml"), "profile: jiraish\n");
    fs.writeFileSync(path.join(cwd, "profiles", "jiraish.yml"), "tracker: jira\n");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(defaultDeps({ quiet: true, cwd }).tracker).toBeNull();
    expect(err).not.toHaveBeenCalled();
    expect(defaultDeps({ cwd }).tracker).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/steward/index.test.ts`
Expected: FAIL (unknown option `--hook` under `.strict()`, and `defaultDeps` takes no options).

- [ ] **Step 3: Implement**

In `index.ts`:

```ts
export interface DepsOptions { quiet?: boolean; cwd?: string }

export function defaultDeps(opts: DepsOptions = {}): EventDeps {
  const profile = readStewardProfile(opts.cwd ?? process.cwd());
  let tracker = null;
  if (profile.tracker === "clickup") tracker = new ClickUpTracker(createClient(), DIGISMITH_SPACE_ID);
  if (profile.tracker === "jira" && !opts.quiet) console.error("steward: the JIRA tracker is not built yet; nothing done");
  // ...the rest of the returned object is unchanged
}

function guarded(depsFactory: (o?: DepsOptions) => EventDeps, body: (deps: EventDeps) => Promise<EventResult>, hook = false): Promise<void> {
  // same body as today, with two changes:
  //   const res = await body(depsFactory({ quiet: hook }));
  //   in the UsageError branch: process.exitCode = hook ? 0 : 2;
}
```

`createStewardCommand(depsFactory: (o?: DepsOptions) => EventDeps = defaultDeps, ...)`. In the `event` builder add `.option("hook", { type: "boolean", default: false, describe: "called from a skill or the factory: silent without a ClickUp tracker, never a non-zero exit" })`. In its handler pass `argv.hook as boolean` as the third argument of `guarded`. The `rebuild` and `file` handlers stay as they are.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/steward`
Expected: PASS, all steward tests (the old ones too: without `--hook` nothing changed).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward/index.ts packages/cli/src/steward/index.test.ts
git commit -m "feat(steward): add the --hook flag to dg steward event"
```

---

### Task 2: The factory sends `started` through the Steward

**Files:**
- Create: `packages/cli/src/autonomous/steward-started.ts`, `packages/cli/src/autonomous/steward-started.test.ts`
- Modify: `packages/cli/src/autonomous/observers-real.ts` (`WriterDeps`, `makeWriters`), `packages/cli/src/autonomous/index.ts` (`makeTick`, the `makeWriters({...})` call)
- Test: `packages/cli/src/autonomous/observers-real.test.ts`

**Interfaces:**
- Consumes: `runEvent`, `EventDeps`, `EventResult` from `../steward/event.ts`; `defaultDeps` from `../steward/index.ts`; `FakeTracker`, `snapshot` from `../steward/fake-tracker.test-util.ts`.
- Produces: `sendStarted(deps: EventDeps, ticket: string): Promise<string[]>` (returns the warning lines; never throws); `WriterDeps.startViaSteward: () => Promise<void>`; `makeWriters(d)` whose `setStatus("in progress")` calls `d.startViaSteward()` and every other status calls `d.tracker.setStatus(s)`.

- [ ] **Step 1: Write the failing tests**

`steward-started.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sendStarted } from "./steward-started.ts";
import type { EventDeps } from "../steward/event.ts";
import { FakeTracker, snapshot } from "../steward/fake-tracker.test-util.ts";

function deps(t: FakeTracker | null): EventDeps {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fst-"));
  return { tracker: t, dir, now: () => new Date("2026-11-12T05:00:00Z"), config: { releaseStage: false }, sessionIds: () => [] };
}

describe("sendStarted", () => {
  it("moves a to do ticket to in progress", async () => {
    const t = new FakeTracker(snapshot("to do"));
    expect(await sendStarted(deps(t), "DGS-1")).toEqual([]);
    expect(t.ticket.status).toBe("in progress");
  });
  it("moves a claimed ticket to in progress", async () => {
    const t = new FakeTracker(snapshot("claimed"));
    await sendStarted(deps(t), "DGS-1");
    expect(t.ticket.status).toBe("in progress");
  });
  it("returns the refusal line and does not throw from the wrong status", async () => {
    const t = new FakeTracker(snapshot("refinement"));
    const warn = await sendStarted(deps(t), "DGS-1");
    expect(warn.join("\n")).toMatch(/refused started/);
  });
  it("returns a line instead of throwing when the tracker fails", async () => {
    const t = new FakeTracker(snapshot("to do"));
    t.getTicket = async () => { throw new Error("network down"); };
    expect((await sendStarted(deps(t), "DGS-1")).join("\n")).toMatch(/network down/);
  });
  it("does nothing without a tracker", async () => {
    expect(await sendStarted(deps(null), "DGS-1")).toEqual([]);
  });
});
```

In `observers-real.test.ts` (follow the file's existing way of building `WriterDeps`; the `exec` and `runEvent` stubs are never called by `setStatus`):

```ts
it("makeWriters: in progress goes through the Steward, claimed through the tracker", async () => {
  const calls: string[] = [];
  const w = makeWriters({
    exec: (async () => ({ stdout: "", stderr: "" })) as never, herdrBin: "h", herdrWs: "w2", conductorName: "c",
    tracker: { setStatus: async (s) => { calls.push(`tracker ${s}`); } },
    runEvent: async () => {},
    startViaSteward: async () => { calls.push("steward started"); },
  });
  await w.setStatus("in progress");
  await w.setStatus("claimed");
  expect(calls).toEqual(["steward started", "tracker claimed"]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/autonomous/steward-started.test.ts src/autonomous/observers-real.test.ts`
Expected: FAIL (`steward-started.ts` missing; `startViaSteward` not a known dep).

- [ ] **Step 3: Implement**

`steward-started.ts`:

```ts
import { runEvent, type EventDeps } from "../steward/event.ts";

/** The factory's "the build starts": the Steward event `started`. Never throws; returns the warning lines. */
export async function sendStarted(deps: EventDeps, ticket: string): Promise<string[]> {
  try {
    const res = await runEvent(deps, ticket, { event: "started", by: "factory" });
    return res.warn;
  } catch (err) {
    return [`steward: ${ticket}: ${(err as Error).message}`];
  }
}
```

`observers-real.ts`: add `startViaSteward: () => Promise<void>;` to `WriterDeps`, and in `makeWriters` replace the `setStatus` line with:

```ts
    setStatus: (s) => (s === "in progress" ? d.startViaSteward() : d.tracker.setStatus(s)),
```

`autonomous/index.ts`, in `makeTick`, add to the `makeWriters({...})` object (`state` is already in scope there, `state?.ticket` is the ticket key):

```ts
      startViaSteward: async () => {
        const ticket = state?.ticket ?? "";
        if (ticket === "") return;
        for (const line of await sendStarted(defaultDeps({ quiet: true }), ticket)) console.error(line);
      },
```

with `import { sendStarted } from "./steward-started.ts";` and `import { defaultDeps } from "../steward/index.ts";`. A refusal prints its line and does not throw: `reconcile.ts` reads the status back and decides `retryable` as before.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/autonomous`
Expected: PASS (existing `act.test.ts`, `advance.test.ts` unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/steward-started.ts packages/cli/src/autonomous/steward-started.test.ts packages/cli/src/autonomous/observers-real.ts packages/cli/src/autonomous/observers-real.test.ts packages/cli/src/autonomous/index.ts
git commit -m "feat(steward): the factory sends started through the Steward"
```

---

### Task 3: The order text sends `started`

**Files:**
- Modify: `packages/cli/src/autonomous/order.ts:30`
- Test: `packages/cli/src/autonomous/order.test.ts:23`

**Interfaces:** Produces the new order step 1 line (exact text below). Consumes nothing.

- [ ] **Step 1: Write the failing test.** Replace the expectation at `order.test.ts:23` with:

```ts
    expect(t).toContain('1. When the Builder starts building, send the Steward its event: `dg steward event started --ticket DGS-9 --hook --by builder`. A refusal is normal for a ticket built by hand; go on.');
    expect(t).not.toContain("update-task");
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/autonomous/order.test.ts`
Expected: FAIL (old text still in `order.ts`).

- [ ] **Step 3: Implement.** Replace the line at `order.ts:30` with:

```ts
    `1. When the Builder starts building, send the Steward its event: \`dg steward event started --ticket ${i.key} --hook --by builder\`. A refusal is normal for a ticket built by hand; go on.`,
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/autonomous/order.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/order.ts packages/cli/src/autonomous/order.test.ts
git commit -m "feat(steward): the factory order sends started through the Steward"
```

---

### Task 4: Hook points before the merge (`refinement-started`, `started`, `review-started`) and the wiring test

**Files:**
- Create: `packages/cli/src/steward/hook-wiring.test.ts`
- Modify: `skills/bootstrap/SKILL.md` (Step 2.9), `skills/adopt/SKILL.md` (the `step-start` block near line 346), `skills/subagent-driven-development/SKILL.md` (after the `step-start --step implementation` block near line 120, and after `task-start --task final` near line 634), `skills/executing-plans/SKILL.md` (after the `step-start` block near line 21), `skills/init/SKILL.md` (after the `step-start --step implementation` block in Step 0 item 2, near line 86), `skills/reviewer/SKILL.md` (the registration line near line 71)

**Interfaces:**
- Produces: `HOOK_ROWS` in the test, an array of `{ file, line }` where `line` is the exact command text each skill must contain. Task 5 appends rows to it.

- [ ] **Step 1: Write the failing test** `hook-wiring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const NEVER_BLOCKS = "A non-zero exit never blocks: print a warning and go on.";

// One row per hook point of spec 3. Task 5 adds the merge-time rows.
export const HOOK_ROWS: { file: string; line: string }[] = [
  { file: "skills/bootstrap/SKILL.md", line: "dg steward event refinement-started --ticket <Key> --hook --by worker" },
  { file: "skills/adopt/SKILL.md", line: "dg steward event refinement-started --ticket <Key> --hook --by worker" },
  { file: "skills/subagent-driven-development/SKILL.md", line: "dg steward event started --ticket <Key> --hook --by worker" },
  { file: "skills/subagent-driven-development/SKILL.md", line: "dg steward event review-started --ticket <Key> --hook --by worker" },
  { file: "skills/executing-plans/SKILL.md", line: "dg steward event started --ticket <Key> --hook --by worker" },
  { file: "skills/init/SKILL.md", line: "dg steward event started --ticket <Key> --hook --by worker" },
  { file: "skills/reviewer/SKILL.md", line: "dg steward event review-started --ticket <Key> --hook --by reviewer" },
];

const GATES = ["shaped", "approved", "accepted", "completed", "discard", "close", "filed", "discovery-started", "release-started", "released"];

describe("hook wiring (spec 3)", () => {
  for (const row of HOOK_ROWS) {
    it(`${row.file} sends: ${row.line}`, () => {
      const text = readFileSync(root + row.file, "utf-8");
      expect(text).toContain(row.line);
      expect(text).toContain(NEVER_BLOCKS);
    });
  }
  it("no skill hook sends a gate or a version-2 event", () => {
    for (const row of HOOK_ROWS) {
      const ev = /dg steward event (\S+)/.exec(row.line)![1];
      expect(GATES).not.toContain(ev);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/steward/hook-wiring.test.ts`
Expected: FAIL, 7 rows (the skills do not contain the lines yet).

- [ ] **Step 3: Edit the skills.** After each existing token block, add exactly this block with the event named in the table (replace `<event>`, `<who>`); keep the surrounding prose of each file:

````markdown
Send the Steward its event (DGS-551). Same key rule as the block above; no key: skip silently:

```bash
dg steward event <event> --ticket <Key> --hook --by <who>
```

A non-zero exit never blocks: print a warning and go on. A refusal (the ticket is in another status, for example a ticket built by hand) is normal: the Steward logs it; do not retry.
````

| File and place | `<event>` | `<who>` |
|---|---|---|
| `bootstrap` Step 2.9, only in the `<step>` is `brainstorming` case | `refinement-started` | `worker` |
| `adopt`, same branch of its `step-start` block | `refinement-started` | `worker` |
| `subagent-driven-development`, after the `step-start --step implementation` block | `started` | `worker` |
| `subagent-driven-development`, after `task-start --task final` (the whole-branch review) | `review-started` | `worker` |
| `executing-plans`, after its `step-start` block | `started` | `worker` |
| `init` Step 0 item 2, after the `step-start --step implementation` block (a resumed build) | `started` | `worker` |
| `reviewer`, after the registration line, only when the review is the whole-branch review (`STOP: ticket-review-ready`); a task review sends nothing | `review-started` | `reviewer` |

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/steward/hook-wiring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward/hook-wiring.test.ts skills/bootstrap/SKILL.md skills/adopt/SKILL.md skills/subagent-driven-development/SKILL.md skills/executing-plans/SKILL.md skills/init/SKILL.md skills/reviewer/SKILL.md
git commit -m "feat(skills): send the Steward refinement-started, started and review-started"
```

---

### Task 5: Hook points at the merge (`merged`, `documented`)

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (Option 1: right after its push; and its end, after the `ticket-total` block near line 296), `skills/report-implementation/SKILL.md` (after the commit of `report.html`, near line 625-628), `packages/cli/src/steward/hook-wiring.test.ts`

**Interfaces:**
- Consumes: `HOOK_ROWS` from Task 4.
- Produces: three more rows; the `merged` line carries `--sha`.

- [ ] **Step 1: Write the failing rows.** Append to `HOOK_ROWS`:

```ts
  { file: "skills/finishing-a-development-branch/SKILL.md", line: "dg steward event merged --ticket <Key> --hook --by finishing --sha <merge-commit-sha>" },
  { file: "skills/finishing-a-development-branch/SKILL.md", line: "dg steward event documented --ticket <Key> --hook --by finishing" },
  { file: "skills/report-implementation/SKILL.md", line: "dg steward event documented --ticket <Key> --hook --by report" },
```

Add one more test in the same file:

```ts
  it("finishing sends merged only in Option 1, never in Option 2 (PR)", () => {
    const text = readFileSync(root + "skills/finishing-a-development-branch/SKILL.md", "utf-8");
    const opt1 = text.indexOf("### Option 1: Merge Locally");
    const opt2 = text.indexOf("### Option 2: Push and Create PR");
    const at = text.indexOf("dg steward event merged");
    expect(at).toBeGreaterThan(opt1);
    expect(at).toBeLessThan(opt2);
    expect(text.indexOf("dg steward event merged", at + 1)).toBe(-1);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/steward/hook-wiring.test.ts`
Expected: FAIL, 3 rows plus the Option 1 test.

- [ ] **Step 3: Edit the skills.**

`finishing`, Option 1, directly after the push succeeds and before the post-finish hooks fire:

````markdown
Send the Steward the merge (DGS-551). `<merge-commit-sha>` is `git rev-parse refs/digismith/post-finish/<feature-branch>/head`. Sign-off Auto goes to done with its due date, Sign-off Jack goes to acceptance, an unmarked ticket records the merge:

```bash
dg steward event merged --ticket <Key> --hook --by finishing --sha <merge-commit-sha>
```

A non-zero exit never blocks: print a warning and go on. Option 2 (push and PR) sends nothing: the merge happens later, and whoever merges the PR sends this line.
````

`finishing`, Option 1, at its end after the `ticket-total` block, only when `.digismith/board/<Key>—*/report.html` exists:

````markdown
When the ticket's `report.html` already exists in its board folder, send `documented` (a refusal from any status but done is normal):

```bash
dg steward event documented --ticket <Key> --hook --by finishing
```

A non-zero exit never blocks: print a warning and go on.
````

`report-implementation`, after it commits `report.html`: the same block with `--by report`. Same sentence.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/steward/hook-wiring.test.ts`
Expected: PASS (all rows).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward/hook-wiring.test.ts skills/finishing-a-development-branch/SKILL.md skills/report-implementation/SKILL.md
git commit -m "feat(skills): send the Steward merged and documented"
```

---

### Task 6: The status-writer guard test

**Files:**
- Create: `packages/cli/src/steward/status-writers.test.ts`

**Interfaces:** Consumes the file layout only. Produces the allowlist that enforces "one path" (spec 2, 6.3).

- [ ] **Step 1: Write the test** (it must be green once Tasks 2 and 3 are in; to see it fail first, run it before Task 3's order edit is merged, or temporarily put `update-task --status "review"` in a skill):

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".worktrees") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(name) && !/\.test(-util)?\.ts$/.test(name) && !/\.test-util\.ts$/.test(name)) out.push(p);
  }
  return out;
}

// The only files that may write a ticket status outside the Steward (spec 2, 2.1):
// W1/W2 the scan claim and its rollback, W6 schedule-release, plus the plumbing they run through.
const ALLOWED = new Set([
  "packages/cli/src/autonomous/scan.ts",
  "packages/cli/src/autonomous/schedule-release.ts",
  "packages/cli/src/autonomous/tracker-clickup.ts",
  "packages/cli/src/autonomous/index.ts",
  "packages/cli/src/autonomous/observers-real.ts",
  "packages/cli/src/autonomous/act.ts",
  "packages/cli/src/steward/clickup-tracker.ts",
]);
const CODE_WRITE = /\.setStatus\(|updateTask\([^)]*\bstatus\b/;
const TEXT_WRITE = /update-task\b[^\n]*--status/;

describe("one status path", () => {
  it("no code outside the allowlist writes a ticket status", () => {
    const bad = walk(join(root, "packages/cli/src"), /\.ts$/)
      .map((f) => relative(root, f))
      .filter((f) => !f.startsWith("packages/cli/src/clickup/") && !ALLOWED.has(f))
      .filter((f) => CODE_WRITE.test(readFileSync(join(root, f), "utf-8")));
    expect(bad).toEqual([]);
  });
  it("no skill, hook or order text tells anyone to set a status with update-task", () => {
    const files = [...walk(join(root, "skills"), /\.md$/), ...walk(join(root, ".digismith/hooks"), /\.md$/), join(root, "packages/cli/src/autonomous/order.ts")];
    const bad = files.map((f) => relative(root, f)).filter((f) => TEXT_WRITE.test(readFileSync(join(root, f), "utf-8")));
    expect(bad).toEqual([]);
  });
  it("the scan still owns exactly the claim and its rollback", () => {
    const scan = readFileSync(join(root, "packages/cli/src/autonomous/scan.ts"), "utf-8");
    expect(scan.match(/\.setStatus\(/g)?.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify the expected state**

Run: `pnpm vitest run src/steward/status-writers.test.ts`
Expected: PASS after Tasks 2-3. If the first test lists a file, it is a writer the inventory missed: add it to the plan's inventory question for the Maestro (report it in the Builder's STOP), never silently to `ALLOWED`. To prove the guard works, put `await t.setStatus("done");` in a scratch file under `packages/cli/src/autonomous/`, see the test fail naming it, then remove the scratch file (your own test leftover: you may remove it).

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/steward/status-writers.test.ts
git commit -m "test(steward): guard that no second status writer appears"
```

---

### Task 7: Docs and drafted text for the conductor

**Files:**
- Modify: `packages/cli/src/steward/README.md`
- Create: `.digismith/board/DGS-551—lifecycle-hooks-send-steward-its/maestro-rule.md`, `.digismith/board/DGS-551—lifecycle-hooks-send-steward-its/runbook-edit.md`

**Interfaces:** Consumes the hook table from Tasks 4-5. Produces text the conductor places after the merge (the runbook and the Maestro identity record are outside the repo).

- [ ] **Step 1: README.** Replace the sentence "Which skill or step sends which event is DGS-551." with a section:

```markdown
## Who sends what (DGS-551)

Every send is `dg steward event <event> --ticket <KEY> --hook --by <who>`. `--hook`: silent without a ClickUp tracker, never a non-zero exit. A refusal is logged in the state file and printed once; nothing retries it.

| Event | Sent by | Where |
|---|---|---|
| `refinement-started` | the refine worker | bootstrap, adopt |
| `started` | the factory (in process), the Builder | `autonomous/steward-started.ts`, the order text, subagent-driven-development, executing-plans, init |
| `review-started` | the Builder | subagent-driven-development (final review); a Reviewer sends no event |
| `merged` | finishing, Option 1 | after the push; Option 2: whoever merges the PR |
| `documented` | report-implementation, finishing | after `report.html` is committed |
| `shaped`, `approved`, `accepted`, `completed`, `discard`, `close` | the Maestro, never a hook | see the Maestro rule |

Not hooked: `claimed` (the factory's lock, `autonomous/scan.ts`), the claim rollback, `scheduled` to `to do` (`schedule-release`). `status-writers.test.ts` keeps this list honest.
```

- [ ] **Step 2: Draft `maestro-rule.md`** with exactly this content:

```markdown
# Maestro gate rule (DGS-551), to place in the Maestro identity record and the conductor runbook

Gates are the Maestro's. No hook sends them.

- Sign-off Jack, Jack approves spec and plan: `dg steward event approved --ticket <KEY> --quote "<Jack's words>" --into "to do"`.
- Sign-off Auto, the Maestro approves: `dg steward event approved --ticket <KEY> --by digismith-maestro --quote "Maestro: plan approved, Sign-off Auto" --into "to do"`.
- Jack accepts or rejects a preview: `dg steward event accepted --ticket <KEY> --answer yes|no --quote "<Jack's words>"`. After `yes`, send `documented` if `report.html` exists (the hook's `documented` was refused while the ticket waited in acceptance).
- A PR merged outside finishing (Option 2): `dg steward event merged --ticket <KEY> --sha <sha>`.
- A ticket that ends without a merge (a decision or SOP ticket): `dg steward event completed --ticket <KEY> --by digismith-maestro --quote "<Jack's words, or for Sign-off Auto: Maestro: decision recorded, Sign-off Auto>"`. Valid from in progress only; never sent by a hook.
- Shaping ends with `shaped` (the shaping skill sends it in the Maestro session).
- Never send a gate event for a Sign-off Jack ticket without his own words.
```

- [ ] **Step 3: Draft `runbook-edit.md`:** one block "Replace the DGS-635 line (`.digismith/sessions/workbox.md:837`): the sentence 'set the ticket to `in progress` and read it back: `dg clickup update-task <KEY> --status "in progress"`, then `dg clickup get-task <KEY>`' becomes 'send the Steward its event: `dg steward event started --ticket <KEY> --hook --by conductor`, then read it back with `dg clickup get-task <KEY>`.' The factory already sends `started` in process; this line is the fallback and a repeat is a `noop`.'" Add the same replacement for any other runbook line the conductor finds with `update-task --status`.

- [ ] **Step 4: Verify** the whole suite for the touched areas

Run: `pnpm vitest run src/steward src/autonomous`
Expected: PASS.

- [ ] **Step 5: Commit** (the drafts stay uncommitted in the board folder for the conductor; commit only the README)

```bash
git add packages/cli/src/steward/README.md
git commit -m "docs(steward): list who sends which event"
```

---

### Task 8: The Maestro-only event `completed` (a ticket that ends without a merge)

Decision (spec 4.0, resolved at checkpoint 2): a Steward event, not an allowed hand writer. Reason: one status path, the guard allowlist stays at three files, and the quote leaves a record in the state file.

**Files:**
- Modify: `packages/cli/src/steward/types.ts` (`EVENTS`, `GATE_EVENTS`), `packages/cli/src/steward/rules.ts` (`evaluate`, new `completed`)
- Test: `packages/cli/src/steward/rules.test.ts`, `packages/cli/src/steward/event.test.ts`, `packages/cli/src/steward/index.test.ts`

**Interfaces:**
- Consumes: `move(to, extra)`, `refuse`, `NOOP` in `rules.ts`; `TicketView`; `GATE_EVENTS`.
- Produces: the event name `completed` in `EVENTS`; `GATE_EVENTS` includes it (so `assertUsage` and `evaluate` refuse it without `--quote`); `completed(view)` in `rules.ts`: `in progress` -> `move("done")` (which sets the due date); `done` or `documented` -> `NOOP`; any other status -> `refuse("completed is valid from in progress; the ticket is in <status>")`.

- [ ] **Step 1: Write the failing tests**

`rules.test.ts` (use the file's existing helpers for `view` and `cfg`; the shape below is the contract):

```ts
describe("completed (a ticket that ends without a merge)", () => {
  const ev = { event: "completed" as const, quote: "Maestro: decision recorded, Sign-off Auto" };
  it("moves in progress to done with the due date", () => {
    expect(evaluate(ev, view("in progress"), cfg)).toEqual({ kind: "move", to: "done", dueDate: true });
  });
  it("is a noop from done and documented", () => {
    expect(evaluate(ev, view("done"), cfg)).toEqual({ kind: "noop" });
    expect(evaluate(ev, view("documented"), cfg)).toEqual({ kind: "noop" });
  });
  it.each(["backlog", "concept", "refinement", "to do", "claimed", "review", "acceptance", "release"])("is refused from %s", (status) => {
    const r = evaluate(ev, view(status), cfg);
    expect(r.kind).toBe("refuse");
    expect(JSON.stringify(r)).toContain("completed is valid from in progress");
  });
  it("is refused without a quote", () => {
    expect(evaluate({ event: "completed" }, view("in progress"), cfg).kind).toBe("refuse");
  });
  it("is a gate event", () => {
    expect(GATE_EVENTS).toContain("completed");
  });
});
```

`event.test.ts`: with `FakeTracker(snapshot("in progress"))` and `runEvent(deps, "DGS-1", { event: "completed", quote: "Maestro: decision recorded, Sign-off Auto", by: "digismith-maestro" })`: expect `t.ticket.status` to be `"done"`, a due date set, and the state-file log to hold an `applied` entry for `completed`. A second send must leave one status write (a `noop`).

`index.test.ts`: `steward event completed --ticket DGS-1` without `--quote` exits 2; with `--hook` it exits 0.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/steward`
Expected: FAIL (`completed` is not an event name; yargs `choices` rejects it).

- [ ] **Step 3: Implement.** In `types.ts` add `"completed"` to `EVENTS` and to `GATE_EVENTS`. In `rules.ts` add to the `switch`: `case "completed": return completed(view);` and:

```ts
function completed(view: TicketView): RuleResult {
  if (view.status === "done" || view.status === "documented") return NOOP;
  if (view.status !== "in progress") return refuse(`completed is valid from in progress; the ticket is in ${view.status}`);
  return move("done");
}
```

`move("done")` already adds `dueDate: true`. Update the `assertUsage` message in `event.ts` from "needs Jack's own words" to "needs the approver's own words" only if no existing test pins the old text (check `event.test.ts` first; otherwise leave it).

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/steward src/autonomous`
Expected: PASS, including `hook-wiring.test.ts` (it lists `completed` among the gates no hook sends) and `status-writers.test.ts` (unchanged: no new writer).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward/types.ts packages/cli/src/steward/rules.ts packages/cli/src/steward/rules.test.ts packages/cli/src/steward/event.test.ts packages/cli/src/steward/index.test.ts packages/cli/src/steward/README.md
git commit -m "feat(steward): add the Maestro-only completed event"
```

Also add to the README event table in this task (the Task 7 README edit has the "Who sends what" row; this task adds `| \`completed\` (gate, needs \`--quote\`) | in progress | done (due date); a ticket that ends without a merge |` to the event table).

---

## Self-Review (done)

- **Spec coverage:** spec 2 inventory: W3 -> Task 2, W4 -> Task 3, W5 -> Task 7 draft, W1/W2/W6 stay -> Task 6 guard. Spec 3 table: every row has a skill edit and a wiring row (Tasks 4, 5), `started` from the factory (Task 2). Spec 4 gates -> wiring test "no gate" + Task 7 rule. Spec 4.1 resolved text (Auto approval line) -> Task 7. C1 -> Task 1, C3 -> Task 2, C4 -> Task 6, C5 -> Task 7. Spec 7 "never blocks": Task 1 (exit 0), Task 2 (`sendStarted` never throws), skill sentence in the wiring test.
- **Task 8** covers the no-merge gap (spec 4.0). Plan and README cite DGS-731 for the status flow.
- **Placeholders:** none; the only angle-bracket tokens are runtime values (`<Key>`, `<who>`) that the skills keep literally.
- **Type consistency:** `defaultDeps({quiet, cwd})`, `DepsOptions`, `sendStarted(deps, ticket)`, `WriterDeps.startViaSteward`, `HOOK_ROWS` are named the same in every task.
- **Known risk for the Builder:** the exact insertion lines in the skills drift; place each block by the anchor text named in the task, not by line number.
