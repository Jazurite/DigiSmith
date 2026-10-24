# A Denied Permission Prompt Unblocks the Run (DGS-589) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run whose last event is a `permission_prompt` stops being `blocked` once herdr shows its pane as `idle`, `done` or `working` (the prompt was answered or denied).

**Architecture:** `classify` stays pure and gets a new last parameter, `agentStatus`. The watch pass already reads `herdr-ws pane list` once per workspace; `pane.ts` now keeps each pane's `agent_status` (a `Map`, was a `Set`) and `watch.ts` passes the run's pane status to `classify`. No hook, hooks.json or settings change.

**Tech Stack:** TypeScript under `node --experimental-strip-types` (Node 24), vitest, pnpm.

Spec: `.digismith/board/DGS-589—denied-prompt-unblocks/spec.md` (approved by the Maestro, 2026-10-24).

## Global Constraints

- Code in `packages/cli/src/` must run under `node --experimental-strip-types`: no parameter properties, no enums, no namespaces. Nexus jobs run the built CLI `dist/index.js`, so each task also runs `pnpm --filter @digismith/cli build` (tsc), which must pass. Vitest does not type-check.
- Fail safe: the run counts as answered ONLY when `agentStatus` is `idle`, `done` or `working` AND the last `permission_prompt` is at least 60 s old (`PROMPT_GRACE_MS = 60_000`). `blocked`, `unknown`, `null`, any other value, or a younger prompt: stay `blocked`.
- `idle_prompt` stays ignored: it is never blocked and never an answer (DGS-583 rule).
- A gone pane is still `lost` (checked before the blocked branch). Do not touch that.
- Do not edit `watch.ts` outside `paneCache`, `paneOf` (type only), the new `statusOf` and the one `classify(` call. DGS-598 edits `withEvents` and the code above the main loop in the same file, and adds `isWatched` to `watchdog.ts` after the `ended` check. Keep our hunks away from those lines.
- Do not touch `packages/cli/src/nightwatch/derive.ts` (it calls `classify(..., "unknown", ...)` with no status: unchanged on purpose), the hook, `hooks/hooks.json`, or any settings file.
- Tests use fakes only: no real herdr, no real ClickUp, no real depot (the watch tests use a temp dir already).
- No sudo, no LaunchAgent, no Caddy change, never touch the running API (port 4300), no delete outside the worktree.
- pnpm only; never `pnpm install` in the depot clone. Run tests from the worktree root: `pnpm vitest run <paths>`.
- Commits are title-only conventional commits with no AI attribution, made with a pathspec (`git commit -m "..." -- <paths>`).

## File Structure

| File | Change |
| --- | --- |
| `packages/cli/src/autonomous/watchdog.ts` | `ANSWERED_STATUSES`, `PROMPT_GRACE_MS`; new last param `agentStatus` on `classify`; the answered check |
| `packages/cli/src/autonomous/watchdog.test.ts` | New cases |
| `packages/cli/src/autonomous/pane.ts` | `PaneLookup` returns `Map<pane_id, agent_status> \| null` |
| `packages/cli/src/autonomous/pane.test.ts` | Map expectations, status parsing cases |
| `packages/cli/src/autonomous/watch.ts` | `paneCache` type, `statusOf`, pass the status to `classify` |
| `packages/cli/src/autonomous/watch.test.ts` | `present` helper builds a Map with statuses; new cases |
| `packages/cli/src/autonomous/WATCHDOG.md` | Document the rule (two lines) |

---

### Task 1: `classify` takes the herdr status

**Files:**
- Modify: `packages/cli/src/autonomous/watchdog.ts` (the `DEFAULT_BUDGETS` area at the top, the `classify` signature, the blocked branch)
- Test: `packages/cli/src/autonomous/watchdog.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export const ANSWERED_STATUSES: readonly string[]`, `export const PROMPT_GRACE_MS: number`, and `classify(run, events, pane, now, budgets, agentStatus: string | null = null): Verdict`. Task 3 passes the real status.

- [ ] **Step 1: Write the failing tests**

In `packages/cli/src/autonomous/watchdog.test.ts`, add this block after the `describe("classify", ...)` block's last `it` (before its closing `});`). The file's helpers `run()`, `ev(type, m, data?)` and `at(m)` are already there; `ev("blocked", m)` defaults to a `permission_prompt`.

```ts
  describe("DGS-589: herdr status answers a permission prompt", () => {
    // the prompt is at minute 1; now is minute 6, so it is 5 minutes old
    const prompt = () => [ev("started", 0), ev("blocked", 1)];
    const st = (status: string | null, events = prompt(), nowMin = 6) =>
      classify(run(), events, "present", at(nowMin), DEFAULT_BUDGETS, status);

    it("stays blocked when herdr says blocked, unknown, null or a value we do not know", () => {
      for (const s of ["blocked", "unknown", null, "weird", ""]) expect(st(s).state).toBe("blocked");
    });
    it("is healthy when herdr says idle, done or working", () => {
      for (const s of ["idle", "done", "working"]) expect(st(s)).toEqual({ state: "healthy", cause: "", since: "" });
    });
    it("no status argument behaves as null: stays blocked", () => {
      expect(classify(run(), prompt(), "present", at(6), DEFAULT_BUDGETS).state).toBe("blocked");
    });
    it("keeps the 60 s grace: done with a 30 s old prompt is still blocked, at 60 s it is healthy", () => {
      expect(st("done", prompt(), 1.5).state).toBe("blocked");
      expect(st("done", prompt(), 2).state).toBe("healthy");
    });
    it("a second permission_prompt is a new episode: blocked again with the new since", () => {
      const e = [ev("started", 0), ev("blocked", 1), ev("blocked", 8)];
      const v = st("blocked", e, 10);
      expect(v.state).toBe("blocked");
      expect(v.since).toBe(min(8));
      // a stale done right after the second prompt does not clear it (grace)
      expect(st("done", e, 8.5).state).toBe("blocked");
    });
    it("a gone pane is lost, even with status done", () => {
      expect(classify(run(), prompt(), "gone", at(6), DEFAULT_BUDGETS, "done").state).toBe("lost");
    });
    it("idle_prompt is no answer: permission_prompt then idle_prompt with a null status stays blocked", () => {
      const e = [ev("started", 0), ev("blocked", 1), ev("blocked", 2, { kind: "idle_prompt" })];
      expect(st(null, e, 6).state).toBe("blocked");
    });
    it("a healthy answer still meets the silence rule: done, but 30 min of silence is lost", () => {
      const v = st("done", prompt(), 1 + 30);
      expect(v.state).toBe("lost");
      expect(v.cause).toBe("silent-30-min");
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/autonomous/watchdog.test.ts`
Expected: FAIL. The `idle`/`done`/`working` and grace-at-2-minutes cases return `blocked`.

- [ ] **Step 3: Write the implementation**

In `packages/cli/src/autonomous/watchdog.ts`, add under `export const DEFAULT_BUDGETS ...`:

```ts
/** DGS-589: herdr agent_status values that mean the permission prompt is no longer waiting (answered or denied). Anything else keeps the run blocked. */
export const ANSWERED_STATUSES: readonly string[] = ["idle", "done", "working"];
/** A prompt younger than this is never called answered: herdr may lag behind the Notification hook. */
export const PROMPT_GRACE_MS = 60_000;
```

Change the signature and the blocked branch of `classify`. Replace

```ts
export function classify(run: RunRecord, events: EventLine[], pane: Pane, now: number, budgets: Budgets): Verdict {
```

with

```ts
export function classify(run: RunRecord, events: EventLine[], pane: Pane, now: number, budgets: Budgets, agentStatus: string | null = null): Verdict {
```

and replace

```ts
  if (lastBlocked >= 0 && !events.slice(lastBlocked + 1).some((e) => e.type === "tool" || e.type === "turn_end")) {
    return { state: "blocked", cause: "waiting-for-answer", since: events[lastBlocked].ts };
  }
```

with

```ts
  if (lastBlocked >= 0 && !events.slice(lastBlocked + 1).some((e) => e.type === "tool" || e.type === "turn_end")) {
    // A denial writes no event, so herdr's status for the pane is the only sign. Unsure means still blocked.
    const answered = agentStatus !== null && ANSWERED_STATUSES.includes(agentStatus) && now - ms(events[lastBlocked].ts) >= PROMPT_GRACE_MS;
    if (!answered) return { state: "blocked", cause: "waiting-for-answer", since: events[lastBlocked].ts };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/autonomous/watchdog.test.ts && pnpm --filter @digismith/cli build`
Expected: all PASS; the build passes.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(watchdog): a herdr status past blocked answers a permission prompt" -- packages/cli/src/autonomous/watchdog.ts packages/cli/src/autonomous/watchdog.test.ts
```

---

### Task 2: The pane lookup keeps each pane's status

**Files:**
- Modify: `packages/cli/src/autonomous/pane.ts` (the `PaneLookup` type and `herdrPaneLookup`)
- Modify: `packages/cli/src/autonomous/watch.ts` (one line: the `paneCache` type, so the build stays green)
- Modify: `packages/cli/src/autonomous/watch.test.ts` (the `present` helper only)
- Test: `packages/cli/src/autonomous/pane.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `export type PaneLookup = (workspace: string) => Promise<Map<string, string> | null>`. The map is `pane_id -> agent_status` (`"unknown"` when the pane has no string status). `null` still means herdr did not answer. Task 3 reads the map.

- [ ] **Step 1: Write the failing tests**

In `packages/cli/src/autonomous/pane.test.ts`, replace the first and third `it` of `describe("herdrPaneLookup")` and add one:

```ts
  it("returns pane ids with their agent_status", async () => {
    const lookup = herdrPaneLookup(async () => ({ code: 0, stdout: '{"result":{"panes":[{"pane_id":"w2:p1","agent_status":"blocked"},{"pane_id":"w2:p7P","agent_status":"done"}]}}' }));
    expect(await lookup("w2")).toEqual(new Map([["w2:p1", "blocked"], ["w2:p7P", "done"]]));
  });
  it("gives a pane with a missing or non-string agent_status the status unknown", async () => {
    const lookup = herdrPaneLookup(async () => ({ code: 0, stdout: '{"result":{"panes":[{"pane_id":"w2:p1"},{"pane_id":"w2:p2","agent_status":7},{"pane_id":"w2:p3","agent_status":null}]}}' }));
    expect(await lookup("w2")).toEqual(new Map([["w2:p1", "unknown"], ["w2:p2", "unknown"], ["w2:p3", "unknown"]]));
  });
  it("skips a pane entry without a string pane_id", async () => {
    const lookup = herdrPaneLookup(async () => ({ code: 0, stdout: '{"result":{"panes":[{"pane_id":"w2:p1","agent_status":"idle"},{},{"pane_id":null},{"pane_id":7}]}}' }));
    expect(await lookup("w2")).toEqual(new Map([["w2:p1", "idle"]]));
  });
```

(The old "returns the pane ids" and old "skips a pane entry" tests are replaced by the first and third above; keep the other tests as they are.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/autonomous/pane.test.ts`
Expected: FAIL. The lookup still returns a `Set`.

- [ ] **Step 3: Write the implementation**

`packages/cli/src/autonomous/pane.ts`: change the type line to

```ts
export type PaneLookup = (workspace: string) => Promise<Map<string, string> | null>;
```

Replace the body of the `try` in `herdrPaneLookup`:

```ts
      const j = JSON.parse(r.stdout) as { result?: { panes?: { pane_id?: unknown; agent_status?: unknown }[] } };
      const panes = j.result?.panes;
      if (!Array.isArray(panes)) return null;
      const out = new Map<string, string>();
      for (const p of panes) {
        if (typeof p?.pane_id === "string") out.set(p.pane_id, typeof p.agent_status === "string" ? p.agent_status : "unknown");
      }
      return out;
```

Also update the doc comment above it: `/** One read-only \`pane list\` per workspace: pane id -> agent_status. null means herdr did not answer, never "the pane is gone". */`

`packages/cli/src/autonomous/watch.ts`: change only this line

```ts
  const paneCache = new Map<string, Set<string> | null>();
```

to

```ts
  const paneCache = new Map<string, ReadonlyMap<string, string> | null>();
```

(`paneOf` keeps using `set.has(pane)`; a `Map` has `has`.)

`packages/cli/src/autonomous/watch.test.ts`: the tests keep `present` as a `Set<string> | null` of present panes. Add a status table and build the Map in `deps`. After `let present: Set<string> | null;` add:

```ts
let status: Map<string, string>; // pane -> herdr agent_status; a pane not listed reads "unknown", which keeps a prompt blocked
```

In `beforeEach`, after `present = new Set();` add `status = new Map();`. In `deps`, replace `panes: async () => present,` with:

```ts
  panes: async () => (present ? new Map([...present].map((p) => [p, status.get(p) ?? "unknown"] as [string, string])) : null),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/autonomous/pane.test.ts packages/cli/src/autonomous/watch.test.ts && pnpm --filter @digismith/cli build`
Expected: all PASS (the existing watch tests are unchanged in meaning: status `unknown` keeps a prompt blocked); the build passes.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(watchdog): the pane lookup keeps each pane's agent status" -- packages/cli/src/autonomous/pane.ts packages/cli/src/autonomous/pane.test.ts packages/cli/src/autonomous/watch.ts packages/cli/src/autonomous/watch.test.ts
```

---

### Task 3: The watch pass passes the status to `classify`

**Files:**
- Modify: `packages/cli/src/autonomous/watch.ts` (the `paneOf` area and the one `classify(` call)
- Modify: `packages/cli/src/autonomous/WATCHDOG.md` (line 10 and line 21)
- Test: `packages/cli/src/autonomous/watch.test.ts`

**Interfaces:**
- Consumes: `classify(..., agentStatus)` from Task 1; the `Map` lookup and the `status` test table from Task 2.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing tests**

In `packages/cli/src/autonomous/watch.test.ts`, add inside `describe("runWatch", ...)` after the test "closes the stalled item and opens a blocked one ...":

```ts
  describe("DGS-589: herdr status resolves a denied prompt", () => {
    // mk() puts the permission_prompt 5 minutes before NOW, past the 60 s grace
    const blockedRun = (): string => {
      present = new Set(["w2:DGS-1"]);
      return mk("DGS-1", "builder", 22, [[20, "started"], [5, "blocked"]]);
    };

    it("keeps the item open while herdr says blocked, resolves it once herdr says done", async () => {
      blockedRun();
      status.set("w2:DGS-1", "blocked");
      await runWatch(deps());
      expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
      const same = await runWatch(deps());
      expect(same.resolved).toBe(0);
      status.set("w2:DGS-1", "done");
      const r = await runWatch(deps());
      expect(r.resolved).toBe(1);
      expect(r.opened).toBe(0);
      expect(readOpen(dir)).toEqual([]);
    });

    it("opens a new item for a second permission_prompt after the first was resolved", async () => {
      const run = blockedRun();
      status.set("w2:DGS-1", "blocked");
      await runWatch(deps());
      status.set("w2:DGS-1", "done");
      await runWatch(deps());
      expect(readOpen(dir)).toEqual([]);
      addEvent(run, 0, "blocked", 3); // a new prompt at NOW, herdr shows blocked again
      status.set("w2:DGS-1", "blocked");
      const r = await runWatch(deps());
      expect(r.opened).toBe(1);
      expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
    });

    it("stays blocked when herdr does not answer (a null lookup)", async () => {
      blockedRun();
      status.set("w2:DGS-1", "blocked");
      await runWatch(deps());
      present = null; // herdr down: pane unknown, status unknown
      status.set("w2:DGS-1", "done");
      const r = await runWatch(deps());
      expect(r.resolved).toBe(0);
      expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
    });

    it("does not resolve while the pane is listed but its status is unknown", async () => {
      blockedRun();
      await runWatch(deps()); // no status set: reads "unknown"
      const r = await runWatch(deps());
      expect(r.resolved).toBe(0);
      expect(readOpen(dir).map((i) => i.kind)).toEqual(["blocked"]);
    });

    it("the DGS-583 guard holds: a resolved item is not reopened by the same prompt", async () => {
      blockedRun();
      status.set("w2:DGS-1", "blocked");
      await runWatch(deps());
      status.set("w2:DGS-1", "done");
      await runWatch(deps());
      const r = await runWatch(deps()); // a third pass with the same events
      expect(r.opened).toBe(0);
      expect(readOpen(dir)).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/autonomous/watch.test.ts`
Expected: FAIL. The first two new tests fail on `resolved` (the item stays open because `watch.ts` does not pass the status yet).

- [ ] **Step 3: Write the implementation**

In `packages/cli/src/autonomous/watch.ts`, directly after the `paneOf` definition (it ends with `return set ? (set.has(pane) ? "present" : "gone") : "unknown";\n  };`) add:

```ts
  // The herdr agent_status of a run's pane, from the same cached lookup; null when herdr or the pane is unknown.
  const statusOf = (ws: string | null, pane: string | null): string | null => {
    if (!ws || !pane) return null;
    return paneCache.get(ws)?.get(pane) ?? null;
  };
```

and replace the one call

```ts
    const v = classify(record, events, pane, nowMs, budgets);
```

with

```ts
    const v = classify(record, events, pane, nowMs, budgets, statusOf(record.herdr.workspace, record.herdr.pane));
```

In `packages/cli/src/autonomous/WATCHDOG.md` replace line 10

```
- `blocked`: the last `blocked` event has no later `tool` or `turn_end` event. A prompt waits for an answer.
```

with

```
- `blocked`: the last `permission_prompt` has no later `tool` or `turn_end` event, and herdr does not show the pane as answered. A prompt waits for an answer.
```

and replace line 21

```
3. A `blocked` event with nothing after it: `blocked`. This beats silence.
```

with

```
3. A `permission_prompt` with nothing after it: `blocked`. This beats silence. A denial writes no event, so herdr's `agent_status` for the run's pane decides: `idle`, `done` or `working`, with the prompt at least 60 s old, means answered. `blocked`, `unknown`, no status (herdr down, no pane) or a younger prompt stays `blocked`.
```

(If the line numbers differ in the file, match by the text.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/autonomous/ packages/cli/src/nightwatch/ && pnpm --filter @digismith/cli build`
Expected: all PASS; the build passes. `packages/cli/src/strip-types.smoke.test.ts` also passes (run it: `pnpm vitest run packages/cli/src/strip-types.smoke.test.ts`).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(watchdog): the watch pass resolves a blocked item when herdr shows the prompt answered" -- packages/cli/src/autonomous/watch.ts packages/cli/src/autonomous/watch.test.ts packages/cli/src/autonomous/WATCHDOG.md
```

---

### Task 4: First use (after the merge)

Run after the branch is merged and pushed and the built CLI is current. Nothing here changes code. A Builder that cannot do a step (no herdr tab, no free seat) says so in its report and does not mark the ticket verified.

**Files:** none.

**Interfaces:**
- Consumes: the merged watchdog.
- Produces: the first-use result for the ticket (written in the report).

- [ ] **Step 1: Open a throwaway run**

In a herdr tab, start a throwaway Claude session with a run id set (`DIGISMITH_RUN_ID=<id>`, a run created by `dg run start` with `--role scout` for a throwaway ticket key, so it does not touch DGS-589). Use the Maestro's S3b way of starting a worker if unsure. Use a haiku model and manual permission mode.

- [ ] **Step 2: A waiting prompt reads blocked and opens the item**

Ask the throwaway session to run a command that needs permission, and leave the prompt open for 90 s. Run:

```bash
HERDR_WS=<workspace> ~/.digismith-depot/bin/herdr-ws pane list
```

Expected: the pane's `agent_status` is `blocked`. Then run the watch pass the way Nexus does (`dg autonomous watch` through the built CLI `dist/index.js`, with the real depot, once). Expected: one `blocked` attention item for the throwaway run. If `agent_status` is not `blocked` here, the rule is wrong: stop and tell the Maestro.

- [ ] **Step 3: A denial resolves the item**

Answer "No" to the prompt. Wait 70 s (past the 60 s grace). Read `agent_status` again: expected `done`. Run the watch pass again. Expected: the item is resolved (`dg autonomous` attention list shows no open `blocked` item for that run), with the note "run is healthy again".

- [ ] **Step 4: A second prompt opens a new item**

Trigger a second permission prompt and leave it for 90 s; run the watch pass. Expected: a new `blocked` item. Answer or deny it and run the pass once more: expected, resolved.

- [ ] **Step 5: Clean up and report**

Leave the throwaway tab to the conductor (tab cleanup is automatic; never close or delete anything yourself). Resolve any attention item the throwaway left open with `dg` (never edit the attention file by hand). In the report, write the four results and the times in UTC+7 with UTC in brackets.
