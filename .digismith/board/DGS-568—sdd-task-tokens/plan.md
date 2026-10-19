# SDD Task Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every plan task of an SDD build gets its tokens in `tokens.json`, and a build that skips the build skills still gets an `implementation` step.

**Architecture:** The ledger parser accepts a note after the agent id (cause 1). Two new registry marks, `task_start` and `task_end`, give each task a time window; `buildSnapshot` tags a record by its ledger agent id first, then by the window (cause 2). A worker session that only wrote a `finishing` end mark has its earlier records counted as `implementation`, and `bootstrap`/`init` open `implementation` when a plan already exists (cause 3).

**Tech Stack:** TypeScript (Node 24, `--experimental-strip-types`), vitest, markdown skills. pnpm only.

Spec: `.digismith/board/DGS-568—sdd-task-tokens/design.html` (approved at checkpoint 1, 2026-10-19).

## How the build runs (role mode)

The build runs with `DIGISMITH_REVIEW_MODE=role` (runbook, "Start of a Reviewer"). The Builder never reviews and never dispatches a reviewer. A conductor starts each Reviewer from the pack.

- Each task below is one commit with a small diff, so each task review stays small. Task 6 is skill text only; Tasks 1 to 5 each carry their own tests.
- After each task the Builder runs `scripts/review-package`, then `dg reviewer pack --type task ...`, and reports `STOP: task-review-ready <pack folder>`.
- `<KEY>` for every pack is `DGS-568`, from the `**Key:**` line of the ticket's `ticket.md`. The Reviewer takes it from the `ticket:` line of `pack.md`.
- Tasks 1 to 5 change `packages/cli/src` only; the SDD marks in Tasks 6 to 8 only matter once Tasks 2 and 3 exist, so keep the order.

**Files touched (and the DGS-570 overlap).** DGS-570 builds first and edits only the "Role Mode (a herdr Builder)" section of `skills/subagent-driven-development/SKILL.md`, plus `skills/report-implementation/SKILL.md`, `skills/reviewer/SKILL.md` and `packages/cli/src/reviewer/sdd.test.ts`. This plan edits the same SDD file in other sections only (Setup is untouched; "Task Loop" step 1 and step 5; "Final Review"). DGS-568 merges after DGS-570: rebase the branch on main before the final review pack, and re-run `pnpm vitest run packages/cli/src/tokens` after the rebase.

| File | Task |
|---|---|
| `packages/cli/src/tokens/ledger.ts`, `ledger.test.ts` | 1 |
| `packages/cli/src/tokens/types.ts`, `registry.ts`, `registry.test.ts` | 2 |
| `packages/cli/src/tokens/entry.ts`, `entry.test.ts` | 3 |
| `packages/cli/src/tokens/snapshot.ts`, `snapshot.test.ts`, `README.md` | 4 |
| `packages/cli/src/tokens/types.ts`, `snapshot.ts`, `snapshot.test.ts`, `README.md` | 5 |
| `skills/subagent-driven-development/SKILL.md` | 6 |
| `skills/executing-plans/SKILL.md` | 7 |
| `skills/bootstrap/SKILL.md`, `skills/init/SKILL.md` | 8 |

## After the merge, and first use

- **A change under `packages/cli/src` needs the main checkout's dist rebuilt after the merge.** In the main checkout (`/Users/workbox/Workspace/Jazurite/DigiSmith`, not the worktree): `pnpm --filter @digismith/cli build`. Then `dg tokens --help` still prints.
- The skills call `entry.ts` from the depot clone, not from the repo: `~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts`. Run `digismith:depot` "update" (pull the clone) after the merge, so `task-start` exists there before any build uses the new skill text. Check: `node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts task-start --ticket X` prints `missing --task`, not `unknown subcommand`.
- Post-finish hooks 01 to 03 run as usual (version bump, plugin reinstall, history). No cache flush.
- **First use:** the next SDD build in role mode after the merge. Check its `tokens.json`: every plan task present under `tasks`, and the tasks' share of the implementation step's output well above 34%. Do not mark DGS-568 done on tests alone: the sign-off is Auto, but "done" waits for this check (Maestro rule: merge, push, first use verified).

## Global Constraints

- pnpm only. Never npm.
- TypeScript style of `packages/cli/src/tokens/`: `.ts` import suffixes, double quotes, two-space indent, `node:` imports, no new dependency.
- `tokens.json` stays `schema_version: 1`. The `tasks` shape stays `task id → model → Counts`.
- A record is counted in at most one task.
- Task ids match `^[A-Za-z0-9_-]+$` (`1`, `12`, `final`).
- A token command that fails or warns never blocks a build (skill text says so; the CLI exits 1 on a usage error, as `step-start` does).
- No message text is read or printed. Counts and ids only.
- Skill text: short plain sentences. Times UTC+7 first when a skill prints a time. No AI attribution in commits.
- Run tests with `pnpm vitest run packages/cli/src/tokens` from the repo root.

---

### Task 1: The ledger parser accepts a note after the agent id

**Files:**
- Modify: `packages/cli/src/tokens/ledger.ts`
- Test: `packages/cli/src/tokens/ledger.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseTaskAgents(ledgerText: string): Record<string, string[]>` (same signature). A line `Task <id>: dispatch <role> agent=<agentId>` gives `<agentId>` to task `<id>`, with or without text after the id. `<agentId>` matches `[A-Za-z0-9_-]+`.

- [ ] **Step 1: Write the failing tests**

Add inside `describe("parseTaskAgents", ...)` in `ledger.test.ts`:

```ts
  it("reads the agent id when a note follows it", () => {
    const text = [
      "Task 1: dispatch implementer agent=a32df36e0289500f4 (mechanical-tier offload unavailable)",
      "Task 2: dispatch implementer agent=a99ffa9025700b79d (base 47badfb)",
      "Task 2: dispatch task-reviewer agent=a1391313bd322afcb (head 3c32731)",
      "Task final: dispatch fix agent=a25508789c9547a44 (one fix wave, base 7f4bce6)",
    ].join("\n");
    expect(parseTaskAgents(text)).toEqual({
      "1": ["a32df36e0289500f4"],
      "2": ["a99ffa9025700b79d", "a1391313bd322afcb"],
      final: ["a25508789c9547a44"],
    });
  });
  it("skips a dispatch line with no agent id and keeps the id clean of the note", () => {
    const text = ["Task final: dispatch final-reviewer (opus)", "Task 3: dispatch implementer agent=a777(base abc1234)"].join("\n");
    expect(parseTaskAgents(text)).toEqual({});
  });
```

The second case pins the rule: the note must be separated from the id by whitespace, so `a777(base abc1234)` is not an id.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/tokens/ledger.test.ts`
Expected: the first new test FAILS (`{}` instead of the map). The second passes already.

- [ ] **Step 3: Write the minimal implementation**

In `ledger.ts` replace the regex line:

```ts
    const m = /^Task (\S+): dispatch \S+ agent=([A-Za-z0-9_-]+)(?:\s.*)?$/.exec(line.trim());
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/tokens/ledger.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Replay check on DGS-560 (counts and ids only)**

Write this script to a scratch file outside the repo (the session's scratchpad folder), then run it from the repo root with `node --experimental-strip-types <scratch file>`. It reads the dispatch lines the DGS-560 Builder wrote, from its transcript, and prints how many tasks and agents the parser now finds. Change the import path to the absolute path of `packages/cli/src/tokens/ledger.ts`.

```ts
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseTaskAgents } from "<absolute path>/packages/cli/src/tokens/ledger.ts";

const root = join(homedir(), ".claude", "projects");
const dir = readdirSync(root).find((d) => readdirSync(join(root, d)).some((f) => f.startsWith("da0aef87")))!;
const file = readdirSync(join(root, dir)).find((f) => f.startsWith("da0aef87") && f.endsWith(".jsonl"))!;
const lines = new Set<string>();
for (const raw of readFileSync(join(root, dir, file), "utf-8").split("\n")) {
  for (const m of raw.matchAll(/Task [0-9a-z]+: dispatch [a-z-]+ agent=[A-Za-z0-9_-]+(?: \([^)'"\\]{0,60}\))?/g)) lines.add(m[0]);
}
const map = parseTaskAgents([...lines].join("\n"));
console.log(Object.keys(map).length, "tasks,", new Set(Object.values(map).flat()).size, "agents");
```

Expected: `7 tasks, 14 agents` (tasks 1 to 6 and `final`). Before the fix the real ledger lines gave 2 tasks. If the transcript is gone, say so in the report and skip this step. Do not commit the script.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/tokens/ledger.ts packages/cli/src/tokens/ledger.test.ts
git commit -m "fix(tokens): the ledger parser reads an agent id that has a note after it"
```

---

### Task 2: Task marks in the registry types and reader

**Files:**
- Modify: `packages/cli/src/tokens/types.ts` (the `RegistryEntry` union)
- Modify: `packages/cli/src/tokens/registry.ts` (`isEntry`)
- Test: `packages/cli/src/tokens/registry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: two `RegistryEntry` members, `{ kind: "task_start"; ticket: string; task: string; session_id: string; ts: string }` and `{ kind: "task_end"; ... same fields }`. `createDepotRegistry().read` returns them when `task` is a string matching `^[A-Za-z0-9_-]+$`, and drops any other `task_start`/`task_end` line like other bad lines. Exported from `registry.ts`: `isTaskId(value: string): boolean`, the same pattern, for Task 3.

- [ ] **Step 1: Write the failing test**

Add to `registry.test.ts`, inside the existing `describe` that holds the other reader tests (use the same `reg`/`dir` setup its neighbours use):

```ts
  it("reads task marks and drops a task mark with a bad task id", () => {
    const dir = mkdtempSync(join(tmpdir(), "reg-"));
    const reg = createDepotRegistry(dir);
    reg.append({ kind: "task_start", ticket: "DGS-1", task: "12", session_id: "s1", ts: "2026-10-10T01:00:00Z" });
    reg.append({ kind: "task_end", ticket: "DGS-1", task: "final", session_id: "s1", ts: "2026-10-10T02:00:00Z" });
    appendFileSync(
      join(dir, "DGS-1.jsonl"),
      ['{"kind":"task_start","ticket":"DGS-1","task":"a b","session_id":"s1","ts":"t"}', '{"kind":"task_end","ticket":"DGS-1","session_id":"s1","ts":"t"}'].join("\n") + "\n",
    );
    expect(reg.read("DGS-1").map((e) => e.kind)).toEqual(["task_start", "task_end"]);
  });
```

Check the file's existing imports (`mkdtempSync`, `tmpdir`, `join`, `appendFileSync`); add any that are missing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/cli/src/tokens/registry.test.ts`
Expected: FAIL (a type error on `kind: "task_start"`, or `read` returns `[]`).

- [ ] **Step 3: Write the minimal implementation**

In `types.ts`, add two members to `RegistryEntry`:

```ts
  | { kind: "task_start"; ticket: string; task: string; session_id: string; ts: string }
  | { kind: "task_end"; ticket: string; task: string; session_id: string; ts: string };
```

(Move the final `;` to the last member.) In `registry.ts`, add above `isEntry`:

```ts
const TASK_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isTaskId(value: string): boolean {
  return TASK_PATTERN.test(value);
}
```

and inside `isEntry`, after the `step_start`/`step_end` line:

```ts
  if (e.kind === "task_start" || e.kind === "task_end") return typeof e.task === "string" && isTaskId(e.task);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/tokens/registry.test.ts`
Expected: PASS. Then `pnpm vitest run packages/cli/src/tokens` stays green (a union change can break a `switch`; fix any compile error there).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/types.ts packages/cli/src/tokens/registry.ts packages/cli/src/tokens/registry.test.ts
git commit -m "feat(tokens): the registry holds task start and task end marks"
```

---

### Task 3: `entry.ts task-start` and `task-end`

**Files:**
- Modify: `packages/cli/src/tokens/entry.ts`
- Test: `packages/cli/src/tokens/entry.test.ts`

**Interfaces:**
- Consumes: `isTaskId` from `registry.ts` (Task 2); the `task_start`/`task_end` entry shape.
- Produces: `entry.ts task-start --ticket <K> --task <id> [--session-id <sid>]` and `entry.ts task-end ...`. Each appends one entry with the live session id, exits 0, and prints a warning only when there is no session id. `task-start` appends nothing when the latest task mark of this session is a `task_start` for the same task. A bad `--task` exits 1 with `tokens: invalid --task <value>`. A missing `--task` exits 1 with `tokens: missing --task`.

- [ ] **Step 1: Write the failing tests**

Add inside `describe("entry.ts", ...)` in `entry.test.ts` (it already has `fixture`, `run`, `lines`):

```ts
  it("task-start and task-end append task marks for the session", () => {
    const f = fixture();
    const base = ["--ticket", "T-1", "--task", "3", "--session-id", "sess-1"];
    expect(run(["task-start", ...base], f).status).toBe(0);
    expect(run(["task-end", ...base], f).status).toBe(0);
    expect(lines(f.registry).map((l) => [l.kind, l.task, l.session_id])).toEqual([
      ["task_start", "3", "sess-1"],
      ["task_end", "3", "sess-1"],
    ]);
  });

  it("task-start skips a start that is already open for the same task", () => {
    const f = fixture();
    const start = (task: string) => run(["task-start", "--ticket", "T-1", "--task", task, "--session-id", "sess-1"], f);
    start("3");
    start("3");
    expect(lines(f.registry)).toHaveLength(1);
    start("4");
    start("3");
    expect(lines(f.registry).map((l) => l.task)).toEqual(["3", "4", "3"]);
  });

  it("task-start rejects a missing or malformed --task", () => {
    const f = fixture();
    const noTask = run(["task-start", "--ticket", "T-1", "--session-id", "sess-1"], f);
    expect(noTask.status).toBe(1);
    expect(noTask.stderr).toContain("missing --task");
    const bad = run(["task-start", "--ticket", "T-1", "--task", "a b", "--session-id", "sess-1"], f);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("invalid --task");
    expect(lines(f.registry)).toHaveLength(0);
  });

  it("task-start with no session id records nothing and exits 0", () => {
    const f = fixture();
    const r = run(["task-start", "--ticket", "T-1", "--task", "3"], f);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("no usable session id");
    expect(lines(f.registry)).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/tokens/entry.test.ts`
Expected: the four new tests FAIL (`unknown subcommand task-start`).

- [ ] **Step 3: Write the minimal implementation**

In `entry.ts`: import `isTaskId` (change the registry import to `import { createDepotRegistry, isTaskId } from "./registry.ts";`). Add beside `stepFlag`:

```ts
function taskFlag(flags: Record<string, string>): string {
  const task = need(flags, "task");
  if (!isTaskId(task)) throw new UsageError(`invalid --task ${task}`);
  return task;
}
```

Add a case before `snapshot`:

```ts
    case "task-start":
    case "task-end": {
      const ticket = need(flags, "ticket");
      const task = taskFlag(flags);
      const id = liveSession(cmd, flags);
      if (!id) return;
      if (cmd === "task-start") {
        let latest: { kind: string; task?: string; ts: string } | undefined;
        for (const e of registry.read(ticket)) {
          if ((e.kind === "task_start" || e.kind === "task_end") && e.session_id === id && (!latest || e.ts >= latest.ts)) latest = e;
        }
        if (latest?.kind === "task_start" && latest.task === task) return;
      }
      registry.append({ kind: cmd === "task-start" ? "task_start" : "task_end", ticket, task, session_id: id, ts: new Date().toISOString() });
      return;
    }
```

Update the default message: `unknown subcommand ${cmd ?? "(none)"} (session, step-start, step-end, task-start, task-end, snapshot, task-tokens)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/tokens/entry.test.ts`
Expected: PASS, with the older entry tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/entry.ts packages/cli/src/tokens/entry.test.ts
git commit -m "feat(tokens): entry.ts task-start and task-end write task marks"
```

---

### Task 4: Tag a record by its task window

**Files:**
- Modify: `packages/cli/src/tokens/snapshot.ts`
- Modify: `packages/cli/src/tokens/README.md` (a short "Task tagging" section)
- Test: `packages/cli/src/tokens/snapshot.test.ts`

**Interfaces:**
- Consumes: `task_start`/`task_end` entries (Task 2); `taskAgents` from `parseTaskAgents` (Task 1).
- Produces: `taskForRecord(record: UsageRecord, entries: RegistryEntry[]): string | null` (exported). It looks only at entries of the record's own session: `task_start`, `task_end` and `step_end` of `implementation`. The latest such entry at or before the record's time decides: a `task_start` gives its task, anything else gives `null`. Entries with an unparseable `ts`, and a record with an unparseable `ts`, count as no window. At the same instant an end sorts before a start; otherwise file order is kept. `buildSnapshot` tags each registered or inferred record with at most one task: the ledger match on `agent_id` first, else `taskForRecord`.

- [ ] **Step 1: Write the failing tests**

Add to `snapshot.test.ts` (import `taskForRecord` next to `buildSnapshot, stepForRecord`):

```ts
describe("taskForRecord", () => {
  const t = (kind: "task_start" | "task_end", task: string, ts: string, session_id = "s1"): RegistryEntry => ({ kind, ticket: "T-1", task, session_id, ts });
  const impl = (kind: "step_start" | "step_end", ts: string): RegistryEntry => ({ kind, ticket: "T-1", step: "implementation", session_id: "s1", ts });
  const list = [t("task_start", "1", "2026-10-10T01:00:00Z"), t("task_end", "1", "2026-10-10T02:00:00Z"), t("task_start", "2", "2026-10-10T03:00:00Z")];

  it("returns the task whose window holds the record", () => {
    expect(taskForRecord(rec({ ts: "2026-10-10T01:30:00Z" }), list)).toBe("1");
    expect(taskForRecord(rec({ ts: "2026-10-10T04:00:00Z" }), list)).toBe("2");
  });
  it("returns null before the first window, between windows and for another session", () => {
    expect(taskForRecord(rec({ ts: "2026-10-10T00:30:00Z" }), list)).toBeNull();
    expect(taskForRecord(rec({ ts: "2026-10-10T02:30:00Z" }), list)).toBeNull();
    expect(taskForRecord(rec({ session_id: "s9", ts: "2026-10-10T01:30:00Z" }), list)).toBeNull();
  });
  it("closes a window at the next task_start, at step_end implementation and at the same instant", () => {
    const next = [t("task_start", "1", "2026-10-10T01:00:00Z"), t("task_start", "2", "2026-10-10T02:00:00Z")];
    expect(taskForRecord(rec({ ts: "2026-10-10T02:30:00Z" }), next)).toBe("2");
    const stepEnd = [t("task_start", "final", "2026-10-10T01:00:00Z"), impl("step_end", "2026-10-10T02:00:00Z")];
    expect(taskForRecord(rec({ ts: "2026-10-10T01:30:00Z" }), stepEnd)).toBe("final");
    expect(taskForRecord(rec({ ts: "2026-10-10T02:30:00Z" }), stepEnd)).toBeNull();
    const same = [t("task_start", "2", "2026-10-10T02:00:00Z"), t("task_end", "1", "2026-10-10T02:00:00Z"), t("task_start", "1", "2026-10-10T01:00:00Z")];
    expect(taskForRecord(rec({ ts: "2026-10-10T02:00:00.500Z" }), same)).toBe("2");
  });
  it("ignores an entry with a bad ts and gives null for a record with a bad ts", () => {
    const bad = [t("task_start", "1", "2026-10-10T01:00:00Z"), t("task_end", "1", "garbage")];
    expect(taskForRecord(rec({ ts: "2026-10-10T01:30:00Z" }), bad)).toBe("1");
    expect(taskForRecord(rec({ ts: "" }), bad)).toBeNull();
  });
  it("does not treat step_start of implementation as a window mark", () => {
    expect(taskForRecord(rec({ ts: "2026-10-10T01:30:00Z" }), [impl("step_start", "2026-10-10T01:00:00Z")])).toBeNull();
  });
});

describe("buildSnapshot task windows", () => {
  const worker: RegistryEntry = { kind: "session", ticket: "T-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T00:59:00Z" };
  const marks: RegistryEntry[] = [
    worker,
    { kind: "task_start", ticket: "T-1", task: "1", session_id: "s1", ts: "2026-10-10T01:00:00Z" },
    { kind: "task_end", ticket: "T-1", task: "1", session_id: "s1", ts: "2026-10-10T02:00:00Z" },
  ];
  it("tags a main-thread record by window and a ledger agent by the ledger, each once", () => {
    const snap = buildSnapshot({
      ticket: "T-1", generatedAt: "t", entries: marks, inferredSessions: [],
      taskAgents: { "7": ["a1"] },
      records: [
        rec({ ts: "2026-10-10T01:10:00Z", output: 10 }),
        rec({ ts: "2026-10-10T01:20:00Z", agent_id: "a1", output: 20 }),
        rec({ ts: "2026-10-10T01:30:00Z", agent_id: "a2", output: 30 }),
        rec({ ts: "2026-10-10T02:30:00Z", output: 40 }),
      ],
    });
    expect(snap.tasks["1"]["claude-opus-5-5"]).toMatchObject({ output: 40, responses: 2 });
    expect(snap.tasks["7"]["claude-opus-5-5"]).toMatchObject({ output: 20, responses: 1 });
    expect(Object.keys(snap.tasks).sort()).toEqual(["1", "7"]);
  });
  it("leaves an unregistered session out of the tasks", () => {
    const snap = buildSnapshot({ ticket: "T-1", generatedAt: "t", entries: marks, inferredSessions: [], records: [rec({ session_id: "s9", ts: "2026-10-10T01:10:00Z" })] });
    expect(snap.tasks).toEqual({});
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/tokens/snapshot.test.ts`
Expected: FAIL (`taskForRecord` is not exported).

- [ ] **Step 3: Write the minimal implementation**

In `snapshot.ts`, add after `stepForRecord`:

```ts
// A task window opens at task_start and closes at task_end, the next task_start, or the end of the
// implementation step. Same rules as stepForRecord: own session only, parsed instants, an end sorts
// before a start at the same instant.
export function taskForRecord(record: UsageRecord, entries: RegistryEntry[]): string | null {
  const at = Date.parse(record.ts);
  if (Number.isNaN(at)) return null;
  const own = entries
    .filter((e) => e.session_id === record.session_id && (e.kind === "task_start" || e.kind === "task_end" || (e.kind === "step_end" && e.step === "implementation")))
    .map((e, order) => ({ e, t: Date.parse(e.ts), order }))
    .filter((x) => !Number.isNaN(x.t) && x.t <= at)
    .sort((a, b) => a.t - b.t || Number(b.e.kind !== "task_start") - Number(a.e.kind !== "task_start") || a.order - b.order);
  const last = own[own.length - 1]?.e;
  return last && last.kind === "task_start" ? last.task : null;
}

function ledgerTask(record: UsageRecord, taskAgents: Record<string, string[]> | undefined): string | null {
  if (!record.agent_id) return null;
  for (const [task, agents] of Object.entries(taskAgents ?? {})) if (agents.includes(record.agent_id)) return task;
  return null;
}
```

In `buildSnapshot` replace the `for (const [task, agents] ...)` loop with:

```ts
    const task = ledgerTask(record, input.taskAgents) ?? taskForRecord(record, input.entries);
    if (task) bump(tasks, task, record);
```

Add to `README.md`, before "Known limits", a section:

```md
## Task tagging

`tokens.json` `tasks` maps a plan task id to its counts. A response gets at most one task. First the SDD ledger: an `agent=<id>` on a `Task <N>: dispatch ...` line (text after the id is ignored). Then the task window: `entry.ts task-start --ticket K --task N` and `task-end` write `task_start`/`task_end` marks; a response of the same session inside a window belongs to that task. A window closes at `task_end`, at the next `task_start`, or at `step_end implementation`. The controller's own turns have no agent id; the window is what tags them. Output outside any window (setup, report, merge prep) stays in its step only.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/tokens`
Expected: PASS, including the older `buildSnapshot` test (its `task-1` ledger case still gives 20 output, because that session has no task marks).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/snapshot.ts packages/cli/src/tokens/snapshot.test.ts packages/cli/src/tokens/README.md
git commit -m "feat(tokens): tag a response by its task window when no ledger agent claims it"
```

---

### Task 5: Count a worker's records as `implementation` when no step was opened

**Files:**
- Modify: `packages/cli/src/tokens/types.ts` (`Snapshot`)
- Modify: `packages/cli/src/tokens/snapshot.ts`
- Modify: `packages/cli/src/tokens/README.md`
- Test: `packages/cli/src/tokens/snapshot.test.ts`

**Interfaces:**
- Consumes: `stepForRecord`, `buildSnapshot` (Task 4's file).
- Produces: `inferredStep(record: UsageRecord, entries: RegistryEntry[], registered: Map<string, Role>): Step | null` (exported). It returns `"implementation"` only when the record's session is a registered `worker`, has no `step_start` entry at all, has a `step_end` of `finishing` with a valid `ts`, and the record's time is at or before the earliest such `finishing` end. `Snapshot` gets an optional `inferred_steps?: Step[]`; `buildSnapshot` sets it (a list of the inferred steps used) only when at least one record was inferred, and counts such a record in `steps.implementation` instead of `steps.other`.

- [ ] **Step 1: Write the failing tests**

Add to `snapshot.test.ts` (import `inferredStep`; add `Role` to the type import from `./types.ts`):

```ts
describe("inferredStep", () => {
  const session = (role: Role): Map<string, Role> => new Map([["s1", role]]);
  const fin = (ts: string): RegistryEntry => ({ kind: "step_end", ticket: "T-1", step: "finishing", session_id: "s1", ts });
  const reg: RegistryEntry = { kind: "session", ticket: "T-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T00:59:00Z" };

  it("calls the records before a lone finishing end of a worker the implementation", () => {
    const list = [reg, fin("2026-10-10T02:00:00Z")];
    expect(inferredStep(rec({ ts: "2026-10-10T01:00:00Z" }), list, session("worker"))).toBe("implementation");
    expect(inferredStep(rec({ ts: "2026-10-10T02:00:00Z" }), list, session("worker"))).toBe("implementation");
    expect(inferredStep(rec({ ts: "2026-10-10T02:00:01Z" }), list, session("worker"))).toBeNull();
  });
  it("infers nothing when the session has any step_start, no finishing end, another role or a bad ts", () => {
    const started: RegistryEntry = { kind: "step_start", ticket: "T-1", step: "brainstorming", session_id: "s1", ts: "2026-10-10T00:30:00Z" };
    expect(inferredStep(rec({ ts: "2026-10-10T01:00:00Z" }), [reg, started, fin("2026-10-10T02:00:00Z")], session("worker"))).toBeNull();
    expect(inferredStep(rec({ ts: "2026-10-10T01:00:00Z" }), [reg], session("worker"))).toBeNull();
    expect(inferredStep(rec({ ts: "2026-10-10T01:00:00Z" }), [reg, fin("2026-10-10T02:00:00Z")], session("reviewer"))).toBeNull();
    expect(inferredStep(rec({ ts: "" }), [reg, fin("2026-10-10T02:00:00Z")], session("worker"))).toBeNull();
    expect(inferredStep(rec({ ts: "2026-10-10T01:00:00Z" }), [reg, fin("garbage")], session("worker"))).toBeNull();
  });
});

describe("buildSnapshot inferred steps", () => {
  it("counts the DGS-561 shape as implementation and says so", () => {
    const entries: RegistryEntry[] = [
      { kind: "session", ticket: "T-1", session_id: "s1", source: "claude-code", role: "worker", ts: "2026-10-10T00:59:00Z" },
      { kind: "step_end", ticket: "T-1", step: "finishing", session_id: "s1", ts: "2026-10-10T02:00:00Z" },
    ];
    const snap = buildSnapshot({
      ticket: "T-1", generatedAt: "t", entries, inferredSessions: [],
      records: [rec({ ts: "2026-10-10T01:00:00Z", output: 10 }), rec({ ts: "2026-10-10T03:00:00Z", output: 5 })],
    });
    expect(snap.steps.implementation["claude-opus-5-5"]).toMatchObject({ output: 10, responses: 1 });
    expect(snap.steps.other["claude-opus-5-5"]).toMatchObject({ output: 5, responses: 1 });
    expect(snap.inferred_steps).toEqual(["implementation"]);
  });
  it("leaves inferred_steps out when no step was inferred", () => {
    const snap = buildSnapshot({ ticket: "T-1", generatedAt: "t", entries: [], inferredSessions: [], records: [] });
    expect("inferred_steps" in snap).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/tokens/snapshot.test.ts`
Expected: FAIL (`inferredStep` is not exported).

- [ ] **Step 3: Write the minimal implementation**

In `types.ts`, add to `Snapshot` after `unattributed`:

```ts
  inferred_steps?: Step[]; // steps counted without a step_start mark; absent when none
```

In `snapshot.ts` (`Role` joins the existing type import), add after `taskForRecord`:

```ts
// A worker that never opened a step but closed "finishing" skipped the build skills (DGS-561). Its
// records up to that mark are the build, so they count as implementation, not other.
export function inferredStep(record: UsageRecord, entries: RegistryEntry[], registered: Map<string, Role>): Step | null {
  if (registered.get(record.session_id) !== "worker") return null;
  const at = Date.parse(record.ts);
  if (Number.isNaN(at)) return null;
  const own = entries.filter((e) => e.session_id === record.session_id);
  if (own.some((e) => e.kind === "step_start")) return null;
  const ends = own.flatMap((e) => (e.kind === "step_end" && e.step === "finishing" ? [Date.parse(e.ts)] : [])).filter((t) => !Number.isNaN(t));
  if (ends.length === 0) return null;
  return at <= Math.min(...ends) ? "implementation" : null;
}
```

In `buildSnapshot`: declare `const inferredSteps = new Set<Step>();` beside `steps`; replace `bump(steps, stepForRecord(record, input.entries), record);` with:

```ts
    let step = stepForRecord(record, input.entries);
    if (step === "other") {
      const inferredFor = inferredStep(record, input.entries, registered);
      if (inferredFor) {
        step = inferredFor;
        inferredSteps.add(inferredFor);
      }
    }
    bump(steps, step, record);
```

and add to the returned object: `...(inferredSteps.size > 0 ? { inferred_steps: [...inferredSteps] } : {}),`.

Add one paragraph to `README.md` under "Task tagging" (rename the section "Task tagging and inferred steps"):

```md
A worker session with no `step_start` and a `step_end finishing` (a build that never opened a build skill) has its responses up to that end counted as `implementation`. The snapshot then lists `inferred_steps: ["implementation"]`. The field is absent otherwise.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/tokens` then `pnpm --filter @digismith/cli exec tsc -p tsconfig.build.json --noEmit`
Expected: tests PASS; tsc prints no error.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/types.ts packages/cli/src/tokens/snapshot.ts packages/cli/src/tokens/snapshot.test.ts packages/cli/src/tokens/README.md
git commit -m "feat(tokens): a worker with no step marks but a finishing end counts as implementation"
```

---

### Task 6: SDD writes the task marks and allows a note on a dispatch line

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md` (Task Loop step 1, the dispatch bullet, Task Loop step 5, Final Review). **Do not edit "Role Mode (a herdr Builder)"**: DGS-570 owns it.

**Interfaces:**
- Consumes: `entry.ts task-start`/`task-end` (Task 3).
- Produces: SDD text that writes `task_start N` before BASE is recorded, `task_end N` after the `complete` line, `task_start final` at the head of Final Review and `task_end final` with the `step-end implementation` block.

- [ ] **Step 1: Read the anchors (they must exist exactly once)**

Run:

```bash
grep -n "Record BASE" skills/subagent-driven-development/SKILL.md
grep -n "After every dispatch, append" skills/subagent-driven-development/SKILL.md
grep -n "^### 5. Complete the task" skills/subagent-driven-development/SKILL.md
grep -n "^## Final Review" skills/subagent-driven-development/SKILL.md
grep -c "step --step implementation\|--step implementation" skills/subagent-driven-development/SKILL.md
```

Expected: one line each, and the last count is `2` (the start block and the end block). If DGS-570 has merged, line numbers moved; match by text, not number.

- [ ] **Step 2: Mark the start of each task (Task Loop step 1)**

Replace the paragraph that starts `Record BASE (` with:

````markdown
Before the dispatch, mark the start of this task's window, then record BASE
(`git rev-parse HEAD`) — the review package and fix-round diffs need it:

```bash
node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts task-start --ticket <Key> --task <N>
```

`<N>` is the task's number in the plan. The window is how the counter tags your own turns
for this task (they carry no agent id). Same key rule as the start block. A warning or
non-zero exit never blocks the flow.
````

(Keep the original sentence's meaning: BASE is recorded before dispatching.)

- [ ] **Step 3: Allow a note on the dispatch line**

In the bullet `After every dispatch, append ...`, after the sentence `<agentId> is the agentId the Agent tool result returns.` add: `A short note may follow the id, in parentheses, for example (base 47badfb); the token counter reads the id and ignores the note. Put a space between the id and the note.`

- [ ] **Step 4: Mark the end of each task (step 5)**

In "### 5. Complete the task", after the two bullet forms of the `complete` line and before the next paragraph, add:

````markdown
Then mark the end of this task's window:

```bash
node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts task-end --ticket <Key> --task <N>
```

Same key rule as the start block.
````

- [ ] **Step 5: Mark the final review window**

At the top of `## Final Review`, before its first paragraph, add:

````markdown
Mark the start of the final review's window (role mode runs this line too; it replaces only the dispatch):

```bash
node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts task-start --ticket <Key> --task final
```

Same key rule as the start block.
````

Then, in the block that ends the step (`step-end ... --step implementation`), put this line directly above it:

````markdown
```bash
node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts task-end --ticket <Key> --task final
```
````

(One short sentence above the two blocks: "Close the final window, then the step.")

- [ ] **Step 6: Verify the text**

Run:

```bash
grep -c "task-start --ticket <Key> --task" skills/subagent-driven-development/SKILL.md
grep -c "task-end --ticket <Key> --task" skills/subagent-driven-development/SKILL.md
git diff --stat
git diff -- skills/subagent-driven-development/SKILL.md | grep '^[-+]' | grep -i "Role Mode" | head
```

Expected: `2`, `2`, only `skills/subagent-driven-development/SKILL.md` changed, and the last command prints nothing (no line of the Role Mode section touched).

- [ ] **Step 7: Commit**

```bash
git add skills/subagent-driven-development/SKILL.md
git commit -m "feat(sdd): SDD marks each task's window and allows a note on the dispatch line"
```

---

### Task 7: `executing-plans` marks each task's window

**Files:**
- Modify: `skills/executing-plans/SKILL.md`

**Interfaces:**
- Consumes: `entry.ts task-start`/`task-end` (Task 3).
- Produces: a `task-start` mark at step 1 ("Mark as in_progress") and a `task-end` mark at step 7 ("Mark as completed") of each task.

- [ ] **Step 1: Edit the task loop**

In the numbered list under "For each task:", change item 1 and item 7 to:

```markdown
1. Mark as in_progress, and mark the start of the task's window:
   `node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts task-start --ticket <Key> --task <N>`
```

```markdown
7. Mark as completed, and mark the end of the task's window:
   `node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts task-end --ticket <Key> --task <N>`
```

Directly after the list add: `<N>` is the task's number in the plan. Same key rule as the start block. A warning or non-zero exit never blocks the flow.`

- [ ] **Step 2: Verify**

Run: `grep -c "task-start --ticket <Key> --task <N>\|task-end --ticket <Key> --task <N>" skills/executing-plans/SKILL.md`
Expected: `2`. `git diff --stat` shows this file only.

- [ ] **Step 3: Commit**

```bash
git add skills/executing-plans/SKILL.md
git commit -m "feat(executing-plans): mark each task's window for the token counter"
```

---

### Task 8: A ticket that starts with a plan opens `implementation`

**Files:**
- Modify: `skills/bootstrap/SKILL.md` (sub-step 2.9 and the Quick Reference row 2.9)
- Modify: `skills/init/SKILL.md` (Step 0, item 2, the resume block)

**Interfaces:**
- Consumes: `entry.ts session`, `step-start`.
- Produces: with a ticket key and a `plan.md` already in the ticket's board folder inside the worktree, `bootstrap` runs `step-start --step implementation` instead of `--step brainstorming`; `init`'s resume block also runs `step-start --step implementation` after `session`. (The spec said `init` or `adopt`. `adopt` already does this. The gap is `bootstrap`, which `init` dispatches to on the base branch, and the resume block of `init`.)

- [ ] **Step 1: Edit `bootstrap` sub-step 2.9**

Replace the second command and the paragraph after the code block so the step reads:

````markdown
   ```bash
   node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts session --ticket <Key> --role worker
   node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts step-start --ticket <Key> --step <step>
   ```

   `<step>` is `implementation` when `.digismith/board/<Key>—<slug>/plan.md` (or
   `.digismith/docs/<slug>/plan.md`) already exists in the worktree (a plan or a plan
   pointer written before the Builder started), else `brainstorming`. A Builder that
   starts from a plan and never opens a build skill still gets an open step this way.

   No tracker key (a `ticket: false` profile and no key evident) → skip,
   silently. A non-zero exit or a warning never blocks the ticket flow
   (same disposition as Step 1.5's missing transcript).
````

Update the Quick Reference row `2.9` to say `step-start --step <step>` (`implementation` when a plan already exists, else `brainstorming`).

- [ ] **Step 2: Edit `init` Step 0, item 2**

After the `session --ticket <Key> --role worker` command block in the "Exists" branch, add a second block and one sentence:

````markdown
     ```bash
     node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts step-start --ticket <Key> --step implementation
     ```

     The plan exists, so the resumed session's work is the build. The command skips a
     repeat of an open step. Same skip rule as above: no key → skip; a non-zero exit or
     warning never blocks.
````

(Place it before "Then read `profile` from `.digismith/config.yml`".)

- [ ] **Step 3: Verify**

Run:

```bash
grep -n "step-start --ticket <Key> --step" skills/bootstrap/SKILL.md skills/init/SKILL.md
git diff --stat
```

Expected: bootstrap shows `--step <step>`, init shows `--step implementation`; only these two files changed.

- [ ] **Step 4: Run the whole token test folder once more**

Run: `pnpm vitest run packages/cli/src/tokens packages/cli/src/reviewer`
Expected: PASS. (`reviewer` is included because DGS-570 adds `sdd.test.ts` there; if it reads the SDD file, this proves Tasks 6 did not break it.)

- [ ] **Step 5: Commit**

```bash
git add skills/bootstrap/SKILL.md skills/init/SKILL.md
git commit -m "feat(init): a ticket that starts with a plan opens the implementation step"
```

---

## Self-review (spec coverage)

| Spec item | Task |
|---|---|
| A. parser accepts a trailing note; SDD dispatch bullet mentions the note | 1, 6 |
| B. `task_start`/`task_end` kinds, commands, window tagging, ledger wins, one task per record | 2, 3, 4 |
| B. SDD and `executing-plans` write the marks; `final` window | 6, 7 |
| C. plan-exists step at the source | 8 |
| C. safety net and `inferred_steps` | 5 |
| Tests (ledger, snapshot, entry, registry), replay check | 1 to 5 |
| First use after the merge; dist rebuild; depot pull | "After the merge, and first use" |
| Out of scope (reviewer tokens per task, Maestro windows, prices, subtasks) | no task, on purpose |

Names checked across tasks: `isTaskId` (2, 3), `taskForRecord` (4), `inferredStep` (5), `ledgerTask` (4), `inferred_steps` (5), `task_start`/`task_end` with field `task` (2, 3, 4), commands `task-start`/`task-end` (3, 6, 7).
