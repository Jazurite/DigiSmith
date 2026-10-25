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
      const patch: { name?: string; resolved?: boolean; parent?: string } = {};
      if (op.parent !== undefined) patch.parent = op.parent;
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
