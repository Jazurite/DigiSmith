// DGS-665: THE count of concurrent runs. Pure: no fs, no yargs. Callers read the rows (listRuns) and the lock.
import type { RunRow } from "./read.ts";
import type { RunRecord } from "./record.ts";

export type Kind = "builder" | "reviewer" | "role";
export type Limits = Record<Kind, number>;
export const KINDS: readonly Kind[] = ["builder", "reviewer", "role"];
export const DEFAULT_LIMITS: Limits = { builder: 2, reviewer: 1, role: 1 };
export const DEFAULT_STALE_MINUTES = 120;

export type SlotState = "busy" | "idle" | "stale" | "closed";
export type Slot = { kind: Kind; run: string; ticket: string | null; state: SlotState; ageMin: number; factory: boolean };
export type Count = { limits: Limits; used: Record<Kind, Slot[]>; stale: Slot[] };

// maestro and conductor are the control plane; an other that is not a herdr or started worker is a person's session.
export function kindOf(r: Pick<RunRecord, "role" | "role_from">): Kind | null {
  if (r.role === "builder") return "builder";
  if (r.role === "reviewer") return "reviewer";
  if (r.role === "scout") return "role";
  if (r.role === "other" && (r.role_from === "herdr" || r.role_from === "start")) return "role";
  return null;
}

function stateOf(row: RunRow, nowMs: number, staleMs: number): { state: SlotState; ageMin: number } {
  const ts = Date.parse(row.summary.last_ts ?? row.record.created_at);
  const age = Number.isFinite(ts) ? Math.max(0, nowMs - ts) : Number.POSITIVE_INFINITY;
  const ageMin = Number.isFinite(age) ? Math.floor(age / 60_000) : 0;
  const t = row.summary.last_type;
  if (row.summary.ended || t === "lost") return { state: "closed", ageMin };
  if (t === "turn_end" || t === "blocked") return { state: "idle", ageMin };
  if (age > staleMs) return { state: "stale", ageMin };
  return { state: "busy", ageMin };
}

export function countSlots(rows: RunRow[], lock: { ticket: string } | null, nowMs: number, limits: Limits, staleAfterMinutes: number): Count {
  const used: Record<Kind, Slot[]> = { builder: [], reviewer: [], role: [] };
  const stale: Slot[] = [];
  for (const row of rows) {
    const kind = kindOf(row.record);
    if (kind === null) continue;
    const { state, ageMin } = stateOf(row, nowMs, staleAfterMinutes * 60_000);
    const slot: Slot = { kind, run: row.record.run, ticket: row.record.ticket, state, ageMin, factory: false };
    if (state === "busy") used[kind].push(slot);
    else if (state === "stale") stale.push(slot);
  }
  if (lock !== null && !used.builder.some((s) => s.ticket === lock.ticket)) {
    used.builder.push({ kind: "builder", run: "factory lock", ticket: lock.ticket, state: "busy", ageMin: 0, factory: true });
  }
  return { limits, used, stale };
}

const label = (s: Slot): string => (s.factory ? `factory lock (${s.ticket})` : `${s.run} (${s.ticket ?? "-"}, last event ${s.ageMin} min ago)`);

export function refusal(c: Count, kind: Kind): string | null {
  const open = c.used[kind];
  if (open.length < c.limits[kind]) return null;
  return `limit: ${kind} ${open.length} of ${c.limits[kind]} in use${open.length ? `: ${open.map(label).join(", ")}` : ""}. Wait for ${open.length > 1 ? "one" : "it"} to finish.`;
}

export function limitLine(c: Count): string {
  return `limits: ${KINDS.map((k) => `${k} ${c.used[k].length}/${c.limits[k]}`).join(", ")}`;
}

export function limitRows(c: Count): string[] {
  const rows = KINDS.flatMap((k) => c.used[k].map((s) => `${k}  ${label(s)}`));
  for (const s of c.stale) rows.push(`stale  ${s.kind}  ${s.run} (${s.ticket ?? "-"}, ${s.ageMin} min): clear with dg run event ${s.run} lost`);
  return rows;
}
