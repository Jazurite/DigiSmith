# DGS-564 Steward start date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Steward leaves a sane start date on a ticket at `started`, and `merged` never stops on ClickUp's ITEM_238.

**Architecture:** All changes are in `packages/cli/src/steward/event.ts`. `pendingOf` decides the dates of a move from the snapshot. `write()` sends them and reads back. A queued write is recomputed from the fresh snapshot at retry. The ClickUp setting "Reschedule dependencies" stays ON: the Steward fixes dates only inside its own events and runs no timer or watcher.

**Tech Stack:** TypeScript (node `--experimental-strip-types`), vitest, pnpm.

## Global Constraints

- Spec: `.digismith/board/DGS-564—steward-start-date/design.html` (approved at checkpoint 1).
- "Today" is `todayUtc7(now)`, a `YYYY-MM-DD` string. Dates compare as strings.
- "Reschedule dependencies" stays ON. No code and no setting fights it between events. Only `started` and the done move (the move with `dueDate`) touch the start date.
- A start date earlier than today is kept.
- pnpm only, never npm. No change to any ClickUp setting.
- Tests: `pnpm --filter @digismith/cli exec vitest run src/steward/event.test.ts` (from the worktree root).
- Test clock: `NOW` in `event.test.ts` gives today = `2026-10-18`; "tomorrow" = `2026-10-19`.

## Role mode (how this plan is built)

The build runs with `DIGISMITH_REVIEW_MODE=role`: the Builder never reviews. After each task the Builder runs `scripts/review-package` and `dg reviewer pack --type task ...` and reports `STOP: task-review-ready <pack>`; a conductor starts the Reviewer. After the last task: `--type ticket`, `STOP: ticket-review-ready <pack>`.
- Each task below is one commit, so each review has a small diff file.
- `<KEY>` for every pack is the `**Key:**` line of `ticket.md`: `DGS-564`. The Reviewer reads it from the `ticket:` line of `pack.md`.
- Four tasks, none large; the tasks touch the same two files, so they run in order.

## After the merge (first use)

- The global `dg` is built from the main checkout. It runs the old Steward until it is rebuilt. After the merge and push, the conductor rebuilds the global `dg` from main (`pnpm --filter @digismith/cli build`, then the global install as the runbook says). Say it in the merge order.
- First use: the next dependent ticket that moves through `started` and done. Read its start and due date with `dg clickup get-task <KEY>`. Expected: start = the day the work began, start <= due. The ticket is not accepted until that check is made.

---

### Task 1: Replace a late start date at `started` and at done

**Files:**
- Modify: `packages/cli/src/steward/event.ts` (`pendingOf`, the pending loop in `apply`)
- Test: `packages/cli/src/steward/event.test.ts`

**Interfaces:**
- Consumes: `TicketSnapshot.startDate: string | null` (date-only, UTC+7); `todayUtc7(now)`.
- Produces: `lateStart(snap, today): boolean` (module-private, in `event.ts`). `pendingOf` sets `p.start = today` when the snapshot start is later than today and the move is `started` or has `dueDate`. The pending retry loop applies the same rule to a queued write (`p.due` set, or `p.to === "in progress"`).

- [ ] **Step 1: Write the failing tests** (add inside `describe("a start", ...)` and `describe("the three done paths", ...)`; add one in `describe("a failed write", ...)`)

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
  it("Auto: merged sends start = today with the due date when the start is later than today", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto", startDate: "2026-10-19" }));
    await run(t, { event: "merged", sha: "abc" });
    expect(t.calls).toEqual(["status:done", "dates:2026-10-18|2026-10-18"]);
    expect(t.ticket).toMatchObject({ status: "done", startDate: "2026-10-18", dueDate: "2026-10-18" });
  });
  it("Auto: merged keeps a start date earlier than today", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto", startDate: "2026-10-01" }));
    await run(t, { event: "merged", sha: "abc" });
    expect(t.calls).toEqual(["status:done", "dates:|2026-10-18"]);
    expect(t.ticket.startDate).toBe("2026-10-01");
  });
```
```ts
  it("a queued done move takes start = today when ClickUp shifted the start meanwhile", async () => {
    const t = new FakeTracker(snapshot("review", { signoff: "Auto" }));
    t.failWrites = 1;
    await run(t, { event: "merged", sha: "abc" });
    expect(readState(dir, "DGS-1")!.pending).toHaveLength(1);
    t.ticket.startDate = "2026-10-19";
    await run(t, { event: "merged", sha: "abc" });
    expect(t.ticket).toMatchObject({ status: "done", startDate: "2026-10-18", dueDate: "2026-10-18" });
    expect(readState(dir, "DGS-1")!.pending).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward/event.test.ts`
Expected: the four new tests FAIL (calls lack the start date).

- [ ] **Step 3: Implement**

In `event.ts`, above `pendingOf`:

```ts
/** A start date later than today. ClickUp's Reschedule dependencies moves a dependent's start to the day after its predecessor's due date. */
function lateStart(snap: TicketSnapshot, today: string): boolean {
  return snap.startDate !== null && snap.startDate > today;
}
```

Replace the body of `pendingOf` after `const p ...`:

```ts
  if (move.startDate && !st.start_written && !snap.startDate) p.start = today;
  if (move.dueDate) p.due = today;
  if ((move.startDate || move.dueDate) && lateStart(snap, today)) p.start = today;
  if (move.comment) p.comment = move.comment;
  return p;
```

In `apply`, inside the `for (const p of st.pending)` loop, right before `const res = await write(...)`:

```ts
    if (lateStart(snap, today) && (p.due || p.to === "in progress")) p.start = today;
```

- [ ] **Step 4: Run the full steward tests**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward`
Expected: all PASS (the old "keeps an existing start date" test still passes: 2026-10-01 is earlier than today).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward/event.ts packages/cli/src/steward/event.test.ts
git commit -m "fix(dgs-564): replace a start date later than today at started and done"
```

---

### Task 2: Read back and fix the start date after the `started` write

**Files:**
- Modify: `packages/cli/src/steward/event.ts` (`write`)
- Test: `packages/cli/src/steward/event.test.ts`

**Interfaces:**
- Consumes: `todayUtc7`, `lateStart` (Task 1), `Tracker.setDates`, `Tracker.getTicket`.
- Produces: in `write()`, for a move to `in progress`, one corrective `setDates({ start: today })` when the read-back start is missing or later than today. `st.start_written` is set to that day.

- [ ] **Step 1: Write the failing tests** (in `describe("a start", ...)`)

```ts
  it("fixes a start date that ClickUp sets itself on the status move", async () => {
    const t = new FakeTracker(snapshot("to do"));
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

In `write()`, replace `const back = await tracker.getTicket(ticket);` and the status check with:

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
(`back` is not used afterwards except by this block; keep the later lines unchanged.)

- [ ] **Step 4: Run the full steward tests**

Run: `pnpm --filter @digismith/cli exec vitest run src/steward`
Expected: all PASS. "keeps an existing start date" still expects only `status:in progress`.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/steward/event.ts packages/cli/src/steward/event.test.ts
git commit -m "fix(dgs-564): check the start date after the started write"
```

---

### Task 3: Retry once with start = due on ITEM_238

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

### Task 4: Document the rule

**Files:**
- Modify: `packages/cli/src/steward/README.md` (the event table row for `started`, and one short section)

**Interfaces:**
- Consumes: the behavior of Tasks 1 to 3.
- Produces: README text only.

- [ ] **Step 1: Edit the README**

Change the `started` row to `| started | to do | in progress (start date; a start later than today is replaced) |`. Add this section after the event table:

```markdown
## Dates and "Reschedule dependencies"

The ClickUp space setting "Reschedule dependencies" is ON. ClickUp can move the dates of a ticket that waits on another ticket, whenever the other ticket's dates change. The Steward does not fight this between events. It fixes dates only inside its own events:

- `started`: a start date later than today is replaced with today. A start date earlier than today is kept. After the write the Steward reads the ticket back and fixes a missing or late start once.
- Done move: the due date is today. A start date later than today is sent as today in the same write. If ClickUp still answers ITEM_238 (start after due), the Steward retries once with start = due.
- A queued move is recomputed from the fresh snapshot at the next event.
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

- Spec rule 1, check after the write -> Task 2. Rule 2, repair at a start event only -> Task 1 (no other event touches the start). Rule 3, merged never meets ITEM_238, recompute at retry -> Tasks 1 and 3. Rule 4, stuck tickets heal -> Task 1 (queued test) and Task 3. Dependents -> Task 1. Tests section -> the tests above. Out of scope (setting, timer) -> no task, by design.
- Names used in later tasks (`lateStart`, `setDatesOnce`, `PendingWrite`) are defined in the task that adds them. Task 2 uses `lateStart` from Task 1.
- Open risk named: a failed corrective write in Task 2 makes `write()` report failed after the status moved; the next event drops that queued move ("already there"), so the repair is lost for that ticket. It is a double failure; the next `started`-like fix is a hand `dg clickup update-task`.
