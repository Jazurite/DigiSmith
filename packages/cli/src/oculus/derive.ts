// packages/cli/src/oculus/derive.ts
import { basename } from "node:path";
import type { Away, Event, Lock } from "../autonomous/types.ts";
import { classify, phaseOf } from "../autonomous/watchdog.ts";
import type { Budgets } from "../autonomous/watchdog.ts";
import type { EventLine } from "../run/events.ts";
import type { RunRecord } from "../run/record.ts";
import { summarize } from "../run/read.ts";
import type { EventGroup, Health, PhaseRow, PipelineStep, PlanTask, RunRowView, Scalar, TicketPhase, Trigger } from "./types.ts";

const SHOWN_KEYS = ["tool", "ok", "kind", "reason", "source", "phase"];
const ms = (iso: string): number => Date.parse(iso);

/** A run started by the night scan has an order file named order-ao-*. The name decides; the folder does not. */
export function isAutonomousOrder(order: string | null): boolean {
  return order !== null && basename(order).startsWith("order-ao-");
}

export function triggerOf(run: RunRecord, claim: Event | null, away: Away | null): Trigger {
  if (run.order === null) return "unknown";
  if (!isAutonomousOrder(run.order)) return "manual";
  if (claim !== null && away !== null && away.away) {
    const at = ms(claim.ts);
    const since = away.since === "" ? Number.NEGATIVE_INFINITY : ms(away.since);
    const ended = away.endedAt === null ? Number.POSITIVE_INFINITY : ms(away.endedAt);
    if (at >= since && at < ended) return "away";
  }
  return "night-scan";
}

export function groupsOf(e: { type: string; data: Record<string, unknown> }): EventGroup[] {
  const out: EventGroup[] = [];
  if (e.type === "tool" || e.type === "turn_end") out.push("agent");
  if (["started", "ended", "phase", "review_ready", "merged", "pushed", "lost"].includes(e.type)) out.push("system");
  if (e.type === "blocked" || e.type === "lost" || (e.type === "tool" && e.data.ok === false)) out.push("errors");
  return out;
}

export function scalarData(data: Record<string, unknown>): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const k of SHOWN_KEYS) {
    const v = data[k];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
  }
  return out;
}

export function runRowOf(run: RunRecord, events: EventLine[], trigger: Trigger, budgets: Budgets, nowMs: number): RunRowView {
  const verdict = classify(run, events, "unknown", nowMs, budgets);
  const state: Health = verdict.state;
  const sum = summarize(events);
  const startedAt = events.find((e) => e.type === "started")?.ts ?? run.created_at;
  const endedAt = state === "ended" ? (sum.last_ts ?? null) : null;
  const stop = endedAt !== null ? ms(endedAt) : nowMs;
  const p = state === "ended" ? null : phaseOf(run, events);
  return {
    run: run.run, ticket: run.ticket, role: run.role, project: run.project ?? null, source: run.source ?? "start", seat: run.seat, model: run.model, trigger, state,
    phase: p?.phase ?? null, startedAt, endedAt, elapsedSec: Math.max(0, Math.round((stop - ms(startedAt)) / 1000)),
    events: events.length, merged: events.some((e) => e.type === "merged"), pushed: events.some((e) => e.type === "pushed"),
    tokens: null, tokensAsOf: null, // views.ts fills these from tokens.json
  };
}

export function pipelineOf(run: RunRecord, events: EventLine[], claimAt: string | null, state: Health): PipelineStep[] {
  const first = (pred: (e: EventLine) => boolean): string | null => events.find(pred)?.ts ?? null;
  const at: Record<PipelineStep["step"], string | null> = {
    claimed: claimAt,
    "worktree-ready": run.created_at,
    building: first((e) => e.type === "started" || (e.type === "phase" && e.data.phase === "building")),
    review: first((e) => e.type === "review_ready" || (e.type === "phase" && e.data.phase === "review")),
    merged: first((e) => e.type === "merged"),
    pushed: first((e) => e.type === "pushed"),
  };
  const order: PipelineStep["step"][] = ["claimed", "worktree-ready", "building", "review", "merged", "pushed"];
  // The furthest step with a time is where the run stands. A manual run has no claim time, so "claimed" is skipped, not blocking.
  let reached = -1;
  order.forEach((s, i) => { if (at[s] !== null) reached = i; });
  return order.map((step, i) => {
    let s: PipelineStep["state"] = "waiting";
    if (i < reached) s = "done";
    else if (i === reached) s = state === "ended" ? "done" : state === "lost" ? "lost" : "current";
    if (step === "claimed" && at.claimed === null) s = "waiting";
    return { step, at: at[step], state: s };
  });
}

export function parsePlanTasks(planText: string): { n: number; title: string }[] {
  const out: { n: number; title: string }[] = [];
  for (const m of planText.matchAll(/^### Task (\d+):[ \t]*(.+?)[ \t]*$/gm)) out.push({ n: Number(m[1]), title: m[2] });
  return out;
}

export function ledgerTasks(ledger: string, tasks: { n: number; title: string }[]): PlanTask[] {
  const done = new Set<number>();
  const rounds = new Map<number, number>();
  for (const line of ledger.split(/\r?\n/)) {
    const text = line.trim().replace(/^- /, "");
    const c = /^Task (\d+): complete\b/.exec(text);
    if (c) done.add(Number(c[1]));
    const f = /^Task (\d+): fix round (\d+)\/\d+/.exec(text);
    if (f) rounds.set(Number(f[1]), Math.max(rounds.get(Number(f[1])) ?? 0, Number(f[2])));
  }
  return tasks.map((t) => {
    if (done.has(t.n)) return { ...t, state: "done", round: null };
    const r = rounds.get(t.n);
    return r === undefined ? { ...t, state: "waiting", round: null } : { ...t, state: "fix-round", round: r };
  });
}

const WINDOW_MS = 7 * 24 * 3600_000;
const LOCK_PHASES: TicketPhase[] = ["claimed", "building", "review", "merge-ready"];

export function phaseTable(a: { lock: Lock | null; releases: Event[]; lostOpen: { since: string }[]; nowMs: number }): PhaseRow[] {
  const by: Record<TicketPhase, PhaseRow> = {
    claimed: { phase: "claimed", count: 0, oldestSince: null },
    building: { phase: "building", count: 0, oldestSince: null },
    review: { phase: "review", count: 0, oldestSince: null },
    "merge-ready": { phase: "merge-ready", count: 0, oldestSince: null },
    merged: { phase: "merged", count: 0, oldestSince: null },
    released: { phase: "released", count: 0, oldestSince: null },
    lost: { phase: "lost", count: 0, oldestSince: null },
  };
  const rows: PhaseRow[] = Object.values(by);
  const row = (p: TicketPhase): PhaseRow => by[p];
  // The scan lock holds one ticket at a time, so these four phases hold at most one ticket.
  const lp = a.lock?.phase;
  if (a.lock !== null && lp !== undefined && (LOCK_PHASES as string[]).includes(lp)) {
    row(lp as TicketPhase).count = 1;
    row(lp as TicketPhase).oldestSince = a.lock.phaseStartedAt ?? a.lock.claimedAt;
  }
  const inWindow = a.releases.filter((e) => e.kind === "release" && a.nowMs - ms(e.ts) <= WINDOW_MS);
  row("released").count = inWindow.length;
  row("merged").count = inWindow.filter((e) => e.result === "merged").length;
  const oldestLost = a.lostOpen.map((l) => l.since).sort()[0];
  row("lost").count = a.lostOpen.length;
  row("lost").oldestSince = oldestLost ?? null;
  return rows;
}
