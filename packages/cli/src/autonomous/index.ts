import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CommandModule } from "yargs";
import { createClient, DIGISMITH_SPACE_ID } from "../clickup/lib.ts";
import { appendResolved, attentionViews, formatOpen, readOpen } from "./attention.ts";
import { herdrPaneLookup } from "./pane.ts";
import { runWatch } from "./watch.ts";
import { readAway, isAway } from "./away.ts";
import { fmtUtc7, parseHhmm } from "./clock.ts";
import { realExec, type Exec } from "./conductor.ts";
import { openLines, readJournal, resultsOf, settle } from "./journal.ts";
import { MAIN_CHECKOUT, makeObservers, makeWriters, realExecOut, realRunEvent, realStores, type ExecOut } from "./observers-real.ts";
import { readPhaseState } from "./phase-state.ts";
import { runTick, type TickResult } from "./tick.ts";
import { defaultNexus, type NexusDeps, type RunNowResult } from "./nexus.ts";
import { runRelease, type ReleaseResult } from "./release.ts";
import { runReport } from "./report.ts";
import { runScan } from "./scan.ts";
import { autonomousDir, newestEvent, readLock } from "./state.ts";
import { closeBreakerAsJack, runAway, runBack } from "./switch.ts";
import { ClickUpLoTracker } from "./tracker-clickup.ts";
import type { EventKind, Tracker } from "./types.ts";

export interface AutonomousDeps {
  tracker: () => Tracker;
  dir: string;
  ordersDir: string;
  conductorsJson: string;
  now: () => Date;
  scanId: () => string;
  exec: Exec;
  fileExists: (p: string) => boolean;
  nexus: NexusDeps;
  /** runs git and herdr-ws for `tick`; the real one by default */
  execOut?: ExecOut;
  /** the checkout `git fetch origin main` runs in (default: the main checkout) */
  mainRepo?: string;
}

const RESULTS: ReleaseResult[] = ["merged", "failed", "stopped", "awaiting-jack"];
const SCAN_KINDS: readonly EventKind[] = ["scan", "off", "busy"];

/** The real dependencies. Built only when a handler runs, never at import time. */
export function defaultDeps(): AutonomousDeps {
  const depot = join(homedir(), ".digismith-depot");
  let tracker: Tracker | null = null;
  return {
    tracker: () => (tracker ??= new ClickUpLoTracker(createClient(), DIGISMITH_SPACE_ID)),
    dir: autonomousDir(),
    ordersDir: join(depot, "sessions", "DigiSmith", "orders"),
    conductorsJson: join(depot, "conductors.json"),
    now: () => new Date(),
    scanId: () => randomUUID(),
    exec: realExec,
    mainRepo: MAIN_CHECKOUT,
    fileExists: existsSync,
    nexus: { ...defaultNexus(), fetch: globalThis.fetch },
  };
}

class UsageError extends Error {}

/** A tracker built on its first call, so a scan that ends before any tracker call (`off`) never reads the credentials. */
function lazyTracker(make: () => Tracker): Tracker {
  let t: Tracker | null = null;
  const get = (): Tracker => (t ??= make());
  return {
    hasStatus: (name) => get().hasStatus(name),
    listToDo: () => get().listToDo(),
    setStatus: (id, status) => get().setStatus(id, status),
    getStatus: (id) => get().getStatus(id),
    comment: (ref, text) => get().comment(ref, text),
  };
}

const CONDUCTOR = "digismith-conductor";

/** The real tick for `d`: the state and the lock are read on each call, `repo` is the checkout git fetch runs in. */
function makeTick(d: AutonomousDeps, dryRun: boolean, repo?: string): () => Promise<TickResult> {
  const exec = d.execOut ?? realExecOut;
  const herdrBin = join(homedir(), ".digismith-depot", "bin", "herdr-ws");
  const herdrWs = process.env.HERDR_WS || "w2";
  const tracker = lazyTracker(d.tracker);
  return () => {
    const read = readPhaseState(d.dir);
    const state = read.kind === "ok" ? read.state : null;
    const taskId = readLock(d.dir)?.taskId ?? "";
    const builderRunId = () => {
      const r = readPhaseState(d.dir);
      return r.kind === "ok" ? r.state.runs.builder : null;
    };
    const stores = realStores({ env: process.env, ticket: state?.ticket ?? "", builderRunId });
    const observers = makeObservers({
      exec, mainRepo: repo ?? d.mainRepo ?? MAIN_CHECKOUT, ticket: state?.ticket ?? "", claimedAt: state?.claimedAt ?? "",
      builderRunId, mergeHead: () => {
        const r = readPhaseState(d.dir);
        return r.kind === "ok" ? (r.state.mergeHead ?? null) : null;
      }, conductorName: CONDUCTOR, runs: stores.runs, reviewerData: stores.reviewerData,
      tracker: { getStatus: () => tracker.getStatus(taskId) }, herdrBin, herdrWs,
      attention: async () => attentionViews(readOpen(d.dir), state?.ticket),
    });
    const writers = makeWriters({
      exec, herdrBin, herdrWs, conductorName: CONDUCTOR,
      tracker: { setStatus: (s) => tracker.setStatus(taskId, s) }, runEvent: realRunEvent(),
    });
    return runTick({ dir: d.dir, now: d.now, observers, dryRun, ...writers });
  };
}

async function tickLines(d: AutonomousDeps, dryRun: boolean, repo?: string): Promise<string[]> {
  const lines: string[] = [];
  if (dryRun) lines.push("dry run, nothing written");
  const read = readPhaseState(d.dir);
  const state = read.kind === "ok" ? read.state : null;
  const r = await makeTick(d, dryRun, repo)();
  lines.push(`tick: ${r.outcome === "no-lock" ? "no lock" : r.outcome}`);
  if (state) lines.push(`state: ${state.ticket} ${state.phase} attempt ${state.attempt}`);
  if (r.action) {
    const { kind, ...rest } = r.action;
    lines.push(`action: ${kind}${Object.entries(rest).map(([k, v]) => ` ${k}=${String(v)}`).join("")}`);
  }
  for (const n of r.notes) lines.push(`note: ${n.ticket} ${n.cause}`);
  return lines;
}

function journalLines(d: AutonomousDeps, openOnly: boolean): string[] {
  if (openOnly) return openLines(d.dir).map((l) => `${l.key}  ${l.state}  ${l.planned.ts}`);
  const results = resultsOf(d.dir);
  const last = new Map<string, string>();
  for (const l of readJournal(d.dir)) last.set(l.key, l.ts);
  return [...last].map(([key, ts]) => `${key}  ${results[key]}  ${ts}`);
}

function guarded(depsFactory: () => AutonomousDeps, body: (deps: AutonomousDeps) => Promise<string[]>): Promise<void> {
  return (async () => {
    try {
      const lines = await body(depsFactory());
      for (const line of lines) console.log(line);
      process.exitCode = 0;
    } catch (err) {
      console.error(`autonomous: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = err instanceof UsageError ? 2 : 1;
    }
  })();
}

const runNowLine = (r: RunNowResult): string => (r.ok ? "run-now: ok" : `run-now: failed (${r.error})`);
// Times print in UTC+7 (fmtUtc7), as the status format in the plan lists them.
const utc7 = (iso: string): string => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? fmtUtc7(new Date(ms)) : iso;
};

function newestReport(dir: string): string | null {
  const reports = join(dir, "reports");
  let names: string[];
  try {
    names = readdirSync(reports);
  } catch {
    return null;
  }
  let best: { file: string; ms: number } | null = null;
  for (const n of names) {
    try {
      const file = join(reports, n);
      const st = statSync(file);
      if (st.isFile() && (best === null || st.mtimeMs > best.ms)) best = { file, ms: st.mtimeMs };
    } catch {
      // skip an unreadable file
    }
  }
  return best?.file ?? null;
}

function statusLines(d: AutonomousDeps): string[] {
  const now = d.now();
  const away = readAway(d.dir);
  const lines: string[] = [];
  if (isAway(away, now)) lines.push(away?.until ? `away: on until ${utc7(away.until)}` : "away: on (no end time)");
  else lines.push("away: off");
  const lock = readLock(d.dir);
  lines.push(lock ? `lock: ${lock.ticket} since ${lock.claimedAtUtc7 || utc7(lock.claimedAt)}` : "lock: none");
  const phase = readPhaseState(d.dir);
  if (phase.kind === "ok") {
    const s = phase.state;
    lines.push(`Phase: ${s.phase} (attempt ${s.attempt}, since ${utc7(s.phaseStartedAt)}) builder run ${s.runs.builder ?? "none"}`);
  }
  const ev = newestEvent(d.dir, SCAN_KINDS);
  lines.push(ev ? `last scan: ${utc7(ev.ts)} ${ev.kind}` : "last scan: none");
  const report = newestReport(d.dir);
  if (report) {
    lines.push(`newest report: ${report}`);
    try {
      lines.push(...readFileSync(report, "utf-8").split("\n").slice(0, 20));
    } catch (e) {
      lines.push(`(cannot read it: ${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return lines;
}

export function createAutonomousCommand(depsFactory: () => AutonomousDeps = defaultDeps): CommandModule {
  return {
    command: "autonomous",
    describe: "Autonomous Operation: scan to do and claim one ticket, the away switch, release, report, status",
    builder: (y) =>
      y
        .command({
          command: "scan",
          describe: "scan to do and claim the first ready ticket (works only at night or while away)",
          builder: (e) =>
            e
              .option("dry-run", { type: "boolean", default: false, describe: "print the verdict for each candidate, write nothing, any hour" })
              .option("repo", { type: "string", requiresArg: true, demandOption: true, describe: "the repo checkout the board folders are read from" })
              .option("orders", { type: "string", requiresArg: true, describe: "orders dir (default ~/.digismith-depot/sessions/DigiSmith/orders)" }),
          handler: (argv) =>
            guarded(depsFactory, async (d) => {
              const r = await runScan({
                tracker: lazyTracker(d.tracker), dir: d.dir, ordersDir: (argv.orders as string | undefined) ?? d.ordersDir,
                conductorsJson: d.conductorsJson, repo: argv.repo as string, now: d.now, scanId: d.scanId(),
                exec: d.exec, fileExists: d.fileExists, dryRun: argv.dryRun as boolean, nexus: d.nexus,
                tick: makeTick(d, false, argv.repo as string),
              });
              const lines: string[] = [];
              lines.push(`scan: ${r.outcome}${r.claimed ? ` ${r.claimed}` : ""} (${r.candidates} candidates, ${r.skipped.length} skipped)`);
              for (const s of r.skipped) lines.push(`skipped ${s.key}: ${s.reason}`);
              if (r.verdicts) {
                lines.push("dry run, nothing written:");
                const w = Math.max(6, ...r.verdicts.map((v) => v.key.length));
                for (const v of r.verdicts) lines.push(`${v.key.padEnd(w)}  ${v.reasons.length ? v.reasons.join("; ") : "ready"}`);
              }
              return lines;
            }),
        })
        .command({
          command: "away",
          describe: "turn the away switch on (work in the day too), optionally until a UTC+7 clock time",
          builder: (e) => e.option("until", { type: "string", requiresArg: true, describe: "HH:MM in UTC+7, the next time that clock comes round" }),
          handler: (argv) =>
            guarded(depsFactory, async (d) => {
              const until = argv.until as string | undefined;
              if (until !== undefined) {
                try { parseHhmm(until); } catch (e) { throw new UsageError(`--until: ${(e as Error).message}`); }
              }
              const r = await runAway({ dir: d.dir, now: d.now, nexus: d.nexus }, { until });
              return [r.until ? `away: on until ${utc7(r.until)}` : "away: on (no end time)", runNowLine(r.runNow)];
            }),
        })
        .command({
          command: "back",
          describe: "turn the away switch off and ask for the report",
          handler: () =>
            guarded(depsFactory, async (d) => {
              const r = await runBack({ dir: d.dir, now: d.now, nexus: d.nexus });
              return ["away: off", runNowLine(r.runNow)];
            }),
        })
        .command({
          command: "release",
          describe: "release the lock after a claimed ticket ends, then kick the next scan",
          builder: (e) =>
            e
              .option("ticket", { type: "string", requiresArg: true, demandOption: true, describe: "ticket key, e.g. DGS-549" })
              .option("result", { type: "string", choices: RESULTS, demandOption: true })
              .option("reason", { type: "string", requiresArg: true })
              .option("commit", { type: "string", requiresArg: true })
              .option("cause", { type: "string", requiresArg: true, describe: "why a failed ticket failed: a code from the cause list (unknown when absent or not in it)" }),
          handler: (argv) =>
            guarded(depsFactory, async (d) => {
              const r = await runRelease(
                { tracker: d.tracker(), dir: d.dir, now: d.now, nexus: d.nexus },
                { ticket: argv.ticket as string, result: argv.result as ReleaseResult, reason: argv.reason as string | undefined, commit: argv.commit as string | undefined, cause: argv.cause as string | undefined },
              );
              if (r.warning) console.error(`release: ${r.warning}`);
              const lines = [`release: ${argv.ticket as string} ${argv.result as string}, lock cleared: ${r.lockCleared ? "yes" : "no"}`];
              if (r.cause) lines.push(`cause: ${r.cause}${r.retryEligible ? " (retry eligible)" : ""}`);
              if (r.breakerOpened) lines.push("breaker: open, scans stop until dg autonomous resume");
              lines.push(runNowLine(r.runNow));
              return lines;
            }),
        })
        .command({
          command: "watch",
          describe: "check the open runs for blocked, stalled and lost ones and write the attention list",
          builder: (e) => e.option("dry-run", { type: "boolean", default: false, describe: "print what would change, write nothing" }),
          handler: (argv) =>
            guarded(depsFactory, async (d) => {
              const entry = process.argv[1];
              const r = await runWatch({
                env: process.env, dir: d.dir, cwd: process.cwd(), now: Date.now, panes: herdrPaneLookup(), dryRun: argv.dryRun as boolean,
                runDg: (args) => new Promise((resolve) => {
                  execFile(process.execPath, [entry, ...args], { timeout: 60_000 }, (err) => resolve({ ok: !err }));
                }),
              });
              return r.lines;
            }),
        })
        .command({
          command: "attention",
          describe: "list the open attention items, or resolve one",
          builder: (e) =>
            e
              .option("json", { type: "boolean", default: false, describe: "print the open items as JSON" })
              .command({
                command: "resolve <id>",
                describe: "close an open item by hand (recorded as jack)",
                builder: (s) => s.positional("id", { type: "string", demandOption: true }).option("note", { type: "string", requiresArg: true }),
                handler: (argv) =>
                  guarded(depsFactory, async (d) => {
                    const id = argv.id as string;
                    if (!appendResolved(d.dir, id, "jack", d.now().toISOString(), (argv.note as string | undefined) ?? "")) throw new Error(`${id}: not an open item`);
                    return [`resolved ${id}`];
                  }),
              }),
          handler: (argv) =>
            guarded(depsFactory, async (d) => {
              const items = readOpen(d.dir);
              return [argv.json ? JSON.stringify(items, null, 2) : formatOpen(items, d.now().getTime())];
            }),
        })
        .command({
          command: "resume",
          describe: "close the circuit breaker so scans can claim again",
          handler: () =>
            guarded(depsFactory, async (d) => [closeBreakerAsJack(d.dir, d.now(), "resume") ? "breaker closed" : "breaker was not open"]),
        })
        .command({
          command: "report",
          describe: "write the report since the last one and post it on DGS-548",
          handler: () =>
            guarded(depsFactory, async (d) => {
              const r = await runReport({ tracker: d.tracker(), dir: d.dir, now: d.now });
              return [`report: ${r.file}`, `comment: ${r.commented ? "posted" : "failed"}`];
            }),
        })
        .command({
          command: "status",
          describe: "show the away switch, the lock, the last scan and the newest report",
          handler: () => guarded(depsFactory, async (d) => statusLines(d)),
        })
        .command({
          command: "tick",
          describe: "advance the locked ticket one step (read the world, decide, act)",
          builder: (e) =>
            e
              .option("dry-run", { type: "boolean", default: false, describe: "observe and decide, write nothing" })
              .option("repo", { type: "string", requiresArg: true, describe: "the main checkout git fetch runs in (default ~/Workspace/Jazurite/DigiSmith)" }),
          handler: (argv) => guarded(depsFactory, (d) => tickLines(d, argv.dryRun as boolean, argv.repo as string | undefined)),
        })
        .command({
          command: "journal",
          describe: "list the action journal, or settle an uncertain key",
          builder: (e) =>
            e
              .option("open", { type: "boolean", default: false, describe: "only open and uncertain keys" })
              .command({
                command: "settle <key>",
                describe: "settle an uncertain or open key by hand (recorded as jack)",
                builder: (s) =>
                  s
                    .positional("key", { type: "string", demandOption: true })
                    .option("result", { type: "string", choices: ["retryable", "permanent"] as const, demandOption: true })
                    .option("note", { type: "string", requiresArg: true }),
                handler: (argv) =>
                  guarded(depsFactory, async (d) => {
                    const key = argv.key as string;
                    const state = resultsOf(d.dir)[key];
                    if (state !== "uncertain" && state !== "open") throw new Error(`${key}: ${state ?? "not in the journal"}, only uncertain or open keys can be settled`);
                    const final = settle(d.dir, d.now(), key, argv.result as "retryable" | "permanent", (argv.note as string | undefined) ?? "", "jack");
                    return [`${key}  ${final}`];
                  }),
              }),
          handler: (argv) => guarded(depsFactory, async (d) => journalLines(d, argv.open as boolean)),
        })
        .demandCommand(1, ""),
    handler: () => {},
  };
}

const autonomousCommand = createAutonomousCommand();
export default autonomousCommand;
