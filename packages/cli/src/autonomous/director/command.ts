import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CommandModule } from "yargs";
import { createClient, DIGISMITH_SPACE_ID } from "../../clickup/lib.ts";
import { readOpen } from "../attention.ts";
import { realExec } from "../conductor.ts";
import { fmtUtc7 } from "../clock.ts";
import { readJournal } from "../journal.ts";
import { MAIN_CHECKOUT } from "../observers-real.ts";
import { findRunDir } from "../../run/paths.ts";
import { readRun } from "../../run/record.ts";
import type { ReadyCtx } from "../ready.ts";
import { autonomousDir, readLock } from "../state.ts";
import { ClickUpLoTracker } from "../tracker-clickup.ts";
import type { Tracker } from "../types.ts";
import { checkAuthority } from "./authority.ts";
import { doMove, type Effects } from "./do.ts";
import { escalate } from "./escalate.ts";
import { planLoop, type Plan, type PlanWorld } from "./plan.ts";
import { readDecisions, recordDecision, retryPendingComments } from "./record.ts";
import { readRefineLock, refineRelease, refineRound, type RefineLock } from "./refine.ts";
import { rankSeats, type SeatReading } from "./seat.ts";
import { promptDriver } from "./target.ts";
import type { Move } from "./unblock.ts";

export interface DirectorDeps {
  dir: string;
  now: () => Date;
  tracker: () => Tracker;
  effects: Effects;
  /** the role of a run from its run record; null when unknown */
  roleOf: (run: string) => string | null;
  boardDir: (ticket: string) => string | null;
  checkReadyCtx: ReadyCtx;
  readDescription: (ticket: string) => Promise<string>;
  /** the ClickUp task id of a ticket key (the status write of an escalation needs it) */
  taskIdOf: (ticket: string) => Promise<string>;
}

class UsageError extends Error {}
const utc7 = (d: Date): string => fmtUtc7(d);

function pendingCount(dir: string): number {
  try { return readFileSync(join(dir, "comment-pending.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "").length; } catch { return 0; }
}

/** The world `plan` and `do` read, from the files in the autonomous dir. */
export function readWorld(d: Pick<DirectorDeps, "dir" | "now" | "roleOf">): PlanWorld {
  const lock = readLock(d.dir);
  const rl = readRefineLock(d.dir);
  return {
    items: readOpen(d.dir),
    history: { decisions: readDecisions(d.dir), journal: readJournal(d.dir) },
    lockTicket: lock === null ? null : lock.ticket,
    refineLock: rl !== null && !("corrupt" in rl) ? (rl as RefineLock) : null,
    pendingComments: pendingCount(d.dir),
    now: d.now(),
    roleOf: d.roleOf,
  };
}

export function describeMove(m: Move): string {
  switch (m.kind) {
    case "reprompt": return `${m.id}  reprompt ${m.ticket} run ${m.run} via ${m.to}`;
    case "start-again": return `${m.id}  start-again ${m.ticket} run ${m.run}`;
    case "retry-once": return `${m.id}  retry-once ${m.ticket} run ${m.run} via ${m.to}`;
    case "release": return `${m.id}  release ${m.ticket} stopped: ${m.reason}${m.escalate ? " (then escalate)" : ""}`;
    case "refine-release": return `${m.id}  refine-release ${m.ticket} ${m.result}: ${m.reason}`;
    case "gate-wait": return `${m.id}  gate-wait ${m.ticket}: ${m.ageMin} min for the Maestro`;
    case "list-only": return `${m.id}  list-only ${m.item}: ${m.why}`;
    default: return `${m.id}  ${m.kind}`;
  }
}

export function planLines(p: Plan, now: Date): string[] {
  if (p.shown.length === 0) return [`Director plan (${utc7(now)} UTC+7): no moves`];
  const lines = [`Director plan (${utc7(now)} UTC+7): ${p.moves.length} move(s), ${p.shown.length - p.moves.length} list-only`];
  for (const m of p.shown) lines.push(describeMove(m));
  if (p.moves.length > 0) lines.push("Run each move with: dg director do <move-id>");
  return lines;
}

function guarded(depsFactory: () => DirectorDeps, body: (d: DirectorDeps) => Promise<{ lines: string[]; code?: number }>): Promise<void> {
  return (async () => {
    try {
      const r = await body(depsFactory());
      for (const l of r.lines) console.log(l);
      process.exitCode = r.code ?? 0;
    } catch (err) {
      console.error(`director: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = err instanceof UsageError ? 2 : 1;
    }
  })();
}

function parseReadings(file: string): SeatReading[] {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new UsageError(`--readings ${file}: ${(e as Error).message}`); }
  if (!Array.isArray(raw)) throw new UsageError("--readings: the file must hold a JSON list of seat readings");
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return raw.map((r: Record<string, unknown>, i) => {
    if (typeof r?.seat !== "string") throw new UsageError(`--readings: entry ${i} has no seat name`);
    return {
      seat: r.seat, fiveHourUsed: num(r.fiveHourUsed), weeklyUsed: num(r.weeklyUsed), weeklyResetsAt: num(r.weeklyResetsAt), exhaustedUntil: num(r.exhaustedUntil),
      workers: num(r.workers) ?? 0, lastAssigned: num(r.lastAssigned), carriesMaestro: r.carriesMaestro === true,
    };
  });
}

export function createDirectorCommand(depsFactory: () => DirectorDeps = defaultDirectorDeps): CommandModule {
  return {
    command: "director",
    describe: "The Director: plan the next moves, do a move, decide, escalate, the refine gate, rank seats",
    builder: (y) =>
      y
        .command({
          command: "plan",
          describe: "list the moves the world calls for (read only; retries queued ClickUp comments first)",
          builder: (e) => e.option("json", { type: "boolean", default: false, describe: "print the plan as JSON" }),
          handler: (argv) => guarded(depsFactory, async (d) => {
            try { await retryPendingComments({ dir: d.dir, now: d.now, tracker: d.tracker() }); } catch { /* a queue that cannot be sent stays queued */ }
            const p = planLoop(readWorld(d));
            return { lines: argv.json ? [JSON.stringify(p, null, 2)] : planLines(p, d.now()) };
          }),
        })
        .command({
          command: "do <move-id>",
          describe: "run one move of the plan and record it (record first, then the effect)",
          builder: (e) => e.positional("move-id", { type: "string", demandOption: true }),
          handler: (argv) => guarded(depsFactory, async (d) => {
            const r = await doMove({ dir: d.dir, now: d.now, tracker: d.tracker(), effects: d.effects }, readWorld(d), argv.moveId as string);
            return { lines: [r.text], code: r.code };
          }),
        })
        .command({
          command: "decide",
          describe: "record one decision; a Jack-only id is refused (exit 3), an unknown id too (exit 4)",
          builder: (e) => e
            .option("id", { type: "string", requiresArg: true, demandOption: true, describe: "an authority id" })
            .option("ticket", { type: "string", requiresArg: true, demandOption: true })
            .option("run", { type: "string", requiresArg: true })
            .option("what", { type: "string", requiresArg: true, demandOption: true })
            .option("why", { type: "string", requiresArg: true, demandOption: true }),
          handler: (argv) => guarded(depsFactory, async (d) => {
            const c = checkAuthority(argv.id as string);
            if (!c.ok) return { lines: [c.text], code: c.code };
            await recordDecision({ dir: d.dir, now: d.now, tracker: d.tracker() }, { ticket: argv.ticket as string, run: (argv.run as string | undefined) ?? null, id: argv.id as string, side: "within", what: argv.what as string, why: argv.why as string });
            return { lines: [`recorded ${argv.id} for ${argv.ticket}`] };
          }),
        })
        .command({
          command: "escalate",
          describe: "put one question on the ticket and move it to concept (once per question)",
          builder: (e) => e
            .option("ticket", { type: "string", requiresArg: true, demandOption: true })
            .option("question", { type: "string", requiresArg: true, demandOption: true })
            .option("id", { type: "string", requiresArg: true, default: "product-taste-names-scope", describe: "the authority id the question needs" })
            .option("via-release", { type: "boolean", default: false, describe: "no status write: the release already makes the ticket wait for Jack" }),
          handler: (argv) => guarded(depsFactory, async (d) => {
            const ticket = argv.ticket as string;
            const viaRelease = argv.viaRelease as boolean;
            const r = await escalate({ dir: d.dir, now: d.now, tracker: d.tracker() }, {
              ticket, taskId: viaRelease ? "" : await d.taskIdOf(ticket), id: argv.id as string, question: argv.question as string, viaRelease,
            });
            if (r.outcome === "refused") return { lines: [r.text], code: 1 };
            return { lines: [r.outcome === "asked" ? `escalated ${ticket}: the question is on the ticket` : `${ticket} already has an open question: nothing sent`] };
          }),
        })
        .command({
          command: "refine-round",
          describe: "set the refine lock to round 2 (one scoped re-review)",
          builder: (e) => e.option("ticket", { type: "string", requiresArg: true, demandOption: true }),
          handler: (argv) => guarded(depsFactory, async (d) => {
            const l = readRefineLock(d.dir);
            if (l === null || "corrupt" in l || l.ticket !== (argv.ticket as string)) throw new Error(`no refine lock for ${argv.ticket as string}`);
            refineRound(d.dir);
            return { lines: [`${argv.ticket as string}: round 2`] };
          }),
        })
        .command({
          command: "refine-release",
          describe: "release the refine lock: ready (the gate), escalated or failed; exit 2 on a refusal",
          builder: (e) => e
            .option("ticket", { type: "string", requiresArg: true, demandOption: true })
            .option("result", { type: "string", choices: ["ready", "escalated", "failed"] as const, demandOption: true })
            .option("report", { type: "string", requiresArg: true, describe: "the plan Reviewer report (required for ready)" })
            .option("question", { type: "string", requiresArg: true })
            .option("cause", { type: "string", requiresArg: true }),
          handler: (argv) => guarded(depsFactory, async (d) => {
            const r = await refineRelease({
              dir: d.dir, now: d.now, tracker: d.tracker(), checkReadyCtx: d.checkReadyCtx, boardDir: d.boardDir, readDescription: d.readDescription,
            }, {
              ticket: argv.ticket as string, result: argv.result as "ready" | "escalated" | "failed",
              report: argv.report as string | undefined, question: argv.question as string | undefined, cause: argv.cause as string | undefined,
            });
            return { lines: [r.text], code: r.code };
          }),
        })
        .command({
          command: "seat",
          describe: "rank the Claude seats from a readings file (a JSON list; the probe is not run here)",
          builder: (e) => e
            .option("readings", { type: "string", requiresArg: true, demandOption: true })
            .option("heavy", { type: "boolean", default: false, describe: "a heavy worker: a seat carrying the Maestro goes last" }),
          handler: (argv) => guarded(depsFactory, async (d) => {
            const r = rankSeats(parseReadings(argv.readings as string), d.now().getTime(), { heavy: argv.heavy as boolean });
            return { lines: r.ranked.length === 0 ? [r.why.join("; ")] : [`seats, best first: ${r.ranked.join(", ")}`, ...r.why] };
          }),
        })
        .demandCommand(1, "")
        .strict(),
    handler: () => {},
  };
}

// ---- the real dependencies: built only when a handler runs ----

const notWired = (what: string) => async (): Promise<never> => { throw new Error(`${what} is not done by code: a herdr worker is started by the Director session from skills/director/refine-brief.md (runbook S0 to S6); record it with dg director decide --id restart-run`); };

function runSelf(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [...process.execArgv, process.argv[1], ...args], { env: process.env }, (err, _o, stderr) => (err ? reject(new Error(String(stderr) || err.message)) : resolve()));
  });
}

function boardDirIn(repo: string, ticket: string): string | null {
  const board = join(repo, ".digismith", "board");
  try {
    const n = readdirSync(board).find((x) => x.startsWith(`${ticket}—`));
    return n === undefined ? null : join(board, n);
  } catch { return null; }
}

/** The role of a run from its run record (the depot of the environment); null when unknown. */
export function roleOfRun(run: string): string | null {
  try {
    const rd = findRunDir(run, process.env);
    return rd === null ? null : readRun(rd).role || null;
  } catch { return null; }
}

export function defaultDirectorDeps(): DirectorDeps {
  let tracker: Tracker | null = null;
  const t = (): Tracker => (tracker ??= new ClickUpLoTracker(createClient(), DIGISMITH_SPACE_ID));
  const dir = autonomousDir();
  const conductorsJson = join(process.env.DIGISMITH_DEPOT_DIR || join(homedir(), ".digismith-depot"), "conductors.json");
  const find = async (ticket: string) => {
    for (const s of ["refinement", "to do", "concept", "in progress", "claimed"]) {
      const hit = (await t().listByStatus(s)).find((x) => (x.key ?? x.id) === ticket);
      if (hit) return hit;
    }
    throw new Error(`ticket ${ticket} not found in refinement, to do, concept, in progress or claimed`);
  };
  const deps: DirectorDeps = {
    dir,
    now: () => new Date(),
    tracker: t,
    roleOf: roleOfRun,
    boardDir: (ticket) => boardDirIn(MAIN_CHECKOUT, ticket),
    checkReadyCtx: { repo: MAIN_CHECKOUT, fileExists: existsSync },
    readDescription: async (ticket) => (await find(ticket)).text,
    taskIdOf: async (ticket) => (await find(ticket)).id,
    effects: {
      promptDriver: (ticket, text) => promptDriver(realExec, conductorsJson, dir, ticket, text),
      promptSelf: notWired("prompting the refine worker"),
      startRefine: notWired("starting the refine worker"),
      releaseBuild: (ticket, reason) => runSelf(["autonomous", "release", "--ticket", ticket, "--result", "stopped", "--reason", reason]),
      refineRelease: async (a) => refineRelease({ dir, now: deps.now, tracker: t(), checkReadyCtx: deps.checkReadyCtx, boardDir: deps.boardDir, readDescription: deps.readDescription }, { ticket: a.ticket, result: a.result, question: a.question, cause: a.cause }),
    },
  };
  return deps;
}

export default createDirectorCommand();
