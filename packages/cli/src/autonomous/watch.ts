import { existsSync, readdirSync, readFileSync } from "node:fs";
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
import { classify, decideRetry, isWatched, type Pane } from "./watchdog.ts";

export interface WatchDeps {
  env: NodeJS.ProcessEnv; dir: string; cwd: string; now: () => number;
  panes: PaneLookup; runDg: RunDg; dryRun: boolean;
}
export interface WatchResult { lines: string[]; opened: number; resolved: number; commented: number }

const RETENTION_MS = 7 * 24 * 3600_000;
const AUTO: AttentionKind[] = ["blocked", "stalled"];
/** The kinds the pass opens; C1 to C3 close all of them. Items of act, release or config are never in this list. */
const CLOSABLE: AttentionKind[] = ["blocked", "stalled", "lost"];

/** Each run is read once; a run older than 7 days is skipped unless it still has an open item and has ended. A broken run dir gives one stderr line; an unreadable runs root throws. */
function withEvents(env: NodeJS.ProcessEnv, nowMs: number, hasOpen: (run: string) => boolean): { runs: { record: RunRecord; events: EventLine[] }[]; unwatched: string[]; seen: Set<string> } {
  const root = runsDir(env);
  let keys: string[];
  try {
    keys = readdirSync(root);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { runs: [], unwatched: [], seen: new Set() };
    throw new Error(`watch: cannot read the runs folder ${root}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const out: { record: RunRecord; events: EventLine[] }[] = [];
  const unwatched: string[] = [];
  const seen = new Set<string>(); // every run id with a readable record, read or skipped
  for (const key of keys) {
    if (key.startsWith(".")) continue; // runs/.index
    const keyDir = join(root, key);
    let ids: string[];
    try { ids = readdirSync(keyDir); } catch { continue; } // hook-errors.log is a file, not a ticket folder
    for (const id of ids) {
      const rd = join(keyDir, id);
      try {
        const record = readRun(rd);
        seen.add(record.run);
        if (!isWatched(record.role)) { unwatched.push(record.run); continue; }
        // An old run is read only when it still has an open item: an ended one closes it, any other old run is skipped.
        const old = nowMs - Date.parse(record.created_at) > RETENTION_MS;
        if (old && !hasOpen(record.run)) continue;
        const events = readEvents(rd);
        if (old && !summarize(events).ended) continue;
        out.push({ record, events });
      } catch (e) {
        seen.add(id); // an unreadable record is not a gone record
        console.error(`watch: skipped run ${rd}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return { runs: out, unwatched, seen };
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

  const paneCache = new Map<string, ReadonlyMap<string, string> | null>();
  const paneOf = async (ws: string | null, pane: string | null): Promise<Pane> => {
    if (!ws || !pane) return "unknown";
    if (!paneCache.has(ws)) paneCache.set(ws, await d.panes(ws));
    const set = paneCache.get(ws);
    return set ? (set.has(pane) ? "present" : "gone") : "unknown";
  };
  // The herdr agent_status of a run's pane, from the same cached lookup; null when herdr or the pane is unknown.
  const statusOf = (ws: string | null, pane: string | null): string | null => {
    if (!ws || !pane) return null;
    return paneCache.get(ws)?.get(pane) ?? null;
  };

  const { runs: read, unwatched, seen } = withEvents(d.env, nowMs, (run) => items.some((o) => o.run === run && AUTO.includes(o.kind)));
  if (unwatched.length) {
    const gone = new Set(unwatched);
    for (const it of items.filter((o) => gone.has(o.run) && AUTO.includes(o.kind))) close(it, "role not watched");
    for (const k of [...opened.keys()]) if (gone.has(k.slice(0, k.lastIndexOf("|")))) opened.delete(k);
  }
  // C3: an open blocked, stalled or lost item whose run record is gone closes.
  for (const it of items.filter((o) => CLOSABLE.includes(o.kind) && !seen.has(o.run))) close(it, "run record gone");
  // C1 superseded (a later run of the same ticket and role), C2 finished (merged event, or worktree set and removed): close, open nothing.
  const newest = new Map<string, { run: string; at: number }>();
  for (const { record } of read) {
    if (!record.ticket) continue;
    const g = `${record.ticket}|${record.role}`;
    const at = Date.parse(record.created_at);
    const cur = newest.get(g);
    if (!cur || at > cur.at) newest.set(g, { run: record.run, at });
  }
  const runs: typeof read = [];
  for (const r of read) {
    const { record, events } = r;
    const top = record.ticket ? newest.get(`${record.ticket}|${record.role}`) : undefined;
    const note = top && top.run !== record.run && top.at > Date.parse(record.created_at) ? `superseded by ${top.run}`
      : events.some((e) => e.type === "merged") || (record.worktree && !existsSync(record.worktree)) ? "ticket done" : null;
    if (!note) { runs.push(r); continue; }
    for (const it of items.filter((o) => o.run === record.run && CLOSABLE.includes(o.kind))) close(it, note);
    for (const k of [...opened.keys()]) if (k.startsWith(`${record.run}|`)) opened.delete(k);
  }
  for (const { record, events } of runs) {
    const pane = await paneOf(record.herdr.workspace, record.herdr.pane);
    const v = classify(record, events, pane, nowMs, budgets, statusOf(record.herdr.workspace, record.herdr.pane));
    const mine = items.filter((o) => o.run === record.run && AUTO.includes(o.kind));
    if (v.state === "ended" || v.state === "healthy") {
      // A prompt herdr showed answered stays closed: keep its key so a later null map or status cannot reopen it. A new prompt has a new since.
      const keep = v.cause === "prompt-answered" ? key(record.run, "blocked") : null;
      for (const k of [...opened.keys()]) if (k.startsWith(`${record.run}|`) && k !== keep) opened.delete(k);
      if (keep) opened.set(keep, v.since);
      for (const it of mine) close(it, `run is ${v.state} again`);
      continue;
    }
    for (const it of mine.filter((o) => o.kind !== v.state)) { close(it, `run is ${v.state} now`); opened.delete(key(it.run, it.kind)); }
    open({
      ticket: record.ticket, run: record.run, kind: v.state as AttentionKind, cause: v.cause, since: v.since,
      retryEligible: v.cause === "pane-gone" && decideRetry(v.state, "unknown", 0) === "retry", causeClass: "unknown",
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
