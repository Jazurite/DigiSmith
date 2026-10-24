// packages/cli/src/nightwatch/views.ts
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { readOpen } from "../autonomous/attention.ts";
import { readAway } from "../autonomous/away.ts";
import { readBreaker } from "../autonomous/breaker.ts";
import { readBudgets } from "../autonomous/budgets.ts";
import { inNightWindow } from "../autonomous/clock.ts";
import { readJournal } from "../autonomous/journal.ts";
import { findWorkspace } from "../autonomous/observers-real.ts";
import { autonomousDir, newestEvent, readEvents as readScanEvents, readLock } from "../autonomous/state.ts";
import type { Event } from "../autonomous/types.ts";
import { DEFAULT_BUDGETS } from "../autonomous/watchdog.ts";
import { parseVerdictEntries } from "../reviewer/verdicts.ts";
import { readEvents as readEventLines, type EventLine } from "../run/events.ts";
import { depotDir, findRunDir, isSafe } from "../run/paths.ts";
import { readRun, type RunRecord } from "../run/record.ts";
import { listRuns } from "../run/read.ts";
import { groupsOf, ledgerTasks, parsePlanTasks, phaseTable, pipelineOf, runRowOf, scalarData, triggerOf } from "./derive.ts";
import type { EventRowView, RunRowView } from "./types.ts";

export const VIEW_NAMES = ["overview", "attention", "runs", "run", "events", "plan"] as const;
const DAY_MS = 24 * 3600_000;
const ORDER_MAX = 64 * 1024;

interface Loaded { record: RunRecord; events: EventLine[] }

function loadAll(env: NodeJS.ProcessEnv, ticket?: string): Loaded[] {
  const out: Loaded[] = [];
  for (const row of listRuns(env, ticket)) {
    const dir = findRunDir(row.record.run, env);
    if (dir === null) continue;
    out.push({ record: row.record, events: readEvents(dir) });
  }
  return out;
}

// One read of the scan events for all runs; the per-run window is applied in memory.
function claimsOf(adir: string, loaded: Loaded[]): Event[] {
  const times = loaded.map((l) => Date.parse(l.record.created_at)).filter((t) => Number.isFinite(t));
  if (times.length === 0) return [];
  const to = Math.max(...times) + DAY_MS;
  const from = Math.max(Math.min(...times) - 2 * DAY_MS, to - 390 * DAY_MS);
  return readScanEvents(adir, from, to).filter((e) => e.kind === "claim");
}

function claimFor(claims: Event[], run: RunRecord): Event | null {
  const created = Date.parse(run.created_at);
  const found = claims.filter((e) => {
    const t = Date.parse(e.ts);
    return t >= created - 2 * DAY_MS && t <= created + DAY_MS && e.ticket === run.ticket && (e.order === run.order || run.order === null);
  });
  return found.length === 0 ? null : found[found.length - 1];
}

// A line that is JSON but not an event (null, no ts or seq, wrong types) is skipped like a torn line; a missing data becomes {}.
function readEvents(dir: string): EventLine[] {
  const out: EventLine[] = [];
  for (const raw of readEventLines(dir) as unknown[]) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.ts !== "string" || !Number.isInteger(e.seq) || typeof e.type !== "string") continue;
    const data = e.data !== null && typeof e.data === "object" && !Array.isArray(e.data) ? e.data : {};
    out.push({ ...e, data } as unknown as EventLine);
  }
  return out;
}

function rowsOf(env: NodeJS.ProcessEnv, now: Date, loaded: Loaded[]): RunRowView[] {
  const adir = autonomousDir(env);
  const away = readAway(adir);
  const budgets = readBudgets(depotCwd(env)).budgets;
  const claims = claimsOf(adir, loaded);
  return loaded.map((l) => runRowOf(l.record, l.events, triggerOf(l.record, claimFor(claims, l.record), away), budgets, now.getTime()));
}

// Budgets come from config.yml in NIGHTWATCH_CONFIG_CWD when it is set, else in the depot folder (depotDir). The depot is not a checkout, so a missing file means defaults; the API sets no NIGHTWATCH_CONFIG_CWD.
const depotCwd = (env: NodeJS.ProcessEnv): string => env.NIGHTWATCH_CONFIG_CWD ?? depotDir(env);

export function overviewView(env: NodeJS.ProcessEnv, now: Date) {
  const adir = autonomousDir(env);
  const loadedAll = loadAll(env);
  const rows = rowsOf(env, now, loadedAll);
  const workers = rows.filter((r) => r.state === "healthy" || r.state === "blocked" || r.state === "stalled");
  const open = readOpen(adir);
  const releases = readScanEvents(adir, now.getTime() - 8 * DAY_MS, now.getTime() + DAY_MS).filter((e) => e.kind === "release");
  const lock = readLock(adir);
  const lastScan = newestEvent(adir, ["scan"]);
  const away = readAway(adir);
  const breaker = readBreaker(adir);
  const scanFacts = readScanEvents(adir, now.getTime() - DAY_MS, now.getTime() + DAY_MS).filter((e) => e.kind === "claim" || e.kind === "release" || e.kind === "breaker").map((e) => ({ ts: e.ts, source: "scan", kind: e.kind, text: `${e.kind} ${String(e.ticket ?? "")}`.trim() }));
  const runFacts = workers.flatMap((w) => {
    const l = loadedAll.find((x) => x.record.run === w.run);
    return (l?.events ?? []).slice(-20).map((e) => ({ ts: e.ts, source: w.ticket, kind: e.type, text: eventText(e) }));
  });
  const lastEvents = [...scanFacts, ...runFacts].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)).slice(0, 20);
  return {
    readAt: now.toISOString(),
    workers,
    attentionCount: open.length,
    tickets: { windowDays: 7, lockTicket: lock?.ticket ?? null, rows: phaseTable({ lock, releases, lostOpen: open.filter((i) => i.kind === "lost"), nowMs: now.getTime() }) },
    lastEvents,
    scan: {
      lastScanAt: lastScan?.ts ?? null,
      candidates: typeof lastScan?.candidates === "number" ? lastScan.candidates : null,
      away: away !== null && away.away,
      nightWindow: inNightWindow(now),
      breakerOpen: breaker.open,
      breakerStreak: breaker.streak,
    },
  };
}

function eventText(e: EventLine): string {
  const d = scalarData(e.data);
  const bits = Object.entries(d).map(([k, v]) => (k === "tool" ? `${String(v)}` : `${k}=${String(v)}`));
  return [e.type, ...bits].join(" ");
}

export function attentionView(env: NodeJS.ProcessEnv, now: Date) {
  const adir = autonomousDir(env);
  const open = readOpen(adir).map((i) => ({
    id: i.id, ticket: i.ticket, run: i.run, kind: i.kind, cause: i.cause, since: i.since,
    causeClass: i.causeClass ?? null, retryEligible: i.retryEligible ?? null,
  }));
  const raw = readAttentionLines(adir);
  const byId = new Map(raw.filter((l) => l.resolved !== true).map((l) => [String(l.id), l]));
  const resolved = raw.filter((l) => l.resolved === true).slice(-20).reverse().map((l) => {
    const first = byId.get(String(l.id));
    return { id: String(l.id), ticket: typeof first?.ticket === "string" ? first.ticket : null, kind: String(first?.kind ?? ""), by: String(l.by ?? ""), ts: String(l.ts ?? ""), note: String(l.note ?? "") };
  });
  return { readAt: now.toISOString(), open, resolved };
}

function readAttentionLines(adir: string): Record<string, unknown>[] {
  let text = "";
  try { text = readFileSync(join(adir, "attention.jsonl"), "utf-8"); } catch { return []; }
  const out: Record<string, unknown>[] = [];
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    try { const o = JSON.parse(l) as Record<string, unknown>; if (typeof o.id === "string") out.push(o); } catch { /* skip */ }
  }
  return out;
}

export function runsView(env: NodeJS.ProcessEnv, now: Date, a: { state?: string; role?: string; ticket?: string; trigger?: string; limit?: number }) {
  let rows = rowsOf(env, now, loadAll(env, a.ticket));
  if (a.state) rows = rows.filter((r) => r.state === a.state);
  if (a.role) rows = rows.filter((r) => r.role === a.role);
  if (a.trigger) rows = rows.filter((r) => r.trigger === a.trigger);
  const limit = Math.min(Math.max(a.limit ?? 100, 1), 500);
  return { readAt: now.toISOString(), total: rows.length, runs: rows.slice(0, limit) };
}

function readOrder(env: NodeJS.ProcessEnv, order: string | null): { available: boolean; text: string } {
  const none = { available: false, text: "" };
  if (order === null || !isAbsolute(order)) return none;
  try {
    const real = realpathSync(order);
    const roots = [join(depotDir(env), "sessions"), autonomousDir(env)].flatMap((r) => { try { return [realpathSync(r)]; } catch { return []; } });
    if (!roots.some((r) => real === r || real.startsWith(r + sep))) return none;
    if (!statSync(real).isFile() || statSync(real).size > ORDER_MAX) return none;
    return { available: true, text: readFileSync(real, "utf8") };
  } catch { return none; }
}

export function runView(env: NodeJS.ProcessEnv, now: Date, a: { run: string; cwd?: string }) {
  if (!isSafe(a.run)) return null;
  const dir = findRunDir(a.run, env);
  if (dir === null) return null;
  let record: RunRecord;
  try { record = readRun(dir); } catch { return null; }
  const loaded: Loaded = { record, events: readEvents(dir) };
  const row = rowsOf(env, now, [loaded])[0];
  const adir = autonomousDir(env);
  const claim = readJournal(adir).find((l) => l.status === "planned" && l.key === `${record.ticket}:claimed:1:claim`);
  const budgets = readBudgets(a.cwd ?? depotCwd(env)).budgets;
  const phase = row.phase;
  const since = phase === null ? null : loaded.events.filter((e) => e.type === "phase" && e.data.phase === phase).map((e) => e.ts).pop() ?? row.startedAt;
  return {
    readAt: now.toISOString(),
    row,
    pipeline: pipelineOf(record, loaded.events, claim?.ts ?? null, row.state),
    budget: {
      phase, limitMin: phase === null ? null : budgets[phase],
      elapsedMin: since === null ? null : Math.max(0, Math.round((now.getTime() - Date.parse(since)) / 60_000)),
      building: budgets.building ?? DEFAULT_BUDGETS.building, review: budgets.review, merge: budgets.merge,
    },
    record: record as unknown as Record<string, unknown>,
    order: readOrder(env, record.order),
  };
}

export function eventsView(env: NodeJS.ProcessEnv, a: { run: string; since?: number; before?: number; tail?: number; group?: string }) {
  if (!isSafe(a.run)) return null;
  const dir = findRunDir(a.run, env);
  if (dir === null) return null;
  const all = readEvents(dir);
  const group = a.group === "agent" || a.group === "system" || a.group === "errors" ? a.group : "all";
  let lines: EventRowView[] = all.map((e, i) => ({ n: i + 1, seq: e.seq, ts: e.ts, type: e.type, groups: groupsOf(e), data: scalarData(e.data) }));
  if (group !== "all") lines = lines.filter((l) => l.groups.includes(group));
  const okInt = (v: number | undefined): boolean => v === undefined || (Number.isInteger(v) && v >= 0);
  const since = okInt(a.since) ? (a.since ?? 0) : 0;
  const before = okInt(a.before) ? a.before : undefined;
  const tail = okInt(a.tail) ? a.tail : undefined;
  lines = lines.filter((l) => l.n > since && (before === undefined || l.n < before));
  if (tail !== undefined) lines = tail === 0 ? [] : lines.slice(-tail);
  return { run: a.run, total: all.length, from: since, lines };
}

function inside(root: string, file: string): boolean {
  const rel = relative(root, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function planView(env: NodeJS.ProcessEnv, a: { ticket: string }) {
  const empty = { ticket: a.ticket, found: false, planFile: null as string | null, tasksTotal: 0, tasksDone: 0, tasks: [] as ReturnType<typeof ledgerTasks>, verdicts: [] as { scope: string; id: string; round: number; finding: string; verdict: "fixed" | "fixing" | "parked" | "rejected"; reason: string }[], ledgerError: false };
  if (!isSafe(a.ticket)) return empty;
  const builder = listRuns(env, a.ticket).find((r) => r.record.role === "builder" && r.record.worktree);
  const wt = builder?.record.worktree;
  if (!wt) return empty;
  const ws = findWorkspace(wt, a.ticket);
  if (ws === null) return empty;
  let ledger = "";
  try { ledger = readFileSync(join(ws, "progress.md"), "utf8"); } catch { return empty; }
  const out = { ...empty, found: true };
  const first = /^# SDD ledger — plan: (.+)$/m.exec(ledger);
  if (first) {
    try {
      const real = realpathSync(resolve(wt, first[1].trim()));
      if (inside(realpathSync(wt), real) && statSync(real).isFile()) {
        out.planFile = real;
        out.tasks = ledgerTasks(ledger, parsePlanTasks(readFileSync(real, "utf8")));
      }
    } catch { /* missing or unreadable plan: no tasks */ }
  }
  out.tasksTotal = out.tasks.length;
  out.tasksDone = out.tasks.filter((t) => t.state === "done").length;
  try {
    out.verdicts = parseVerdictEntries(ledger).map((v) => ({ scope: v.kind, id: v.id, round: v.round, finding: v.finding, verdict: v.verdict, reason: v.reason }));
  } catch { out.ledgerError = true; }
  return out;
}
