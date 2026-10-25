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
    const after = (await c.getTaskByRef()).checklists.find((l) => l.id === out.checklist_id)!;
    const parentId = after.items.find((i) => i.name === "Task 1: One")!.id;
    const nests = c.editChecklistItem.mock.calls.filter((call) => call[2].parent !== undefined);
    expect(nests).toHaveLength(3);
    for (const call of nests) expect(call[2].parent).toBe(parentId);
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

  it("a failed nest edit leaves an orphan that the next run adopts without a duplicate", async () => {
    const c = fakeClient([checklist([])]);
    c.editChecklistItem.mockRejectedValueOnce(new Error("HTTP 502"));
    await expect(runSync(asClient(c), parseSyncArgv({ task: "DGS-9", plan: planFile }), true)).rejects.toThrow("HTTP 502");
    const out = await runSync(asClient(c), parseSyncArgv({ task: "DGS-9", plan: planFile }), true);
    const items = (await c.getTaskByRef()).checklists[0].items;
    expect(items.filter((i) => i.name === "Implement")).toHaveLength(1);
    expect(out.dry_run).toBe(false);
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
