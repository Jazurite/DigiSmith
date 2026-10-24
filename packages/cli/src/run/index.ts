import type { CommandModule } from "yargs";
import { appendEvent, CONDUCTOR_TYPES, validEventData } from "./events.ts";
import { findRunDir } from "./paths.ts";
import { createRun } from "./record.ts";
import { formatList, formatShow, LIST_DAYS, listRuns, showRun, tailEvents } from "./read.ts";

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

const startCommand: CommandModule = {
  command: "start",
  describe: "write run.json for a new worker run and print the run id",
  builder: (y) =>
    y
      .option("ticket", { type: "string", demandOption: true, describe: "ticket key, e.g. DGS-581" })
      .option("role", { type: "string", demandOption: true, describe: "builder, reviewer, scout, maestro, conductor or other" })
      .option("order", { type: "string", demandOption: true, describe: "path of the order (a Scout without an order file passes the path of its brief)" })
      .option("seat", { type: "string" })
      .option("model", { type: "string" })
      .option("worktree", { type: "string", describe: "worktree path (branch and base sha are read from git)" })
      .option("branch", { type: "string" })
      .option("base-sha", { type: "string" })
      .option("workspace", { type: "string", describe: "herdr workspace" })
      .option("tab", { type: "string", describe: "herdr tab label" })
      .option("pane", { type: "string", describe: "herdr pane id" })
      .option("budget", { type: "string", describe: "JSON object" }),
  handler: (a) => {
    try {
      const r = createRun({
        ticket: a.ticket as string,
        role: a.role as string,
        order: a.order as string,
        seat: a.seat as string | undefined,
        model: a.model as string | undefined,
        worktree: a.worktree as string | undefined,
        branch: a.branch as string | undefined,
        baseSha: a["base-sha"] as string | undefined,
        workspace: a.workspace as string | undefined,
        tab: a.tab as string | undefined,
        pane: a.pane as string | undefined,
        budget: a.budget as string | undefined,
      });
      console.log(r.run);
    } catch (e) {
      fail((e as Error).message);
    }
  },
};

const eventCommand: CommandModule = {
  command: "event <run-id> <type>",
  describe: `append an event (${CONDUCTOR_TYPES.join(", ")})`,
  builder: (y) =>
    y
      .positional("run-id", { type: "string", demandOption: true })
      .positional("type", { type: "string", demandOption: true })
      .option("data", { type: "string", describe: "JSON object" }),
  handler: (a) => {
    const runId = a["run-id"] as string;
    const type = a.type as string;
    if (!(CONDUCTOR_TYPES as readonly string[]).includes(type)) return fail(`type must be one of ${CONDUCTOR_TYPES.join(", ")}`);
    let data: Record<string, unknown> = {};
    if (a.data !== undefined) {
      try {
        const v: unknown = JSON.parse(a.data as string);
        if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error();
        data = v as Record<string, unknown>;
      } catch {
        return fail("--data must be a JSON object");
      }
    }
    const bad = validEventData(type, data);
    if (bad) return fail(bad);
    const dir = findRunDir(runId, process.env);
    if (!dir) return fail(`no run ${runId}`);
    try {
      appendEvent(dir, runId, type, data, 2000);
    } catch (e) {
      fail((e as Error).message);
    }
  },
};

const listCommand: CommandModule = {
  command: "list",
  describe: "list runs active in the last 7 days, newest first",
  builder: (y) =>
    y
      .option("ticket", { type: "string" })
      .option("days", { type: "number", default: LIST_DAYS, describe: "only runs with an event in the last N days" })
      .option("all", { type: "boolean", default: false, describe: "every run, however old" })
      .option("json", { type: "boolean", default: false }),
  handler: (a) => {
    const days = a.days as number;
    if (!a.all && (!Number.isInteger(days) || days < 1)) return fail("--days must be a whole number of 1 or more");
    const rows = listRuns(process.env, a.ticket as string | undefined, a.all ? {} : { days });
    console.log(a.json ? JSON.stringify(rows) : formatList(rows));
  },
};

const showCommand: CommandModule = {
  command: "show <run-id>",
  describe: "show a run record with an event summary",
  builder: (y) => y.positional("run-id", { type: "string", demandOption: true }).option("json", { type: "boolean", default: false }),
  handler: (a) => {
    const r = showRun(a["run-id"] as string, process.env);
    if (!r) return fail(`no run ${a["run-id"]}`);
    console.log(a.json ? JSON.stringify(r) : formatShow(r));
  },
};

const tailCommand: CommandModule = {
  command: "tail <run-id>",
  describe: "print the events of a run, one JSON line each (no follow); the file position is the authority, a seq cursor can skip a duplicate",
  builder: (y) => y.positional("run-id", { type: "string", demandOption: true }).option("since", { type: "number", default: 0, describe: "only lines whose seq is greater than N; a follower using --since may miss a line that repeats a seq it already passed, the file position is the authority" }),
  handler: (a) => {
    const since = a.since as number;
    if (!Number.isFinite(since) || since < 0) return fail("--since must be a number of 0 or more");
    const events = tailEvents(a["run-id"] as string, since, process.env);
    if (!events) return fail(`no run ${a["run-id"]}`);
    for (const e of events) console.log(JSON.stringify(e));
  },
};

const runCommand: CommandModule = {
  command: "run",
  describe: "Nightwatch run records: start, event, list, show, tail",
  builder: (y) => y.command(startCommand).command(eventCommand).command(listCommand).command(showCommand).command(tailCommand).demandCommand(1, ""),
  handler: () => {},
};

export default runCommand;
