import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CommandModule } from "yargs";

// The only place the number of days lives.
export const CLEANUP_DAYS = 3;

const DAY_MS = 86_400_000;
const SAFE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

export type Entry = { path: string; reason: string };
export type Plan = { delete: Entry[]; kept: Entry[]; errors: Entry[] };

export function depotDir(env: NodeJS.ProcessEnv = process.env): string {
  const o = env.DIGISMITH_DEPOT_DIR;
  return o !== undefined && o !== "" ? o : path.join(os.homedir(), ".digismith-depot");
}

// Reads status and ended from a card file. Throws on a line that is not "key: value" or a bad status.
function readCard(text: string): { status: string; ended?: string } {
  const fields: Record<string, string> = {};
  text.replace(/^﻿/, "").split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === "" || line.trimStart().startsWith("#")) return;
    const m = /^([a-z_]+):(?: (.*))?$/.exec(line);
    if (!m) throw new Error(`line ${i + 1}: not a "key: value" line`);
    let v = (m[2] ?? "").trim();
    if (v.startsWith('"')) {
      try { v = JSON.parse(v) as string; } catch { throw new Error(`line ${i + 1}: bad quoted value`); }
    }
    fields[m[1]] = v;
  });
  if (!["open", "closed", "lost"].includes(fields.status)) throw new Error("status: must be open, closed or lost");
  return { status: fields.status, ended: fields.ended };
}

function isRealDir(p: string): boolean {
  try { return fs.lstatSync(p).isDirectory(); } catch { return false; }
}

// Allow-list, positive: only archive/<name>.yml, a regular file (never a symlink), a card with
// status closed or lost, and an ended STRICTLY older than CLEANUP_DAYS. Nothing else is a candidate.
export function planCleanup(depot: string, now: Date, project?: string): Plan {
  const plan: Plan = { delete: [], kept: [], errors: [] };
  const root = path.join(depot, "sessions");
  if (project !== undefined && !SAFE_RE.test(project)) throw new Error("project: not a safe folder name");
  if (!isRealDir(root)) return plan;
  const projects = project !== undefined ? [project] : fs.readdirSync(root).filter((n) => SAFE_RE.test(n)).sort();
  for (const proj of projects) {
    const pdir = path.join(root, proj);
    const archive = path.join(pdir, "archive");
    if (!isRealDir(pdir) || !isRealDir(archive)) continue;
    for (const name of fs.readdirSync(archive).sort()) {
      if (!name.endsWith(".yml") || name.startsWith(".")) continue;
      const file = path.join(archive, name);
      const st = fs.lstatSync(file);
      if (st.isSymbolicLink()) { plan.kept.push({ path: file, reason: "symlink skipped" }); continue; }
      if (!st.isFile()) continue;
      let card: { status: string; ended?: string };
      try { card = readCard(fs.readFileSync(file, "utf-8")); } catch (e) {
        plan.errors.push({ path: file, reason: (e as Error).message });
        continue;
      }
      if (card.status === "open") { plan.kept.push({ path: file, reason: "open card" }); continue; }
      if (card.ended === undefined) { plan.kept.push({ path: file, reason: "no ended" }); continue; }
      const t = TS_RE.test(card.ended) ? Date.parse(card.ended) : NaN;
      if (Number.isNaN(t)) { plan.kept.push({ path: file, reason: "ended unreadable" }); continue; }
      if (now.getTime() - t > CLEANUP_DAYS * DAY_MS) {
        plan.delete.push({ path: file, reason: `${card.status}, ended ${card.ended}` });
      } else plan.kept.push({ path: file, reason: `${card.status}, ended ${card.ended}, not older than ${CLEANUP_DAYS} days` });
    }
  }
  return plan;
}

export function runCleanup(opts: { depot: string; now?: Date; yes: boolean; project?: string }): {
  lines: string[]; errors: string[]; exitCode: number;
} {
  const now = opts.now ?? new Date();
  const plan = planCleanup(opts.depot, now, opts.project);
  const lines: string[] = [];
  const logFile = path.join(opts.depot, "sessions", "cleanup.log");
  // Open the log first: if it cannot be written, nothing is deleted.
  const logFd = opts.yes && plan.delete.length > 0 ? fs.openSync(logFile, "a") : undefined;
  for (const d of plan.delete) {
    if (!opts.yes) { lines.push(`would delete ${d.path} (${d.reason})`); continue; }
    fs.unlinkSync(d.path);
    const line = `deleted ${d.path} (${d.reason})`;
    fs.writeSync(logFd!, `${now.toISOString()} ${line}\n`);
    lines.push(line);
  }
  if (logFd !== undefined) fs.closeSync(logFd);
  const errors = plan.errors.map((e) => `kept ${e.path}: ${e.reason}`);
  return { lines, errors, exitCode: errors.length > 0 ? 1 : 0 };
}

interface Args { project?: string; yes: boolean }

export const cleanupCommand: CommandModule<object, Args> = {
  command: "cleanup",
  describe: `delete archived closed/lost session cards that ended more than ${CLEANUP_DAYS} days ago (dry run unless --yes)`,
  builder: (y) =>
    y
      .option("project", { type: "string", describe: "only this project folder (default: all)" })
      .option("yes", { type: "boolean", default: false, describe: "really delete (default is a dry run)" }),
  handler: (args) => {
    const r = runCleanup({ depot: depotDir(), yes: args.yes, project: args.project });
    for (const l of r.lines) console.log(l);
    for (const e of r.errors) console.error(e);
    console.log(`${args.yes ? "deleted" : "would delete"} ${r.lines.length} file(s)${args.yes ? "" : " (dry run; --yes to delete)"}`);
    if (r.exitCode !== 0) process.exitCode = r.exitCode;
  },
};
