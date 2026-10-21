import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { summarize } from "../run/read.ts";
import { readEvents, type EventLine } from "../run/events.ts";
import { runsDir } from "../run/paths.ts";
import { readRun, type RunRecord } from "../run/record.ts";
import { appendOpen, appendResolved, readOpen, type AttentionKind, type OpenItem } from "./attention.ts";
import { readBudgets } from "./budgets.ts";
import { atomicWrite } from "./state.ts";
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

/** Each run is read once; a run older than 7 days is skipped unless it still has an open item and has ended. A broken run dir gives one stderr line; an unreadable runs root throws. */
function withEvents(env: NodeJS.ProcessEnv, nowMs: number, hasOpen: (run: string) => boolean): { record: RunRecord; events: EventLine[] }[] {
  const root = runsDir(env);
  let keys: string[];
  try {
    keys = readdirSync(root);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error(`watch: cannot read the runs folder ${root}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const out: { record: RunRecord; events: EventLine[] }[] = [];
  for (const key of keys) {
    const keyDir = join(root, key);
    let ids: string[];
    try { ids = readdirSync(keyDir); } catch { continue; } // hook-errors.log is a file, not a ticket folder
    for (const id of ids) {
      const rd = join(keyDir, id);
      try {
        const record = readRun(rd);
        // An old run is read only when it still has an open item: an ended one closes it, any other old run is skipped.
        const old = nowMs - Date.parse(record.created_at) > RETENTION_MS;
        if (old && !hasOpen(record.run)) continue;
        const events = readEvents(rd);
        if (old && !summarize(events).ended) continue;
        out.push({ record, events });
      } catch (e) {
        console.error(`watch: skipped run ${rd}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return out;
}

/** What the pass remembers between runs: the (run, kind) pairs it opened with the since of that episode, cleared when the run is seen healthy or ended again. A pair from an older file has no since (null). */
function loadState(dir: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  try {
    const v = JSON.parse(readFileSync(join(dir, "watch-state.json"), "utf-8")) as { opened?: unknown; since?: unknown };
    const since = typeof v.since === "object" && v.since !== null ? (v.since as Record<string, unknown>) : {};
    if (Array.isArray(v.opened)) for (const k of v.opened) if (typeof k === "string") out.set(k, typeof since[k] === "string" ? (since[k] as string) : null);
  } catch { /* missing or corrupt: empty */ }
  return out;
}

export async function runWatch(d: WatchDeps): Promise<WatchResult> {
  const res: WatchResult = { lines: [], opened: 0, resolved: 0, commented: 0 };
  const nowMs = d.now();
  const nowIso = new Date(nowMs).toISOString();
  const { budgets, problems } = readBudgets(d.cwd);
  // The attention file is read once per pass; the list follows what the pass opens and resolves.
  let items = readOpen(d.dir);
  // A (run, kind) opened earlier and no longer open was resolved: it stays closed while its since is the same, or until the run is seen healthy.
  const opened = loadState(d.dir);
  const key = (run: string, kind: string): string => `${run}|${kind}`;
  const open = (i: Omit<OpenItem, "id" | "ts">): void => {
    if (items.some((o) => o.run === i.run && o.kind === i.kind)) return;
    if (i.run !== "-") { // "-" is the config item: it follows the config, not a run
      const k = key(i.run, i.kind);
      if (opened.has(k)) {
        const was = opened.get(k);
        if (was === null || was === i.since) { opened.set(k, i.since); return; }
      }
      opened.set(k, i.since);
    }
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

  const runs = withEvents(d.env, nowMs, (run) => items.some((o) => o.run === run && AUTO.includes(o.kind)));
  for (const { record, events } of runs) {
    const pane = await paneOf(record.herdr.workspace, record.herdr.pane);
    const v = classify(record, events, pane, nowMs, budgets);
    const mine = items.filter((o) => o.run === record.run && AUTO.includes(o.kind));
    if (v.state === "ended" || v.state === "healthy") {
      for (const k of [...opened.keys()]) if (k.startsWith(`${record.run}|`)) opened.delete(k);
      for (const it of mine) close(it, `run is ${v.state} again`);
      continue;
    }
    for (const it of mine.filter((o) => o.kind !== v.state)) { close(it, `run is ${v.state} now`); opened.delete(key(it.run, it.kind)); }
    open({
      ticket: record.ticket, run: record.run, kind: v.state as AttentionKind, cause: v.cause, since: v.since,
      retryEligible: decideRetry(v.state, "unknown", 0) === "retry", causeClass: "unknown",
    });
    res.lines.push(`${record.run}  ${record.ticket}  ${v.state}  ${v.cause}`);
  }

  if (!d.dryRun) {
    const live = new Set(runs.map((r) => r.record.run));
    const keep = [...opened.keys()].filter((k) => live.has(k.slice(0, k.lastIndexOf("|"))));
    const since: Record<string, string> = {};
    for (const k of keep) { const sv = opened.get(k); if (sv) since[k] = sv; }
    try { atomicWrite(d.dir, "watch-state.json", `${JSON.stringify({ opened: keep, since })}\n`); } catch { /* the state is a convenience */ }
    // earlier sends that failed are offered again with this pass's new items
    const n = await notifyNew({ dir: d.dir, now: d.now, runDg: d.runDg }, readOpen(d.dir));
    res.commented = n.sent;
  }
  res.lines.push(d.dryRun
    ? `watch (dry run, nothing written): ${runs.length} runs, would open ${res.opened}, would resolve ${res.resolved}`
    : `watch: ${runs.length} runs, ${res.opened} opened, ${res.resolved} resolved, ${res.commented} commented`);
  return res;
}
