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
  return { runNow: await kick(d, "autonomous-report") };
}
