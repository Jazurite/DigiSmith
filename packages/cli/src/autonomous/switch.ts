import { appendResolved, readOpen } from "./attention.ts";
import { closeBreaker, readBreaker } from "./breaker.ts";
import { nextClock } from "./clock.ts";
import { readAway, writeAway } from "./away.ts";
import { runNow, type NexusDeps, type RunNowResult } from "./nexus.ts";
import { appendEvent } from "./state.ts";

export interface SwitchDeps { dir: string; now: () => Date; nexus: NexusDeps }

async function kick(d: SwitchDeps, job: string): Promise<RunNowResult> {
  const r = await runNow(d.nexus, job);
  appendEvent(d.dir, d.now(), "run-now", { job, ok: r.ok, status: r.ok ? 202 : r.status });
  return r;
}

/** Closes the breaker and resolves the open circuit-breaker-open items as jack. Returns whether the breaker was open. */
export function closeBreakerAsJack(dir: string, now: Date, note: string): boolean {
  const wasOpen = readBreaker(dir).open;
  if (wasOpen) closeBreaker(dir);
  for (const it of readOpen(dir).filter((o) => o.cause === "circuit-breaker-open" || o.cause.startsWith("breaker-file-unreadable"))) appendResolved(dir, it.id, "jack", now.toISOString(), note);
  return wasOpen;
}

export async function runAway(d: SwitchDeps, a: { until?: string }): Promise<{ until: string | null; runNow: RunNowResult }> {
  const now = d.now();
  const until = a.until === undefined ? null : nextClock(now, a.until).toISOString();
  writeAway(d.dir, { away: true, since: now.toISOString(), until, endedAt: null });
  appendEvent(d.dir, now, "away-on", { until });
  return { until, runNow: await kick(d, "autonomous-scan") };
}

export async function runBack(d: SwitchDeps, kind: "away-off" | "away-expired" = "away-off"): Promise<{ runNow: RunNowResult }> {
  const now = d.now();
  const cur = readAway(d.dir);
  writeAway(d.dir, { away: false, since: cur?.since || now.toISOString(), until: cur?.until ?? null, endedAt: now.toISOString() });
  appendEvent(d.dir, now, kind);
  // Only Jack's own `back` closes the breaker; an expired away window never does. back never fails because of the breaker.
  if (kind === "away-off") {
    try { closeBreakerAsJack(d.dir, now, "back"); } catch { /* go on */ }
  }
  return { runNow: await kick(d, "autonomous-report") };
}
