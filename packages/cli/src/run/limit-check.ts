// DGS-665: reads the rows, the factory lock and the config, and counts. The one function `dg run start`, `dg run limit` and the scan share.
import { readLimitsFile } from "../autonomous/guardrails.ts";
import { autonomousDir, readLock } from "../autonomous/state.ts";
import { countSlots, refusal, type Count, type Kind } from "./limit.ts";
import { listRuns } from "./read.ts";

// 2 days is above the stale window (at most 1440 minutes), so a run that could still count is always read.
const WINDOW_DAYS = 2;

export function currentCount(env: NodeJS.ProcessEnv, cwd: string, nowMs: number = Date.now()): { count: Count; problems: string[] } {
  const cfg = readLimitsFile(cwd);
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
