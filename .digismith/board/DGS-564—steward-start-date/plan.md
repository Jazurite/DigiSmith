# DGS-564 Steward start date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Steward leaves a sane start date on a ticket at `started`, and `merged` never stops on ClickUp's ITEM_238.

**Architecture:** All changes are in `packages/cli/src/steward/event.ts`. At the top of `apply`, at every event, the Steward repairs the dates from the snapshot it already read (`repairedStart`). `pendingOf` fixes a late start inside the `started` move. `write()` reads back after `started`. A last-resort retry answers ITEM_238. The ClickUp setting "Reschedule dependencies" stays ON: the Steward fixes dates only inside its own events and runs no timer or watcher.

**Tech Stack:** TypeScript (node `--experimental-strip-types`), vitest, pnpm.

## Global Constraints

- Spec: `.digismith/board/DGS-564—steward-start-date/design.html` (approved at checkpoint 1).
- "Today" is `todayUtc7(now)`, a `YYYY-MM-DD` string. Dates compare as strings.
- "Reschedule dependencies" stays ON. No timer, no watcher: the repair runs only inside an event, at every event, even when the status is already there (Maestro, checkpoint 2).
- Repair rules: in progress or later (not discarded or Closed): start later than today becomes today; on done or documented, start later than due becomes due. A missing start date is repaired only by `started`.
- A start date earlier than today is kept.
- pnpm only, never npm. No change to any ClickUp setting.
- Tests: `pnpm --filter @digismith/cli exec vitest run src/steward/event.test.ts` (from the worktree root).
- Test clock: `NOW` in `event.test.ts` gives today = `2026-10-18`; "tomorrow" = `2026-10-19`.

## Role mode (how this plan is built)

The build runs with `DIGISMITH_REVIEW_MODE=role`: the Builder never reviews. After each task the Builder runs `scripts/review-package` and `dg reviewer pack --type task ...` and reports `STOP: task-review-ready <pack>`; a conductor starts the Reviewer. After the last task: `--type ticket`, `STOP: ticket-review-ready <pack>`.
- Each task below is one commit, so each review has a small diff file.
- `<KEY>` for every pack is the `**Key:**` line of `ticket.md`: `DGS-564`. The Reviewer reads it from the `ticket:` line of `pack.md`.
- Five tasks, none large; they touch the same two files, so they run in order.

## After the merge (first use)

- The global `dg` is built from the main checkout. It runs the old Steward until it is rebuilt (`dist` rebuild). The merge order includes it: after merge and push, in the main checkout, `pnpm --filter @digismith/cli build`, then refresh the global `dg` as the runbook says.
- Check the rebuild: the global `dist/steward/event.js` contains `could not repair the start date` (`grep -l "could not repair the start date" ~/Library/pnpm/global/v11/*/node_modules/@digismith/cli/dist/steward/event.js`). A dry run does not run the repair, so it proves nothing here.
- First use: the next dependent ticket that moves through `started` and done. Read its start and due date with `dg clickup get-task <KEY>`. Expected: start = the day the work began, start <= due. The ticket is not accepted until that check is made.

---

### Task 1: Repair the dates at every event

**Files:**
- Modify: `packages/cli/src/steward/event.ts` (new `repairedStart`, top of `apply`)
- Test: `packages/cli/src/steward/event.test.ts`

**Interfaces:**
- Consumes: `TicketSnapshot { status, startDate, dueDate }`; `todayUtc7(now)`; `Tracker.setDates`.
- Produces: `repairedStart(snap: TicketSnapshot, today: string): string | null` (module-private): the start date to write, or `null` for no repair. `apply` calls it right after the first `getTicket`, before the pending loop and `evaluate`, for every event. A failed repair is a warning, never an error.

- [ ] **Step 1: Write the failing tests** (a new `describe` in `event.test.ts`, after `describe("a start", ...)`)

```ts
describe("the dates repair at every event", () => {
  it("status already there, start still late: repaired", async () => {
    const t = new FakeTracker(snapshot("in progress", { startDate: "2026-10-19" }));
    const lines = await run(t, { event: "started" });
    expect(t.calls).toEqual(["dates:2026-10-18|"]);
    expect(t.ticket.startDate).toBe("2026-10-18");
    expect(lines.join("\n")).toContain("start date 2026-10-19 -> 2026-10-18");
    const s = readState(dir, "DGS-1")!;
    expect(s.start_written).toBe("2026-10-18");
    expect(s.log.at(-1)?.outcome).toBe("noop");
  });
  it("a record-only event in review repairs a late start", async () => {
    const t = new FakeTracker(snapshot("review", { startDate: "2026-10-19" }));
    await run(t, { event: "merged", sha: "abc" });
    expect(t.calls).toEqual(["dates:2026-10-18|"]);
  });
  it("a refused event still repairs", async () => {
    const t = new FakeTracker(snapshot("review", { startDate: "2026-10-19" }));
    const lines = await run(t, { event: "started" });
    expect(lines.join("\n")).toMatch(/refused started/);
    expect(t.ticket.startDate).toBe("2026-10-18");
  });
  it("done with a start after the due date: start = due", async () => {
    const t = new FakeTracker(snapshot("done", { startDate: "2026-10-19", dueDate: "2026-10-17" }));
    await run(t, { event: "documented" });
    expect(t.calls).toEqual(["dates:2026-10-17|", "status:documented"]);
    expect(t.ticket.startDate).toBe("2026-10-17");
  });
  it("merged: a late start is put back before the due write", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto", startDate: "2026-10-19" }));
    await run(t, { event: "merged", sha: "abc" });
    expect(t.calls).toEqual(["dates:2026-10-18|", "status:done", "dates:|2026-10-18"]);
    expect(t.ticket).toMatchObject({ status: "done", startDate: "2026-10-18", dueDate: "2026-10-18" });
  });
  it("a queued done move heals: the start ClickUp shifted is repaired at the next event", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto" }));
    t.failWrites = 1;
    await run(t, { event: "merged", sha: "abc" });
    expect(readState(dir, "DGS-1")!.pending).toHaveLength(1);
    t.ticket.startDate = "2026-10-19";
    await run(t, { event: "merged", sha: "abc" });
    expect(t.ticket).toMatchObject({ status: "done", startDate: "2026-10-18", dueDate: "2026-10-18" });
    expect(readState(dir, "DGS-1")!.pending).toEqual([]);
  });
  it("leaves alone: a ticket in to do, a discarded one, an earlier start, a missing start", async () => {
    const early = new FakeTracker(snapshot("in progress", { startDate: "2026-10-01" }));
    await run(early, { event: "started" });
    expect(early.calls).toEqual([]);
    const missing = new FakeTracker(snapshot("in progress"));
    await run(missing, { event: "started" });
    expect(missing.calls).toEqual([]);
    const todo = new FakeTracker(snapshot("to do", { startDate: "2026-10-19" }));
    await run(todo, { event: "review-started" });
    expect(todo.calls).toEqual([]);
    const gone = new FakeTracker(snapshot("discarded", { startDate: "2026-10-19" }));
    await run(gone, { event: "discard" });
    expect(gone.calls).toEqual([]);
  });
  it("a failed repair is a warning and the event still applies", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto", startDate: "2026-10-19" }));
    const original = t.setDates.bind(t);
    t.setDates = async (k, d) => { if (!d.due) throw new Error("boom"); await original(k, d); };
    const lines = await run(t, { event: "merged", sha: "abc" });
    expect(lines.join("\n")).toMatch(/could not repair the start date \(boom\)/);
    expect(t.ticket.status).toBe("done");
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward/event.test.ts`
Expected: the new tests FAIL, except "leaves alone", which already passes.

- [ ] **Step 3: Implement**

In `event.ts`, above `pendingOf`:

```ts
const REPAIRED_IN = ["in progress", "review", "acceptance", "release", "done", "documented"];
const DONE_LIKE = ["done", "documented"];

/** The start date to write, or null. A start later than today becomes today (ClickUp's Reschedule dependencies moves a dependent's start to the day after its predecessor's due date). On done, a start later than the due date becomes the due date. A missing start is not repaired here. */
function repairedStart(snap: TicketSnapshot, today: string): string | null {
  if (snap.startDate === null || !REPAIRED_IN.includes(snap.status)) return null;
  let start = snap.startDate;
  if (start > today) start = today;
  if (DONE_LIKE.includes(snap.status) && snap.dueDate !== null && start > snap.dueDate) start = snap.dueDate;
  return start === snap.startDate ? null : start;
}
```

In `apply`, right after `const st = loadState(deps, ticket, snap);` and before the `// Writes that failed earlier` comment:

```ts
  // Dates first, at every event: ClickUp may have moved them since the last one.
  const fixed = repairedStart(snap, today);
  if (fixed !== null) {
    try {
      await tracker.setDates(ticket, { start: fixed });
      out.push(`steward: ${ticket}: start date ${snap.startDate} -> ${fixed}`);
      snap = { ...snap, startDate: fixed };
      st.start_written = fixed;
    } catch (err) {
      warn.push(`steward: ${ticket}: could not repair the start date (${(err as Error).message}); will retry at the next event`);
    }
  }
```

- [ ] **Step 4: Run the full steward tests**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward`
Expected: all PASS. If an old test now shows a repair line, its snapshot had a late start; fix that test's data, not the rule.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward/event.ts packages/cli/src/steward/event.test.ts
git commit -m "fix(dgs-564): repair the dates at every Steward event"
```

---

### Task 2: Replace a late start inside the `started` move

**Files:**
- Modify: `packages/cli/src/steward/event.ts` (`lateStart`, `pendingOf`, the pending loop in `apply`)
- Test: `packages/cli/src/steward/event.test.ts`

**Interfaces:**
- Consumes: `TicketSnapshot.startDate`, `todayUtc7`.
- Produces: `lateStart(snap: TicketSnapshot, today: string): boolean` (module-private). A ticket in `to do` is outside Task 1's repair, so the `started` move carries the fix: `pendingOf` sets `p.start = today` when the snapshot start is later than today, and the pending loop does the same for a queued move to `in progress`.

- [ ] **Step 1: Write the failing tests** (in `describe("a start", ...)` and `describe("a failed write", ...)`)

```ts
  it("replaces a start date later than today (a dependent ClickUp moved)", async () => {
    const t = new FakeTracker(snapshot("to do", { startDate: "2026-10-19" }));
    await run(t, { event: "started" });
    expect(t.calls).toEqual(["status:in progress", "dates:2026-10-18|"]);
    expect(t.ticket.startDate).toBe("2026-10-18");
    expect(readState(dir, "DGS-1")!.start_written).toBe("2026-10-18");
  });
```
```ts
  it("a queued start takes start = today when ClickUp shifted the start meanwhile", async () => {
    const t = new FakeTracker(snapshot("to do", { startDate: "2026-10-01" }));
    t.failWrites = 1;
    await run(t, { event: "started" });
    expect(readState(dir, "DGS-1")!.pending).toHaveLength(1);
    t.ticket.startDate = "2026-10-19";
    await run(t, { event: "review-started" });
    expect(t.ticket).toMatchObject({ status: "review", startDate: "2026-10-18" });
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward/event.test.ts`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement**

In `event.ts`, above `pendingOf`:

```ts
function lateStart(snap: TicketSnapshot, today: string): boolean {
  return snap.startDate !== null && snap.startDate > today;
}
```

In `pendingOf`, after the `if (move.startDate && !st.start_written && !snap.startDate) p.start = today;` line add:

```ts
  if (move.startDate && lateStart(snap, today)) p.start = today;
```

In the `for (const p of st.pending)` loop of `apply`, right before `const res = await write(...)`:

```ts
    if (p.to === "in progress" && lateStart(snap, today)) p.start = today;
```

- [ ] **Step 4: Run the full steward tests**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward`
Expected: all PASS. "keeps an existing start date" (2026-10-01) still expects only `status:in progress`.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward/event.ts packages/cli/src/steward/event.test.ts
git commit -m "fix(dgs-564): replace a late start date inside the started move"
```

---

### Task 3: Read back and fix the start date after the `started` write

**Files:**
- Modify: `packages/cli/src/steward/event.ts` (`write`)
- Test: `packages/cli/src/steward/event.test.ts`

**Interfaces:**
- Consumes: `todayUtc7`, `lateStart` (Task 2), `Tracker.setDates`, `Tracker.getTicket`.
- Produces: in `write()`, for a move to `in progress`, one corrective `setDates({ start: today })` when the read-back start is missing or later than today. A failure of that write is treated as a failed write (the move is queued); a lost repair also heals at the next event by Task 1.

- [ ] **Step 1: Write the failing tests** (in `describe("a start", ...)`)

```ts
  it("fixes a start date that ClickUp sets itself on the status move", async () => {
    const t = new FakeTracker(snapshot("to do", { startDate: "2026-10-01" })); // no own start write, so only the read-back can catch it
    const original = t.setStatus.bind(t);
    t.setStatus = async (k, s) => { await original(k, s); t.ticket.startDate = "2026-10-19"; };
    await run(t, { event: "started" });
    expect(t.ticket).toMatchObject({ status: "in progress", startDate: "2026-10-18" });
    expect(readState(dir, "DGS-1")!.start_written).toBe("2026-10-18");
  });
  it("writes the start date when it is missing after the move", async () => {
    const t = new FakeTracker(snapshot("to do", { startDate: "2026-10-01" }));
    const original = t.setStatus.bind(t);
    t.setStatus = async (k, s) => { await original(k, s); t.ticket.startDate = null; };
    await run(t, { event: "started" });
    expect(t.ticket.startDate).toBe("2026-10-18");
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward/event.test.ts`
Expected: the two new tests FAIL (start stays 2026-10-19 / null).

- [ ] **Step 3: Implement**

In `write()`, replace `const back = await tracker.getTicket(ticket);` and the status check below it with:

```ts
    let back = await tracker.getTicket(ticket);
    if (back.status !== p.to) return { ok: false, kind: "failed", message: `read back shows "${back.status}", wanted "${p.to}"` };
    const today = todayUtc7(now);
    if (p.to === "in progress" && (back.startDate === null || lateStart(back, today))) {
      await tracker.setDates(ticket, { start: today });
      p.start = today;
      back = await tracker.getTicket(ticket);
    }
```

- [ ] **Step 4: Run the full steward tests**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward/event.ts packages/cli/src/steward/event.test.ts
git commit -m "fix(dgs-564): check the start date after the started write"
```

---

### Task 4: Retry once with start = due on ITEM_238

**Files:**
- Modify: `packages/cli/src/steward/event.ts` (`write`)
- Test: `packages/cli/src/steward/event.test.ts`

**Interfaces:**
- Consumes: `Tracker.setDates(key, { start?, due? })`.
- Produces: `setDatesOnce(tracker, ticket, p): Promise<void>` (module-private). It sends `p.start`/`p.due`. If ClickUp answers an error whose message contains `ITEM_238` and `p.due` is set, it sends `{ start: p.due, due: p.due }` once and sets `p.start = p.due`. Any other error is thrown as before.

- [ ] **Step 1: Write the failing test** (in `describe("the three done paths", ...)`)

```ts
  it("Auto: merged retries once with start = due when ClickUp says ITEM_238", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto", startDate: "2026-10-01" }));
    const original = t.setDates.bind(t);
    t.setDates = async (k, d) => {
      if (!d.start && d.due) { t.calls.push("dates-refused"); throw new Error('Request failed with status code 400: {"ECODE":"ITEM_238"}'); }
      await original(k, d);
    };
    await run(t, { event: "merged", sha: "abc" });
    expect(t.calls).toEqual(["status:done", "dates-refused", "dates:2026-10-18|2026-10-18"]);
    expect(t.ticket).toMatchObject({ status: "done", startDate: "2026-10-18", dueDate: "2026-10-18" });
    expect(readState(dir, "DGS-1")!.pending).toEqual([]);
  });
  it("a date error that is not ITEM_238 still queues the move", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto" }));
    t.setDates = async () => { throw new Error("boom"); };
    await run(t, { event: "merged", sha: "abc" });
    expect(readState(dir, "DGS-1")!.pending).toHaveLength(1);
  });
```

- [ ] **Step 2: Run to see the first fail**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward/event.test.ts`
Expected: the ITEM_238 test FAILS (move stays pending). The second test already passes.

- [ ] **Step 3: Implement**

In `event.ts`, above `write`:

```ts
/** One date write. ClickUp's ITEM_238 (start after due) is answered once with start = due, so a done move is not left pending. */
async function setDatesOnce(tracker: Tracker, ticket: string, p: PendingWrite): Promise<void> {
  try {
    await tracker.setDates(ticket, { start: p.start, due: p.due });
  } catch (err) {
    if (!p.due || !(err as Error).message.includes("ITEM_238")) throw err;
    await tracker.setDates(ticket, { start: p.due, due: p.due });
    p.start = p.due;
  }
}
```

In `write()`, replace `if (p.start || p.due) await tracker.setDates(ticket, { start: p.start, due: p.due });` with:

```ts
    if (p.start || p.due) await setDatesOnce(tracker, ticket, p);
```

- [ ] **Step 4: Run the full steward tests**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward/event.ts packages/cli/src/steward/event.test.ts
git commit -m "fix(dgs-564): answer ITEM_238 at done with start = due"
```

---

### Task 5: Document the rule

**Files:**
- Modify: `packages/cli/src/steward/README.md` (the event table row for `started`, and one short section)

**Interfaces:**
- Consumes: the behavior of Tasks 1 to 4.
- Produces: README text only.

- [ ] **Step 1: Edit the README**

Change the `started` row to `| started | to do | in progress (start date; a start later than today is replaced) |`. Add this section after the event table:

```markdown
## Dates and "Reschedule dependencies"

The ClickUp space setting "Reschedule dependencies" is ON. ClickUp can move the dates of a ticket that waits on another ticket, whenever the other ticket's dates change. The Steward does not fight this between events: it has no timer and no watcher. It repairs dates inside its own events, at every event, from the snapshot it reads first, even when the status is already there:

- A ticket in progress or later (not discarded or Closed): a start date later than today becomes today.
- On done or documented: a start date later than the due date becomes the due date.
- A missing start date is written only by `started`. An earlier start date is kept.
- `started` also replaces a late start date and reads the ticket back once after its write.
- If ClickUp still answers ITEM_238 (start after due) on the done write, the Steward retries once with start = due.
- A failed repair is a warning. The next event repairs again.
```

- [ ] **Step 2: Check the whole package**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward` and `pnpm --filter @digismith/cli exec tsc -p tsconfig.build.json --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/steward/README.md
git commit -m "docs(dgs-564): document the Steward date rules"
```

---

## Self-review (spec coverage)

- Rule 1, read back after the write -> Task 3. Rule 2, repair at every event -> Task 1; the `started` move from `to do` -> Task 2. Rule 3, merged never meets ITEM_238 -> Task 1 (late start put back first) and Task 4 (last resort). Rule 4, stuck tickets heal -> Task 1 (queued test, "status already there" test). Dependents -> Task 2. Tests section -> the tests above. Out of scope (the setting, a timer) -> no task, by design.
- Names used in later tasks (`repairedStart`, `lateStart`, `setDatesOnce`, `PendingWrite`) are defined in the task that adds them. Task 3 uses `lateStart` from Task 2.
- The gap from the first draft (a lost repair after a failed corrective write) is closed by Task 1: the repair does not depend on the queued move, and the next event repairs again. A missing start date after a failed `started` fix stays missing (Task 1 does not write a missing start); a hand `dg clickup update-task --start-date` fixes it. That case needs two failures in a row.
