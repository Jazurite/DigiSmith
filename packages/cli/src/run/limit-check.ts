// DGS-665: reads the rows, the factory lock and the config, and counts. The one function `dg run start`, `dg run limit` and the scan share.
import * as fs from "node:fs";
import * as path from "node:path";
import { readLimitsFile } from "../autonomous/guardrails.ts";
import { autonomousDir, readLock } from "../autonomous/state.ts";
import { countSlots, refusal, type Count, type Kind } from "./limit.ts";
import { listRuns } from "./read.ts";
import { readDriver } from "../conductor/drivers.ts";

// 2 days is above the stale window (at most 1440 minutes), so a run that could still count is always read.
const WINDOW_DAYS = 2;

/**
 * The main checkout for `cwd`, from files only (no child process): walk up to the nearest `.git`; a folder is the main checkout,
 * a file ("gitdir: <main>/.git/worktrees/<name>") points at the common git dir through its `commondir`, whose parent is the main checkout.
 * Any failure gives `cwd` back. The limits are Workbox-wide and live in the main checkout's config, not in a worktree's copy.
 */
export function mainCheckout(cwd: string): string {
  try {
    for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
      const git = path.join(dir, ".git");
      if (fs.existsSync(git)) {
        if (fs.statSync(git).isDirectory()) return dir;
        const gitdir = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(git, "utf-8"))?.[1].trim();
        if (!gitdir) return cwd;
        const wt = path.resolve(dir, gitdir);
        const common = path.resolve(wt, fs.readFileSync(path.join(wt, "commondir"), "utf-8").trim());
        return path.dirname(common);
      }
      if (path.dirname(dir) === dir) return cwd;
    }
  } catch {
    return cwd;
  }
}

export function currentCount(env: NodeJS.ProcessEnv, cwd: string, nowMs: number = Date.now()): { count: Count; problems: string[] } {
  const cfg = readLimitsFile(mainCheckout(cwd));
  const lock = readLock(autonomousDir(env));
  const rows = listRuns(env, undefined, { days: WINDOW_DAYS, nowMs });
  return { count: countSlots(rows, lock === null ? null : { ticket: lock.ticket }, nowMs, cfg.limits, cfg.staleAfterMinutes), problems: cfg.problems };
}

/**
 * The refusal text for a start of `kind` for `ticket`, or null when it may start.
 * The factory ticket's own builder IS the factory slot (the lock already counts it), so it is never refused by the builder limit.
 */
export function startRefusal(env: NodeJS.ProcessEnv, cwd: string, kind: Kind, ticket: string): string | null {
  if (kind === "builder" && readLock(autonomousDir(env))?.ticket === ticket) return null;
  return refusal(currentCount(env, cwd).count, kind);
}

/**
 * DGS-683: the refusal text when another conductor drives `ticket`, or null. Only a builder or reviewer start is checked.
 * No driver file means the start goes on as before (the starter is not claimed here). The starter is DIGISMITH_NAME.
 * A ticket outside the driver key format (^[A-Z]+-\d+$) has no driver record, so it is not checked.
 */
export function driverRefusal(env: NodeJS.ProcessEnv, role: string, ticket: string): string | null {
  if (role !== "builder" && role !== "reviewer") return null;
  if (!/^[A-Z]+-\d+$/.test(ticket)) return null;
  const d = readDriver(ticket, env);
  if (d === null || d.driver === env.DIGISMITH_NAME) return null;
  // the factory's own ticket: its conductor may run without DIGISMITH_NAME, so a factory-mode record on the lock's ticket passes when no name is set (as in startRefusal); a different name is still refused
  if (!env.DIGISMITH_NAME && d.mode === "factory" && readLock(autonomousDir(env))?.ticket === ticket) return null;
  return `${ticket} is driven by ${d.driver} (since ${d.since}): ask that conductor`;
}
