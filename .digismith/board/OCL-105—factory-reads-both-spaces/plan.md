# The factory reads both ClickUp spaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Ticket:** OCL-105 (task id `14zcebrypxm`). **Spec:** `spec.md` in this folder (approved by the Dock with three changes, all in the spec).

**Goal:** The scan, the Steward and the Director read the DigiSmith (DGS) and Oculus (OCL) ClickUp spaces; every key tool accepts an OCL key; `dg` can create the `Mode` and `Sign-off` fields in the Oculus space.

**Architecture:** One new file (`clickup/spaces.ts`) lists the spaces and resolves a key by prefix. The two ClickUp trackers take a list of space ids and merge their per-space reads. Six `^DGS-\d+$` checks and the conductor key greps use the shared prefix set. One new command, `dg clickup create-factory-fields`, creates the field pair idempotently, dry run by default.

**Tech Stack:** TypeScript (node `--experimental-strip-types`), vitest 2, yargs, pnpm. Mocks only: no live ClickUp call, temp depot through `DIGISMITH_DEPOT_DIR`.

## Global Constraints

- Space ids: DGS `1301150000001271`, OCL `1301150000003197`. Prefixes: `DGS`, `OCL`. Key format stays `^[A-Z]+-\d+$` with a known prefix.
- `DIGISMITH_SPACE_ID` stays exported from `packages/cli/src/clickup/lib.ts` with the same value.
- No live ClickUp write in this build. Reads through `dg` only. The first `create-factory-fields --yes` is the conductor's, after the merge.
- Never touch `~/.digismith-depot/autonomous/lock.json`, `~/.claude`, settings, `~/.digismith-depot/bin`, `.digismith/config.yml`. Tests use a temp depot.
- Commits: title-only conventional commits, scope `keys`, `scan`, `steward` or `clickup`, never `ocl-105`; no AI attribution; never on main; no push in this build.
- Tests run on changed files only, fork pool of 2: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 <files>` from `packages/cli` (files under `scripts/` run from the repo root with the same flags). The whole `packages/cli` suite runs once, at the end. Check `uptime` first: load under 4.
- Known failing test, not ours: the guardrails pin (now OCL-106, was DGS-720).

## Protected paths this plan touches (the Dock approves the merge)

- `packages/cli/src/autonomous/`: `tracker-clickup.ts` (Task 2), `index.ts` (Task 4), `director/command.ts` (Task 4), new tests (Tasks 8, 9).
- `packages/cli/src/steward/`: `clickup-tracker.ts` (Task 3), `index.ts` (Task 4), new tests (Task 9).
- `scripts/nexus-api/src/scheduler/`: NOT touched. Task 9, Step 1 greps it for a space id or `DGS-` check. A hit becomes a new task before the build goes on.

## Findings the build must fix (known at plan time)

| ID | Finding | Task |
|---|---|---|
| F1 | One space id in the scan, Director and Steward trackers | 1-4 |
| F2 | `^DGS-\d+$` in attach-record, ticket-total, merge-comment, task-stamp | 5 |
| F3 | `DGS-` key checks in `scripts/conductor` (ticket-status, markers, refresh) | 6 |
| F4 | No `Mode` or `Sign-off` field in the Oculus space | 7 |
| F5 | `create-field` by hand can mistype the options | 7 |
| Out of scope | `board-path.ts --action path --title` derives `factory-reads-both-clickup-spaces` while the branch says `factory-reads-both-spaces`. The Dock said: report it as a finding, no fix here. | report only |

## Post-merge first-use steps (the conductor runs them; the Dock approved OCL-106 only at this point, not before)

1. `dg clickup create-factory-fields --space 1301150000003197` (dry run). Read the two planned calls.
2. `dg clickup create-factory-fields --space 1301150000003197 --yes`. Read back: `dg clickup list-fields --list 1301150000006382` lists `Mode` (Autonomous, Manual) and `Sign-off` (Auto, Jack).
3. Move OCL-106 (the guardrails test pin, ex DGS-720) to `to do` with Mode Autonomous: `dg clickup update-task --task OCL-106 --status "to do"`, and set the Mode field (`dg clickup field-set`, same options as for a DGS ticket).
4. One scan tick (`dg autonomous scan`) claims OCL-106. Check: lock file names `OCL-106`; its status moves (`in progress`, `review`, `done`) appear on the OCL-106 ticket in the Oculus space; merge-comment and token stamp work with the OCL key.
5. If the scan does not claim it: read `dg autonomous scan` output and the `skip` events before changing anything.

---

### Task 1: Space list and key resolver

**Files:**
- Create: `packages/cli/src/clickup/spaces.ts`
- Create: `packages/cli/src/clickup/spaces.test.ts`
- Modify: `packages/cli/src/clickup/lib.ts:31-35` (`DIGISMITH_SPACE_ID` comes from `spaces.ts`)

**Interfaces:**
- Produces:
  - `interface SpaceEntry { prefix: string; id: string; name: string }`
  - `const SPACES: readonly SpaceEntry[]` (DGS first, OCL second)
  - `const DIGISMITH_SPACE_ID: string`, `const ALL_SPACE_IDS: string[]`, `const KEY_PREFIXES: string` (`"DGS|OCL"`, for building regexes)
  - `spaceForKey(key: string): SpaceEntry` (throws `Error` naming the known prefixes)
  - `isTicketKey(key: string): boolean`

- [ ] **Step 1: Write the failing test** (`spaces.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { ALL_SPACE_IDS, DIGISMITH_SPACE_ID, KEY_PREFIXES, SPACES, isTicketKey, spaceForKey } from "./spaces.ts";
import * as lib from "./lib.ts";

describe("spaces", () => {
  it("lists DigiSmith first and Oculus second, with the live ids", () => {
    expect(SPACES.map((s) => [s.prefix, s.id])).toEqual([
      ["DGS", "1301150000001271"],
      ["OCL", "1301150000003197"],
    ]);
    expect(ALL_SPACE_IDS).toEqual(["1301150000001271", "1301150000003197"]);
    expect(KEY_PREFIXES).toBe("DGS|OCL");
  });
  it("lib still exports DIGISMITH_SPACE_ID with the same value", () => {
    expect(lib.DIGISMITH_SPACE_ID).toBe(DIGISMITH_SPACE_ID);
    expect(DIGISMITH_SPACE_ID).toBe("1301150000001271");
  });
  it("resolves a key to its space by prefix", () => {
    expect(spaceForKey("DGS-12").name).toBe("DigiSmith");
    expect(spaceForKey("OCL-105").id).toBe("1301150000003197");
  });
  it("refuses an unknown prefix and names the known ones", () => {
    expect(() => spaceForKey("ABC-1")).toThrow(/unknown key prefix "ABC".*DGS, OCL/);
  });
  it("refuses a malformed key", () => {
    for (const bad of ["", "12", "OCL-", "ocl-1", "OCL-1x", "../OCL-1", "OCL-1 "]) {
      expect(() => spaceForKey(bad)).toThrow();
      expect(isTicketKey(bad)).toBe(false);
    }
  });
  it("isTicketKey is true for a known prefix with digits", () => {
    expect(isTicketKey("DGS-546")).toBe(true);
    expect(isTicketKey("OCL-1")).toBe(true);
    expect(isTicketKey("ABC-1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (in `packages/cli`): `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 src/clickup/spaces.test.ts`
Expected: FAIL, `Cannot find module './spaces.ts'`.

- [ ] **Step 3: Write the implementation** (`spaces.ts`)

```ts
/** The ClickUp spaces the factory reads. A key's prefix names its space. One entry per space: a third space is one line. */
export interface SpaceEntry { prefix: string; id: string; name: string }

export const SPACES: readonly SpaceEntry[] = [
  { prefix: "DGS", id: "1301150000001271", name: "DigiSmith" },
  { prefix: "OCL", id: "1301150000003197", name: "Oculus" },
];

export const DIGISMITH_SPACE_ID = SPACES[0].id;
export const ALL_SPACE_IDS: string[] = SPACES.map((s) => s.id);
/** For building regexes: "DGS|OCL". */
export const KEY_PREFIXES = SPACES.map((s) => s.prefix).join("|");

const KEY = /^([A-Z]+)-(\d+)$/;

export function spaceForKey(key: string): SpaceEntry {
  const m = KEY.exec(key);
  if (!m) throw new Error(`"${key}" is not a ticket key (PREFIX-123)`);
  const entry = SPACES.find((s) => s.prefix === m[1]);
  if (!entry) throw new Error(`unknown key prefix "${m[1]}" in "${key}"; known: ${SPACES.map((s) => s.prefix).join(", ")}`);
  return entry;
}

export function isTicketKey(key: string): boolean {
  try { spaceForKey(key); return true; } catch { return false; }
}
```

In `lib.ts` replace the constant line with a re-export and an import:

```ts
import { DIGISMITH_SPACE_ID } from "./spaces.ts";
export { DIGISMITH_SPACE_ID };
```
(keep `createDigiSmithSpace` as it is).

- [ ] **Step 4: Run to verify it passes**

Run the same command, plus `src/clickup/lib.test.ts src/clickup/create-folder.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/spaces.ts packages/cli/src/clickup/spaces.test.ts packages/cli/src/clickup/lib.ts
git commit -m "feat(keys): space list and key resolver by prefix"
```

---

### Task 2: The scan tracker reads a list of spaces

**Files:**
- Modify: `packages/cli/src/autonomous/tracker-clickup.ts:50-85` (constructor, `hasStatus`, `loadLists`, `listByStatus`)
- Test: `packages/cli/src/autonomous/tracker-clickup.test.ts` (add a `describe("two spaces")` block at the end; reuse its `fakeClient`, `task`, `modeField`)

**Interfaces:**
- Consumes: nothing new (the constructor keeps accepting one space id).
- Produces: `new ClickUpLoTracker(client, spaceIds: string | string[])`. `listByStatus` returns the tickets of every space, one `searchTeamTasks` call per space, in the order given, no duplicate ids. `hasStatus` is true when any list in any space has the status. A failed read of any space throws.

- [ ] **Step 1: Write the failing tests.** The existing `fakeClient` has one `search` pool. Extend it for this block with `searchBySpace?: Record<string, T[]>` (a pool per space id; falls back to `o.search`). Change `searchTeamTasks` in `fakeClient` to `const source = o.searchBySpace?.[spaceId] ?? o.search;` and use `source` where it uses `o.search` for `pool`. Add:

```ts
describe("two spaces", () => {
  const dgs = task({ id: "d1", custom_id: "DGS-700", name: "DigiSmith one", custom_fields: [signOffField(0), modeField(0)] });
  const ocl = task({ id: "o1", custom_id: "OCL-106", name: "Oculus one", custom_fields: [signOffField(0), modeField(0)] });

  it("lists the tickets of every space, one search per space, in order", async () => {
    const { client, calls } = fakeClient({ search: [], searchBySpace: { S1: [dgs], S2: [ocl] } });
    const out = await new ClickUpLoTracker(client, ["S1", "S2"]).listByStatus("to do");
    expect(out.map((t) => t.key)).toEqual(["DGS-700", "OCL-106"]);
    expect(calls.filter((c) => c.startsWith("searchTeamTasks"))).toEqual(["searchTeamTasks S1 to do", "searchTeamTasks S2 to do"]);
  });
  it("a ticket that both searches return is listed once", async () => {
    const { client } = fakeClient({ search: [], searchBySpace: { S1: [dgs], S2: [dgs, ocl] } });
    const out = await new ClickUpLoTracker(client, ["S1", "S2"]).listByStatus("to do");
    expect(out.map((t) => t.key)).toEqual(["DGS-700", "OCL-106"]);
  });
  it("a failed read of the second space fails the whole list", async () => {
    const { client } = fakeClient({ search: [], searchBySpace: { S1: [dgs] } });
    (client as unknown as { searchTeamTasks: unknown }).searchTeamTasks = async (s: string) => {
      if (s === "S2") throw new Error("503");
      return [dgs];
    };
    await expect(new ClickUpLoTracker(client, ["S1", "S2"]).listByStatus("to do")).rejects.toThrow("503");
  });
  it("hasStatus is true when only the second space has the status", async () => {
    const { client } = fakeClient({ search: [], lists: { L1: ["backlog"], L2: ["to do"] } });
    (client as unknown as { getSpaceFolders: unknown }).getSpaceFolders = async (s: string) =>
      [{ id: "f", name: "F", lists: [{ id: s === "S1" ? "L1" : "L2", name: "x" }] }];
    const t = new ClickUpLoTracker(client, ["S1", "S2"]);
    expect(await t.hasStatus("to do")).toBe(true);
    expect(await t.hasStatus("nope")).toBe(false);
  });
  it("a single space id string still works", async () => {
    const { client, calls } = fakeClient({ search: [dgs] });
    await new ClickUpLoTracker(client, "S1").listByStatus("to do");
    expect(calls.filter((c) => c.startsWith("searchTeamTasks"))).toEqual(["searchTeamTasks S1 to do"]);
  });
  it("an OCL ticket keeps its OCL key and its Oculus Mode and Sign-off", async () => {
    const manual = task({ id: "o2", custom_id: "OCL-107", custom_fields: [signOffField(1), modeField(1)] });
    const { client } = fakeClient({ search: [], searchBySpace: { S2: [manual] } });
    const [t] = await new ClickUpLoTracker(client, ["S1", "S2"]).listByStatus("to do");
    expect(t).toMatchObject({ key: "OCL-107", mode: "Manual", signOff: "Jack" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 src/autonomous/tracker-clickup.test.ts`
Expected: FAIL (the array is read as one space id; `getSpaceFolders` and `searchTeamTasks` get the array).

- [ ] **Step 3: Implement.** In `tracker-clickup.ts`:

```ts
  private readonly spaceIds: string[];

  constructor(client: ClickUpClient, spaceIds: string | string[]) {
    this.client = client;
    this.spaceIds = Array.isArray(spaceIds) ? spaceIds : [spaceIds];
  }
```
Remove the `spaceId` field. Replace `loadLists`:

```ts
  private async loadLists(): Promise<string[]> {
    const ids: string[] = [];
    for (const space of this.spaceIds) {
      const folders = await this.client.getSpaceFolders(space);
      const folderless = await this.client.getFolderlessLists(space);
      ids.push(...[...folders.flatMap((f) => f.lists ?? []), ...folderless].map((l) => l.id));
    }
    return ids;
  }
```
In `listByStatus` replace the `const all = ...` line with:

```ts
    const seen = new Set<string>();
    const all: ClickUpTask[] = [];
    for (const space of this.spaceIds) {
      for (const t of await this.client.searchTeamTasks(space, 10, name)) {
        if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
      }
    }
```
(The rest of the method stays; `byId` still reads from `all`.) Update the class comment: "for one or more spaces".

- [ ] **Step 4: Run to verify it passes**

Run the Step 2 command, plus `src/autonomous/ready.test.ts src/autonomous/scan.test.ts`. Expected: PASS (old tests use one id).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/tracker-clickup.ts packages/cli/src/autonomous/tracker-clickup.test.ts
git commit -m "feat(scan): the scan tracker reads a list of spaces"
```

---

### Task 3: The Steward tracker reads a list of spaces

**Files:**
- Modify: `packages/cli/src/steward/clickup-tracker.ts:34-40,70-85` (constructor, `listTargets`, `findCandidates`)
- Test: `packages/cli/src/steward/clickup-tracker.test.ts` (add a `describe("two spaces")` block)

**Interfaces:**
- Produces: `new ClickUpTracker(client, spaceIds: string | string[])`. `listTargets()` returns the lists of every space (DigiSmith first). `findCandidates(idea)` searches every space, merges, then applies the same score, sort and limit. `getTicket/setStatus/addComment/createTicket` are unchanged (key or list id carries the space).

- [ ] **Step 1: Write the failing tests**

```ts
describe("two spaces", () => {
  it("listTargets merges the lists of both spaces, in order", async () => {
    const c = client({
      getSpaceFolders: vi.fn(async (s: string) => [{ id: `F-${s}`, name: `Folder ${s}`, lists: [{ id: `L-${s}`, name: `List ${s}` }] }]),
      getFolderlessLists: vi.fn(async (s: string) => (s === "S2" ? [{ id: "LX", name: "Loose" }] : [])),
    });
    const out = await new ClickUpTracker(c, ["S1", "S2"]).listTargets();
    expect(out.map((t) => [t.id, t.folder])).toEqual([["L-S1", "Folder S1"], ["L-S2", "Folder S2"], ["LX", ""]]);
  });
  it("findCandidates searches both spaces and keeps the best matches", async () => {
    const hit = (key: string, name: string) => task({ custom_id: key, name, status: { status: "refinement" } });
    const c = client({
      searchTeamTasks: vi.fn(async (s: string) =>
        s === "S1" ? [hit("DGS-3", "Steward role keeps sync")] : [hit("OCL-9", "Steward role keeps sync state")]),
    });
    const out = await new ClickUpTracker(c, ["S1", "S2"]).findCandidates("steward role keeps sync");
    expect(out.map((x) => x.key).sort()).toEqual(["DGS-3", "OCL-9"]);
    expect(c.searchTeamTasks).toHaveBeenCalledTimes(2);
  });
  it("getTicket reads an OCL key with no space id", async () => {
    const c = client({ getTaskByRef: vi.fn().mockResolvedValue(task({ custom_id: "OCL-105" })) });
    const t = await new ClickUpTracker(c, ["S1", "S2"]).getTicket("OCL-105");
    expect(t.key).toBe("OCL-105");
    expect(c.getTaskByRef).toHaveBeenCalledWith("OCL-105");
  });
  it("a single space id string still works", async () => {
    const c = client();
    await new ClickUpTracker(c, "S1").listTargets();
    expect(c.getSpaceFolders).toHaveBeenCalledWith("S1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 src/steward/clickup-tracker.test.ts`
Expected: FAIL (array passed as one id).

- [ ] **Step 3: Implement.**

```ts
  private readonly spaceIds: string[];

  constructor(client: ClickUpClient, spaceIds: string | string[]) {
    this.client = client;
    this.spaceIds = Array.isArray(spaceIds) ? spaceIds : [spaceIds];
  }
```
`listTargets`:

```ts
  async listTargets(): Promise<ListTarget[]> {
    const out: ListTarget[] = [];
    for (const space of this.spaceIds) {
      const [folders, loose] = await Promise.all([this.client.getSpaceFolders(space), this.client.getFolderlessLists(space)]);
      for (const f of folders) for (const l of f.lists) out.push({ id: l.id, name: l.name, folder: f.name, description: "" });
      for (const l of loose) out.push({ id: l.id, name: l.name, folder: "", description: "" });
    }
    return out;
  }
```
`findCandidates`: replace `const tasks = await this.client.searchTeamTasks(this.spaceId);` with:

```ts
    const tasks: ClickUpTask[] = [];
    for (const space of this.spaceIds) tasks.push(...(await this.client.searchTeamTasks(space)));
```

- [ ] **Step 4: Run to verify it passes**

Run the Step 2 command plus `src/steward/index.test.ts src/steward/event.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward/clickup-tracker.ts packages/cli/src/steward/clickup-tracker.test.ts
git commit -m "feat(steward): the Steward tracker reads a list of spaces"
```

---

### Task 4: Wire both spaces into the scan, the Director and the Steward

**Files:**
- Modify: `packages/cli/src/autonomous/index.ts:7,62`
- Modify: `packages/cli/src/autonomous/director/command.ts:6,250`
- Modify: `packages/cli/src/steward/index.ts:2,18`
- Create: `packages/cli/src/clickup/spaces.wiring.test.ts` (precedent: `attach-hooks.wiring.test.ts`)

**Interfaces:**
- Consumes: `ALL_SPACE_IDS` (Task 1), the list constructors (Tasks 2, 3).
- Produces: the three production trackers are built with `ALL_SPACE_IDS`.

- [ ] **Step 1: Write the failing test** (`spaces.wiring.test.ts`)

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("the production trackers read every space", () => {
  for (const [label, rel, ctor] of [
    ["scan", "../autonomous/index.ts", "ClickUpLoTracker"],
    ["Director", "../autonomous/director/command.ts", "ClickUpLoTracker"],
    ["Steward", "../steward/index.ts", "ClickUpTracker"],
  ] as const) {
    it(`${label} builds ${ctor} with ALL_SPACE_IDS`, () => {
      const src = read(rel);
      expect(src).toMatch(new RegExp(`new ${ctor}\\(createClient\\(\\), ALL_SPACE_IDS\\)`));
      expect(src).not.toMatch(/DIGISMITH_SPACE_ID/);
    });
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 src/clickup/spaces.wiring.test.ts`
Expected: FAIL (three cases).

- [ ] **Step 3: Implement.** In each of the three files: change the import `createClient, DIGISMITH_SPACE_ID` from `clickup/lib.ts` to `import { createClient } from ".../clickup/lib.ts";` plus `import { ALL_SPACE_IDS } from ".../clickup/spaces.ts";` (same relative depth as the existing import), and replace `DIGISMITH_SPACE_ID` in the constructor call with `ALL_SPACE_IDS`.

- [ ] **Step 4: Run to verify it passes**

Run the Step 2 command plus `src/autonomous/index.test.ts src/autonomous/index-director.test.ts src/steward/index.test.ts`. Expected: PASS. Then `pnpm exec tsc -p tsconfig.build.json --noEmit` in `packages/cli`: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/index.ts packages/cli/src/autonomous/director/command.ts packages/cli/src/steward/index.ts packages/cli/src/clickup/spaces.wiring.test.ts
git commit -m "feat(scan): scan, Director and Steward read both spaces"
```

---

### Task 5: The ClickUp record commands accept an OCL key

**Files:**
- Modify: `packages/cli/src/clickup/attach-record.ts:13`, `ticket-total.ts:12`, `merge-comment.ts:14`, `task-stamp.ts:31` (each: `CLICKUP_KEY` becomes `isTicketKey`)
- Test: the four matching `*.test.ts` files (one new case each)

**Interfaces:**
- Consumes: `isTicketKey` (Task 1).
- Produces: each command treats `OCL-<n>` like `DGS-<n>`; a non-ticket text still prints `not a ClickUp key, skipped`; an unknown prefix (`ABC-1`) still skips.

- [ ] **Step 1: Write the failing tests.** Read the existing "not a ClickUp key, skipped" case in each test file (`attach-record.test.ts:52`, `merge-comment.test.ts:86`, `task-stamp.test.ts:155`, `ticket-total.test.ts:318`) and copy its harness. In each file add, next to it, two cases built the same way: one run with the task `OCL-105` (a mock client that answers `getTaskByRef("OCL-105")`, as the file's other success cases do for a DGS key) that expects the output NOT to contain `not a ClickUp key` and the mock client to have been called with `OCL-105`; one run with `ABC-1` that expects `not a ClickUp key, skipped`. Name them `accepts an OCL key` and `still skips an unknown prefix`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 src/clickup/attach-record.test.ts src/clickup/ticket-total.test.ts src/clickup/merge-comment.test.ts src/clickup/task-stamp.test.ts`
Expected: FAIL, the four `accepts an OCL key` cases print `not a ClickUp key, skipped`.

- [ ] **Step 3: Implement.** In each of the four files: delete `const CLICKUP_KEY = /^DGS-\d+$/;`, add `import { isTicketKey } from "./spaces.ts";`, and replace `CLICKUP_KEY.test(x)` with `isTicketKey(x)` (use `grep -n CLICKUP_KEY` to find every use). Change each `describe` text `ticket key (DGS-546)` is fine as is.

- [ ] **Step 4: Run to verify it passes**

Run the Step 2 command. Expected: PASS, no existing case changes.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/attach-record.ts packages/cli/src/clickup/ticket-total.ts packages/cli/src/clickup/merge-comment.ts packages/cli/src/clickup/task-stamp.ts packages/cli/src/clickup/attach-record.test.ts packages/cli/src/clickup/ticket-total.test.ts packages/cli/src/clickup/merge-comment.test.ts packages/cli/src/clickup/task-stamp.test.ts
git commit -m "feat(keys): record commands accept an OCL key"
```

---

### Task 6: The conductor scripts accept an OCL key

**Files:**
- Modify: `scripts/conductor/ticket-status.ts:8`, `scripts/conductor/markers.ts:24`, `scripts/conductor/refresh.ts:125,190,196`
- Test: `scripts/conductor/catch-up-cli.test.ts` (the `taskIdForKey` block, line 67), `scripts/conductor/refresh.test.ts` (the `markers` block, line 133, and the worker-row and merged-log cases)

**Interfaces:**
- Consumes: `isTicketKey`, `KEY_PREFIXES` from `../../packages/cli/src/clickup/spaces.ts` (scripts already import from `packages/cli/src`).
- Produces: `taskIdForKey("OCL-105", root)` reads the `OCL-105—*` board folder; `parseMarkers` reads `[resolves: ticket OCL-9]` and `[resolves: merged OCL-9]`; `refresh` lists an OCL worker with its key and counts an `ocl-9` commit subject as merged `OCL-9`.

- [ ] **Step 1: Write the failing tests.**
  - In `catch-up-cli.test.ts`, in the `taskIdForKey (S12)` block, copy its board-folder setup for `DGS-428` but with folder `OCL-105—x` containing `ticket.md` with task id `14zcebrypxm`; expect `taskIdForKey("OCL-105", root)` to be `"14zcebrypxm"` and `taskIdForKey("ABC-1", root)` to be `undefined`.
  - In `refresh.test.ts`, `markers` block, add: `expect(parseMarkers("[resolves: ticket OCL-9]\n[resolves: merged OCL-12]").resolvers).toEqual([{ kind: "ticket", key: "OCL-9" }, { kind: "merged", key: "OCL-12" }])`.
  - In `refresh.test.ts`, copy the existing merged-log case (the one that feeds `git log` rows with a `dgs-N` subject) and the existing worker-row case (terminal title with `DGS-N`); in the copies use `feat(scan): ocl-9 reads both spaces` and a terminal title containing `OCL-105`. Expect `merged` to contain `OCL-9` and the worker row key to be `OCL-105`.

- [ ] **Step 2: Run to verify it fails**

Run (repo root): `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 scripts/conductor/catch-up-cli.test.ts scripts/conductor/refresh.test.ts`
Expected: FAIL (4 new cases).

- [ ] **Step 3: Implement.**
  - `ticket-status.ts`: delete `const KEY = /^DGS-\d+$/;`, add `import { isTicketKey } from "../../packages/cli/src/clickup/spaces.ts";`, line 14 `!isTicketKey(key)`.
  - `markers.ts`: add the same import plus `KEY_PREFIXES`; line 24 becomes ``const t = new RegExp(`^(ticket|merged)\\s+((?:${KEY_PREFIXES})-\\d+)$`).exec(body);`` (build the RegExp once at module level as `TICKET_MARKER`).
  - `refresh.ts`: import `KEY_PREFIXES`; add at module level `const LOG_KEY = new RegExp(`\\b(${KEY_PREFIXES})-(\\d+)`, "gi"); const TITLE_KEY = new RegExp(`(?:${KEY_PREFIXES})-\\d+`, "i");`; line 125 becomes `for (const m of row.split("\t").slice(2).join("\t").matchAll(LOG_KEY)) merged.add(`${m[1].toUpperCase()}-${m[2]}`);`; line 190 becomes `const key = TITLE_KEY.exec(a.terminal_title_stripped ?? "")?.[0].toUpperCase() ?? TITLE_KEY.exec(name)?.[0].toUpperCase() ?? "-";`; line 196 uses `TITLE_KEY.exec(`${c.name} ${c.domain}`)`.

- [ ] **Step 4: Run to verify it passes**

Run the Step 2 command plus `scripts/conductor/cli.test.ts scripts/conductor/consult.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/conductor/ticket-status.ts scripts/conductor/markers.ts scripts/conductor/refresh.ts scripts/conductor/catch-up-cli.test.ts scripts/conductor/refresh.test.ts
git commit -m "feat(keys): conductor scripts accept an OCL key"
```

---

### Task 7: `dg clickup create-factory-fields`

**Files:**
- Create: `packages/cli/src/clickup/create-factory-fields.ts`
- Create: `packages/cli/src/clickup/create-factory-fields.test.ts`
- Modify: `packages/cli/src/clickup/index.ts:26,74` (import and register next to `createFieldCommand`)

**Interfaces:**
- Consumes: `buildFieldCreateBody` and `parseOption` from `./create-field.ts`; `printCall` from `./task-type-write.ts`; `ClickUpClient.getSpaceFolders/getFolderlessLists/getListFields`; `FrontdoorClient.createField/setFieldLocations/teamId`; `SPACES` (Task 1).
- Produces:
  - `FACTORY_FIELDS`: `[{ name: "Mode", options: ["Autonomous:#2ecd6f", "Manual:#e67e22"] }, { name: "Sign-off", options: ["Auto:#1bbc9c", "Jack:#e67e22"] }]` (read from the DigiSmith fields on 2026-11-14: Mode `c89fcfe7-...`, Sign-off `17a56fbf-...`).
  - `createCreateFactoryFieldsCommand(readFactory?: () => ClickUpClient, fieldFactory?: () => FrontdoorClient): CommandModule`; options `--space <id>` (required, numeric, must be a space in `SPACES`) and `--yes`.
  - Behaviour: reads every list of the space; for each factory field: present with the same option names in the same order → prints `skip <name>: exists (<id>)`; present with other options → error, exit 1, nothing created; missing → dry run prints the POST and the location PUT (`parent {type: 4, id: <space>}`) and `nothing sent; add --yes to send`; with `--yes` creates the field, sets the space-level location, reads the locations back. Exit 0 on success, 1 on error.

- [ ] **Step 1: Write the failing tests** (`create-factory-fields.test.ts`)

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClickUpClient, FrontdoorClient } from "@digismith/clickup-client";
import { FACTORY_FIELDS, createCreateFactoryFieldsCommand } from "./create-factory-fields.ts";

const OCL = "1301150000003197";
const opt = (name: string, i: number) => ({ id: `o${i}`, name, orderindex: i, color: "#000" });
const field = (name: string, options: string[]) => ({ id: `id-${name}`, name, type: "drop_down", type_config: { options: options.map(opt) } });

function read(fields: unknown[]) {
  return {
    getSpaceFolders: vi.fn().mockResolvedValue([{ id: "F", name: "Product", lists: [{ id: "L1", name: "Backlog" }] }]),
    getFolderlessLists: vi.fn().mockResolvedValue([{ id: "L2", name: "Loose" }]),
    getListFields: vi.fn().mockResolvedValue(fields),
  } as unknown as ClickUpClient & { getListFields: ReturnType<typeof vi.fn> };
}
function front() {
  let n = 0;
  return {
    teamId: "5738747",
    createField: vi.fn(async (b: { name: string }) => ({ id: `new-${++n}`, name: b.name, type: "drop_down", type_config: { options: [] } })),
    setFieldLocations: vi.fn().mockResolvedValue(undefined),
    getFieldLocations: vi.fn().mockResolvedValue({ locations: [{}] }),
  } as unknown as FrontdoorClient & { createField: ReturnType<typeof vi.fn>; setFieldLocations: ReturnType<typeof vi.fn> };
}
const run = (r: unknown, f: unknown, argv: object) =>
  (createCreateFactoryFieldsCommand(() => r as ClickUpClient, () => f as FrontdoorClient).handler as (a: object) => Promise<void>)({ yes: false, ...argv });
const out = () => (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).join("\n");

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

describe("create-factory-fields", () => {
  it("the field pair equals DigiSmith's (pinned)", () => {
    expect(FACTORY_FIELDS).toEqual([
      { name: "Mode", options: ["Autonomous:#2ecd6f", "Manual:#e67e22"] },
      { name: "Sign-off", options: ["Auto:#1bbc9c", "Jack:#e67e22"] },
    ]);
  });
  it("dry run prints both calls with the space-level location and sends nothing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = front();
    await run(read([]), f, { space: OCL });
    expect(f.createField).not.toHaveBeenCalled();
    expect(out()).toContain('"name": "Mode"');
    expect(out()).toContain('"name": "Sign-off"');
    expect(out()).toContain(`"id": "${OCL}"`);
    expect(out()).toContain("nothing sent; add --yes to send");
    expect(process.exitCode).toBe(0);
  });
  it("--yes creates both missing fields at the space, then reads the locations back", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = front();
    await run(read([]), f, { space: OCL, yes: true });
    expect(f.createField.mock.calls.map((c) => (c[0] as { name: string }).name)).toEqual(["Mode", "Sign-off"]);
    expect(f.setFieldLocations).toHaveBeenCalledTimes(2);
    expect(f.setFieldLocations.mock.calls[0][1]).toEqual([
      { parent: { type: 4, id: OCL }, required: false, required_on_subtasks: false, hide_from_guests: false },
    ]);
    expect(process.exitCode).toBe(0);
  });
  it("--yes creates only the missing field", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = front();
    await run(read([field("Mode", ["Autonomous", "Manual"])]), f, { space: OCL, yes: true });
    expect(f.createField.mock.calls.map((c) => (c[0] as { name: string }).name)).toEqual(["Sign-off"]);
    expect(out()).toContain("skip Mode: exists (id-Mode)");
  });
  it("a second run with both fields present creates nothing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = front();
    await run(read([field("Mode", ["Autonomous", "Manual"]), field("Sign-off", ["Auto", "Jack"])]), f, { space: OCL, yes: true });
    expect(f.createField).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });
  it("a field with other options is an error and nothing is created", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = front();
    await run(read([field("Mode", ["Autonomous", "Maual"])]), f, { space: OCL, yes: true });
    expect(f.createField).not.toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toContain('"Mode" exists with options Autonomous, Maual');
    expect(process.exitCode).toBe(1);
  });
  it("refuses a space that is not in the space list", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(read([]), front(), { space: "999" });
    expect(String(err.mock.calls[0][0])).toContain("not a known space");
    expect(process.exitCode).toBe(1);
  });
  it("a failed location call says the field exists without a location and exits 1", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = front();
    f.setFieldLocations.mockRejectedValueOnce(new Error("boom"));
    await run(read([]), f, { space: OCL, yes: true });
    expect(String(err.mock.calls[0][0])).toContain("new-1 was created, but setting its locations failed: boom");
    expect(f.createField).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 src/clickup/create-factory-fields.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** (`create-factory-fields.ts`)

```ts
import type { CommandModule } from "yargs";
import type { ClickUpClient, FrontdoorClient } from "@digismith/clickup-client";
import { buildFieldCreateBody, parseOption } from "./create-field.ts";
import { createClient, createFrontdoorClient } from "./lib.ts";
import { SPACES } from "./spaces.ts";
import { printCall } from "./task-type-write.ts";

/** The fields the factory claims by. Same names, options, order and colours as the DigiSmith space (read 2026-11-14). */
export const FACTORY_FIELDS = [
  { name: "Mode", options: ["Autonomous:#2ecd6f", "Manual:#e67e22"] },
  { name: "Sign-off", options: ["Auto:#1bbc9c", "Jack:#e67e22"] },
] as const;

/** Location type 4 = a space (read from get-field on DigiSmith's Mode field). */
const SPACE_LOCATION_TYPE = 4;

interface ListedField { id: string; name: string; type_config?: { options?: { name: string; orderindex: number }[] } }

async function fieldsOfSpace(client: ClickUpClient, space: string): Promise<Map<string, ListedField>> {
  const [folders, loose] = await Promise.all([client.getSpaceFolders(space), client.getFolderlessLists(space)]);
  const lists = [...folders.flatMap((f) => f.lists ?? []), ...loose];
  const found = new Map<string, ListedField>();
  for (const l of lists) {
    for (const f of (await client.getListFields(l.id)) as unknown as ListedField[]) if (!found.has(f.name)) found.set(f.name, f);
  }
  return found;
}

const optionNames = (f: ListedField): string[] =>
  [...(f.type_config?.options ?? [])].sort((a, b) => a.orderindex - b.orderindex).map((o) => o.name);

export function createCreateFactoryFieldsCommand(
  readFactory: () => ClickUpClient = createClient,
  fieldFactory: () => FrontdoorClient = createFrontdoorClient
): CommandModule {
  return {
    command: "create-factory-fields",
    describe: "create the Mode and Sign-off fields the factory claims by in a space (same options as DigiSmith's); a dry run unless --yes; skips a field that exists",
    builder: (y) =>
      y
        .option("space", { type: "string", requiresArg: true, demandOption: true, describe: "space id (must be in the factory space list)" })
        .option("yes", { type: "boolean", default: false, describe: "send the calls (without it, only print them)" }),
    handler: async (argv) => {
      try {
        const space = String(argv.space ?? "").trim();
        if (!SPACES.some((s) => s.id === space)) {
          throw new Error(`"${space}" is not a known space (${SPACES.map((s) => `${s.name} ${s.id}`).join(", ")})`);
        }
        const existing = await fieldsOfSpace(readFactory(), space);
        const plan: (typeof FACTORY_FIELDS)[number][] = [];
        for (const want of FACTORY_FIELDS) {
          const have = existing.get(want.name);
          const names = want.options.map((o, i) => parseOption(o, i).name);
          if (!have) { plan.push(want); continue; }
          const got = optionNames(have);
          if (got.join("|") !== names.join("|")) {
            throw new Error(`"${want.name}" exists with options ${got.join(", ")}; expected ${names.join(", ")}. Nothing created; fix it by hand.`);
          }
          console.log(`skip ${want.name}: exists (${have.id})`);
        }
        const client = fieldFactory();
        const location = [{ parent: { type: SPACE_LOCATION_TYPE, id: space }, required: false as const, required_on_subtasks: false as const, hide_from_guests: false as const }];
        for (const want of plan) {
          const body = buildFieldCreateBody(want.name, [...want.options], { teamId: client.teamId }, "", "drop_down");
          if (!argv.yes) {
            printCall("POST", "/customFields/v2/field?ignore_existing=true", body);
            printCall("PUT", `/field/v3/experience/workspaces/${client.teamId}/fields/<new field id>/locations`, { new_locations: location });
            continue;
          }
          const created = await client.createField(body);
          console.log(`field ${created.id} (${created.type}) ${JSON.stringify(created.name)}`);
          try {
            await client.setFieldLocations(created.id, location);
          } catch (e) {
            throw new Error(`field ${created.id} was created, but setting its locations failed: ${(e as Error).message}. Run get-field ${created.id} and set the locations again; do not create the field twice.`);
          }
          const back = await client.getFieldLocations(created.id);
          console.log(`locations read back: ${(back.locations ?? []).length}`);
        }
        if (!argv.yes && plan.length > 0) console.log("nothing sent; add --yes to send");
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup create-factory-fields: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const createFactoryFieldsCommand: CommandModule = createCreateFactoryFieldsCommand();
```

In `index.ts` add `import { createFactoryFieldsCommand } from "./create-factory-fields.ts";` after line 26 and `.command(createFactoryFieldsCommand)` after line 74. If the test for the dry run expects the line even when nothing is missing, keep as written: with nothing missing nothing is printed but the `skip` lines.

- [ ] **Step 4: Run to verify it passes**

Run the Step 2 command plus `src/clickup/create-field.test.ts`. Expected: PASS. If a type error appears for `setFieldLocations`' parameter type, read `packages/clickup-client/src/frontdoor.ts:193-236` and match `create-field.ts`'s `locations` shape. Then `pnpm exec tsc -p tsconfig.build.json --noEmit`: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/create-factory-fields.ts packages/cli/src/clickup/create-factory-fields.test.ts packages/cli/src/clickup/index.ts
git commit -m "feat(clickup): create-factory-fields makes Mode and Sign-off in a space"
```

---

### Task 8: Schedule release, the watch labeller and the report see OCL tickets

**Files:**
- Test only: `packages/cli/src/autonomous/two-space-readers.test.ts` (new). Production code changes only if a test fails; a failure becomes a finding in the report and a fix in this task.

**Interfaces:**
- Consumes: real `ClickUpLoTracker` (Task 2) over a fake `ClickUpClient` with one search pool per space; `runScheduleRelease(d: ScheduleDeps)` (`schedule-release.ts:41`); `gatherDrift`/`driftLines` (`drift.ts`); `TICKET_RE` (`phase-types.ts:7`).
- Produces: pins that the three readers work with an OCL ticket through the merged tracker. "autonomous watch" (the watchdog) names a ticket only through `TICKET_RE` and the run role names; both are pinned here.

- [ ] **Step 1: Write the tests**

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { ClickUpLoTracker } from "./tracker-clickup.ts";
import { runScheduleRelease } from "./schedule-release.ts";
import { driftLines, gatherDrift } from "./drift.ts";
import { TICKET_RE } from "./phase-types.ts";
import { readEvents } from "./state.ts";

const NOW = new Date("2026-11-14T10:00:00.000Z");
const modeField = { id: "fm", name: "Mode", type: "drop_down", value: 0, type_config: { options: [{ name: "Autonomous", orderindex: 0 }, { name: "Manual", orderindex: 1 }] } };
const scheduledField = { id: "fs", name: "Scheduled at", type: "date", value: String(NOW.getTime() - 60_000) };
const ocl = (status: string) => ({
  id: "o1", custom_id: "OCL-106", custom_item_id: 0, name: "Guardrails pin", text_content: "", description: "",
  status: { status, type: "custom" }, date_created: "1000", due_date: null, priority: null,
  custom_fields: [modeField, scheduledField], dependencies: [], linked_tasks: [], attachments: [],
});

function twoSpaceClient() {
  const state = { status: "scheduled" };
  const updates: string[] = [];
  const client = {
    async searchTeamTasks(space: string, _p: number, status?: string) {
      return space === "S2" && status?.toLowerCase() === state.status ? [ocl(state.status)] : [];
    },
    async getTaskByRef(ref: string) { if (ref !== "o1" && ref !== "OCL-106") throw new Error(`no ${ref}`); return ocl(state.status); },
    async updateTask(id: string, body: { status?: string }) { updates.push(`${id} ${body.status}`); if (body.status) state.status = body.status; return ocl(state.status); },
    async addTaskComment() { return { id: 1 }; },
    async getAllListTasks() { return []; },
  };
  return { client: client as unknown as ClickUpClient, updates, state };
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "two-space-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("readers over the merged tracker", () => {
  it("schedule-release moves a due OCL ticket from the Oculus space to to do", async () => {
    const { client, updates } = twoSpaceClient();
    const tracker = new ClickUpLoTracker(client, ["S1", "S2"]);
    const r = await runScheduleRelease({ tracker, dir, now: () => NOW, dryRun: false });
    expect(updates).toEqual(["o1 to do"]);
    expect(r).toMatchObject({ scheduled: 1, moved: 1 });
    const ev = readEvents(dir, NOW.getTime() - 86_400_000, NOW.getTime() + 86_400_000);
    expect(ev.map((e) => [e.kind, e.ticket])).toEqual([["schedule-move", "OCL-106"]]);
  });
  it("the report's drift check reads an OCL ticket's status", async () => {
    const { client } = twoSpaceClient();
    const tracker = new ClickUpLoTracker(client, ["S1", "S2"]);
    const git = (() => "") as never;
    const facts = await gatherDrift({ tracker, git, repo: "/nope" }, [{ ticket: "OCL-106", taskId: "o1" }]);
    expect(facts.get("OCL-106")?.status).toBe("scheduled");
    expect(driftLines([{ ticket: "OCL-106", taskId: "o1" }], facts).join("\n")).not.toContain("DGS");
  });
  it("the watchdog's ticket key rule accepts an OCL key", () => {
    expect(TICKET_RE.test("OCL-106")).toBe(true);
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 src/autonomous/two-space-readers.test.ts`
Expected: PASS if the readers are key-agnostic (expected). A FAIL is a finding: record it, fix the production line in the same task, rerun. If `runScheduleRelease`'s `ScheduleDeps` needs more fields than `{tracker, dir, now, dryRun}`, add them as the existing `schedule-release.test.ts` `mk()` does (line 17).

- [ ] **Step 3: Read the run-role rule.** Run `grep -n "ticket key\|[A-Za-z]-\\\\d" packages/cli/src/run/role.ts packages/cli/src/run/label-cli.ts`. If a rule is DGS-only, add a failing case to `packages/cli/src/run/role.test.ts` for an `ocl-105` pane name giving role `builder`, then fix it. If it is generic, add the passing case as a pin.

- [ ] **Step 4: Run** the changed test files. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/two-space-readers.test.ts packages/cli/src/run
git commit -m "test(scan): schedule release, report and labeller see OCL tickets"
```

---

### Task 9: Pins for board, lock, claims, Steward and Director with an OCL key, and the end-to-end scan

**Files:**
- Test only (production fix only if a test fails): `scripts/board-path.test.ts` (or the existing test file for `board-path.ts`; find it with `ls scripts/*board-path*`), `packages/cli/src/steward/event.test.ts` (or a new `packages/cli/src/steward/ocl-key.test.ts`), `packages/cli/src/autonomous/scan.test.ts` (new case), `packages/cli/src/autonomous/director/` test for the refine pass.
- Modify (docs): `packages/cli/src/steward/README.md`, `packages/cli/src/autonomous/WATCHDOG.md` (one line each: both spaces, key by prefix).

**Interfaces:**
- Consumes: the existing fakes (`FakeTracker` in `autonomous/fake-tracker.test-util.ts`, `steward/fake-tracker.test-util.ts`).
- Produces: pins for D5, D6, D7 and the end-to-end done check.

- [ ] **Step 1: Scheduler grep (protected path).** Run `grep -rn "1301150000001271\|DGS-\|DIGISMITH_SPACE" scripts/nexus-api/src/scheduler/ | grep -v "\.test\." | grep -v "(DGS-[0-9]*)"`. Expected: no output (only description strings with a ticket number in brackets). A real hit: add a task to this plan and tell the Dock before editing.

- [ ] **Step 2: Board path pins.** In the `board-path` test file add:

```ts
it("path, parse and find work with an OCL key", () => {
  expect(boardRelPathForSlug("OCL-105", "factory-reads-both-spaces")).toBe(".digismith/board/OCL-105—factory-reads-both-spaces");
  expect(parseBoardName("OCL-105—factory-reads-both-spaces")).toEqual(["OCL-105", "factory-reads-both-spaces"]);
});
```
Use the real export names: run `grep -n "^export" scripts/board-path.ts` first and match them (the names above stand for `boardRelPathForSlug` and the parse function). Expected: PASS. A FAIL is a finding.

- [ ] **Step 3: Steward pins.** With `steward/fake-tracker.test-util.ts`, add a test that applies the whole event chain to `OCL-105` (`refinement-started`, `spec-approved`... use the event names in `steward/types.ts` `EVENTS`, in the order the README table lists) with a temp `dir` and asserts: every event is accepted (no refusal line), the final status is the one the same chain gives `DGS-105`, and the state files are `OCL-105.json` and `DGS-105.json` (two different files after running both). Copy the harness from `steward/event.test.ts`.

- [ ] **Step 4: Director pin.** In the Director's existing refine-pass test, copy the case that picks a `refinement` ticket and add a second ticket with key `OCL-9`; expect both picked. Use the file's own fake tracker.

- [ ] **Step 5: End-to-end scan.** In `autonomous/scan.test.ts`, copy the case "claims the top ready ticket" and add a variant where the ready ticket is `OCL-106` (Mode Autonomous, spec and plan attachments as the other cases do): expect the claim event, the lock's `ticket` to be `OCL-106`, the order file name to contain `ocl-106` (or the existing naming for DGS keys), and the driver record to be written for `OCL-106`. Run with a temp dir and `DIGISMITH_DEPOT_DIR` set to it.

- [ ] **Step 6: Docs.** Add to `steward/README.md` under the first paragraph: "Reads the DigiSmith (DGS) and Oculus (OCL) spaces; a key finds its ticket across the team, so the key prefix needs no setting." Add to `WATCHDOG.md` "Ticket flow": "The scan reads both spaces (DGS and OCL); the claim, lock and order carry the ticket's own key."

- [ ] **Step 7: Run and commit.** Run each changed test file with the fork pool of 2. Expected: PASS (a failure becomes a finding and a fix, then rerun).

```bash
git add scripts packages/cli/src/steward packages/cli/src/autonomous
git commit -m "test(scan): OCL key pins for board, Steward, Director and scan"
```

---

## Whole-branch checks (after a clean whole-branch review)

1. `uptime`: load under 4 (the DGS-785 Builder's suite must not be running).
2. Whole `packages/cli` suite once: `pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2`. The only known failure: the guardrails pin (OCL-106, ex DGS-720).
3. `pnpm exec tsc -p tsconfig.build.json --noEmit` in `packages/cli`: exit 0.
4. `scripts/conductor` tests and, only if touched, `scripts/nexus-api` tests.
5. Merge package: `report.html` (`Ticket:` strong line, a Date span, `<section id="summary">`; lists every deviation, the findings F1-F5 and the board-path slug finding), `plan.md` committed by pathspec; print `STOP: merge-ready <sha>`. No merge, no push, no Steward events by me.

## Self-review

- **Spec coverage:** D1 Task 1; D2 Tasks 2, 3, 4; D3 Tasks 5, 6; D4 Task 7; D5 Task 9 Step 2 (+ lock and claims in Step 5); D6 Task 9 Step 3; D7 Task 9 Step 4; D8 (schedule-release, watch, report) Task 8; D9 out of scope (slug finding in the findings table and the report); post-merge first use with OCL-106 in its own section; protected paths listed and the scheduler grep in Task 9 Step 1.
- **Placeholders:** Tasks 5, 6, 8 (Step 3), 9 (Steps 2-5) describe a test by copying an existing case of the same file, with the exact input and expected output named, because the harness shapes differ per file. The implementer reads the named case first.
- **Names:** `SPACES`, `ALL_SPACE_IDS`, `KEY_PREFIXES`, `spaceForKey`, `isTicketKey` (Task 1) are the only names later tasks use. `FACTORY_FIELDS` and `createCreateFactoryFieldsCommand` stay inside Task 7.
