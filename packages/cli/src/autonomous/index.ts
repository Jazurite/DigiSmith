import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CommandModule } from "yargs";
import { createClient, DIGISMITH_SPACE_ID } from "../clickup/lib.ts";
import { readAway, isAway } from "./away.ts";
import { fmtUtc7, parseHhmm } from "./clock.ts";
import { realExec, type Exec } from "./conductor.ts";
import { defaultNexus, type NexusDeps, type RunNowResult } from "./nexus.ts";
import { runRelease, type ReleaseResult } from "./release.ts";
import { runReport } from "./report.ts";
import { runScan } from "./scan.ts";
import { autonomousDir, newestEvent, readLock } from "./state.ts";
import { runAway, runBack } from "./switch.ts";
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
              .option("commit", { type: "string", requiresArg: true }),
          handler: (argv) =>
            guarded(depsFactory, async (d) => {
              const r = await runRelease(
                { tracker: d.tracker(), dir: d.dir, now: d.now, nexus: d.nexus },
                { ticket: argv.ticket as string, result: argv.result as ReleaseResult, reason: argv.reason as string | undefined, commit: argv.commit as string | undefined },
              );
              return [`release: ${argv.ticket as string} ${argv.result as string}, lock cleared: ${r.lockCleared ? "yes" : "no"}`, runNowLine(r.runNow)];
            }),
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
        .demandCommand(1, ""),
    handler: () => {},
  };
}

const autonomousCommand = createAutonomousCommand();
export default autonomousCommand;
