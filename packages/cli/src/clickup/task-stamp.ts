import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { CommandModule } from "yargs";
import { commentBody, type ClickUpClient } from "@digismith/clickup-client";
import { createClient } from "./lib.ts";
import { printCall } from "./task-type-write.ts";
import { collectRecords, type Collected } from "../tokens/count.ts";
import { parseTaskAgents } from "../tokens/ledger.ts";
import { createDepotRegistry } from "../tokens/registry.ts";
import { reviewData } from "../tokens/review-data.ts";
import { renderStamp, taskUsage, type TaskUsage } from "../tokens/stamp.ts";
import { appendStamp, stampOf, type StampLine } from "../tokens/stamps-store.ts";

export interface TaskStampArgv {
  task?: string;
  planTask?: string;
  ledger?: string;
  findings?: string;
  all?: boolean;
  yes?: boolean;
}

export interface TaskStampRequest {
  task: string;
  planTask: string | undefined;
  ledger: string | undefined;
  findings: string | undefined;
  all: boolean;
  yes: boolean;
}

const CLICKUP_KEY = /^DGS-\d+$/;
const PLAN_TASK = /^(final|\d+)$/;

/** Checks the flags, with no network call and no file read. */
export function parseTaskStampArgv(argv: TaskStampArgv): TaskStampRequest {
  const task = argv.task === undefined ? "" : String(argv.task).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(task)) throw new Error(`--task must be a ticket key like DGS-12, got "${task}"`);
  const all = argv.all === true;
  const planTask = argv.planTask === undefined ? undefined : String(argv.planTask).trim();
  if (!all && (planTask === undefined || !PLAN_TASK.test(planTask))) throw new Error(`--plan-task must be a task number or "final", got "${planTask ?? ""}"`);
  if (planTask !== undefined && !PLAN_TASK.test(planTask)) throw new Error(`--plan-task must be a task number or "final", got "${planTask}"`);
  return { task, planTask, ledger: argv.ledger, findings: argv.findings, all, yes: argv.yes === true };
}

const readText = (file: string | undefined): string => (file !== undefined && existsSync(file) ? readFileSync(file, "utf8") : "");

function appendLedger(file: string, line: string): void {
  const prior = existsSync(file) ? readFileSync(file, "utf8") : "";
  appendFileSync(file, `${prior === "" || prior.endsWith("\n") ? "" : "\n"}${line}\n`);
}

const marker = (key: string, n: string) => (n === "final" ? `Hallmark final review of ${key}` : `Hallmark task ${n} of ${key}`);
const failure = (msg: string) => `warn: ${msg.replace(/\s*\n\s*/g, " ")}`;

function stampLine(n: string, commentId: string, u: TaskUsage, r: ReturnType<typeof reviewData>, partial: boolean): StampLine {
  const models: StampLine["models"] = {};
  for (const [m, v] of Object.entries(u.models)) models[m] = { input: v.input, output: v.output, cache_read: v.cache_read, cache_write_5m: v.cache_write_5m, cache_write_1h: v.cache_write_1h, responses: v.responses, cost_usd: v.cost_usd };
  const starts = u.windows.map((w) => w.start).sort();
  const ends = u.windows.map((w) => w.end).sort();
  return {
    task: n,
    comment_id: commentId,
    window_start: starts[0],
    window_end: ends[ends.length - 1],
    agent_seconds: u.agentSeconds,
    window_seconds: u.windowSeconds,
    models,
    reviews: { rounds: r.rounds ?? 0, findings: r.findings ?? 0, fixed: r.fixed ?? 0, parked: r.parked ?? 0, rejected: r.rejected ?? 0, open: r.open ?? 0, fix_rounds: r.fixRounds ?? 0, source: r.source },
    partial,
    stamped_at: new Date().toISOString(),
  };
}

interface Ctx {
  req: TaskStampRequest;
  key: string;
  data: Collected;
  client: () => ClickUpClient;
  resolved?: { id: string };
}

async function resolve(ctx: Ctx): Promise<string> {
  ctx.resolved ??= await ctx.client().getTaskByRef(ctx.key);
  return ctx.resolved.id;
}

// Stamps one plan task. Returns the one output line (for --all); single mode prints more itself.
async function stampOne(ctx: Ctx, n: string, quiet: boolean): Promise<string> {
  const { req, key, data } = ctx;
  if (!/^(\d+|final)$/.test(n)) throw new Error(`task id "${n}" is not a number or final`);
  const ledgerText = readText(req.ledger);
  const usage = taskUsage(data.records, data.entries, parseTaskAgents(ledgerText), n, data.ticketSessions);
  const ended = data.entries.some((e) => e.kind === "task_end" && e.task === n);
  if (!ended || usage.windows.length === 0) return "task not ended";
  if (new RegExp(`^(?:- )?Task ${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: stamped \\(comment \\S+\\)\\s*$`, "m").test(ledgerText)) return "already stamped (ledger)";
  if (stampOf(key, n)) return "already stamped (stamps file)";
  const id = await resolve(ctx);
  const first = marker(key, n);
  const comments = await ctx.client().getAllTaskComments(id);
  if (comments.some((c) => String(c.comment_text ?? "").split(/\r?\n/)[0].trim() === first)) return "already stamped (ticket comments)";

  const partial = data.missingSessions.length > 0;
  const review = reviewData(n, { ledgerText: ledgerText || undefined, findingsText: readText(req.findings) || undefined });
  const text = renderStamp({ key, task: n, usage, review, missingSessions: data.missingSessions });
  if (!req.yes) {
    if (!quiet) {
      console.log(text);
      printCall("POST", `/task/${id}/comment`, commentBody(text));
      console.log("nothing sent; add --yes to send");
    }
    return "would stamp (dry run)";
  }
  if (data.ticketSessions.length - data.missingSessions.length <= 0) throw new Error(`no session of ${key} could be read, refusing to post a stamp with no data`);
  const created = await ctx.client().addTaskComment(id, text);
  const cid = String(created.id);
  // Written before the read-back so a later run never posts twice.
  appendStamp(key, stampLine(n, cid, usage, review, partial));
  if (req.ledger !== undefined) {
    try {
      appendLedger(req.ledger, `Task ${n}: stamped (comment ${cid})`);
    } catch (err) {
      throw new Error(`sent (comment ${cid}), but the ledger line could not be written: ${(err as Error).message}; do not send again (the stamps file has it)`);
    }
  }
  let rows;
  try {
    rows = await ctx.client().getTaskComments(id);
  } catch (err) {
    throw new Error(`sent (comment ${cid}), but the read-back failed: ${(err as Error).message}; do not send again, check it in ClickUp`);
  }
  if (!rows.some((r) => String(r.id) === cid)) throw new Error(`sent (comment ${cid}), but read-back of ${id} does not show it; do not send again, check it in ClickUp`);
  return `stamped (comment ${cid})`;
}

export function createTaskStampCommand(clientFactory: () => ClickUpClient = createClient): CommandModule {
  return {
    command: "task-stamp",
    describe: "post a Hallmark comment (window, tokens, list-price cost, reviews) for one plan task; a dry run unless --yes",
    builder: (y) =>
      y
        .option("task", { type: "string", requiresArg: true, demandOption: true, describe: "ticket key (DGS-546)" })
        .option("plan-task", { type: "string", requiresArg: true, describe: "plan task number or final" })
        .option("ledger", { type: "string", requiresArg: true, describe: "the SDD ledger (progress.md): review data, agent ids, and the stamped line" })
        .option("findings", { type: "string", requiresArg: true, describe: "findings.md, the review data when the ledger has none" })
        .option("all", { type: "boolean", default: false, describe: "stamp every task with a task_end plus final, skipping stamped ones" })
        .option("yes", { type: "boolean", default: false, describe: "post the comment (without it, only print it)" }),
    handler: async (argv) => {
      process.exitCode = 0;
      try {
        const req = parseTaskStampArgv(argv as unknown as TaskStampArgv);
        if (!CLICKUP_KEY.test(req.task)) {
          console.log("not a ClickUp key, skipped");
          return;
        }
        const data = collectRecords({ ticket: req.task, registry: createDepotRegistry() });
        let cached: ClickUpClient | undefined;
        const ctx: Ctx = { req, key: req.task, data, client: () => (cached ??= clientFactory()) };
        if (!req.all) {
          console.log(await stampOne(ctx, req.planTask as string, false));
          return;
        }
        const ids = new Set<string>();
        for (const e of data.entries) if (e.kind === "task_end" && e.task !== "final") ids.add(e.task);
        const order = [...ids].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
        if (data.entries.some((e) => e.kind === "task_end" && e.task === "final")) order.push("final");
        for (const n of order) {
          try {
            console.log(`task ${n}: ${await stampOne(ctx, n, true)}`);
          } catch (err) {
            console.error(failure(`task ${n}: ${(err as Error).message}`));
            process.exitCode = 1;
          }
        }
      } catch (err) {
        console.error(failure((err as Error).message));
        process.exitCode = 1;
      }
    },
  };
}

export const taskStampCommand: CommandModule = createTaskStampCommand();
