import { listRuns } from "../run/read.ts";
import { readEvents, type EventLine } from "../run/events.ts";
import { findRunDir } from "../run/paths.ts";
import type { RunRecord } from "../run/record.ts";
import { appendOpen, appendResolved, readOpen, type AttentionKind, type OpenItem } from "./attention.ts";
import { readBudgets } from "./budgets.ts";
import { notifyNew, type RunDg } from "./notify.ts";
import type { PaneLookup } from "./pane.ts";
import { classify, decideRetry, type Pane } from "./watchdog.ts";

export interface WatchDeps {
  env: NodeJS.ProcessEnv; dir: string; cwd: string; now: () => number;
  panes: PaneLookup; runDg: RunDg; dryRun: boolean;
}
export interface WatchResult { lines: string[]; opened: number; resolved: number; commented: number }

const RETENTION_MS = 7 * 24 * 3600_000;
const AUTO: AttentionKind[] = ["blocked", "stalled"];

function withEvents(env: NodeJS.ProcessEnv): { record: RunRecord; events: EventLine[] }[] {
  const out: { record: RunRecord; events: EventLine[] }[] = [];
  for (const { record } of listRuns(env)) {
    try {
      const rd = findRunDir(record.run, env);
      if (!rd) continue;
      out.push({ record, events: readEvents(rd) });
    } catch { /* skip a run that cannot be read */ }
  }
  return out;
}

export async function runWatch(d: WatchDeps): Promise<WatchResult> {
  const res: WatchResult = { lines: [], opened: 0, resolved: 0, commented: 0 };
  const nowMs = d.now();
  const nowIso = new Date(nowMs).toISOString();
  const { budgets, problems } = readBudgets(d.cwd);
  // The attention file is read once per pass; the list follows what the pass opens and resolves.
  let items = readOpen(d.dir);
  const open = (i: Omit<OpenItem, "id" | "ts">): void => {
    if (items.some((o) => o.run === i.run && o.kind === i.kind)) return;
    if (d.dryRun) { res.opened++; items.push({ ...i, id: `${i.run}.${i.kind}.dry`, ts: nowIso }); return; }
    const made = appendOpen(d.dir, { ...i, ts: nowIso });
    if (made) { res.opened++; items.push(made); }
  };
  const close = (it: OpenItem, note: string): void => {
    if (!d.dryRun) appendResolved(d.dir, it.id, "watchdog", nowIso, note);
    res.resolved++;
    items = items.filter((o) => o.id !== it.id);
  };

  for (const p of problems) {
    res.lines.push(`config: ${p}`);
    open({ ticket: null, run: "-", kind: "failed", cause: "bad-budget-config", since: nowIso });
  }

  const paneCache = new Map<string, Set<string> | null>();
  const paneOf = async (ws: string | null, pane: string | null): Promise<Pane> => {
    if (!ws || !pane) return "unknown";
    if (!paneCache.has(ws)) paneCache.set(ws, await d.panes(ws));
    const set = paneCache.get(ws);
    return set ? (set.has(pane) ? "present" : "gone") : "unknown";
  };

  const runs = withEvents(d.env);
  for (const { record, events } of runs) {
    if (nowMs - Date.parse(record.created_at) > RETENTION_MS && !events.some((e) => e.type === "ended")) continue;
    const pane = await paneOf(record.herdr.workspace, record.herdr.pane);
    const v = classify(record, events, pane, nowMs, budgets);
    const mine = items.filter((o) => o.run === record.run && AUTO.includes(o.kind));
    if (v.state === "ended" || v.state === "healthy") {
      for (const it of mine) close(it, `run is ${v.state} again`);
      continue;
    }
    for (const it of mine.filter((o) => o.kind !== v.state)) close(it, `run is ${v.state} now`);
    open({
      ticket: record.ticket, run: record.run, kind: v.state as AttentionKind, cause: v.cause, since: v.since,
      retryEligible: decideRetry(v.state, "unknown", 0) === "retry", causeClass: "unknown",
    });
    res.lines.push(`${record.run}  ${record.ticket}  ${v.state}  ${v.cause}`);
  }

  if (!d.dryRun) {
    // earlier sends that failed are offered again with this pass's new items
    const n = await notifyNew({ dir: d.dir, now: d.now, runDg: d.runDg }, readOpen(d.dir));
    res.commented = n.sent;
  }
  res.lines.push(d.dryRun
    ? `watch (dry run, nothing written): ${runs.length} runs, would open ${res.opened}, would resolve ${res.resolved}`
    : `watch: ${runs.length} runs, ${res.opened} opened, ${res.resolved} resolved, ${res.commented} commented`);
  return res;
}
