import { appendFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fmtUtc7 } from "./clock.ts";
import { runNow, type NexusDeps, type RunNowResult } from "./nexus.ts";
import { appendEvent, clearLock, readLock } from "./state.ts";
import type { Tracker } from "./types.ts";

export type ReleaseResult = "merged" | "failed" | "stopped" | "awaiting-jack";
export interface ReleaseDeps { tracker: Tracker; dir: string; now: () => Date; nexus: NexusDeps }

const JOB = "autonomous-scan";

function newestReportAfter(dir: string, sinceMs: number): string | null {
  const reports = join(dir, "reports");
  let best: { file: string; ms: number } | null = null;
  let names: string[];
  try {
    names = readdirSync(reports);
  } catch {
    return null;
  }
  for (const n of names) {
    try {
      const file = join(reports, n);
      const st = statSync(file);
      if (st.isFile() && (best === null || st.mtimeMs > best.ms)) best = { file, ms: st.mtimeMs };
    } catch {
      // skip an unreadable file
    }
  }
  return best !== null && best.ms > sinceMs ? best.file : null;
}

export async function runRelease(
  d: ReleaseDeps,
  a: { ticket: string; result: ReleaseResult; reason?: string; commit?: string },
): Promise<{ lockCleared: boolean; runNow: RunNowResult }> {
  const now = d.now();
  const lock = readLock(d.dir);
  let lockCleared = false;
  if (lock === null) {
    appendEvent(d.dir, now, "release", { ticket: a.ticket, result: a.result, note: "no-lock" });
  } else {
    if (lock.ticket !== a.ticket) throw new Error(`the lock belongs to ${lock.ticket}`);
    const claimedMs = Date.parse(lock.claimedAt);
    const lateReport = Number.isFinite(claimedMs) ? newestReportAfter(d.dir, claimedMs) : null;
    if (a.result !== "merged" && lateReport === null) {
      try {
        await d.tracker.comment(lock.taskId, `Autonomous Operation ${a.result} (${fmtUtc7(now)})${a.reason ? `: ${a.reason}` : ""}`);
      } catch (e) {
        appendEvent(d.dir, now, "comment-failed", { ticket: a.ticket, error: e instanceof Error ? e.message : String(e) });
      }
    }
    clearLock(d.dir);
    lockCleared = true;
    const minutes = Number.isFinite(claimedMs) ? Math.round((now.getTime() - claimedMs) / 60_000) : null;
    appendEvent(d.dir, now, "release", { ticket: a.ticket, result: a.result, reason: a.reason, commit: a.commit, minutes });
    if (lateReport !== null) {
      try {
        appendFileSync(lateReport, `late release: ${a.ticket} ${a.result}\n`);
      } catch (e) {
        console.error(`release: cannot append the late release line: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  const rn = await runNow(d.nexus, JOB);
  appendEvent(d.dir, now, "run-now", { job: JOB, ok: rn.ok, status: rn.ok ? 202 : rn.status });
  return { lockCleared, runNow: rn };
}
