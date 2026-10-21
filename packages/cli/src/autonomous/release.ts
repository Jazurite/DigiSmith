import { appendFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fmtUtc7 } from "./clock.ts";
import { closeOpen, plan, resultsOf, settle } from "./journal.ts";
import { runNow, type NexusDeps, type RunNowResult } from "./nexus.ts";
import { appendEvent, clearLock, readLock } from "./state.ts";
import type { Tracker } from "./types.ts";

export type ReleaseResult = "merged" | "failed" | "stopped" | "awaiting-jack";
export interface ReleaseDeps { tracker: Tracker; dir: string; now: () => Date; nexus: NexusDeps }

const JOB = "autonomous-scan";
const CORRUPT = "?";

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
    // A corrupt lock reads as ticket "?" (readLock): `--ticket "?"` clears it, with no ticket to comment on.
    if (lock.ticket !== a.ticket) throw new Error(`the lock belongs to ${lock.ticket}`);
    const corrupt = lock.ticket === CORRUPT;
    const claimedMs = Date.parse(lock.claimedAt);
    const lateReport = Number.isFinite(claimedMs) ? newestReportAfter(d.dir, claimedMs) : null;
    // failed, stopped and awaiting-jack always comment on the ticket, a late release too (design sections 1 and 9).
    if (a.result !== "merged" && !corrupt) {
      try {
        await d.tracker.comment(lock.taskId, `Autonomous Operation ${a.result} (${fmtUtc7(now)})${a.reason ? `: ${a.reason}` : ""}`);
      } catch (e) {
        appendEvent(d.dir, now, "comment-failed", { ticket: a.ticket, error: e instanceof Error ? e.message : String(e) });
      }
    }
    // plan runs before clearLock: a crash between leaves an open line that closeOpen settles on the next release.
    const phase = lock.phase ?? "claimed";
    const attempt = lock.attempt ?? 1;
    const jkey = `${a.ticket}:${phase}:${attempt}:released`;
    const used = resultsOf(d.dir)[jkey];
    const journaled = !corrupt && (used === undefined || used === "retryable");
    if (journaled) plan(d.dir, now, { ticket: a.ticket, phase, attempt, action: "released" });
    clearLock(d.dir);
    lockCleared = true;
    if (journaled) settle(d.dir, now, jkey, "succeeded", a.result);
    if (!corrupt) closeOpen(d.dir, now, a.ticket, "released");
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
