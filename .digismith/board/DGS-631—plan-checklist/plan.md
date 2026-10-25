# Plan Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dg clickup checklist sync` keeps a ticket's nested ClickUp "Plan" checklist matched to its plan and ledger (DGS-632); writing-plans creates it (DGS-631); subagent-driven-development and executing-plans tick it as the build moves (DGS-634).

**Architecture:** Four client methods on `ClickUpClient` for the public API v2 checklist endpoints. Pure modules in `packages/cli/src/clickup/checklist/`: `plan.ts` (plan headings, `--done` keys, ledger → keys), `want.ts` (plan + done → wanted items), `diff.ts` (current items + wanted → ops). `sync.ts` is the yargs command: read the task, apply the ops with `--yes`, read back, print one JSON line. Each skill gets one small named step.

**Tech Stack:** TypeScript (Node 24, `--experimental-strip-types`), yargs, axios through `ClickUpClient`, Vitest with mocks only.

Spec: `.digismith/board/DGS-631—plan-checklist/design.html` (approved, ee0d4107).

## Global Constraints

- pnpm only. Run tests from the worktree root: `pnpm vitest run <path>`.
- Tests never write to ClickUp: mock the client or axios.
- Command shape: `dg clickup checklist sync --task <KEY|id> --plan <plan.md> [--done <key,key,...> | --ledger <progress.md>] [--name "Plan"] [--yes]`.
- Item keys: `N`, `N.implement`, `N.review`, `N.fix`, `final.review`, `final.fix`. `--done` also takes `N.fix:none` and `final.fix:none`.
- Layout, in order: per plan task a top-level item `Task N: <title>` with children `Implement`, `Review`, `Fix` (or `Fix (none needed)`); then top-level `Whole-branch review`, then `Whole-branch fixes` (or `Whole-branch fixes (none needed)`).
- Item `N` is resolved when its three children are resolved, or when key `N` is in the done set.
- Matching survives renames: a child is matched by its parent item and its name prefix (`Implement`, `Review`, `Fix`); finals by prefix (`Whole-branch review`, `Whole-branch fixes`); task items by `Task N:`.
- Items with other names are foreign: never touched, counted.
- Dry run without `--yes`: reads only. A failed write or a read-back mismatch exits 1 with `clickup checklist sync: <message>` on stderr. Output: one JSON line on stdout.
- Commits: title-only conventional commits, no AI attribution. Scope `dgs-632` for Tasks 1-4, `dgs-631` for the writing-plans hook, `dgs-634` for the SDD/executing-plans hooks. Commit with explicit paths, never `git add -A`.
- Match the neighbouring files (`add-comment.ts`, `client.ts`): short `/** */` doc lines, plain English.

---

### Task 1: Checklist types and client methods

**Files:**
- Modify: `packages/clickup-client/src/types.ts` (two interfaces just above `export interface ClickUpTask`; type `ClickUpTask.checklists`)
- Modify: `packages/clickup-client/src/client.ts` (import the type; four methods after `getTaskComments`)
- Test: `packages/clickup-client/src/client.test.ts` (one `it` in the `describe` that holds the `addTaskComment()` test)

**Interfaces:**
- Produces:
  - `interface ClickUpChecklistItem { id: string; name: string; orderindex: number; resolved: boolean; parent?: string | null; children?: unknown[] }`
  - `interface ClickUpChecklist { id: string; task_id: string; name: string; orderindex: number; resolved: number; unresolved: number; items: ClickUpChecklistItem[] }`
  - `ClickUpTask.checklists: ClickUpChecklist[]`
  - `createChecklist(taskId: string, name: string): Promise<ClickUpChecklist>`
  - `createChecklistItem(checklistId: string, name: string): Promise<ClickUpChecklist>`
  - `editChecklistItem(checklistId: string, itemId: string, patch: { name?: string; resolved?: boolean; parent?: string | null }): Promise<ClickUpChecklist>`
  - `deleteChecklistItem(checklistId: string, itemId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
  it("checklist calls: create a checklist, add, edit (with parent) and delete an item", async () => {
    const client = makeClient();
    const cl = { id: "c1", task_id: "a", name: "Plan", orderindex: 0, resolved: 0, unresolved: 1, items: [] };
    request.mockResolvedValueOnce({ data: { checklist: cl } });
    request.mockResolvedValueOnce({ data: { checklist: { ...cl, items: [{ id: "i1", name: "Implement", orderindex: 0, resolved: false }] } } });
    request.mockResolvedValueOnce({ data: { checklist: { ...cl, items: [{ id: "i1", name: "Implement", orderindex: 0, resolved: true, parent: "p1" }] } } });
    request.mockResolvedValueOnce({ data: {} });

    expect((await client.createChecklist("a", "Plan")).id).toBe("c1");
    expect((await client.createChecklistItem("c1", "Implement")).items[0].id).toBe("i1");
    expect((await client.editChecklistItem("c1", "i1", { parent: "p1", resolved: true })).items[0].parent).toBe("p1");
    await client.deleteChecklistItem("c1", "i1");

    expect(request).toHaveBeenNthCalledWith(1, { method: "POST", url: "/task/a/checklist", params: undefined, data: { name: "Plan" } });
    expect(request).toHaveBeenNthCalledWith(2, { method: "POST", url: "/checklist/c1/checklist_item", params: undefined, data: { name: "Implement" } });
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "PUT",
      url: "/checklist/c1/checklist_item/i1",
      params: undefined,
      data: { parent: "p1", resolved: true },
    });
    expect(request).toHaveBeenNthCalledWith(4, { method: "DELETE", url: "/checklist/c1/checklist_item/i1", params: undefined, data: undefined });
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run packages/clickup-client/src/client.test.ts -t "checklist calls"`
Expected: FAIL, `client.createChecklist is not a function`.

- [ ] **Step 3: Add the types**

Above `export interface ClickUpTask` in `types.ts`:

```ts
/** One checklist item. A child item has `parent` set; GET /task may also nest children as objects in `children`. */
export interface ClickUpChecklistItem {
  id: string;
  name: string;
  orderindex: number;
  resolved: boolean;
  parent?: string | null;
  children?: unknown[];
}

/** A task checklist. The checklist endpoints answer `{ checklist }` with this shape. */
export interface ClickUpChecklist {
  id: string;
  task_id: string;
  name: string;
  orderindex: number;
  resolved: number;
  unresolved: number;
  items: ClickUpChecklistItem[];
}
```

In `ClickUpTask` replace `checklists: unknown[];` with `checklists: ClickUpChecklist[];`.

- [ ] **Step 4: Add the client methods**

Add `ClickUpChecklist,` to the `import type` list in `client.ts` (after `ClickUpAttachment,`). After `getTaskComments`:

```ts
  /** POST /task/{id}/checklist. ClickUp answers { checklist }. */
  async createChecklist(taskId: string, name: string): Promise<ClickUpChecklist> {
    const res = await this.post<{ checklist: ClickUpChecklist }>(`/task/${taskId}/checklist`, { data: { name } });
    return res.checklist;
  }

  /** POST /checklist/{id}/checklist_item: takes only a name (no parent). ClickUp answers the whole checklist. */
  async createChecklistItem(checklistId: string, name: string): Promise<ClickUpChecklist> {
    const res = await this.post<{ checklist: ClickUpChecklist }>(`/checklist/${checklistId}/checklist_item`, { data: { name } });
    return res.checklist;
  }

  /** PUT /checklist/{id}/checklist_item/{item}: rename, tick or untick, or nest under `parent`. ClickUp answers the whole checklist. */
  async editChecklistItem(
    checklistId: string,
    itemId: string,
    patch: { name?: string; resolved?: boolean; parent?: string | null },
  ): Promise<ClickUpChecklist> {
    const res = await this.put<{ checklist: ClickUpChecklist }>(`/checklist/${checklistId}/checklist_item/${itemId}`, { data: patch });
    return res.checklist;
  }

  /** DELETE /checklist/{id}/checklist_item/{item}. ClickUp answers {}. */
  async deleteChecklistItem(checklistId: string, itemId: string): Promise<void> {
    await this.delete(`/checklist/${checklistId}/checklist_item/${itemId}`);
  }
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/clickup-client packages/cli/src/clickup`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/clickup-client/src/types.ts packages/clickup-client/src/client.ts packages/clickup-client/src/client.test.ts
git commit -m "feat(dgs-632): add the checklist calls to the ClickUp client"
```

---

### Task 2: Plan, `--done` keys and ledger parsing

**Files:**
- Create: `packages/cli/src/clickup/checklist/plan.ts`
- Test: `packages/cli/src/clickup/checklist/plan.test.ts`

**Interfaces:**
- Produces:
  - `interface PlanTask { n: number; name: string }` (`name` = `Task N: <title>`)
  - `interface DoneState { keys: Set<string>; noneNeeded: Set<string> }` — `keys` holds item keys (`"2"`, `"2.implement"`, `"final.fix"`); `noneNeeded` holds `"N.fix"` / `"final.fix"` keys that read "(none needed)". A key in `noneNeeded` is always in `keys` too.
  - `parsePlanTasks(text: string): PlanTask[]`
  - `parseDoneKeys(value: string): DoneState`
  - `parseLedgerDone(text: string): DoneState`

Ledger rules (exact):
- `N.implement` when a line `Task N: implemented`, `Task N: review requested` or `Task N: complete` exists.
- `N.review` when `Task N: reviewed` or `Task N: complete` exists.
- `N.fix` when `Task N: complete` exists; also in `noneNeeded` when there is no `Task N: fix round` line and no `Review task N r<R>: ... -> fixed` line.
- `final.review` when `Task final: reviewed` or `Task final: complete` exists.
- `final.fix` when `Task final: complete` exists; also in `noneNeeded` when there is no `Task final: dispatch fix` line and no `Review ticket final r<R>: ... -> fixed` line.
- A line may start with `- ` or `* `. `Task final: review requested` means nothing for the checklist.

- [ ] **Step 1: Write the failing test**

`packages/cli/src/clickup/checklist/plan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePlanTasks, parseDoneKeys, parseLedgerDone } from "./plan.ts";

const sorted = (s: Set<string>) => [...s].sort();

describe("parsePlanTasks", () => {
  it("reads ### Task N: headings in plan order", () => {
    expect(parsePlanTasks("# P\n\n### Task 1: Client calls\n\nbody\n\n### Task 2:   Parse the plan  \n")).toEqual([
      { n: 1, name: "Task 1: Client calls" },
      { n: 2, name: "Task 2: Parse the plan" },
    ]);
  });

  it("skips headings inside fenced code blocks, also four-backtick and tilde fences", () => {
    const plan = [
      "### Task 1: Real",
      "````markdown",
      "### Task 9: Inside four backticks",
      "```ts",
      "### Task 8: Nested three backticks",
      "```",
      "````",
      "~~~",
      "### Task 7: Inside tildes",
      "~~~",
      "### Task 2: Also real",
    ].join("\n");
    expect(parsePlanTasks(plan).map((t) => t.n)).toEqual([1, 2]);
  });

  it("ignores other heading levels and Task headings without a number", () => {
    expect(parsePlanTasks("## Task 1: Two\n### Task final: x\n#### Task 3: four\n### Task 4: ok\n")).toEqual([{ n: 4, name: "Task 4: ok" }]);
  });

  it("throws on no task headings and on a repeated number", () => {
    expect(() => parsePlanTasks("# nothing\n")).toThrow('no "### Task N: <title>" headings');
    expect(() => parsePlanTasks("### Task 1: a\n### Task 1: b\n")).toThrow("Task 1 twice");
  });
});

describe("parseDoneKeys", () => {
  it("reads every key form", () => {
    const d = parseDoneKeys("1, 1.implement,1.review,1.fix:none, 2.fix, final.review,final.fix:none");
    expect(sorted(d.keys)).toEqual(["1", "1.fix", "1.implement", "1.review", "2.fix", "final.fix", "final.review"]);
    expect(sorted(d.noneNeeded)).toEqual(["1.fix", "final.fix"]);
  });
  it("an empty string is nothing done", () => {
    expect(parseDoneKeys("").keys.size).toBe(0);
  });
  it("refuses a bad key", () => {
    for (const bad of ["x", "0", "1.build", "1.review:none", "final", "final.implement"]) {
      expect(() => parseDoneKeys(bad)).toThrow(`--done: "${bad}" is not an item key`);
    }
  });
});

describe("parseLedgerDone", () => {
  it("maps SDD ledger lines to keys", () => {
    const ledger = [
      "# SDD ledger — plan: x/plan.md",
      "Review mode: hand",
      "Task 1: dispatch implementer agent=a1",
      "Task 1: implemented",
      "Task 1: reviewed (clean)",
      "Task 1: complete (commits a..b, review clean)",
      "Task 2: implemented",
      "Task 2: reviewed (2 findings)",
      "Task 2: fix round 1/5 (2 addressed, 0 open; commits b..c)",
      "Task 2: complete (commits b..c, review clean)",
      "Task 3: implemented",
      "Task 3: reviewed (1 findings)",
      "Task final: reviewed (clean)",
      "Task final: complete",
    ].join("\n");
    const d = parseLedgerDone(ledger);
    expect(sorted(d.keys)).toEqual([
      "1.fix", "1.implement", "1.review", "2.fix", "2.implement", "2.review", "3.implement", "3.review", "final.fix", "final.review",
    ]);
    expect(sorted(d.noneNeeded)).toEqual(["1.fix", "final.fix"]);
  });

  it("role mode: review requested means implemented; a fixed verdict line means a fix happened", () => {
    const ledger = [
      "Task 1: review requested",
      "Review task 1 r1: F1 -> fixed (abc1234)",
      "Task 1: complete (commits a..b, review clean)",
      "- Task 2: complete (commits c..d, self-check: ok)",
      "Task final: review requested",
    ].join("\n");
    const d = parseLedgerDone(ledger);
    expect(sorted(d.keys)).toEqual(["1.fix", "1.implement", "1.review", "2.fix", "2.implement", "2.review"]);
    expect(sorted(d.noneNeeded)).toEqual(["2.fix"]);
  });

  it("a whole-branch fix wave keeps final.fix from reading none needed", () => {
    const a = parseLedgerDone("Task final: reviewed (3 findings)\nTask final: dispatch fix agent=f1\nTask final: complete\n");
    expect(a.noneNeeded.has("final.fix")).toBe(false);
    const b = parseLedgerDone("Task final: reviewed (1 findings)\nReview ticket final r1: F1 -> fixed (x)\nTask final: complete\n");
    expect(b.noneNeeded.has("final.fix")).toBe(false);
    expect(b.keys.has("final.fix")).toBe(true);
  });

  it("an empty ledger is nothing done", () => {
    expect(parseLedgerDone("").keys.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run packages/cli/src/clickup/checklist/plan.test.ts`
Expected: FAIL, cannot find `./plan.ts`.

- [ ] **Step 3: Write `plan.ts`**

```ts
/** One plan task: its number and its checklist item name `Task N: <title>`. */
export interface PlanTask {
  n: number;
  name: string;
}

/** Item keys that are done; `noneNeeded` holds the fix keys that read "(none needed)" (always also in `keys`). */
export interface DoneState {
  keys: Set<string>;
  noneNeeded: Set<string>;
}

const TASK_HEADING = /^###\s+Task\s+(\d+):\s*(.*?)\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
const DONE_KEY = /^(?:([1-9]\d*)(?:\.(implement|review|fix(:none)?))?|final\.(review|fix(:none)?))$/;
const LEDGER_LINE = /^\s*(?:[-*]\s+)?Task (\d+|final): (implemented|review requested|reviewed|complete|fix round|dispatch fix)\b/;
const LEDGER_FIXED = /^\s*(?:[-*]\s+)?Review (?:task (\d+)|ticket (final)) r\d+: .*-> fixed\b/;

/** Reads `### Task N: <title>` headings outside fenced code blocks, in plan order. Throws on none or on a repeated number. */
export function parsePlanTasks(text: string): PlanTask[] {
  const tasks: PlanTask[] = [];
  let fence: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const f = FENCE.exec(line);
    if (fence === null) {
      if (f) {
        fence = f[1];
        continue;
      }
    } else {
      // A fence closes only on the same character, at least as long, with nothing after it.
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && f[2].trim() === "") fence = null;
      continue;
    }
    const m = TASK_HEADING.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    if (tasks.some((t) => t.n === n)) throw new Error(`the plan has Task ${n} twice`);
    tasks.push({ n, name: `Task ${n}: ${m[2]}` });
  }
  if (tasks.length === 0) throw new Error('the plan has no "### Task N: <title>" headings');
  return tasks;
}

/** `--done 1.implement,1.fix:none,final.review` as a DoneState. Throws on a key that is not an item key. */
export function parseDoneKeys(value: string): DoneState {
  const done: DoneState = { keys: new Set(), noneNeeded: new Set() };
  for (const part of value.split(",").map((p) => p.trim())) {
    if (part === "") continue;
    const m = DONE_KEY.exec(part);
    if (!m) throw new Error(`--done: "${part}" is not an item key (N, N.implement, N.review, N.fix, N.fix:none, final.review, final.fix, final.fix:none)`);
    const key = part.replace(/:none$/, "");
    done.keys.add(key);
    if (part.endsWith(":none")) done.noneNeeded.add(key);
  }
  return done;
}

/** The item keys an SDD or inline-execution ledger shows as done (rules in the spec's "Ledger to keys"). */
export function parseLedgerDone(text: string): DoneState {
  const seen = new Map<string, Set<string>>();
  const fixed = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = LEDGER_LINE.exec(line);
    if (m) {
      if (!seen.has(m[1])) seen.set(m[1], new Set());
      seen.get(m[1])!.add(m[2]);
    }
    const f = LEDGER_FIXED.exec(line);
    if (f) fixed.add(f[1] ?? f[2]);
  }
  const done: DoneState = { keys: new Set(), noneNeeded: new Set() };
  for (const [id, events] of seen) {
    const complete = events.has("complete");
    if (id === "final") {
      if (events.has("reviewed") || complete) done.keys.add("final.review");
      if (complete) {
        done.keys.add("final.fix");
        if (!events.has("dispatch fix") && !fixed.has("final")) done.noneNeeded.add("final.fix");
      }
      continue;
    }
    if (events.has("implemented") || events.has("review requested") || complete) done.keys.add(`${id}.implement`);
    if (events.has("reviewed") || complete) done.keys.add(`${id}.review`);
    if (complete) {
      done.keys.add(`${id}.fix`);
      if (!events.has("fix round") && !fixed.has(id)) done.noneNeeded.add(`${id}.fix`);
    }
  }
  return done;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm vitest run packages/cli/src/clickup/checklist/plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/checklist/plan.ts packages/cli/src/clickup/checklist/plan.test.ts
git commit -m "feat(dgs-632): parse plan tasks, done keys and ledger lines"
```

---

### Task 3: Wanted items and the checklist diff

**Files:**
- Create: `packages/cli/src/clickup/checklist/want.ts`
- Create: `packages/cli/src/clickup/checklist/diff.ts`
- Test: `packages/cli/src/clickup/checklist/want.test.ts`
- Test: `packages/cli/src/clickup/checklist/diff.test.ts`

**Interfaces:**
- Consumes: `PlanTask`, `DoneState` from `./plan.ts`.
- Produces (`want.ts`):
  - `interface WantItem { key: string; name: string; resolved: boolean; parentKey?: string }`
  - `wantedItems(plan: PlanTask[], done: DoneState): WantItem[]` — order: per task `N`, `N.implement`, `N.review`, `N.fix`; then `final.review`, `final.fix`.
  - `keysOutsidePlan(plan: PlanTask[], done: DoneState): string[]` — sorted done keys whose task number is not in the plan.
- Produces (`diff.ts`):
  - `interface CurrentItem { id: string; name: string; resolved: boolean; parent: string | null }`
  - `flattenItems(items: ClickUpChecklistItem[]): CurrentItem[]` — reads flat items with `parent` and nested `children` objects; each id once.
  - `type ChecklistOp = { kind: "add"; key: string; name: string; resolved: boolean; parentKey?: string } | { kind: "edit"; id: string; key: string; name?: string; resolved?: boolean } | { kind: "remove"; id: string; name: string }`
  - `interface OpCounts { add: number; rename: number; remove: number; tick: number; untick: number }`
  - `interface ChecklistDiff { ops: ChecklistOp[]; counts: OpCounts; foreign: number; matched: Map<string, string> }` — `matched` maps key → current item id.
  - `diffChecklist(current: CurrentItem[], want: WantItem[]): ChecklistDiff` — ops: removes (children before parents), edits, adds (want order).

- [ ] **Step 1: Write the failing tests**

`packages/cli/src/clickup/checklist/want.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { wantedItems, keysOutsidePlan } from "./want.ts";

const plan = [{ n: 1, name: "Task 1: One" }, { n: 2, name: "Task 2: Two" }];
const done = (keys: string[], none: string[] = []) => ({ keys: new Set(keys), noneNeeded: new Set(none) });

describe("wantedItems", () => {
  it("lays out tasks with three children, then the two whole-branch items", () => {
    expect(wantedItems(plan, done([]))).toEqual([
      { key: "1", name: "Task 1: One", resolved: false },
      { key: "1.implement", name: "Implement", resolved: false, parentKey: "1" },
      { key: "1.review", name: "Review", resolved: false, parentKey: "1" },
      { key: "1.fix", name: "Fix", resolved: false, parentKey: "1" },
      { key: "2", name: "Task 2: Two", resolved: false },
      { key: "2.implement", name: "Implement", resolved: false, parentKey: "2" },
      { key: "2.review", name: "Review", resolved: false, parentKey: "2" },
      { key: "2.fix", name: "Fix", resolved: false, parentKey: "2" },
      { key: "final.review", name: "Whole-branch review", resolved: false },
      { key: "final.fix", name: "Whole-branch fixes", resolved: false },
    ]);
  });

  it("ticks a task when its three children are done and names none-needed fixes", () => {
    const w = wantedItems(plan, done(["1.implement", "1.review", "1.fix", "2.implement", "final.review", "final.fix"], ["1.fix", "final.fix"]));
    const by = Object.fromEntries(w.map((i) => [i.key, i]));
    expect(by["1"].resolved).toBe(true);
    expect(by["1.fix"]).toEqual({ key: "1.fix", name: "Fix (none needed)", resolved: true, parentKey: "1" });
    expect(by["2"].resolved).toBe(false);
    expect(by["2.implement"].resolved).toBe(true);
    expect(by["final.fix"].name).toBe("Whole-branch fixes (none needed)");
  });

  it("key N alone ticks the task item", () => {
    expect(wantedItems(plan, done(["2"])).find((i) => i.key === "2")!.resolved).toBe(true);
  });
});

describe("keysOutsidePlan", () => {
  it("lists done keys whose task is not in the plan", () => {
    expect(keysOutsidePlan(plan, done(["1.fix", "3", "5.review", "final.fix"]))).toEqual(["3", "5.review"]);
  });
});
```

`packages/cli/src/clickup/checklist/diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diffChecklist, flattenItems, type CurrentItem } from "./diff.ts";
import { wantedItems } from "./want.ts";

const plan = [{ n: 1, name: "Task 1: One" }];
const none = { keys: new Set<string>(), noneNeeded: new Set<string>() };
const item = (id: string, name: string, parent: string | null = null, resolved = false): CurrentItem => ({ id, name, resolved, parent });
/** The checklist that matches wantedItems(plan, none) exactly. */
const full = () => [
  item("t1", "Task 1: One"),
  item("c1", "Implement", "t1"),
  item("c2", "Review", "t1"),
  item("c3", "Fix", "t1"),
  item("fr", "Whole-branch review"),
  item("ff", "Whole-branch fixes"),
];

describe("flattenItems", () => {
  it("reads flat items with parent and nested children objects, each id once", () => {
    const raw = [
      { id: "t1", name: "Task 1: One", orderindex: 0, resolved: false, parent: null, children: [{ id: "c1", name: "Implement", orderindex: 0, resolved: true, children: [] }] },
      { id: "c1", name: "Implement", orderindex: 1, resolved: true, parent: "t1", children: [] },
      { id: "c2", name: "Review", orderindex: 2, resolved: false, parent: "t1" },
    ];
    expect(flattenItems(raw)).toEqual([
      { id: "t1", name: "Task 1: One", resolved: false, parent: null },
      { id: "c1", name: "Implement", resolved: true, parent: "t1" },
      { id: "c2", name: "Review", resolved: false, parent: "t1" },
    ]);
  });
  it("ignores children given as plain id strings", () => {
    expect(flattenItems([{ id: "t1", name: "x", orderindex: 0, resolved: false, children: ["c9"] }])).toEqual([{ id: "t1", name: "x", resolved: false, parent: null }]);
  });
});

describe("diffChecklist", () => {
  it("an empty checklist gets every wanted item added, children with their parent key", () => {
    const d = diffChecklist([], wantedItems(plan, none));
    expect(d.ops.map((o) => (o.kind === "add" ? `${o.key}<${o.parentKey ?? ""}` : o.kind))).toEqual([
      "1<", "1.implement<1", "1.review<1", "1.fix<1", "final.review<", "final.fix<",
    ]);
    expect(d.counts).toEqual({ add: 6, rename: 0, remove: 0, tick: 0, untick: 0 });
  });

  it("a matching checklist needs no op and maps every key", () => {
    const d = diffChecklist(full(), wantedItems(plan, none));
    expect(d.ops).toEqual([]);
    expect(d.matched.get("1.fix")).toBe("c3");
  });

  it("matching survives a rename to Fix (none needed) and back", () => {
    const cur = full();
    cur[3] = item("c3", "Fix (none needed)", "t1", true);
    const d = diffChecklist(cur, wantedItems(plan, none));
    expect(d.ops).toEqual([{ kind: "edit", id: "c3", key: "1.fix", name: "Fix", resolved: false }]);
    expect(d.counts).toMatchObject({ rename: 1, untick: 1 });
  });

  it("ticks children and the task item from the done state", () => {
    const want = wantedItems(plan, { keys: new Set(["1.implement", "1.review", "1.fix"]), noneNeeded: new Set(["1.fix"]) });
    const d = diffChecklist(full(), want);
    expect(d.ops).toEqual([
      { kind: "edit", id: "t1", key: "1", resolved: true },
      { kind: "edit", id: "c1", key: "1.implement", resolved: true },
      { kind: "edit", id: "c2", key: "1.review", resolved: true },
      { kind: "edit", id: "c3", key: "1.fix", name: "Fix (none needed)", resolved: true },
    ]);
    expect(d.counts).toEqual({ add: 0, rename: 1, remove: 0, tick: 4, untick: 0 });
  });

  it("removes a dropped task with its known children first, and duplicates", () => {
    const cur = [
      ...full(),
      item("t2", "Task 2: Dropped"),
      item("d1", "Implement", "t2"),
      item("dx", "Ask Jack", "t2"),
      item("t1b", "Task 1: Again"),
      item("c1b", "Implement", "t1"),
    ];
    const d = diffChecklist(cur, wantedItems(plan, none));
    expect(d.ops).toEqual([
      { kind: "remove", id: "d1", name: "Implement" },
      { kind: "remove", id: "c1b", name: "Implement" },
      { kind: "remove", id: "t2", name: "Task 2: Dropped" },
      { kind: "remove", id: "t1b", name: "Task 1: Again" },
    ]);
    expect(d.foreign).toBe(1);
  });

  it("leaves foreign items alone: other names, unknown children, a top-level Implement", () => {
    const cur = [...full(), item("x", "Buy milk"), item("y", "Notes", "t1"), item("z", "Implement")];
    const d = diffChecklist(cur, wantedItems(plan, none));
    expect(d.ops).toEqual([]);
    expect(d.foreign).toBe(3);
  });

  it("adds a missing child under the existing task item", () => {
    const cur = full().filter((i) => i.id !== "c2");
    const d = diffChecklist(cur, wantedItems(plan, none));
    expect(d.ops).toEqual([{ kind: "add", key: "1.review", name: "Review", resolved: false, parentKey: "1" }]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/cli/src/clickup/checklist/want.test.ts packages/cli/src/clickup/checklist/diff.test.ts`
Expected: FAIL, cannot find `./want.ts` / `./diff.ts`.

- [ ] **Step 3: Write `want.ts`**

```ts
import type { DoneState, PlanTask } from "./plan.ts";

/** One item the checklist should have. `parentKey` is set for the three children of a task item. */
export interface WantItem {
  key: string;
  name: string;
  resolved: boolean;
  parentKey?: string;
}

const CHILDREN = [
  ["implement", "Implement"],
  ["review", "Review"],
  ["fix", "Fix"],
] as const;

/** The whole wanted checklist, in order: each task with Implement, Review, Fix; then Whole-branch review and fixes. */
export function wantedItems(plan: PlanTask[], done: DoneState): WantItem[] {
  const out: WantItem[] = [];
  for (const t of plan) {
    const kids = CHILDREN.map(([part, name]): WantItem => {
      const key = `${t.n}.${part}`;
      return { key, name: done.noneNeeded.has(key) ? `${name} (none needed)` : name, resolved: done.keys.has(key), parentKey: String(t.n) };
    });
    out.push({ key: String(t.n), name: t.name, resolved: done.keys.has(String(t.n)) || kids.every((k) => k.resolved) }, ...kids);
  }
  out.push({ key: "final.review", name: "Whole-branch review", resolved: done.keys.has("final.review") });
  out.push({
    key: "final.fix",
    name: done.noneNeeded.has("final.fix") ? "Whole-branch fixes (none needed)" : "Whole-branch fixes",
    resolved: done.keys.has("final.fix"),
  });
  return out;
}

/** Done keys whose task number is not in the plan, sorted. */
export function keysOutsidePlan(plan: PlanTask[], done: DoneState): string[] {
  const inPlan = new Set(plan.map((t) => String(t.n)));
  return [...done.keys].filter((k) => !k.startsWith("final.") && !inPlan.has(k.split(".")[0])).sort();
}
```

- [ ] **Step 4: Write `diff.ts`**

```ts
import type { ClickUpChecklistItem } from "@digismith/clickup-client";
import type { WantItem } from "./want.ts";

/** A checklist item as the diff needs it. */
export interface CurrentItem {
  id: string;
  name: string;
  resolved: boolean;
  parent: string | null;
}

export type ChecklistOp =
  | { kind: "add"; key: string; name: string; resolved: boolean; parentKey?: string }
  | { kind: "edit"; id: string; key: string; name?: string; resolved?: boolean }
  | { kind: "remove"; id: string; name: string };

export interface OpCounts {
  add: number;
  rename: number;
  remove: number;
  tick: number;
  untick: number;
}

export interface ChecklistDiff {
  ops: ChecklistOp[];
  counts: OpCounts;
  /** Items that are not ours (other names, unknown children): left alone. */
  foreign: number;
  /** Item key to the id of the current item that holds it. */
  matched: Map<string, string>;
}

const TASK_ITEM = /^Task (\d+):/;
const CHILD_PREFIX: [string, RegExp][] = [
  ["implement", /^Implement\b/],
  ["review", /^Review\b/],
  ["fix", /^Fix\b/],
];
const FINAL_PREFIX: [string, RegExp][] = [
  ["final.review", /^Whole-branch review\b/],
  ["final.fix", /^Whole-branch fixes\b/],
];

const isItem = (x: unknown): x is ClickUpChecklistItem => typeof x === "object" && x !== null && typeof (x as { id?: unknown }).id === "string";

/** Flat items with `parent` and nested `children` objects both read; each id once, first seen wins. */
export function flattenItems(items: ClickUpChecklistItem[]): CurrentItem[] {
  const out = new Map<string, CurrentItem>();
  const walk = (list: unknown[], parent: string | null) => {
    for (const raw of list) {
      if (!isItem(raw)) continue;
      if (!out.has(raw.id)) out.set(raw.id, { id: raw.id, name: raw.name, resolved: Boolean(raw.resolved), parent: raw.parent ?? parent });
      if (Array.isArray(raw.children)) walk(raw.children, raw.id);
    }
  };
  walk(items, null);
  return [...out.values()];
}

/** The writes that make the checklist equal `want`, matched by key; removes (children first), then edits, then adds. */
export function diffChecklist(current: CurrentItem[], want: WantItem[]): ChecklistDiff {
  const wanted = new Map(want.map((w) => [w.key, w]));
  const matched = new Map<string, string>();
  const keyOfId = new Map<string, string>();
  const removeChildren: ChecklistOp[] = [];
  const removeTop: ChecklistOp[] = [];
  const droppedParents = new Set<string>();
  let foreign = 0;

  for (const it of current.filter((i) => i.parent === null)) {
    const t = TASK_ITEM.exec(it.name);
    const key = t ? t[1] : FINAL_PREFIX.find(([, re]) => re.test(it.name))?.[0];
    if (key === undefined) {
      foreign++;
      continue;
    }
    if (!wanted.has(key) || matched.has(key)) {
      removeTop.push({ kind: "remove", id: it.id, name: it.name });
      if (t) droppedParents.add(it.id);
      continue;
    }
    matched.set(key, it.id);
    keyOfId.set(it.id, key);
  }
  for (const it of current.filter((i) => i.parent !== null)) {
    const part = CHILD_PREFIX.find(([, re]) => re.test(it.name))?.[0];
    const parentKey = keyOfId.get(it.parent!);
    if (part !== undefined && droppedParents.has(it.parent!)) {
      removeChildren.push({ kind: "remove", id: it.id, name: it.name });
      continue;
    }
    if (part === undefined || parentKey === undefined || parentKey.startsWith("final.")) {
      foreign++;
      continue;
    }
    const key = `${parentKey}.${part}`;
    if (matched.has(key)) {
      removeChildren.push({ kind: "remove", id: it.id, name: it.name });
      continue;
    }
    matched.set(key, it.id);
  }

  const byId = new Map(current.map((i) => [i.id, i]));
  const counts: OpCounts = { add: 0, rename: 0, remove: removeChildren.length + removeTop.length, tick: 0, untick: 0 };
  const edits: ChecklistOp[] = [];
  const adds: ChecklistOp[] = [];
  for (const w of want) {
    const id = matched.get(w.key);
    if (id === undefined) {
      adds.push(w.parentKey === undefined ? { kind: "add", key: w.key, name: w.name, resolved: w.resolved } : { kind: "add", key: w.key, name: w.name, resolved: w.resolved, parentKey: w.parentKey });
      counts.add++;
      if (w.resolved) counts.tick++;
      continue;
    }
    const have = byId.get(id)!;
    const edit: { kind: "edit"; id: string; key: string; name?: string; resolved?: boolean } = { kind: "edit", id, key: w.key };
    if (have.name !== w.name) {
      edit.name = w.name;
      counts.rename++;
    }
    if (have.resolved !== w.resolved) {
      edit.resolved = w.resolved;
      if (w.resolved) counts.tick++;
      else counts.untick++;
    }
    if (edit.name !== undefined || edit.resolved !== undefined) edits.push(edit);
  }
  return { ops: [...removeChildren, ...removeTop, ...edits, ...adds], counts, foreign, matched };
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm vitest run packages/cli/src/clickup/checklist/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/clickup/checklist/want.ts packages/cli/src/clickup/checklist/want.test.ts packages/cli/src/clickup/checklist/diff.ts packages/cli/src/clickup/checklist/diff.test.ts
git commit -m "feat(dgs-632): build the wanted checklist and diff it by item key"
```

---

### Task 4: The `dg clickup checklist sync` command

**Files:**
- Create: `packages/cli/src/clickup/checklist/sync.ts`
- Create: `packages/cli/src/clickup/checklist/index.ts`
- Modify: `packages/cli/src/clickup/index.ts` (import the `checklist` group like `frontdoorCommand`; `.command(checklistCommand)` right after `.command(addCommentCommand)`)
- Test: `packages/cli/src/clickup/checklist/sync.test.ts`

**Interfaces:**
- Consumes: `parsePlanTasks`, `parseDoneKeys`, `parseLedgerDone`, `PlanTask`, `DoneState` (Task 2); `wantedItems`, `keysOutsidePlan` (Task 3); `diffChecklist`, `flattenItems` (Task 3); client methods (Task 1); `createClient` from `../lib.ts`; `REF` from `../refs.ts`.
- Produces:
  - `interface SyncArgv { task?: string; plan?: string; done?: string; ledger?: string; name?: string; yes?: boolean }`
  - `interface SyncRequest { task: string; name: string; plan: PlanTask[]; done: DoneState; ignoredDone: string[] }`
  - `parseSyncArgv(argv: SyncArgv): SyncRequest`
  - `interface SyncOutput { task: string; checklist_id: string | null; dry_run: boolean; ops: { create: number; add: number; rename: number; remove: number; tick: number; untick: number }; items: { key: string; name: string; resolved: boolean }[]; foreign: number; ignored_done: string[]; same_name_skipped: number }`
  - `runSync(client: ClickUpClient, req: SyncRequest, write: boolean): Promise<SyncOutput>`
  - `createChecklistSyncCommand(clientFactory?: () => ClickUpClient): CommandModule`; default export `checklistCommand` of `checklist/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/clickup/checklist/sync.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClickUpClient, ClickUpChecklist, ClickUpChecklistItem } from "@digismith/clickup-client";
import { parseSyncArgv, runSync, createChecklistSyncCommand } from "./sync.ts";

type Handler = (argv: Record<string, unknown>) => Promise<void>;
const run = (c: { handler: unknown }, argv: Record<string, unknown>) => (c.handler as Handler)(argv);

let dir: string;
let planFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dg632-"));
  planFile = join(dir, "plan.md");
  writeFileSync(planFile, "# P\n\n### Task 1: One\n");
});
afterEach(() => {
  rmSync(dir, { recursive: true });
  vi.restoreAllMocks();
  process.exitCode = 0;
});

const mk = (id: string, name: string, parent: string | null = null, resolved = false): ClickUpChecklistItem => ({ id, name, parent, resolved, orderindex: 0 });
const checklist = (items: ClickUpChecklistItem[], id = "c1", name = "Plan"): ClickUpChecklist => ({ id, task_id: "t1", name, orderindex: 0, resolved: 0, unresolved: 0, items });
/** A checklist that matches the one-task plan with nothing done. */
const fullItems = () => [
  mk("t1", "Task 1: One"),
  mk("k1", "Implement", "t1"),
  mk("k2", "Review", "t1"),
  mk("k3", "Fix", "t1"),
  mk("fr", "Whole-branch review"),
  mk("ff", "Whole-branch fixes"),
];

/** A fake client that keeps checklists in memory and applies writes like ClickUp: create takes a name only, edit sets parent. */
function fakeClient(start: ClickUpChecklist[]) {
  const lists = start.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i })) }));
  let next = 100;
  const find = (id: string) => lists.find((l) => l.id === id)!;
  const copy = (c: ClickUpChecklist) => ({ ...c, items: c.items.map((i) => ({ ...i })) });
  return {
    getTaskByRef: vi.fn(async () => ({ id: "t1", custom_id: "DGS-9", name: "n", checklists: lists.map(copy) })),
    createChecklist: vi.fn(async (_t: string, name: string) => {
      const c = checklist([], `c${next++}`, name);
      lists.push(c);
      return copy(c);
    }),
    createChecklistItem: vi.fn(async (cid: string, name: string) => {
      const c = find(cid);
      c.items.push(mk(`i${next++}`, name));
      return copy(c);
    }),
    editChecklistItem: vi.fn(async (cid: string, iid: string, patch: { name?: string; resolved?: boolean; parent?: string | null }) => {
      const c = find(cid);
      Object.assign(c.items.find((i) => i.id === iid)!, patch);
      return copy(c);
    }),
    deleteChecklistItem: vi.fn(async (cid: string, iid: string) => {
      const c = find(cid);
      c.items = c.items.filter((i) => i.id !== iid);
    }),
  };
}
type Fake = ReturnType<typeof fakeClient>;
const asClient = (f: Fake) => f as unknown as ClickUpClient;
const writes = (c: Fake) =>
  c.createChecklist.mock.calls.length + c.createChecklistItem.mock.calls.length + c.editChecklistItem.mock.calls.length + c.deleteChecklistItem.mock.calls.length;

describe("parseSyncArgv", () => {
  it("reads the plan, --done keys and the default name", () => {
    const r = parseSyncArgv({ task: "DGS-9", plan: planFile, done: "1.implement,1.fix:none" });
    expect(r.task).toBe("DGS-9");
    expect(r.name).toBe("Plan");
    expect(r.plan).toEqual([{ n: 1, name: "Task 1: One" }]);
    expect([...r.done.keys].sort()).toEqual(["1.fix", "1.implement"]);
    expect([...r.done.noneNeeded]).toEqual(["1.fix"]);
    expect(r.ignoredDone).toEqual([]);
  });
  it("reads --ledger and lists ledger keys outside the plan", () => {
    const ledger = join(dir, "progress.md");
    writeFileSync(ledger, "Task 1: implemented\nTask 4: complete (x)\n");
    const r = parseSyncArgv({ task: "DGS-9", plan: planFile, ledger });
    expect([...r.done.keys]).toEqual(["1.implement"]);
    expect(r.ignoredDone).toEqual(["4.fix", "4.implement", "4.review"]);
  });
  it("refuses a --done key for a task not in the plan", () => {
    expect(() => parseSyncArgv({ task: "DGS-9", plan: planFile, done: "3.review" })).toThrow("--done: 3.review is not in the plan");
  });
  it("refuses --done with --ledger, a bad ref, a missing plan or ledger, an empty --name", () => {
    expect(() => parseSyncArgv({ task: "DGS-9", plan: planFile, done: "1", ledger: planFile })).toThrow("not both");
    expect(() => parseSyncArgv({ task: "a/b", plan: planFile })).toThrow("--task");
    expect(() => parseSyncArgv({ task: "DGS-9", plan: join(dir, "none.md") })).toThrow("cannot read --plan");
    expect(() => parseSyncArgv({ task: "DGS-9", plan: planFile, ledger: join(dir, "none.md") })).toThrow("cannot read --ledger");
    expect(() => parseSyncArgv({ task: "DGS-9", plan: planFile, name: "  " })).toThrow("--name");
  });
});

describe("runSync", () => {
  it("dry run: reads only, plans a create and every item", async () => {
    const c = fakeClient([]);
    const out = await runSync(asClient(c), parseSyncArgv({ task: "DGS-9", plan: planFile, done: "1.implement" }), false);
    expect(writes(c)).toBe(0);
    expect(out.dry_run).toBe(true);
    expect(out.checklist_id).toBeNull();
    expect(out.ops).toEqual({ create: 1, add: 6, rename: 0, remove: 0, tick: 1, untick: 0 });
    expect(out.items.map((i) => i.key)).toEqual(["1", "1.implement", "1.review", "1.fix", "final.review", "final.fix"]);
  });

  it("--yes on a task with no checklist creates it, nests the children with one edit each and reads back", async () => {
    const c = fakeClient([]);
    const out = await runSync(asClient(c), parseSyncArgv({ task: "DGS-9", plan: planFile, done: "1.implement" }), true);
    expect(c.createChecklist).toHaveBeenCalledWith("t1", "Plan");
    expect(c.createChecklistItem).toHaveBeenCalledTimes(6);
    const parentId = c.createChecklistItem.mock.results[0] && (await c.createChecklistItem.mock.results[0].value).items[0].id;
    expect(c.editChecklistItem).toHaveBeenCalledWith(out.checklist_id, expect.any(String), { parent: parentId, resolved: true });
    expect(c.editChecklistItem).toHaveBeenCalledTimes(3);
    expect(out.dry_run).toBe(false);
  });

  it("is idempotent: a run with no change makes no write", async () => {
    const c = fakeClient([checklist(fullItems())]);
    const out = await runSync(asClient(c), parseSyncArgv({ task: "DGS-9", plan: planFile }), true);
    expect(writes(c)).toBe(0);
    expect(out.ops).toEqual({ create: 0, add: 0, rename: 0, remove: 0, tick: 0, untick: 0 });
    expect(out.checklist_id).toBe("c1");
  });

  it("ticks from the ledger and renames Fix to (none needed); a second run makes no write", async () => {
    const c = fakeClient([checklist(fullItems())]);
    const ledger = join(dir, "progress.md");
    writeFileSync(ledger, "Task 1: implemented\nTask 1: reviewed (clean)\nTask 1: complete (commits a..b, review clean)\n");
    const out = await runSync(asClient(c), parseSyncArgv({ task: "DGS-9", plan: planFile, ledger }), true);
    expect(c.editChecklistItem).toHaveBeenCalledWith("c1", "k3", { name: "Fix (none needed)", resolved: true });
    expect(c.editChecklistItem).toHaveBeenCalledWith("c1", "t1", { resolved: true });
    expect(out.ops).toEqual({ create: 0, add: 0, rename: 1, remove: 0, tick: 4, untick: 0 });
    const before = writes(c);
    await runSync(asClient(c), parseSyncArgv({ task: "DGS-9", plan: planFile, ledger }), true);
    expect(writes(c)).toBe(before);
  });

  it("removes a dropped task's children before the task, foreign items stay", async () => {
    const c = fakeClient([checklist([...fullItems(), mk("t2", "Task 2: Gone"), mk("g1", "Review", "t2"), mk("x", "Buy milk")])]);
    const out = await runSync(asClient(c), parseSyncArgv({ task: "DGS-9", plan: planFile }), true);
    expect(c.deleteChecklistItem.mock.calls).toEqual([["c1", "g1"], ["c1", "t2"]]);
    expect(out.foreign).toBe(1);
  });

  it("uses the first checklist of --name and reports the others", async () => {
    const c = fakeClient([checklist(fullItems(), "c1"), checklist([], "c2"), checklist([], "c3", "Other")]);
    const out = await runSync(asClient(c), parseSyncArgv({ task: "DGS-9", plan: planFile }), true);
    expect(out.checklist_id).toBe("c1");
    expect(out.same_name_skipped).toBe(1);
    expect(c.createChecklist).not.toHaveBeenCalled();
  });

  it("a failed write throws naming the step and how many writes were made", async () => {
    const c = fakeClient([checklist([])]);
    c.createChecklistItem.mockRejectedValueOnce(new Error("HTTP 500"));
    await expect(runSync(asClient(c), parseSyncArgv({ task: "DGS-9", plan: planFile }), true)).rejects.toThrow(
      'add "Task 1: One" failed: HTTP 500; 0 of 9 writes made; run the sync again',
    );
  });

  it("a read-back that does not match throws (a server that ignores parent)", async () => {
    const c = fakeClient([checklist([])]);
    const real = c.editChecklistItem.getMockImplementation()!;
    c.editChecklistItem.mockImplementation(async (cid, iid, patch) => real(cid, iid, { ...patch, parent: undefined }));
    await expect(runSync(asClient(c), parseSyncArgv({ task: "DGS-9", plan: planFile }), true)).rejects.toThrow("read-back");
  });
});

describe("checklist sync command", () => {
  it("prints one JSON line and exits 0", async () => {
    const c = fakeClient([]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createChecklistSyncCommand(() => asClient(c)), { task: "DGS-9", plan: planFile });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0][0])).dry_run).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it("a failure prints one stderr line and exits 1", async () => {
    const c = fakeClient([checklist([])]);
    c.createChecklistItem.mockRejectedValue(new Error("HTTP 401"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(createChecklistSyncCommand(() => asClient(c)), { task: "DGS-9", plan: planFile, yes: true });
    expect(String(err.mock.calls[0][0])).toMatch(/^clickup checklist sync: add "Task 1: One" failed: HTTP 401/);
    expect(process.exitCode).toBe(1);
  });

  it("is registered as dg clickup checklist sync", async () => {
    const { default: clickup } = await import("../index.ts");
    const { default: group } = await import("./index.ts");
    expect(group.command).toBe("checklist");
    const names = (cmd: { builder?: unknown }) => {
      const seen: string[] = [];
      const y = { command: (c: { command: string }) => (seen.push(c.command), y), demandCommand: () => y };
      (cmd.builder as unknown as (yy: typeof y) => unknown)(y);
      return seen;
    };
    expect(names(group)).toEqual(["sync"]);
    expect(names(clickup)).toContain("checklist");
  });
});
```

Write-count note for the failed-write test: an empty "Plan" checklist exists, so total = 6 adds + 3 child edits (parent; none resolved) = 9.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run packages/cli/src/clickup/checklist/sync.test.ts`
Expected: FAIL, cannot find `./sync.ts`.

- [ ] **Step 3: Write `sync.ts`**

```ts
import { readFileSync } from "node:fs";
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "../lib.ts";
import { REF } from "../refs.ts";
import { parsePlanTasks, parseDoneKeys, parseLedgerDone, type DoneState, type PlanTask } from "./plan.ts";
import { wantedItems, keysOutsidePlan } from "./want.ts";
import { diffChecklist, flattenItems } from "./diff.ts";

export interface SyncArgv {
  task?: string;
  plan?: string;
  done?: string;
  ledger?: string;
  name?: string;
  yes?: boolean;
}

export interface SyncRequest {
  task: string;
  name: string;
  plan: PlanTask[];
  done: DoneState;
  /** Ledger keys for tasks that are not in the plan (left out of `done`). */
  ignoredDone: string[];
}

export interface SyncOutput {
  task: string;
  checklist_id: string | null;
  dry_run: boolean;
  ops: { create: number; add: number; rename: number; remove: number; tick: number; untick: number };
  items: { key: string; name: string; resolved: boolean }[];
  foreign: number;
  ignored_done: string[];
  same_name_skipped: number;
}

function readFlagFile(flag: string, path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`cannot read ${flag} ${path}: ${(err as Error).message}`);
  }
}

/** Checks the flags and reads the plan (and ledger), with no network call. */
export function parseSyncArgv(argv: SyncArgv): SyncRequest {
  const task = argv.task === undefined ? "" : String(argv.task).trim();
  if (!REF.test(task)) throw new Error(`--task must be a task id or a key like DGS-12, got "${task}"`);
  if (argv.plan === undefined) throw new Error("--plan is required");
  const name = argv.name === undefined ? "Plan" : String(argv.name).trim();
  if (name === "") throw new Error("--name must not be empty");
  if (argv.done !== undefined && argv.ledger !== undefined) throw new Error("give --done or --ledger, not both");
  const plan = parsePlanTasks(readFlagFile("--plan", String(argv.plan)));
  let done: DoneState = { keys: new Set(), noneNeeded: new Set() };
  let ignoredDone: string[] = [];
  if (argv.done !== undefined) {
    done = parseDoneKeys(String(argv.done));
    const outside = keysOutsidePlan(plan, done);
    if (outside.length > 0) throw new Error(`--done: ${outside[0]} is not in the plan`);
  } else if (argv.ledger !== undefined) {
    const fromLedger = parseLedgerDone(readFlagFile("--ledger", String(argv.ledger)));
    ignoredDone = keysOutsidePlan(plan, fromLedger);
    const drop = new Set(ignoredDone);
    done = {
      keys: new Set([...fromLedger.keys].filter((k) => !drop.has(k))),
      noneNeeded: new Set([...fromLedger.noneNeeded].filter((k) => !drop.has(k))),
    };
  }
  return { task, name, plan, done, ignoredDone };
}

/** Reads the task, makes its checklist equal the plan and done state (write = true) or only plans it, and reads back after writes. */
export async function runSync(client: ClickUpClient, req: SyncRequest, write: boolean): Promise<SyncOutput> {
  const t = await client.getTaskByRef(req.task);
  const named = (t.checklists ?? []).filter((c) => c.name === req.name);
  const target = named[0];
  const want = wantedItems(req.plan, req.done);
  const diff = diffChecklist(flattenItems(target?.items ?? []), want);
  const base = {
    task: t.custom_id ?? t.id,
    ops: { create: target ? 0 : 1, ...diff.counts },
    items: want.map((w) => ({ key: w.key, name: w.name, resolved: w.resolved })),
    foreign: diff.foreign,
    ignored_done: req.ignoredDone,
    same_name_skipped: Math.max(0, named.length - 1),
  };
  if (!write) return { ...base, checklist_id: target?.id ?? null, dry_run: true };
  if (target && diff.ops.length === 0) return { ...base, checklist_id: target.id, dry_run: false };

  // An added item needs a second write when it has a parent or starts ticked.
  const total = (target ? 0 : 1) + diff.ops.length + diff.ops.filter((o) => o.kind === "add" && (o.parentKey !== undefined || o.resolved)).length;
  let made = 0;
  const step = async <T>(label: string, call: () => Promise<T>): Promise<T> => {
    try {
      const r = await call();
      made++;
      return r;
    } catch (err) {
      throw new Error(`${label} failed: ${(err as Error).message}; ${made} of ${total} writes made; run the sync again`);
    }
  };

  const checklistId = target ? target.id : (await step(`create checklist "${req.name}"`, () => client.createChecklist(t.id, req.name))).id;
  const ids = new Map(diff.matched);
  const known = new Set(flattenItems(target?.items ?? []).map((i) => i.id));
  for (const op of diff.ops) {
    if (op.kind === "remove") {
      await step(`remove "${op.name}"`, () => client.deleteChecklistItem(checklistId, op.id));
    } else if (op.kind === "edit") {
      const patch: { name?: string; resolved?: boolean } = {};
      if (op.name !== undefined) patch.name = op.name;
      if (op.resolved !== undefined) patch.resolved = op.resolved;
      await step(`edit item ${op.key}`, () => client.editChecklistItem(checklistId, op.id, patch));
    } else {
      const after = await step(`add "${op.name}"`, () => client.createChecklistItem(checklistId, op.name));
      const added = flattenItems(after.items).find((i) => i.name === op.name && !known.has(i.id));
      if (!added) throw new Error(`add "${op.name}" shows no new item in the answer; ${made} of ${total} writes made; run the sync again`);
      known.add(added.id);
      ids.set(op.key, added.id);
      const patch: { parent?: string; resolved?: boolean } = {};
      if (op.parentKey !== undefined) {
        const parentId = ids.get(op.parentKey);
        if (parentId === undefined) throw new Error(`add "${op.name}": no item for its parent ${op.parentKey}; run the sync again`);
        patch.parent = parentId;
      }
      if (op.resolved) patch.resolved = true;
      if (Object.keys(patch).length > 0) await step(`nest or tick item ${op.key}`, () => client.editChecklistItem(checklistId, added.id, patch));
    }
  }

  let back;
  try {
    back = await client.getTaskByRef(t.id);
  } catch (err) {
    throw new Error(`all ${total} writes made, but the read-back failed: ${(err as Error).message}; check the checklist in ClickUp`);
  }
  const now = (back.checklists ?? []).find((c) => c.id === checklistId);
  if (!now) throw new Error(`read-back of task ${t.id} shows no checklist ${checklistId}; run the sync again`);
  const left = diffChecklist(flattenItems(now.items), want).ops.length;
  if (left > 0) throw new Error(`read-back of checklist ${checklistId} shows ${left} differences from the plan; run the sync again`);
  return { ...base, checklist_id: checklistId, dry_run: false };
}

export function createChecklistSyncCommand(clientFactory: () => ClickUpClient = createClient): CommandModule {
  return {
    command: "sync",
    describe:
      "make a task's Plan checklist match its plan (task items with Implement, Review, Fix children, then the whole-branch items) and tick done keys; a dry run unless --yes; prints one JSON line",
    builder: (y) =>
      y
        .option("task", { type: "string", requiresArg: true, demandOption: true, describe: "task id or key (DGS-12)" })
        .option("plan", { type: "string", requiresArg: true, demandOption: true, describe: "the plan.md whose ### Task N: <title> headings are the task items" })
        .option("done", {
          type: "string",
          requiresArg: true,
          describe: "done item keys, comma separated: N, N.implement, N.review, N.fix, N.fix:none, final.review, final.fix, final.fix:none",
        })
        .option("ledger", { type: "string", requiresArg: true, describe: "an SDD or inline-execution progress.md; the done keys come from its lines" })
        .option("name", { type: "string", requiresArg: true, default: "Plan", describe: "the checklist name" })
        .option("yes", { type: "boolean", default: false, describe: "make the writes (without it, only read and print the planned writes)" }),
    handler: async (argv) => {
      try {
        const req = parseSyncArgv(argv as unknown as SyncArgv);
        const out = await runSync(clientFactory(), req, Boolean(argv.yes));
        console.log(JSON.stringify(out));
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup checklist sync: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const checklistSyncCommand: CommandModule = createChecklistSyncCommand();
```

- [ ] **Step 4: Write `checklist/index.ts` and register it**

```ts
import type { CommandModule } from "yargs";
import { checklistSyncCommand } from "./sync.ts";

const checklistCommand: CommandModule = {
  command: "checklist",
  describe: "keep a task's Plan checklist matched to its plan and build ledger",
  builder: (y) => y.command(checklistSyncCommand).demandCommand(1, ""),
  handler: () => {},
};

export default checklistCommand;
```

In `packages/cli/src/clickup/index.ts`: `import checklistCommand from "./checklist/index.ts";` beside the `frontdoorCommand` import, and `.command(checklistCommand)` right after `.command(addCommentCommand)`.

- [ ] **Step 5: Run the tests and the help smoke**

Run: `pnpm vitest run packages/cli/src/clickup`
Expected: PASS.
Run: `node --experimental-strip-types packages/cli/src/index.ts clickup checklist sync --help`
Expected: help listing `--task`, `--plan`, `--done`, `--ledger`, `--name`, `--yes`.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/clickup/checklist/sync.ts packages/cli/src/clickup/checklist/sync.test.ts packages/cli/src/clickup/checklist/index.ts packages/cli/src/clickup/index.ts
git commit -m "feat(dgs-632): add dg clickup checklist sync"
```

---

### Task 5: Skill hooks (DGS-631 create, DGS-634 tick)

**Files:**
- Modify: `skills/writing-plans/SKILL.md`
- Modify: `skills/subagent-driven-development/SKILL.md`
- Modify: `skills/executing-plans/SKILL.md`
- Test: `scripts/plan-checklist-skills.test.ts`

Two commits after the whole test passes: the writing-plans edit alone (scope `dgs-631`), then the SDD and executing-plans edits with the test file (scope `dgs-634`).

- [ ] **Step 1: Write the failing test**

`scripts/plan-checklist-skills.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (s: string) => readFileSync(join(ROOT, "skills", s, "SKILL.md"), "utf8");
const SYNC = "dg clickup checklist sync --task <Key> --plan PLAN_FILE --ledger <workspace>/progress.md --yes";
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("DGS-631: writing-plans creates the checklist", () => {
  const s = read("writing-plans");
  it("has a named step that syncs once after the plan commit, DGS keys only, never blocking", () => {
    expect(s).toContain("### Plan checklist (DGS-631)");
    expect(s).toContain("dg clickup checklist sync --task <Key> --plan <plan.md path> --yes");
    expect(s).toContain("Plan checklist: skipped (no ClickUp key)");
    expect(s).toMatch(/never blocks/);
    expect(s.indexOf("### Plan checklist (DGS-631)")).toBeLessThan(s.indexOf("## Scope Check"));
  });
});

describe("DGS-634: SDD ticks the checklist", () => {
  const s = read("subagent-driven-development");
  it("has one section with the command, the ledger lines and the never-blocks rule, before Role Mode", () => {
    const sec = s.indexOf("## Plan Checklist (DGS-634)");
    expect(sec).toBeGreaterThan(-1);
    expect(sec).toBeLessThan(s.indexOf("## Role Mode (a herdr Builder)"));
    for (const line of ["`Task <N>: implemented`", "`Task <N>: reviewed (clean)`", "`Task <N>: reviewed (<K> findings)`", "`Task final: reviewed (clean)`", "`Task final: complete`", "Checklist sync: failed ("]) {
      expect(s).toContain(line);
    }
    expect(s).toContain(SYNC);
    expect(s).toMatch(/plan revision/);
  });
  it("points to the section at each event: implementer done, task verdict, task complete, final verdict, final clean", () => {
    expect(count(s, "(Plan Checklist (DGS-634))")).toBeGreaterThanOrEqual(5);
    const step2 = s.indexOf("### 2. Handle the report");
    const step3 = s.indexOf("### 3. Review the task");
    expect(s.slice(step2, step3)).toContain("Task <N>: implemented");
    const step5 = s.indexOf("### 5. Complete the task");
    expect(s.slice(step5, s.indexOf("## Plan Checklist (DGS-634)"))).toContain("(Plan Checklist (DGS-634))");
    const fin = s.slice(s.indexOf("## Final Review"), s.indexOf("## Finish"));
    expect(fin).toContain("Task final: reviewed");
    expect(fin).toContain("Task final: complete");
  });
});

describe("DGS-634: executing-plans ticks the checklist", () => {
  const s = read("executing-plans");
  it("syncs after each task and once in Step 3", () => {
    expect(s).toContain("Plan checklist (DGS-634)");
    expect(count(s, SYNC)).toBeGreaterThanOrEqual(2);
    expect(s).toContain("Checklist sync: failed (");
    const step3 = s.indexOf("### Step 3: Complete Development");
    expect(s.indexOf(SYNC, step3)).toBeGreaterThan(step3);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run scripts/plan-checklist-skills.test.ts`
Expected: FAIL.

- [ ] **Step 3: writing-plans**

Insert directly before the line `## Scope Check` in `skills/writing-plans/SKILL.md`:

````markdown
### Plan checklist (DGS-631)

After the plan is written and committed, and again after a plan revision, when `<Key>` (same key rule as the start block) is a
ClickUp key (`DGS-<n>`), run:

```bash
dg clickup checklist sync --task <Key> --plan <plan.md path> --yes
```

It creates the ticket's "Plan" checklist: one item per `### Task N:` heading with children Implement, Review and Fix, then
Whole-branch review and Whole-branch fixes. Any other key (a Jira key) or no key: print `Plan checklist: skipped (no ClickUp key)`
and go on. A non-zero exit prints a warning with its stderr line and the flow goes on: the sync never blocks. If the classifier
blocks the command, tell your conductor (the runbook worker start line gets the allow rule); never edit the allowlist yourself.

````

- [ ] **Step 4: SDD**

In `skills/subagent-driven-development/SKILL.md`:

(a) "### 2. Handle the report", in the **DONE:** paragraph, append at its end (same paragraph):
` Before the review, append `Task <N>: implemented` to the ledger and sync the checklist (Plan Checklist (DGS-634)).`
Also append the same sentence at the end of the **DONE_WITH_CONCERNS:** paragraph.

(b) "### 3. Review the task": directly before the line `### 4. The fix loop`, insert:

```markdown
When the task review returns its verdict, append `Task <N>: reviewed (clean)` or `Task <N>: reviewed (<K> findings)` to the
ledger and sync the checklist (Plan Checklist (DGS-634)). Role mode: append the line when your parent's verdict arrives.

```

(c) "### 5. Complete the task": directly before `Then mark the todo complete and move on.`, insert:

```markdown
Then sync the checklist (Plan Checklist (DGS-634)): the `complete` line ticks Fix, and the task item with it.

```

(d) Insert a new section directly before `## Role Mode (a herdr Builder)`:

````markdown
## Plan Checklist (DGS-634)

When `<Key>` is a ClickUp key (`DGS-<n>`), the ticket's "Plan" checklist (made by writing-plans, DGS-631) follows the build. Each
sync recomputes the whole checklist from the ledger, never from memory:

```bash
dg clickup checklist sync --task <Key> --plan PLAN_FILE --ledger <workspace>/progress.md --yes
```

The ledger lines it reads: `Task <N>: implemented` (Implement), `Task <N>: reviewed (clean)` or
`Task <N>: reviewed (<K> findings)` (Review), `Task <N>: complete` (Fix; "Fix (none needed)" when the task had no fix round),
`Task final: reviewed (clean)` or `Task final: reviewed (<K> findings)` (Whole-branch review), `Task final: complete`
(Whole-branch fixes; "(none needed)" when no fix wave ran). A task item ticks when its three children are ticked. Sync after each
of those lines and after a plan revision (a task added, split or dropped). Any other key or none: skip. The key is the one the
build runs under (a subtask build has its own checklist). A non-zero exit never blocks the build: print a warning, append
`Checklist sync: failed (<first stderr line>)` to the ledger and go on; the next sync heals it.

````

(e) "## Final Review": directly after the paragraph that ends `... superpowers:requesting-code-review's [code-reviewer.md](../requesting-code-review/code-reviewer.md). Point it at the ledger's deferred-minor and parked lines so it can triage which must be fixed before merge. Append the `Task final: dispatch final-reviewer ...` line as in step 1.`, insert:

```markdown

When the final review returns its verdict, append `Task final: reviewed (clean)` or `Task final: reviewed (<K> findings)` and
sync the checklist (Plan Checklist (DGS-634)).
```

and directly before the line `Once the final review is clean, before the report and the Finish step, mark the end of the final window and of the step:`, insert:

```markdown
Once the final review is clean (its fixes verified), append `Task final: complete` and sync the checklist
(Plan Checklist (DGS-634)) so the end state is right.

```

Note: the test counts the literal `(Plan Checklist (DGS-634))` at least five times; never wrap it across lines.

- [ ] **Step 5: executing-plans**

In `skills/executing-plans/SKILL.md`:

(a) In Step 2, after item 7 (the one ending with the `task-end` command), insert:

```markdown
8. **Plan checklist (DGS-634).** When `<Key>` is a ClickUp key (`DGS-<n>`), sync the ticket's checklist from the ledger, never
   from memory: `dg clickup checklist sync --task <Key> --plan PLAN_FILE --ledger <workspace>/progress.md --yes`. The `complete`
   line ticks Implement, Review and "Fix (none needed)". Sync again after a plan revision. Any other key or none: skip. A
   non-zero exit never blocks: print a warning and append `Checklist sync: failed (<first stderr line>)` to the ledger.
```

(b) In "### Step 3: Complete Development", directly after the `step-end` code block and its line `Same key rule as the start block.`, insert:

````markdown

Then sync the checklist once more (Plan checklist (DGS-634) in Step 2). If a whole-branch review ran, append
`Task final: reviewed (clean)` or `Task final: reviewed (<K> findings)`, and `Task final: complete` once its fixes are verified,
before this sync:

```bash
dg clickup checklist sync --task <Key> --plan PLAN_FILE --ledger <workspace>/progress.md --yes
```
````

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run scripts/plan-checklist-skills.test.ts packages/cli/src/reviewer/sdd.test.ts scripts/check_vendored_skills.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit (two commits)**

```bash
git add skills/writing-plans/SKILL.md
git commit -m "feat(dgs-631): create the plan checklist from writing-plans"
git add skills/subagent-driven-development/SKILL.md skills/executing-plans/SKILL.md scripts/plan-checklist-skills.test.ts
git commit -m "feat(dgs-634): tick the plan checklist from SDD and executing-plans"
```
