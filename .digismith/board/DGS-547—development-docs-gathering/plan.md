# DGS-547 Build Record on the Ticket Implementation Plan

> DGS-534 (the record: report, review verdicts, ledger summary, tokens.json) is part of DGS-547.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach the spec, plan, reviews, ledger summary, report and tokens.json to the ClickUp ticket automatically, once each at its final moment, through one new `dg` command.

**Architecture:** One command `dg clickup attach-record` (file mode plus two render kinds). A pure decision function (`decideAttach`) compares the file's sha-256 with a depot state file and the task's current attachments, so a re-run adds nothing. A pure `renderLedgerSummary` builds the ledger summary. Skills get one hook line each, never blocking, the same rule as Hallmark.

**Tech Stack:** TypeScript (node `--experimental-strip-types`), yargs, vitest, `@digismith/clickup-client`. pnpm only.

## BLOCKER (the only one): build after DGS-551 merges

DGS-551 (the Steward event hooks, spec+plan in `.worktrees/dgs-551/.digismith/board/DGS-551—lifecycle-hooks-send-steward-its/`) edits the same skill files: `subagent-driven-development`, `report-implementation`, `finishing-a-development-branch`, `executing-plans`, `bootstrap`/`adopt`. Do not start Task 6 until DGS-551 is merged on main. Tasks 1-5 touch only `packages/` and may start earlier. If the build starts before the merge: rebase the build branch on main after DGS-551 lands, before Task 6, and re-read each skill before editing. Status moves follow SOP DGS-731 (F.9); skill text points there, never at DGS-488.

## Global Constraints

- ClickUp profile only; a non-`DGS-<n>` key prints `not a ClickUp key, skipped` and exits 0 (decision 4).
- Attachments, not description text. Hallmark's block is the only machine text in the description (decision 2).
- Never block a build: every hook failure prints a warning, appends `Attach record: failed (<first stderr line>)` to the ledger when one exists, and the step goes on (decision 3).
- Writes through `dg` only; no one-off script (decision 5).
- The command NEVER deletes an attachment. `superseded: <id>` goes to command output only, never a ticket comment (Maestro, checkpoint 1).
- Each file is attached ONCE at its final moment: spec.md at spec approval, plan.md at plan approval, reviews.md and ledger-summary.md before `rm -rf <workspace>`, report.html at report time, tokens.json at finish.
- Tests use mock clients and a temp `DIGISMITH_TOKEN_REGISTRY_DIR`; no live ClickUp call in the build. One live check by the conductor after merge.
- Spec deviation: `ClickUpTask.attachments` already exists (GET task), so no new client method; `attach-record` reads it through `getTaskByRef`.
- Commits: title-only conventional commits, no AI attribution, scope is the key (`dgs-547`) only on the build branch.

## File Structure

- Create `packages/cli/src/tokens/attachments-store.ts` (+ `.test.ts`): read and write `<registry dir>/<KEY>.attachments.json`.
- Create `packages/cli/src/clickup/attach-decision.ts` (+ `.test.ts`): pure `decideAttach`.
- Create `packages/cli/src/tokens/ledger-summary.ts` (+ `.test.ts`): pure `renderLedgerSummary`.
- Create `packages/cli/src/clickup/attach-record.ts` (+ `.test.ts`): the command.
- Modify `packages/cli/src/clickup/index.ts`: register it.
- Modify the six skills (Task 6) and create `packages/cli/src/clickup/attach-hooks.wiring.test.ts` (Task 7).

---

### Task 1: The attachment state store

**Files:**
- Create: `packages/cli/src/tokens/attachments-store.ts`
- Test: `packages/cli/src/tokens/attachments-store.test.ts`

**Interfaces:**
- Consumes: `depotRegistryDir()` and `TICKET_PATTERN` from `./registry.ts`.
- Produces: `export interface AttachedRecord { name: string; sha256: string; id: string; attached_at: string }`, `readAttached(ticket: string): AttachedRecord[]`, `recordAttached(ticket: string, rec: AttachedRecord): void` (the latest record per name wins; a torn or missing file reads as `[]`).

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAttached, recordAttached } from "./attachments-store.ts";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "att-")); process.env.DIGISMITH_TOKEN_REGISTRY_DIR = dir; });
afterEach(() => { delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR; rmSync(dir, { recursive: true, force: true }); });

describe("attachments-store", () => {
  it("reads [] when there is no file", () => { expect(readAttached("DGS-1")).toEqual([]); });
  it("keeps the latest record per name", () => {
    recordAttached("DGS-1", { name: "plan.md", sha256: "a", id: "1", attached_at: "t1" });
    recordAttached("DGS-1", { name: "plan.md", sha256: "b", id: "2", attached_at: "t2" });
    recordAttached("DGS-1", { name: "spec.md", sha256: "c", id: "3", attached_at: "t3" });
    expect(readAttached("DGS-1").map((r) => [r.name, r.id])).toEqual([["plan.md", "2"], ["spec.md", "3"]]);
  });
  it("reads [] from a torn file", () => {
    writeFileSync(join(dir, "DGS-2.attachments.json"), "{not json");
    expect(readAttached("DGS-2")).toEqual([]);
  });
  it("rejects a bad ticket key", () => { expect(() => readAttached("../x")).toThrow(/invalid ticket key/); });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/tokens/attachments-store.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TICKET_PATTERN, depotRegistryDir } from "./registry.ts";

export interface AttachedRecord { name: string; sha256: string; id: string; attached_at: string }

function fileFor(ticket: string): string {
  if (!TICKET_PATTERN.test(ticket)) throw new Error(`invalid ticket key: ${ticket}`);
  return join(depotRegistryDir(), `${ticket}.attachments.json`);
}

export function readAttached(ticket: string): AttachedRecord[] {
  try {
    const v = JSON.parse(readFileSync(fileFor(ticket), "utf8"));
    return Array.isArray(v) ? (v as AttachedRecord[]) : [];
  } catch (e) {
    if ((e as Error).message.startsWith("invalid ticket key")) throw e;
    return [];
  }
}

export function recordAttached(ticket: string, rec: AttachedRecord): void {
  const next = [...readAttached(ticket).filter((r) => r.name !== rec.name), rec];
  mkdirSync(depotRegistryDir(), { recursive: true });
  writeFileSync(fileFor(ticket), JSON.stringify(next, null, 2));
}
```

- [ ] **Step 4: Run to verify it passes** (same command). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/attachments-store.ts packages/cli/src/tokens/attachments-store.test.ts
git commit -m "feat(dgs-547): store what attach-record attached"
```

### Task 2: The decision function

**Files:**
- Create: `packages/cli/src/clickup/attach-decision.ts`
- Test: `packages/cli/src/clickup/attach-decision.test.ts`

**Interfaces:**
- Consumes: `AttachedRecord` (Task 1).
- Produces: `export type AttachDecision = { action: "skip"; reason: "unchanged" } | { action: "upload"; supersedes?: string; warn?: string }`; `decideAttach(a: { name: string; sha256: string; recorded: AttachedRecord[]; onTask: { id: string; title: string }[] }): AttachDecision`.

Rules: a record with the same name and sha whose id is still in `onTask` gives skip. A record with the same name and another sha gives upload with `supersedes: record.id`. No record but a same-title attachment on the task gives upload with `warn: "same-named attachment on the task is unknown to the depot"`. Otherwise upload.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { decideAttach } from "./attach-decision.ts";

const rec = (sha: string, id = "1") => ({ name: "plan.md", sha256: sha, id, attached_at: "t" });
describe("decideAttach", () => {
  it("skips an unchanged file still on the task", () => {
    expect(decideAttach({ name: "plan.md", sha256: "a", recorded: [rec("a")], onTask: [{ id: "1", title: "plan.md" }] })).toEqual({ action: "skip", reason: "unchanged" });
  });
  it("uploads again when the recorded copy is gone from the task", () => {
    expect(decideAttach({ name: "plan.md", sha256: "a", recorded: [rec("a")], onTask: [] }).action).toBe("upload");
  });
  it("names the superseded id when the content changed", () => {
    expect(decideAttach({ name: "plan.md", sha256: "b", recorded: [rec("a", "9")], onTask: [{ id: "9", title: "plan.md" }] })).toEqual({ action: "upload", supersedes: "9" });
  });
  it("warns on an unknown same-named attachment", () => {
    const d = decideAttach({ name: "plan.md", sha256: "b", recorded: [], onTask: [{ id: "5", title: "plan.md" }] });
    expect(d).toMatchObject({ action: "upload" });
    expect((d as { warn?: string }).warn).toMatch(/unknown to the depot/);
  });
  it("uploads a new name", () => {
    expect(decideAttach({ name: "spec.md", sha256: "a", recorded: [], onTask: [] })).toEqual({ action: "upload" });
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm --filter @digismith/cli exec vitest run src/clickup/attach-decision.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { AttachedRecord } from "../tokens/attachments-store.ts";

export type AttachDecision =
  | { action: "skip"; reason: "unchanged" }
  | { action: "upload"; supersedes?: string; warn?: string };

export function decideAttach(a: { name: string; sha256: string; recorded: AttachedRecord[]; onTask: { id: string; title: string }[] }): AttachDecision {
  const rec = a.recorded.find((r) => r.name === a.name);
  const live = rec !== undefined && a.onTask.some((t) => t.id === rec.id);
  if (rec && live && rec.sha256 === a.sha256) return { action: "skip", reason: "unchanged" };
  if (rec && live) return { action: "upload", supersedes: rec.id };
  if (!rec && a.onTask.some((t) => t.title === a.name)) return { action: "upload", warn: "same-named attachment on the task is unknown to the depot" };
  return { action: "upload" };
}
```

- [ ] **Step 4: Run to verify it passes.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/attach-decision.ts packages/cli/src/clickup/attach-decision.test.ts
git commit -m "feat(dgs-547): decide skip or upload for an attachment"
```

### Task 3: The ledger summary renderer

**Files:**
- Create: `packages/cli/src/tokens/ledger-summary.ts`
- Test: `packages/cli/src/tokens/ledger-summary.test.ts`

**Interfaces:**
- Produces: `renderLedgerSummary(progress: string): string` (markdown). Pure. Reads the grammar of `skills/subagent-driven-development/SKILL.md`: `# SDD ledger — plan: <path>` first line; `Review mode:`; `Task <N>: complete (...)`; `Task <N>: reviewed (...)`; `Task <N>: fix round ...`; `Task <N>: parked ...`; `Task <N>: tokens ...`; `Task stamp: ...`; `Final review (...)`; `Scoped re-review (...)`; `Final review: parked ...`; deferred-minor lines. Output: a title line, the plan path, then one markdown table row per task (Task, Delivered = the text inside `complete (...)`, Reviews = count and last verdict, Notes = parked or deferred lines), then a `Whole-branch review` section holding the `Final review`, `Scoped re-review` and parked lines verbatim. A task with no `complete` line shows `not completed`. Unknown lines are ignored. Pipes in cell text are escaped as `\|`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderLedgerSummary } from "./ledger-summary.ts";

const ledger = [
  "# SDD ledger — plan: .digismith/board/DGS-9—x/plan.md",
  "Review mode: hand",
  "Task 1: implemented",
  "Task 1: reviewed (clean)",
  "Task 1: complete (commits abc1234; added a|b)",
  "Task 2: reviewed (2 findings)",
  "Task 2: parked F1 minor: naming",
  "Final review (base aaa..bbb, opus): F1 minor naming",
  "Scoped re-review (fix base ccc..ddd, opus): clean",
].join("\n");

describe("renderLedgerSummary", () => {
  const out = renderLedgerSummary(ledger);
  it("names the plan", () => { expect(out).toContain("plan.md"); });
  it("has one row per task with the delivered text", () => {
    expect(out).toMatch(/\| 1 \| commits abc1234; added a\\\|b \| 1 review, last: clean \|/);
    expect(out).toMatch(/\| 2 \| not completed \| 1 review, last: 2 findings \| parked F1 minor: naming \|/);
  });
  it("keeps the whole-branch lines verbatim", () => {
    expect(out).toContain("Final review (base aaa..bbb, opus): F1 minor naming");
    expect(out).toContain("Scoped re-review (fix base ccc..ddd, opus): clean");
  });
  it("renders an empty ledger without throwing", () => { expect(renderLedgerSummary("")).toContain("No tasks recorded"); });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm --filter @digismith/cli exec vitest run src/tokens/ledger-summary.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
const cell = (s: string) => s.replace(/\|/g, "\\|");

export function renderLedgerSummary(progress: string): string {
  const lines = progress.split(/\r?\n/).map((l) => l.trim().replace(/^- /, ""));
  const plan = /^# .*plan: (.+)$/.exec(lines[0] ?? "")?.[1] ?? "unknown plan";
  const tasks = new Map<string, { delivered?: string; reviews: string[]; notes: string[] }>();
  const get = (id: string) => { let t = tasks.get(id); if (!t) tasks.set(id, (t = { reviews: [], notes: [] })); return t; };
  const whole: string[] = [];
  for (const l of lines) {
    const m = /^Task (\d+): (.*)$/.exec(l);
    if (m) {
      const t = get(m[1]);
      const complete = /^complete \((.*)\)$/.exec(m[2]);
      const reviewed = /^reviewed \((.*)\)$/.exec(m[2]);
      if (complete) t.delivered = complete[1];
      else if (reviewed) t.reviews.push(reviewed[1]);
      else if (/^parked|^deferred/.test(m[2])) t.notes.push(m[2]);
      continue;
    }
    if (/^(Final review|Scoped re-review)/.test(l)) whole.push(l);
  }
  const out = [`# Ledger summary`, ``, `Plan: ${plan}`, ``];
  if (tasks.size === 0) out.push("No tasks recorded.");
  else {
    out.push("| Task | Delivered | Reviews | Notes |", "| --- | --- | --- | --- |");
    for (const [id, t] of [...tasks].sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const rv = t.reviews.length === 0 ? "not recorded" : `${t.reviews.length} review${t.reviews.length === 1 ? "" : "s"}, last: ${t.reviews[t.reviews.length - 1]}`;
      out.push(`| ${id} | ${cell(t.delivered ?? "not completed")} | ${cell(rv)} | ${cell(t.notes.join("; "))} |`);
    }
  }
  if (whole.length > 0) out.push("", "## Whole-branch review", "", ...whole.map((w) => `- ${w}`));
  return out.join("\n") + "\n";
}
```

Note for the implementer: the test regex for task 2 expects an empty Notes cell to be absent; the row for task 2 has notes, task 1 has none and ends `|  |`. Adjust the test regex to `\| 1 \| ... \|  \|` if needed; the behavior stays as written.

- [ ] **Step 4: Run to verify it passes.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tokens/ledger-summary.ts packages/cli/src/tokens/ledger-summary.test.ts
git commit -m "feat(dgs-547): render the SDD ledger summary"
```

### Task 4: The `dg clickup attach-record` command (file mode)

**Files:**
- Create: `packages/cli/src/clickup/attach-record.ts`
- Test: `packages/cli/src/clickup/attach-record.test.ts`
- Modify: `packages/cli/src/clickup/index.ts` (import and `.command(attachRecordCommand)` beside `uploadAttachmentCommand`, lines 39 and 63)

**Interfaces:**
- Consumes: `decideAttach` (Task 2), `readAttached`/`recordAttached` (Task 1), `createClient` from `./lib.ts`, `ClickUpClient.getTaskByRef`, `uploadAttachment`, `handlerOf` test util.
- Produces: `createAttachRecordCommand(clientFactory?: () => ClickUpClient): CommandModule` and `attachRecordCommand`. Options: `--task <KEY>` (required), `--file <path>`, `--name <attachment name>` (default: the file's basename). Output lines: `attached <name> (<id>)`, `skipped <name>: unchanged`, `superseded: <old id>`, `warn: <text>`. Not a `DGS-<n>` key: `not a ClickUp key, skipped`, exit 0. Missing file: `skipped <file>: not found`, exit 0. Any error: `warn: <first line>` on stderr, exit code 1.

- [ ] **Step 1: Write the failing tests**

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createAttachRecordCommand } from "./attach-record.ts";
import { handlerOf } from "./handler-of.test-util.ts";

let dir: string; let file: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ar-")); process.env.DIGISMITH_TOKEN_REGISTRY_DIR = dir; file = join(dir, "plan.md"); writeFileSync(file, "v1"); });
afterEach(() => { delete process.env.DIGISMITH_TOKEN_REGISTRY_DIR; rmSync(dir, { recursive: true, force: true }); process.exitCode = 0; vi.restoreAllMocks(); });

const run = (client: Partial<ClickUpClient>, argv: { task: string; file: string; name?: string }) =>
  handlerOf<typeof argv>(createAttachRecordCommand(() => client as ClickUpClient))(argv);

describe("attach-record", () => {
  it("uploads a new file and records it", async () => {
    const uploadAttachment = vi.fn().mockResolvedValue({ id: "a1" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [] }), uploadAttachment } as never, { task: "DGS-9", file });
    expect(uploadAttachment).toHaveBeenCalledWith("t1", file);
    expect(log).toHaveBeenCalledWith("attached plan.md (a1)");
  });
  it("a second run with the same content uploads nothing", async () => {
    const uploadAttachment = vi.fn().mockResolvedValue({ id: "a1" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const getTaskByRef = vi.fn().mockResolvedValueOnce({ id: "t1", attachments: [] }).mockResolvedValue({ id: "t1", attachments: [{ id: "a1", title: "plan.md" }] });
    await run({ getTaskByRef, uploadAttachment } as never, { task: "DGS-9", file });
    await run({ getTaskByRef, uploadAttachment } as never, { task: "DGS-9", file });
    expect(uploadAttachment).toHaveBeenCalledTimes(1);
  });
  it("prints superseded and keeps the old copy when the content changed", async () => {
    const uploadAttachment = vi.fn().mockResolvedValueOnce({ id: "a1" }).mockResolvedValueOnce({ id: "a2" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const getTaskByRef = vi.fn().mockResolvedValueOnce({ id: "t1", attachments: [] }).mockResolvedValue({ id: "t1", attachments: [{ id: "a1", title: "plan.md" }] });
    await run({ getTaskByRef, uploadAttachment } as never, { task: "DGS-9", file });
    writeFileSync(file, "v2");
    await run({ getTaskByRef, uploadAttachment } as never, { task: "DGS-9", file });
    expect(log).toHaveBeenCalledWith("superseded: a1");
    expect(uploadAttachment).toHaveBeenCalledTimes(2);
  });
  it("skips a non-ClickUp key without a client call", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const factory = vi.fn();
    await handlerOf<{ task: string; file: string }>(createAttachRecordCommand(factory as never))({ task: "EMKT-1", file });
    expect(log).toHaveBeenCalledWith("not a ClickUp key, skipped");
    expect(factory).not.toHaveBeenCalled();
  });
  it("skips a missing file with exit 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({} as never, { task: "DGS-9", file: join(dir, "nope.html") });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("not found"));
    expect(process.exitCode).toBe(0);
  });
  it("warns and sets exit 1 when the upload fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [] }), uploadAttachment: vi.fn().mockRejectedValue(new Error("boom")) } as never, { task: "DGS-9", file });
    expect(err).toHaveBeenCalledWith("warn: boom");
    expect(process.exitCode).toBe(1);
  });
  it("never calls a delete", async () => {
    const client = { getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [] }), uploadAttachment: vi.fn().mockResolvedValue({ id: "a1" }) };
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run(client as never, { task: "DGS-9", file });
    expect(Object.keys(client).some((k) => /delete/i.test(k))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm --filter @digismith/cli exec vitest run src/clickup/attach-record.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { CommandModule } from "yargs";
import type { ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { decideAttach } from "./attach-decision.ts";
import { readAttached, recordAttached } from "../tokens/attachments-store.ts";

const CLICKUP_KEY = /^DGS-\d+$/;

export async function attachFile(client: ClickUpClient, key: string, file: string, name: string): Promise<string[]> {
  const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
  const task = (await client.getTaskByRef(key)) as unknown as { id: string; attachments?: { id: string; title: string }[] };
  const d = decideAttach({ name, sha256, recorded: readAttached(key), onTask: task.attachments ?? [] });
  if (d.action === "skip") return [`skipped ${name}: ${d.reason}`];
  const out: string[] = [];
  const att = (await client.uploadAttachment(task.id, file)) as unknown as { id: string };
  recordAttached(key, { name, sha256, id: att.id, attached_at: new Date().toISOString() });
  out.push(`attached ${name} (${att.id})`);
  if (d.supersedes) out.push(`superseded: ${d.supersedes}`);
  if (d.warn) out.push(`warn: ${d.warn}`);
  return out;
}

export function createAttachRecordCommand(clientFactory: () => ClickUpClient = createClient): CommandModule {
  return {
    command: "attach-record",
    describe: "attach a build-record file to a ClickUp ticket once; a re-run with the same content adds nothing, and nothing is ever deleted",
    builder: (y) =>
      y
        .option("task", { type: "string", requiresArg: true, demandOption: true, describe: "ticket key (DGS-547)" })
        .option("file", { type: "string", requiresArg: true, describe: "local file to attach" })
        .option("name", { type: "string", describe: "attachment name (default: the file's name)" }),
    handler: async (argv) => {
      process.exitCode = 0;
      try {
        const key = String(argv.task ?? "").trim();
        if (!CLICKUP_KEY.test(key)) { console.log("not a ClickUp key, skipped"); return; }
        const file = String(argv.file ?? "");
        if (!file || !existsSync(file)) { console.log(`skipped ${file}: not found`); return; }
        for (const line of await attachFile(clientFactory(), key, file, String(argv.name ?? basename(file)))) console.log(line);
      } catch (err) {
        console.error(`warn: ${(err as Error).message.split("\n")[0]}`);
        process.exitCode = 1;
      }
    },
  };
}

export const attachRecordCommand: CommandModule = createAttachRecordCommand();
```

Then in `packages/cli/src/clickup/index.ts` add `import { attachRecordCommand } from "./attach-record.ts";` and `.command(attachRecordCommand)` after `.command(uploadAttachmentCommand)`.

- [ ] **Step 4: Run to verify it passes.** Run the same command, then `pnpm --filter @digismith/cli exec vitest run src/clickup` for the whole folder. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/attach-record.ts packages/cli/src/clickup/attach-record.test.ts packages/cli/src/clickup/index.ts
git commit -m "feat(dgs-547): add dg clickup attach-record"
```

### Task 5: The render kinds (`--kind reviews|ledger-summary`)

**Files:**
- Modify: `packages/cli/src/clickup/attach-record.ts`
- Modify: `packages/cli/src/clickup/attach-record.test.ts`

**Interfaces:**
- Consumes: `renderLedgerSummary` (Task 3), `runTable` from `../reviewer/table.ts` (`runTable({ workspace, ledger?, out?, json? })`), `attachFile` (Task 4).
- Produces: new options `--kind <reviews|ledger-summary>` and `--workspace <dir>`. With `--kind ledger-summary` the command reads `<workspace>/progress.md`, renders to a temp file named `ledger-summary.md`, attaches it. With `--kind reviews` it calls `runTable({ workspace, out: <temp>/reviews.md })` and attaches. `--file` and `--kind` together is an error. A missing `progress.md` prints `skipped ledger-summary.md: no ledger` and exits 0. Temp files go under `os.tmpdir()` in a fresh `mkdtemp` folder, removed after the upload.

- [ ] **Step 1: Write the failing tests** (append to the same test file)

```ts
describe("attach-record kinds", () => {
  it("renders and attaches the ledger summary under its own name", async () => {
    const ws = join(dir, "ws"); mkdirSync(ws);
    writeFileSync(join(ws, "progress.md"), "# SDD ledger — plan: p.md\nTask 1: complete (commits abc)\n");
    const uploadAttachment = vi.fn().mockResolvedValue({ id: "a1" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await handlerOf<{ task: string; kind: string; workspace: string }>(createAttachRecordCommand(() => ({ getTaskByRef: vi.fn().mockResolvedValue({ id: "t1", attachments: [] }), uploadAttachment }) as never))({ task: "DGS-9", kind: "ledger-summary", workspace: ws });
    expect(log).toHaveBeenCalledWith("attached ledger-summary.md (a1)");
    expect(uploadAttachment.mock.calls[0][1]).toMatch(/ledger-summary\.md$/);
  });
  it("skips when there is no ledger", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await handlerOf<{ task: string; kind: string; workspace: string }>(createAttachRecordCommand(() => ({}) as never))({ task: "DGS-9", kind: "ledger-summary", workspace: join(dir, "none") });
    expect(log).toHaveBeenCalledWith("skipped ledger-summary.md: no ledger");
    expect(process.exitCode).toBe(0);
  });
  it("refuses --file with --kind", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await handlerOf<Record<string, string>>(createAttachRecordCommand(() => ({}) as never))({ task: "DGS-9", file, kind: "reviews", workspace: dir });
    expect(err).toHaveBeenCalledWith(expect.stringContaining("--file"));
    expect(process.exitCode).toBe(1);
  });
});
```

Add `mkdirSync` to the test file's `node:fs` import.

- [ ] **Step 2: Run to verify it fails.** Run: `pnpm --filter @digismith/cli exec vitest run src/clickup/attach-record.test.ts`. Expected: 3 new FAIL.

- [ ] **Step 3: Write minimal implementation.** In `attach-record.ts`: add the two options to the builder (`choices: ["reviews", "ledger-summary"]`, and `workspace`); in the handler, after the key check, branch on `argv.kind`:

```ts
const kind = argv.kind as "reviews" | "ledger-summary" | undefined;
if (kind) {
  if (argv.file) throw new Error("--file and --kind cannot be used together");
  const ws = String(argv.workspace ?? "");
  const name = kind === "reviews" ? "reviews.md" : "ledger-summary.md";
  const ledger = join(ws, "progress.md");
  if (!ws || !existsSync(ledger)) { console.log(`skipped ${name}: no ledger`); return; }
  const tmp = mkdtempSync(join(tmpdir(), "attach-record-"));
  try {
    const out = join(tmp, name);
    if (kind === "ledger-summary") writeFileSync(out, renderLedgerSummary(readFileSync(ledger, "utf8")));
    else runTable({ workspace: ws, out });
    for (const line of await attachFile(clientFactory(), key, out, name)) console.log(line);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return;
}
```

with imports `mkdtempSync, rmSync, writeFileSync` from `node:fs`, `tmpdir` from `node:os`, `join` from `node:path`, `renderLedgerSummary`, `runTable`. The `file` option stays optional.

- [ ] **Step 4: Run to verify it passes.** Run the clickup folder tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/clickup/attach-record.ts packages/cli/src/clickup/attach-record.test.ts
git commit -m "feat(dgs-547): attach-record renders reviews and the ledger summary"
```

### Task 6: Skill hook lines (starts only after DGS-551 has merged; see BLOCKER)

**Files (modify, after re-reading each on current main):**
- `skills/brainstorming/SKILL.md`: after the user approves the spec.
- `skills/writing-plans/SKILL.md`: after the plan is approved (beside "Plan checklist (DGS-631)").
- `skills/subagent-driven-development/SKILL.md`: in "Finish", before the `snapshot` line and the `rm -rf`.
- `skills/report-implementation/SKILL.md`: after it commits `report.html`; replace the line "Attaching `findings.md` ... is the conductor's job" so it says the hook attaches when the worker may write, and the conductor does it otherwise.
- `skills/finishing-a-development-branch/SKILL.md`: Option 1 and Option 2 end blocks, after the `snapshot --write` line.
- `skills/executing-plans/SKILL.md`: the ledger summary only (inline ledger has no reviews), before it hands off.

**Interfaces:** each edit is one fenced block plus the standing sentence: "Same key rule as above. A non-zero exit prints a warning, appends `Attach record: failed (<first stderr line>)` to the ledger when one exists, and the flow goes on. If the classifier blocks the command, tell your conductor; the conductor attaches the file. Status moves follow SOP DGS-731." Commands:

```bash
dg clickup attach-record --task <Key> --file <board folder>/spec.md
dg clickup attach-record --task <Key> --file <board folder>/plan.md
dg clickup attach-record --task <Key> --kind reviews --workspace <workspace>
dg clickup attach-record --task <Key> --kind ledger-summary --workspace <workspace>
dg clickup attach-record --task <Key> --file <board folder>/report.html
dg clickup attach-record --task <Key> --file <snapshot path>/tokens.json
```

(In `brainstorming`, the spec is `design.html` when that is the spec file: use `--file <board folder>/design.html --name spec.html`.) The finishing edit sends `report.html` only if the file exists and re-sends are no-ops by hash.

- [ ] **Step 1: Write the failing wiring test** (Task 7 holds it; write it first). Run it: FAIL on all six skills.
- [ ] **Step 2: Re-read each skill on current main; confirm DGS-551's hook lines are present and place the attach lines after them, not before.**
- [ ] **Step 3: Add the blocks above, one per skill, in the places listed.**
- [ ] **Step 4: Run the wiring test and `pnpm --filter @digismith/cli exec vitest run`. Expected: PASS.**
- [ ] **Step 5: Commit**

```bash
git add skills/brainstorming/SKILL.md skills/writing-plans/SKILL.md skills/subagent-driven-development/SKILL.md skills/report-implementation/SKILL.md skills/finishing-a-development-branch/SKILL.md skills/executing-plans/SKILL.md
git commit -m "feat(dgs-547): hook attach-record into the build skills"
```

### Task 7: The wiring guard test

**Files:**
- Create: `packages/cli/src/clickup/attach-hooks.wiring.test.ts`

**Interfaces:** reads the skill files from the repo root; no code under test.

- [ ] **Step 1: Write the test** (it fails until Task 6 is done)

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const skill = (n: string) => readFileSync(resolve(root, "skills", n, "SKILL.md"), "utf8");
const hooks: [string, RegExp][] = [
  ["brainstorming", /attach-record --task <Key> --file .*(spec\.md|design\.html)/],
  ["writing-plans", /attach-record --task <Key> --file .*plan\.md/],
  ["subagent-driven-development", /attach-record --task <Key> --kind reviews/],
  ["subagent-driven-development", /attach-record --task <Key> --kind ledger-summary/],
  ["report-implementation", /attach-record --task <Key> --file .*report\.html/],
  ["finishing-a-development-branch", /attach-record --task <Key> --file .*tokens\.json/],
  ["executing-plans", /attach-record --task <Key> --kind ledger-summary/],
];

describe("attach-record hook wiring", () => {
  for (const [name, re] of hooks) it(`${name} sends ${re.source.slice(0, 40)}`, () => { expect(skill(name)).toMatch(re); });
  it("every skill that attaches says a failure never blocks", () => {
    for (const n of new Set(hooks.map((h) => h[0]))) expect(skill(n)).toMatch(/Attach record: failed/);
  });
  it("the reviews and summary go before the workspace is deleted", () => {
    const t = skill("subagent-driven-development");
    const del = t.indexOf("rm -rf <workspace>");
    expect(t.indexOf("--kind reviews")).toBeLessThan(del);
    expect(t.indexOf("--kind ledger-summary")).toBeLessThan(del);
  });
  it("no skill points at DGS-488 for the status flow", () => {
    for (const n of new Set(hooks.map((h) => h[0]))) expect(skill(n)).not.toMatch(/DGS-488/);
  });
});
```

- [ ] **Step 2: Run it before Task 6.** Run: `pnpm --filter @digismith/cli exec vitest run src/clickup/attach-hooks.wiring.test.ts`. Expected: FAIL.
- [ ] **Step 3: Run it after Task 6.** Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/clickup/attach-hooks.wiring.test.ts
git commit -m "test(dgs-547): guard the attach-record hook lines in the skills"
```

---

## Self-Review

- **Spec coverage:** section 2 table: spec.md, plan.md (Task 6 hooks), reviews.md (Task 5 + 6), ledger-summary.md (Tasks 3, 5, 6), report.html and tokens.json (Task 6). Section 3 replace rule: Tasks 1, 2, 4. Section 4 never block, ClickUp only, dg only: Global Constraints, Task 4 error paths, Task 6 sentence. Section 5 item 2 (client reader): replaced by the existing `attachments` field, noted in Global Constraints. Maestro answer: once-each rule and output-only `superseded`: Global Constraints, Tasks 2 and 4. DGS-551 order: BLOCKER.
- **Placeholders:** none; Task 3's one implementer note names the exact adjustment.
- **Types:** `AttachedRecord`, `decideAttach`, `attachFile`, `renderLedgerSummary`, `runTable` match across tasks.

## Verification

After the last task: `pnpm --filter @digismith/cli exec vitest run`, then `pnpm -r exec tsc --noEmit` (or the repo's typecheck script). The conductor does one live run on a throwaway DGS ticket after merge: six files attached; a second run adds none.
