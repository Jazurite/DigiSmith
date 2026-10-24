# DGS-600 Ready starter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `autonomous-scan` claims tickets in the new status `ready` only (Mode `Autonomous`), `to do` becomes attended, the Steward knows `ready` and `scheduled`, and `dg` can read a field's locations and create a dropdown field at any location, so the statuses and the Mode field can be set up after the merge.

**Architecture:** The `Tracker` interface gets `listByStatus(name)` instead of `listToDo()`, and `LoTask` gets `mode`. The scan, the claim reset and the controller repair in `advance.ts` read `ready`. The Definition of Ready (`ready.ts`) gets a fifth reason for Mode. Two `dg clickup` changes (a new read command `get-field`, and `create-field --location`) use the Frontdoor shapes of the capture of 2026-10-10. A last task runs the live setup after the merge.

**Tech Stack:** TypeScript under `node --experimental-strip-types`, yargs, vitest, pnpm. Nuxt (nexus-web) for one label.

**Spec:** `.digismith/board/DGS-600—ready-scheduled-starters/design.html` (approved by Jack, 2026-10-24). DGS-601 has its own plan: `plan-dgs-601.md` in the same folder; it builds on this one.

## Global Constraints

- Code in `packages/cli/src/` runs under `node --experimental-strip-types`: no parameter properties, no enums, no namespaces.
- Tests use fakes only: no real ClickUp, no herdr prompt, no live API, no real depot (`DIGISMITH_DEPOT_DIR` in a temp folder when a test needs it).
- Test first: write the failing test, see it fail, then the code.
- pnpm only. Never `pnpm install` in the depot clone.
- ClickUp writes go through `dg` only; no one-off scripts. Every new write command prints the call and sends nothing without `--yes`.
- Status names, exactly: `ready`, `scheduled`, `to do`. Mode options, exactly: `Autonomous` (orderindex 0), `Manual` (orderindex 1). Field name, exactly: `Mode`.
- The Mode skip reason, exactly: `Mode is not Autonomous (Manual or missing)`.
- Pickup timing, the night window, the away switch, the lock, the breaker and rank order do not change.
- Existing tickets in `to do` stay there. No migration.
- Commits: title-only conventional commits, no AI attribution. Times UTC+7 first.
- `packages/cli/src/autonomous/` and `scripts/nexus-api/src/scheduler/` are Nightwatch-protected paths: this is an attended build.

Test commands used below:
- CLI: `cd packages/cli && pnpm vitest run <path relative to packages/cli>`
- Whole CLI suite: `cd packages/cli && pnpm test`
- Type check: `cd packages/cli && pnpm exec tsc --noEmit -p tsconfig.build.json`
- nexus-api (no package script; run from the repo root): `pnpm vitest run scripts/nexus-api/<path>`
- nexus-web: `cd scripts/nexus-web && pnpm vitest run <path>`

## File Structure

| File | Change |
|---|---|
| `packages/clickup-client/src/client.ts` | `searchTeamTasks` gets an optional status filter |
| `packages/clickup-client/src/frontdoor.ts`, `types.ts` | `getFieldLocations`, `setFieldLocations`; create body without `category_id` |
| `packages/cli/src/autonomous/types.ts` | `listByStatus`, `LoTask.mode` |
| `packages/cli/src/autonomous/tracker-clickup.ts` | `listByStatus`, Mode read |
| `packages/cli/src/autonomous/fake-tracker.test-util.ts` | `listByStatus`, default `ready`, default Mode |
| `packages/cli/src/autonomous/ready.ts` | `REASON.mode` |
| `packages/cli/src/autonomous/scan.ts` | starter `ready` |
| `packages/cli/src/autonomous/advance.ts` | repair reads `ready` |
| `packages/cli/src/autonomous/index.ts` | `lazyTracker`, describe texts |
| `packages/cli/src/steward/types.ts`, `rules.ts`, `index.ts`, `README.md`, `fake-tracker.test-util.ts` | new statuses, `approved --into`, `started` from `ready` |
| `scripts/nexus-api/src/scheduler/registry.ts` | `autonomous-scan` description |
| `scripts/nexus-web/app/components/nw/NwTopBar.vue`, `shell.test.ts`, visual snapshots | label "Ready waiting" |
| `packages/cli/src/clickup/get-field.ts` (new), `create-field.ts`, `index.ts` | read locations; `--location` |

---

### Task 1: Tracker lists by status and reads Mode

**Files:**
- Modify: `packages/clickup-client/src/client.ts:160-170` (`searchTeamTasks`)
- Modify: `packages/cli/src/autonomous/types.ts`
- Modify: `packages/cli/src/autonomous/tracker-clickup.ts`
- Modify: `packages/cli/src/autonomous/fake-tracker.test-util.ts`
- Modify: `packages/cli/src/autonomous/index.ts:71-81` (`lazyTracker`)
- Modify: `packages/cli/src/autonomous/scan.ts:179` (call site only, behaviour unchanged in this task)
- Test: `packages/clickup-client/src/client.test.ts`, `packages/cli/src/autonomous/tracker-clickup.test.ts`, `packages/cli/src/autonomous/scan.test.ts`, `packages/cli/src/autonomous/index.test.ts`

**Interfaces:**
- Produces: `Tracker.listByStatus(name: string): Promise<LoTask[]>` (status compared lower-case, whole space, any type). `LoTask.mode: "Autonomous" | "Manual" | null`. `ClickUpClient.searchTeamTasks(spaceId: string, maxPages = 10, status?: string)`. `FakeTracker.add()` defaults: `status: "ready"`, `mode: "Autonomous"`.
- `listToDo` is removed from `Tracker`, `ClickUpLoTracker`, `FakeTracker` and `lazyTracker`.

- [ ] **Step 1: Write the failing tests**

In `client.test.ts` (it mocks axios with a shared `request` mock and `makeClient()`), add:

```ts
it("searchTeamTasks sends one statuses[] filter when a status is given", async () => {
  const client = makeClient();
  request.mockResolvedValueOnce({ data: { tasks: [] } });
  await client.searchTeamTasks("space-1", 10, "ready");
  expect(request.mock.calls[0][0].params).toEqual({ "space_ids[]": "space-1", include_closed: false, subtasks: true, page: 0, "statuses[]": "ready" });
});
it("searchTeamTasks sends no statuses[] without a status", async () => {
  const client = makeClient();
  request.mockResolvedValueOnce({ data: { tasks: [] } });
  await client.searchTeamTasks("space-1");
  expect(request.mock.calls[0][0].params).not.toHaveProperty("statuses[]");
});
```

In `tracker-clickup.test.ts`: change the fake client's `searchTeamTasks(spaceId, maxPages = 10)` to `searchTeamTasks(spaceId, maxPages = 10, status?: string)` and push `searchTeamTasks ${spaceId} ${status ?? "-"}` into `calls`. Rename every `listToDo()` call in the file to `listByStatus("to do")` (the fixtures use `to do`; the meaning of these tests does not change). Add a Mode fixture next to `signOffField`:

```ts
const modeField = (value?: number) => ({
  id: "field-m", name: "Mode", type: "drop_down",
  type_config: { options: [
    { id: "opt-a", name: "Autonomous", color: null, orderindex: 0 },
    { id: "opt-m", name: "Manual", color: null, orderindex: 1 },
  ] },
  ...(value === undefined ? {} : { value }),
});
```

and these tests:

```ts
it("listByStatus keeps only the named status, any case, and passes it to the search", async () => {
  const { client, calls } = fakeClient({ search: [
    task({ id: "r1", status: { status: "Ready", type: "custom" } }),
    task({ id: "d1", status: { status: "to do", type: "custom" } }),
  ] });
  const got = await new ClickUpLoTracker(client, SPACE).listByStatus("ready");
  expect(got.map((t) => t.id)).toEqual(["r1"]);
  expect(calls).toContain(`searchTeamTasks ${SPACE} ready`);
});
it("reads Mode Autonomous, Manual, and null for no value or an unknown index", async () => {
  const mk = (id: string, v?: number) => task({ id, status: { status: "ready", type: "custom" }, custom_fields: [modeField(v)] });
  const { client } = fakeClient({ search: [mk("a", 0), mk("m", 1), mk("n"), mk("x", 7)] });
  const got = await new ClickUpLoTracker(client, SPACE).listByStatus("ready");
  expect(got.map((t) => t.mode)).toEqual(["Autonomous", "Manual", null, null]);
});
```

In `scan.test.ts` and `index.test.ts`: any test that reads `tracker.calls` for `"listToDo"` now expects `"listByStatus to do"` (Task 3 changes it to `ready`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/clickup-client && pnpm vitest run src/client.test.ts` and `cd packages/cli && pnpm vitest run src/autonomous/tracker-clickup.test.ts`
Expected: FAIL (`listByStatus is not a function`, missing `statuses[]`).

- [ ] **Step 3: Implement**

`client.ts`:

```ts
  async searchTeamTasks(spaceId: string, maxPages = 10, status?: string): Promise<ClickUpTask[]> {
    const all: ClickUpTask[] = [];
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get<{ tasks: ClickUpTask[] }>(`/team/${this.teamId}/task`, {
        params: { "space_ids[]": spaceId, include_closed: false, subtasks: true, page, ...(status === undefined ? {} : { "statuses[]": status }) },
      });
      all.push(...res.tasks);
      if (res.tasks.length < 100) break;
    }
    return all;
  }
```

(One status is sent as a plain string, like `space_ids[]`, so axios does not write `statuses[][]`.)

`types.ts`:

```ts
export interface LoTask {
  id: string; key: string | null; name: string; typeId: number;
  priority: number | null;      // 1 urgent .. 4 low, null none
  due: number | null;           // ms
  created: number;              // ms
  attachments: string[];        // titles
  text: string;
  signOff: "Auto" | "Jack" | null;
  mode: "Autonomous" | "Manual" | null;
  milestone: string | null;
  blockers: { key: string; done: boolean }[];
}
export interface Tracker {
  hasStatus(name: string): Promise<boolean>;
  listByStatus(name: string): Promise<LoTask[]>;   // status equal to name (any case), whole space, any type
  setStatus(taskId: string, status: string): Promise<void>;
  getStatus(taskId: string): Promise<string>;
  comment(ref: string, text: string): Promise<void>;   // ref = task id or key
}
```

`tracker-clickup.ts`: remove `const TO_DO = "to do";`. Replace `signOff()` with one dropdown reader used twice:

```ts
/** The option name of a dropdown field, read by its orderindex value; null when absent or not one of `allowed`. */
function dropdown<T extends string>(t: ClickUpTask, name: string, allowed: readonly T[]): T | null {
  const field = (t.custom_fields as unknown as Field[] | undefined)?.find((f) => f.name === name);
  if (!field || typeof field.value !== "number") return null;
  const option = field.type_config?.options?.find((o) => o.orderindex === field.value);
  return option?.name !== undefined && (allowed as readonly string[]).includes(option.name) ? (option.name as T) : null;
}
```

```ts
  async listByStatus(name: string): Promise<LoTask[]> {
    const want = name.toLowerCase();
    const all = await this.client.searchTeamTasks(this.spaceId, 10, name);
    const byId = new Map(all.map((t) => [t.id, t]));
    const out: LoTask[] = [];
    for (const hit of all) {
      if (hit.status?.status?.toLowerCase() !== want) continue;
      // Search leaves out attachments: read the full ticket, only for tickets in this status.
      const full = await this.client.getTaskByRef(hit.id);
      out.push(await this.toLoTask({ ...hit, ...full, dependencies: full.dependencies ?? hit.dependencies,
        linked_tasks: full.linked_tasks ?? hit.linked_tasks }, byId));
    }
    return out;
  }
```

Note: `byId` now holds only the filtered tickets, so a blocker in another status is read with `getTaskByRef` (the existing fallback in `blockers()`). That is one read per blocker; correct, slower only for blocked tickets.

In `toLoTask`: `signOff: dropdown(t, "Sign-off", ["Auto", "Jack"] as const),` and `mode: dropdown(t, "Mode", ["Autonomous", "Manual"] as const),`.

`fake-tracker.test-util.ts`: in `add()` defaults use `mode: "Autonomous"` and `status: "ready"`; `statuses` default `new Set(["to do", "ready", "scheduled", "in progress", "complete"])`; replace `listToDo` with:

```ts
  async listByStatus(name: string): Promise<LoTask[]> {
    this.calls.push(`listByStatus ${name}`);
    return [...this.tasks.values()].filter((t) => t.status.toLowerCase() === name.toLowerCase()).map(({ status: _s, ...t }) => ({ ...t }));
  }
```

and `getStatus` with `readBackWrong` returns `"ready"`.

Because the fake's default status is now `ready` while `scan.ts` still lists `to do` in this task, set `status: "to do"` explicitly in `scan.test.ts` where the tests add tasks: change `const tracker = new FakeTracker()` setup to nothing new, and instead in `scan.test.ts` add at the top of the file `const add = (t: Parameters<FakeTracker["add"]>[0]) => tracker.add({ status: "to do", ...t });` and replace `tracker.add(` with `add(` in that file. Task 3 removes this helper again.

`scan.ts:179`: `const all = await d.tracker.listByStatus("to do");`

`index.ts` `lazyTracker`: replace the `listToDo` line with `listByStatus: (name) => get().listByStatus(name),`.

Every other `LoTask` object literal in the CLI tests (for example `ready.test.ts`, `rank.test.ts`, `scan-guard.test.ts`) gets `mode: "Autonomous"`. Find them with `pnpm exec tsc --noEmit -p tsconfig.build.json` and `grep -rn "signOff:" src --include=*.test.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/clickup-client && pnpm vitest run src/client.test.ts`, then `cd packages/cli && pnpm test` and `pnpm exec tsc --noEmit -p tsconfig.build.json`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/clickup-client/src/client.ts packages/clickup-client/src/client.test.ts packages/cli/src/autonomous
git commit -m "refactor(dgs-600): list tickets by status and read the Mode field"
```

### Task 2: Definition of Ready checks Mode

**Files:**
- Modify: `packages/cli/src/autonomous/ready.ts`
- Test: `packages/cli/src/autonomous/ready.test.ts`

**Interfaces:**
- Consumes: `LoTask.mode` (Task 1).
- Produces: `REASON.mode = "Mode is not Autonomous (Manual or missing)"`; `checkReady` order: spec/plan, Sign-off, milestone, blocked, Mode.

- [ ] **Step 1: Write the failing tests** (add to `ready.test.ts`, using its existing complete-ticket helper; read the file for its name)

```ts
it("Mode Manual fails with the Mode reason only", () => {
  expect(checkReady({ ...complete, mode: "Manual" }, ctx)).toEqual([REASON.mode]);
});
it("Mode missing fails with the Mode reason only", () => {
  expect(checkReady({ ...complete, mode: null }, ctx)).toEqual([REASON.mode]);
});
it("lists all five in order", () => {
  const t = { ...complete, attachments: [], text: "", signOff: null, milestone: null, blockers: [{ key: "DGS-1", done: false }], mode: null };
  expect(checkReady(t, ctx)).toEqual([REASON.specPlan, REASON.signOff, REASON.milestone, REASON.blocked(["DGS-1"]), REASON.mode]);
});
it("pins the Mode reason text", () => {
  expect(REASON.mode).toBe("Mode is not Autonomous (Manual or missing)");
});
```

The existing test "lists all four in order" builds a ticket with Mode `Autonomous` (from Task 1); keep it.

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/cli && pnpm vitest run src/autonomous/ready.test.ts`
Expected: FAIL (`REASON.mode` undefined).

- [ ] **Step 3: Implement**

```ts
export const REASON = {
  specPlan: "no spec and plan on the ticket (an attachment named design.* or spec.* and one named plan.*, or a linked board folder with design.* and plan.md on main)",
  signOff: "no Sign-off mark (Auto or Jack)",
  milestone: "no milestone",
  blocked: (keys: string[]) => `blocked by open ticket(s): ${keys.join(", ")}`,
  mode: "Mode is not Autonomous (Manual or missing)",
} as const;
```

and as the last check in `checkReady`: `if (t.mode !== "Autonomous") out.push(REASON.mode);`

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/cli && pnpm vitest run src/autonomous/ready.test.ts src/autonomous/scan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/ready.ts packages/cli/src/autonomous/ready.test.ts
git commit -m "feat(dgs-600): skip a ready ticket whose Mode is not Autonomous"
```

### Task 3: The scan and the controller read ready

**Files:**
- Modify: `packages/cli/src/autonomous/scan.ts:82,163-180,213`
- Modify: `packages/cli/src/autonomous/advance.ts:128`
- Test: `packages/cli/src/autonomous/scan.test.ts`, `packages/cli/src/autonomous/advance.test.ts`

**Interfaces:**
- Consumes: `listByStatus` (Task 1), `REASON.mode` (Task 2).
- Produces: no new names. `runScan` reads `ready`; `advanceTicket` repairs `ready`.

- [ ] **Step 1: Write the failing tests**

In `scan.test.ts`: remove the `add` helper from Task 1 and use `tracker.add(` again (default status is now `ready`). Change the expected texts and statuses:
- every `toBe("to do")` on a task status after a failed claim or a skip becomes `toBe("ready")`; `toContain("setStatus t1 to do")` becomes `toContain("setStatus t1 ready")`;
- the skip comment text: `"Autonomous scan skipped this ticket (2026-10-21 00:00:00 UTC+7): no milestone. It stays in ready. Fix and it is picked up on a later scan."`;
- the missing-status test: `tracker.statuses.delete("ready")`, and its DGS-548 comment contains `the status "ready" is missing`;
- the test name "empty to do" becomes "empty ready".

Add:

```ts
it("never claims a to do ticket: to do is attended", async () => {
  tracker.add({ id: "t1", status: "to do", priority: 1 });
  tracker.add({ id: "t2", status: "ready", priority: 4 });
  const r = await runScan(mk());
  expect(r.claimed).toBe("T2");
  expect(tracker.tasks.get("t1")?.status).toBe("to do");
  expect(tracker.writeCalls().filter((c) => c.includes("t1"))).toEqual([]);
});
it("a ready ticket with Mode Manual is skipped with one comment, not again on the next scan", async () => {
  tracker.add({ id: "t1", mode: "Manual" });
  await runScan(mk());
  await runScan(mk());
  expect(tracker.comments.map((c) => c.text)).toEqual([
    "Autonomous scan skipped this ticket (2026-10-21 00:00:00 UTC+7): Mode is not Autonomous (Manual or missing). It stays in ready. Fix and it is picked up on a later scan.",
  ]);
  expect(tracker.tasks.get("t1")?.status).toBe("ready");
});
it("a ready ticket with no Mode is skipped the same way", async () => {
  tracker.add({ id: "t1", mode: null });
  const r = await runScan(mk());
  expect(r.outcome).toBe("none");
  expect(r.skipped).toEqual([{ key: "T1", reason: "Mode is not Autonomous (Manual or missing)" }]);
});
```

In `advance.test.ts`: the two tests at lines 146-153 use `ok({ status: "ready" })` and keep their expectations; add:

```ts
it("a locked ticket that Jack moved to to do is left alone (to do is his)", () => {
  const o = O({ ...withEvent("building"), tracker: ok({ status: "to do" }) });
  expect(advanceTicket(S("building"), o, {}).kind).not.toBe("status");
});
```

(Use the file's existing helpers `O`, `S`, `ok`, `withEvent`; read the two tests at 146-153 for their exact shape and copy it.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/cli && pnpm vitest run src/autonomous/scan.test.ts src/autonomous/advance.test.ts`
Expected: FAIL (the scan still lists `to do`).

- [ ] **Step 3: Implement**

`scan.ts`:
- line 82: `try { await d.tracker.setStatus(t.id, "ready"); } catch { /* best effort */ }`
- step 3: `if (!(await d.tracker.hasStatus("ready"))) {` and the comment text `` `Autonomous scan (${fmtUtc7(now)} UTC+7): the status "ready" is missing, so no ticket can be picked up. Add it back to the space's status set.` ``
- step 4: `const all = await d.tracker.listByStatus("ready");`
- the skip comment: `` `Autonomous scan skipped this ticket (${fmtUtc7(now)} UTC+7): ${reason}. It stays in ready. Fix and it is picked up on a later scan.` ``
- the comment above step 3 stays `// 3. The starter status.`

`advance.ts:128`: `if (obs.tracker.ok && obs.tracker.value.status === "ready" && s.phase !== "merged" && s.phase !== "released" && !used(j, keyOf(s, "status-write")))`

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/cli && pnpm test`
Expected: PASS (whole CLI suite).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/scan.ts packages/cli/src/autonomous/scan.test.ts packages/cli/src/autonomous/advance.ts packages/cli/src/autonomous/advance.test.ts
git commit -m "feat(dgs-600): claim ready tickets only; to do is attended"
```

### Task 4: The Steward knows ready and scheduled

**Files:**
- Modify: `packages/cli/src/steward/types.ts`, `packages/cli/src/steward/rules.ts`, `packages/cli/src/steward/index.ts:55-72`, `packages/cli/src/steward/README.md`, `packages/cli/src/steward/fake-tracker.test-util.ts`
- Test: `packages/cli/src/steward/rules.test.ts`, `packages/cli/src/steward/index.test.ts`

**Interfaces:**
- Produces: `STATUSES` with `"scheduled"` after `"refinement"` and `"ready"` after `"to do"`. `EventInput.into?: "to do" | "ready" | "scheduled"`. `APPROVE_TARGETS = ["to do", "ready", "scheduled"] as const`. CLI flag `--into` (choices those three, default `to do`), only meaningful for `approved`.

- [ ] **Step 1: Write the failing tests** (`rules.test.ts`; use its existing `view()` and `cfg` helpers, read the file first)

```ts
it("approved --into ready moves refinement to ready", () => {
  expect(evaluate({ event: "approved", quote: "yes", into: "ready" }, view({ status: "refinement" }), cfg)).toEqual({ kind: "move", to: "ready" });
});
it("approved --into scheduled moves refinement to scheduled", () => {
  expect(evaluate({ event: "approved", quote: "yes", into: "scheduled" }, view({ status: "refinement" }), cfg)).toEqual({ kind: "move", to: "scheduled" });
});
it("approved without --into still moves to to do", () => {
  expect(evaluate({ event: "approved", quote: "yes" }, view({ status: "refinement" }), cfg)).toEqual({ kind: "move", to: "to do" });
});
it("approved --into ready on a ready ticket is a noop", () => {
  expect(evaluate({ event: "approved", quote: "yes", into: "ready" }, view({ status: "ready" }), cfg)).toEqual({ kind: "noop" });
});
it("approved with a bad --into is refused", () => {
  const r = evaluate({ event: "approved", quote: "yes", into: "done" as never }, view({ status: "refinement" }), cfg);
  expect(r).toEqual({ kind: "refuse", reason: "approved --into must be one of to do, ready, scheduled" });
});
it("started is valid from ready", () => {
  expect(evaluate({ event: "started" }, view({ status: "ready" }), cfg)).toMatchObject({ kind: "move", to: "in progress", startDate: true });
});
it("started from scheduled is refused", () => {
  expect(evaluate({ event: "started" }, view({ status: "scheduled" }), cfg)).toEqual({ kind: "refuse", reason: "started is valid from to do or ready; the ticket is in scheduled" });
});
```

In `index.test.ts` add one test that runs `steward event approved --ticket DGS-1 --quote "go" --into ready --dry-run` through the file's existing runner and expects the printed move to name `ready`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/cli && pnpm vitest run src/steward/rules.test.ts src/steward/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`types.ts`:

```ts
export const STATUSES = [
  "backlog", "concept", "discovery", "refinement", "scheduled", "to do", "ready", "in progress", "review",
  "acceptance", "release", "done", "documented", "discarded", "Closed",
] as const;
```

```ts
/** Where Jack's approval can send a refined ticket. */
export const APPROVE_TARGETS = ["to do", "ready", "scheduled"] as const;
export type ApproveTarget = (typeof APPROVE_TARGETS)[number];

export interface EventInput {
  event: EventName;
  answer?: "yes" | "no";
  quote?: string;
  by?: string;
  sha?: string;
  /** approved only: the starter status; default "to do". */
  into?: ApproveTarget;
}
```

`rules.ts`: remove `approved` from `ENTRY`; `started: { from: ["to do", "ready"], to: "in progress" },`. In `evaluate`'s switch add `case "approved": return approved(input, view);` and:

```ts
function approved(input: EventInput, view: TicketView): RuleResult {
  const into = input.into ?? "to do";
  if (!(APPROVE_TARGETS as readonly string[]).includes(into)) return refuse(`approved --into must be one of ${APPROVE_TARGETS.join(", ")}`);
  return viaEntry("approved", { from: ["refinement"], to: into }, view);
}
```

(import `APPROVE_TARGETS` from `./types.ts`). `viaEntry` already joins `from` with " or ", which gives the refusal text in the test.

`steward/index.ts`: add `.option("into", { type: "string", choices: ["to do", "ready", "scheduled"], describe: "approved only: the starter status (default to do)" })` and pass `into: argv.into as ApproveTarget | undefined` in the `EventInput`. Refuse `--into` with any event other than `approved` as a usage error (exit code 2, like the file's other usage errors): `--into is valid only with approved`.

`steward/fake-tracker.test-util.ts`: its status list gains `scheduled` and `ready` in the same places as `STATUSES`.

`README.md` table: `approved` row: `| \`approved\` (gate, needs \`--quote\`; \`--into to do\|ready\|scheduled\`, default to do) | refinement | to do, ready or scheduled |`; `started` row: `| \`started\` | to do, ready | in progress (start date; a start later than today is replaced) |`. Add one line under the table: `\`scheduled\` leaves by \`dg autonomous schedule-release\` (DGS-601), not by a Steward event.`

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/cli && pnpm vitest run src/steward`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward
git commit -m "feat(dgs-600): let the steward approve into ready or scheduled"
```

### Task 5: Texts: describe lines, the job description and the Nightwatch label

**Files:**
- Modify: `packages/cli/src/autonomous/index.ts:213,218`
- Modify: `scripts/nexus-api/src/scheduler/registry.ts` (`autonomous-scan` description)
- Modify: `scripts/nexus-web/app/components/nw/NwTopBar.vue:33`
- Test: `scripts/nexus-web/app/components/nw/shell.test.ts:18`, `scripts/nexus-api/src/scheduler/registry.test.ts`, visual snapshots in `scripts/nexus-web/tests/visual/__screenshots__/`

**Interfaces:** none (texts only).

- [ ] **Step 1: Write the failing tests**

`shell.test.ts:18`: `expect(t).toContain('Ready waiting 5')`.
`registry.test.ts`, add:

```ts
it('autonomous-scan says it claims a ready ticket', () => {
  expect(JOBS.find((j) => j.name === 'autonomous-scan')!.description).toBe('Autonomous Operation: at night or while Jack is away, claim one ready ticket and hand it to the conductor')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd scripts/nexus-web && pnpm vitest run app/components/nw/shell.test.ts` and `pnpm vitest run scripts/nexus-api/src/scheduler/registry.test.ts` (repo root)
Expected: FAIL.

- [ ] **Step 3: Implement**

- `index.ts:213`: `describe: "Autonomous Operation: scan ready and claim one ticket, the away switch, release, report, status",`
- `index.ts:218`: `describe: "scan ready and claim the first ticket that passes the Definition of Ready (works only at night or while away)",`
- `registry.ts`: `description: 'Autonomous Operation: at night or while Jack is away, claim one ready ticket and hand it to the conductor',`
- `NwTopBar.vue:33`: `<span>Ready waiting <b>{{ overview.scan.candidates ?? '-' }}</b> <span class="muted">as of {{ fmtUtc7(overview.scan.lastScanAt) }}</span></span>`

- [ ] **Step 4: Run to verify they pass, and refresh the visual baselines**

Run: `cd scripts/nexus-web && pnpm vitest run app/components/nw/shell.test.ts`, `pnpm vitest run scripts/nexus-api/src/scheduler/registry.test.ts` (repo root), then `cd scripts/nexus-web && pnpm visual`.
Expected: the unit tests PASS. `pnpm visual` fails only on snapshots that show the top bar. Look at each diff image: the only change must be the label text. Then `pnpm visual:update` and `pnpm visual` again: PASS. If a diff shows any other change, stop and report it.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/index.ts scripts/nexus-api/src/scheduler scripts/nexus-web/app/components/nw scripts/nexus-web/tests/visual/__screenshots__
git commit -m "docs(dgs-600): name ready in the scan texts and the Nightwatch top bar"
```

### Task 6: `dg clickup get-field` reads a field and its locations

**Files:**
- Modify: `packages/clickup-client/src/frontdoor.ts` (new `getFieldLocations`)
- Modify: `packages/clickup-client/src/types.ts` (new `FrontdoorFieldWithLocations`)
- Create: `packages/cli/src/clickup/get-field.ts`
- Modify: `packages/cli/src/clickup/index.ts` (register)
- Test: `packages/clickup-client/src/frontdoor.test.ts`, `packages/cli/src/clickup/get-field.test.ts`

**Interfaces:**
- Produces: `FrontdoorClient.getFieldLocations(id: string): Promise<FrontdoorFieldWithLocations>` = `GET /customFields/v2/field/{id}?locations=true`. `interface FrontdoorFieldWithLocations extends FrontdoorField { locations?: unknown[] }`. Command `dg clickup get-field <id>`: read only; prints `field <id> (<type>) "<name>"`, one `option <id> <name> (orderindex <n>)` line per option, then `locations:` and `JSON.stringify(locations, null, 2)` (or `locations: none`). `--json` prints the whole answer.

- [ ] **Step 1: Write the failing tests**

`frontdoor.test.ts` (same style as its `getField` test):

```ts
it("getFieldLocations asks for the locations", async () => {
  const client = makeClient();
  request.mockResolvedValueOnce({ data: { id: "f1", name: "Sign-off", type: "drop_down", type_config: {}, locations: [] } });
  await client.getFieldLocations("f1");
  expect(request).toHaveBeenCalledWith({ method: "GET", url: "/customFields/v2/field/f1?locations=true", data: undefined });
});
```

`get-field.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createGetFieldCommand } from "./get-field.ts";

const answer = {
  id: "f1", name: "Sign-off", type: "drop_down",
  type_config: { options: [{ id: "o1", name: "Auto", orderindex: 0 }, { id: "o2", name: "Jack", orderindex: 1 }] },
  locations: [{ parent: { type: 4, id: "1301150000001271" } }],
};
const run = (client: unknown, argv: object) =>
  (createGetFieldCommand(() => client as FrontdoorClient).handler as (a: object) => Promise<void>)({ json: false, ...argv });

describe("get-field", () => {
  afterEach(() => { process.exitCode = 0; vi.restoreAllMocks(); });

  it("prints the field, its options and its locations", async () => {
    const getFieldLocations = vi.fn().mockResolvedValue(answer);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ getFieldLocations }, { id: "f1" });
    expect(getFieldLocations).toHaveBeenCalledWith("f1");
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain('field f1 (drop_down) "Sign-off"');
    expect(out).toContain("option o1 Auto (orderindex 0)");
    expect(out).toContain('"type": 4');
    expect(process.exitCode).toBe(0);
  });
  it("says none when there are no locations", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ getFieldLocations: vi.fn().mockResolvedValue({ ...answer, locations: [] }) }, { id: "f1" });
    expect(log.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("locations: none");
  });
  it("--json prints the whole answer", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ getFieldLocations: vi.fn().mockResolvedValue(answer) }, { id: "f1", json: true });
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual(answer);
  });
  it("a failed read exits 1 with one line", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run({ getFieldLocations: vi.fn().mockRejectedValue(new Error("404")) }, { id: "f1" });
    expect(err.mock.calls[0][0]).toBe("clickup get-field: 404");
    expect(process.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/clickup-client && pnpm vitest run src/frontdoor.test.ts` and `cd packages/cli && pnpm vitest run src/clickup/get-field.test.ts`
Expected: FAIL (no such method / module).

- [ ] **Step 3: Implement**

`frontdoor.ts`, next to `getField`:

```ts
  /** The field with its locations (where it shows). Read only. */
  getFieldLocations(id: string): Promise<FrontdoorFieldWithLocations> {
    return this.request<FrontdoorFieldWithLocations>("GET", `/customFields/v2/field/${id}?locations=true`);
  }
```

`types.ts`: `export interface FrontdoorFieldWithLocations extends FrontdoorField { locations?: unknown[] }` (exported from the package index the same way `FrontdoorField` is).

`get-field.ts`:

```ts
import type { CommandModule } from "yargs";
import type { FrontdoorClient } from "@digismith/clickup-client";
import { createFrontdoorClient } from "./lib.ts";

export function createGetFieldCommand(clientFactory: () => FrontdoorClient = createFrontdoorClient): CommandModule {
  return {
    command: "get-field <id>",
    describe: "read a custom field with its options and locations (Frontdoor, read only)",
    builder: (y) =>
      y
        .positional("id", { type: "string", demandOption: true, describe: "field id" })
        .option("json", { type: "boolean", default: false, describe: "print the whole answer as JSON" }),
    handler: async (argv) => {
      try {
        const f = await clientFactory().getFieldLocations(argv.id as string);
        if (argv.json) {
          console.log(JSON.stringify(f, null, 2));
        } else {
          console.log(`field ${f.id} (${f.type}) ${JSON.stringify(f.name)}`);
          for (const o of f.type_config.options ?? []) console.log(`option ${o.id} ${o.name} (orderindex ${o.orderindex})`);
          const locations = f.locations ?? [];
          console.log(locations.length === 0 ? "locations: none" : `locations:\n${JSON.stringify(locations, null, 2)}`);
        }
        process.exitCode = 0;
      } catch (err) {
        console.error(`clickup get-field: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const getFieldCommand: CommandModule = createGetFieldCommand();
```

`clickup/index.ts`: import `getFieldCommand` and add `.command(getFieldCommand)` after `.command(listFieldsCommand)`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/clickup-client && pnpm vitest run src/frontdoor.test.ts` and `cd packages/cli && pnpm vitest run src/clickup/get-field.test.ts src/clickup/lib.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/clickup-client/src packages/cli/src/clickup/get-field.ts packages/cli/src/clickup/get-field.test.ts packages/cli/src/clickup/index.ts
git commit -m "feat(dgs-600): add dg clickup get-field to read a field and its locations"
```

### Task 7: `dg clickup create-field --location`

**Files:**
- Modify: `packages/clickup-client/src/types.ts` (`FrontdoorFieldCreateBody`, new `FrontdoorFieldLocation`)
- Modify: `packages/clickup-client/src/frontdoor.ts` (new `setFieldLocations`)
- Modify: `packages/cli/src/clickup/create-field.ts`
- Test: `packages/clickup-client/src/frontdoor.test.ts`, `packages/cli/src/clickup/create-field.test.ts`

**Interfaces:**
- Consumes: the location shape printed by `get-field` (Task 6).
- Produces:
  - `interface FrontdoorFieldLocation { parent: { type: number; id: string }; required: false; required_on_subtasks: false; hide_from_guests: false }`
  - `FrontdoorClient.setFieldLocations(fieldId: string, locations: FrontdoorFieldLocation[]): Promise<void>` = `PUT /field/v3/experience/workspaces/{teamId}/fields/{fieldId}/locations` with body `{ new_locations: locations }` (ClickUp answers 204).
  - `FrontdoorFieldCreateBody`: `category_id?: string` and `team_id?: string` (exactly one is set).
  - `parseLocation(input: string): { type: number; id: string }` exported from `create-field.ts`: `"<type>:<id>"`, type a whole number 1-99, id digits only.
  - `buildFieldCreateBody(name, optionArgs, scope: { folder: string } | { teamId: string }, description)`.
  - Flag `--location <type>:<id>` (repeatable), not together with `--folder`; exactly one of the two is required.
  - DGS-601 adds `--type date` to this same command; keep the body builder in one function so that change stays small.

- [ ] **Step 1: Write the failing tests**

`frontdoor.test.ts`:

```ts
it("setFieldLocations PUTs new_locations to the workspace field path", async () => {
  const client = makeClient();   // team id "123"
  request.mockResolvedValueOnce({ data: "" });
  await client.setFieldLocations("f1", [{ parent: { type: 4, id: "77" }, required: false, required_on_subtasks: false, hide_from_guests: false }]);
  expect(request).toHaveBeenCalledWith({
    method: "PUT", url: "/field/v3/experience/workspaces/123/fields/f1/locations",
    data: { new_locations: [{ parent: { type: 4, id: "77" }, required: false, required_on_subtasks: false, hide_from_guests: false }] },
  });
});
```

If the file's `request` mock answers in a different shape for a 204, copy the shape from its `putSpaceStatuses` test.

`create-field.test.ts` (extend the `fake()` helper with `setFieldLocations: vi.fn().mockResolvedValue(undefined)` and give `run` a `teamId` by passing a client object that has `teamId: "5738747"`):

```ts
it("parseLocation reads type:id and refuses anything else", () => {
  expect(parseLocation("4:1301150000001271")).toEqual({ type: 4, id: "1301150000001271" });
  for (const bad of ["4", ":1", "x:1", "4:", "4:abc", "0:1", "100:1"]) expect(() => parseLocation(bad)).toThrow(/--location/);
});

it("--location dry run prints both calls and sends nothing", async () => {
  const client = fake();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await run(client, { name: "Mode", option: ["Autonomous", "Manual"], location: ["4:1301150000001271"] });
  const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
  expect(out).toContain("POST /customFields/v2/field?ignore_existing=true");
  expect(out).toContain('"team_id": "5738747"');
  expect(out).not.toContain("category_id");
  expect(out).toContain("PUT /field/v3/experience/workspaces/5738747/fields/<new field id>/locations");
  expect(out).toContain('"type": 4');
  expect(client.createField).not.toHaveBeenCalled();
  expect(client.setFieldLocations).not.toHaveBeenCalled();
});

it("--location --yes creates the field, then sets every location, then reads it back", async () => {
  const client = fake();
  client.getFieldLocations = vi.fn().mockResolvedValue({ id: "f9", name: "Mode", type: "drop_down", type_config: { options: [] }, locations: [{ parent: { type: 4, id: "1301150000001271" } }] });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await run(client, { name: "Mode", option: ["Autonomous", "Manual"], location: ["4:1301150000001271", "5:42"], yes: true });
  expect(client.createField.mock.calls[0][0]).toMatchObject({ name: "Mode", type: "drop_down", team_id: "5738747" });
  expect(client.createField.mock.calls[0][0]).not.toHaveProperty("category_id");
  expect(client.setFieldLocations).toHaveBeenCalledWith("f9", [
    { parent: { type: 4, id: "1301150000001271" }, required: false, required_on_subtasks: false, hide_from_guests: false },
    { parent: { type: 5, id: "42" }, required: false, required_on_subtasks: false, hide_from_guests: false },
  ]);
  expect(client.getFieldLocations).toHaveBeenCalledWith("f9");
  expect(log.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("locations read back: 1");
});

it("--folder and --location together is refused", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  await run(fake(), { name: "Mode", option: ["A"], folder: "1", location: ["4:1"] });
  expect(err.mock.calls[0][0]).toBe("clickup create-field: use --folder or --location, not both");
  expect(process.exitCode).toBe(1);
});

it("neither --folder nor --location is refused", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  await run(fake(), { name: "Mode", option: ["A"] });
  expect(err.mock.calls[0][0]).toBe("clickup create-field: --folder or --location is required");
});

it("a failed location call says the field exists without a location", async () => {
  const client = fake();
  client.setFieldLocations = vi.fn().mockRejectedValue(new Error("400"));
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await run(client, { name: "Mode", option: ["A"], location: ["4:1"], yes: true });
  expect(err.mock.calls[0][0]).toBe("clickup create-field: field f9 was created, but setting its locations failed: 400. Run get-field f9 and set the locations again; do not create the field twice.");
  expect(process.exitCode).toBe(1);
});
```

The existing test "neither … `folder` is required" (if any) changes to the new message. Existing `--folder` tests stay as they are.

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/clickup-client && pnpm vitest run src/frontdoor.test.ts` and `cd packages/cli && pnpm vitest run src/clickup/create-field.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`types.ts`:

```ts
/** Body of the web app's POST /customFields/v2/field (captured 2026-10-02 with a folder, 2026-10-10 with team_id). Exactly one of category_id and team_id. */
export interface FrontdoorFieldCreateBody {
  name: string;
  description: string;
  type: "drop_down";
  type_config: {
    new_drop_down: true;
    sorting: "manual";
    options: FrontdoorFieldCreateOption[];
  };
  category_id?: string;
  team_id?: string;
  required: boolean;
  required_on_subtasks: boolean;
  pinned: boolean;
  private: boolean;
  hide_from_guests: boolean;
  permission_level: string | null;
  members: unknown[];
  groups: unknown[];
}

/** One item of PUT /field/v3/experience/workspaces/{ws}/fields/{id}/locations (captured 2026-10-10; type 7 was the workspace). */
export interface FrontdoorFieldLocation {
  parent: { type: number; id: string };
  required: false;
  required_on_subtasks: false;
  hide_from_guests: false;
}
```

`frontdoor.ts`:

```ts
  /** Adds locations to a field (where it shows). ClickUp answers 204. */
  async setFieldLocations(fieldId: string, locations: FrontdoorFieldLocation[]): Promise<void> {
    await this.request("PUT", `/field/v3/experience/workspaces/${this.teamId}/fields/${fieldId}/locations`, { new_locations: locations });
  }
```

`create-field.ts`:

```ts
const LOCATION = /^([1-9]\d?):(\d+)$/;

/** "<type>:<id>" as printed by get-field: a location type number and a numeric id. */
export function parseLocation(input: string): { type: number; id: string } {
  const m = LOCATION.exec(input.trim());
  if (!m) throw new Error(`--location "${input}" must look like "<type>:<id>" with a type from 1 to 99 and a numeric id (read them with dg clickup get-field on a field that already has the place)`);
  return { type: Number(m[1]), id: m[2] };
}

export function buildFieldCreateBody(
  name: string,
  optionArgs: string[],
  scope: { folder: string } | { teamId: string },
  description: string
): FrontdoorFieldCreateBody {
  // options: unchanged code (parseOption, empty and duplicate checks)
  return {
    name,
    description,
    type: "drop_down",
    type_config: { new_drop_down: true, sorting: "manual", options: options.map((o) => ({ id: null, name: o.name, color: o.color, orderindex: null })) },
    ...("folder" in scope ? { category_id: scope.folder } : { team_id: scope.teamId }),
    required: false,
    required_on_subtasks: false,
    pinned: false,
    private: false,
    hide_from_guests: false,
    permission_level: null,
    members: [],
    groups: [],
  };
}
```

In the builder add `.option("location", { type: "string", array: true, requiresArg: true, describe: 'a place the field shows: "<type>:<id>" as printed by get-field; repeat for more; not with --folder' })`. In the handler, after the name and option checks:

```ts
        const locationArgs = (argv.location as string[] | undefined) ?? [];
        if (folder !== undefined && locationArgs.length > 0) throw new Error("use --folder or --location, not both");
        if (folder === undefined && locationArgs.length === 0) throw new Error("--folder or --location is required");
        if (folder !== undefined && !/^\d+$/.test(folder)) throw new Error("--folder must be a numeric id");
        const locations = locationArgs.map(parseLocation).map((parent) => ({ parent, required: false as const, required_on_subtasks: false as const, hide_from_guests: false as const }));
        const client = clientFactory();
        const body = buildFieldCreateBody(name, optionArgs, folder !== undefined ? { folder } : { teamId: client.teamId }, (argv.description as string) ?? "");
        if (!argv.yes) {
          printCall("POST", "/customFields/v2/field?ignore_existing=true", body);
          if (locations.length > 0) printCall("PUT", `/field/v3/experience/workspaces/${client.teamId}/fields/<new field id>/locations`, { new_locations: locations });
          console.log("nothing sent; add --yes to send");
        } else {
          const field = await client.createField(body);
          console.log(`field ${field.id} (${field.type}) ${JSON.stringify(field.name)}`);
          for (const o of field.type_config.options ?? []) console.log(`option ${o.id} ${o.name} (orderindex ${o.orderindex})`);
          if (locations.length > 0) {
            try {
              await client.setFieldLocations(field.id, locations);
            } catch (e) {
              throw new Error(`field ${field.id} was created, but setting its locations failed: ${(e as Error).message}. Run get-field ${field.id} and set the locations again; do not create the field twice.`);
            }
            const back = await client.getFieldLocations(field.id);
            console.log(`locations read back: ${(back.locations ?? []).length}`);
          }
        }
```

(The client is now built once, before the dry run, because the dry run prints the team id; `createFrontdoorClient` reads credentials but sends nothing.) Remove the old `if (folder === undefined) throw new Error("--folder is required");` line. Update the `describe` text: `"create a dropdown custom field at a folder or at locations read with get-field (Frontdoor); a dry run unless --yes"`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/clickup-client && pnpm vitest run` and `cd packages/cli && pnpm vitest run src/clickup` and `pnpm exec tsc --noEmit -p tsconfig.build.json`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/clickup-client/src packages/cli/src/clickup/create-field.ts packages/cli/src/clickup/create-field.test.ts
git commit -m "feat(dgs-600): let create-field place a field at locations read with get-field"
```

### Task 8: Whole-suite check and the post-merge setup

This task has two parts. Part A runs on the branch. Part B runs only after the merge to `main`, the push and the plugin/CLI build of the main checkout (the global `dg` runs `packages/cli/dist` of the main checkout), and only with the conductor's go. Part B is live ClickUp writes through `dg`, each with a dry run first.

**Files:**
- No code. Part B writes a short setup log into the board folder: `.digismith/board/DGS-600—ready-scheduled-starters/setup.md`.

**Interfaces:**
- Produces: in ClickUp, the statuses `scheduled` and `ready` in space `1301150000001271`; the field `Mode` at the same locations as `Sign-off`; the new DGS-488 text. DGS-601 needs all three.

- [ ] **Step A1: Whole suites**

Run: `cd packages/clickup-client && pnpm test`, `cd packages/cli && pnpm test && pnpm exec tsc --noEmit -p tsconfig.build.json`, `pnpm vitest run scripts/nexus-api` (repo root), `cd scripts/nexus-web && pnpm test`.
Expected: all PASS.

- [ ] **Step A2: Strip-types smoke**

Run: `cd packages/cli && node --experimental-strip-types src/index.ts clickup get-field --help && node --experimental-strip-types src/index.ts autonomous scan --help`
Expected: both print help, no syntax error.

- [ ] **Step B1: Statuses** (after merge; conductor's go)

```bash
dg clickup add-status --space 1301150000001271 --name scheduled --type custom --color '#0091ff' --after refinement
dg clickup add-status --space 1301150000001271 --name ready --type custom --color '#2ecd6f' --after 'to do'
```

Read the printed set: the order must be `… refinement, scheduled, to do, ready, in progress …`. Then the same two commands with `--yes`. Read back: `dg autonomous scan --dry-run --repo ~/Workspace/Jazurite/DigiSmith` must not print `no-starter-status`. Write to no ticket here.

- [ ] **Step B2: Where Sign-off lives**

```bash
dg clickup get-field 9f85d93c-4b42-42e6-96d3-9d1891ab1592
```

Write each printed location as `<parent.type>:<parent.id>` into `setup.md`. If the answer has no `locations` key or no `parent.type` number, stop and tell the conductor: the Mode location is then not known and nothing is guessed.

- [ ] **Step B3: Mode field**

```bash
dg clickup create-field --name Mode --option 'Autonomous:#2ecd6f' --option 'Manual:#e67e22' --description 'Who carries the ticket through: Autonomous (DigiSmith on its own) or Manual (Jack). Sign-off says who accepts.' --location <each location from B2>
```

Check the dry run (body has `team_id`, options in order Autonomous, Manual), then run it again with `--yes`. Check `locations read back` equals the count from B2. Then `dg clickup get-task DGS-600 | jq '.custom_fields[] | select(.name=="Mode")'` shows the field with options orderindex 0 Autonomous, 1 Manual. Note the field id in `setup.md`.

- [ ] **Step B4: Lists without the new statuses**

List the lists of the space with `dg clickup get-lists --space 1301150000001271`. For each list, read one of its tickets with `dg clickup list-tasks --list <id>` and `dg clickup get-task <key>`; a list whose tickets cannot show `ready` keeps its own status set. A full check needs a status read per list, which `dg` has no command for: write in `setup.md` which lists were checked and how, and report any list without `ready`. Change nothing.

- [ ] **Step B5: DGS-488 status flow text**

```bash
W=$(mktemp -d) && dg clickup get-task DGS-488 --markdown | jq -r .markdown_description > "$W/dgs-488.md"
```

Change only these parts, word for word:
1. The `refinement` row, column "Leaves when": `Jack approves -> to do, ready or scheduled`.
2. Replace the `to do` row with three rows:
   - `scheduled` | parked until "Scheduled at" (date and time, UTC+7) | `dg autonomous schedule-release` (Nexus, every 5 min) | Scheduled at is past: Mode Autonomous -> `ready`, Mode Manual -> `to do`
   - `to do` | attended starter: approved, spec and plan on the ticket; Jack starts and observes it | Jack | Jack starts the build
   - `ready` | unattended starter: approved, spec and plan on the ticket, Mode Autonomous | Lights-Out picks up any ticket in `ready`, in rank order (night or away) | a build starts
3. The sentence "Two human gates: refinement -> to do (always Jack)" becomes "Two human gates: refinement -> to do, ready or scheduled (always Jack)".
4. The sentence "The Definition of Ready therefore includes "plan written"." becomes "The Definition of Ready therefore includes "plan written" and "Mode set" (Autonomous for ready)."
5. The Roles row "Lights-Out engine | picks to do tickets in rank order | touches anything not to do" becomes "Lights-Out engine | picks ready tickets in rank order | touches anything not ready".
6. Under "Statuses in the space", add one line: "Added 2026-10-24 (DGS-600): scheduled (after refinement), ready (after to do). Field Mode (Autonomous, Manual)."

Then:

```bash
dg clickup update-task --task DGS-488 --markdown-description-file "$W/dgs-488.md"
dg clickup get-task DGS-488 --markdown | jq -r .markdown_description | diff "$W/dgs-488.md" -
```

Expected: no diff, or only whitespace ClickUp normalises. Any other difference: stop and report.

- [ ] **Step B6: Commit the setup log**

```bash
git add ".digismith/board/DGS-600—ready-scheduled-starters/setup.md"
git commit -m "docs(dgs-600): add the setup log"
```

Then tell the conductor to update the untracked conductor runbook section "Autonomous order" (it names `to do`); the worker does not edit that file.
