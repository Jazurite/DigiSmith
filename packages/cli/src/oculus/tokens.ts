// packages/cli/src/oculus/tokens.ts
// Readers for the token files that `dg tokens runs` writes. They only read; they never count.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { depotDir, runsDir } from "../run/paths.ts";

export const STALE_MS = 15 * 60_000;
export interface RowTokens { total: number; costUsd: number | null; unpriced: string[] }
export interface RunTokensView {
  generatedAt: string; final: boolean; priceVersion: string;
  models: { model: string; input: number; output: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number; responses: number; tokens: number; costUsd: number | null }[];
  total: { tokens: number; responses: number; costUsd: number | null }; unpriced: string[];
}
export interface BurnView { tokensPerH: number; usdPerH: number | null; asOf: string }
export interface SeatWindowView { usedPct: number; resetsAt: string }
export interface SeatView { seat: string; readAt: string; stale: boolean; fiveHour: SeatWindowView | null; weekly: SeatWindowView | null }
export interface SeatsView { asOf: string; seats: SeatView[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function readJson(path: string): Json {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const numOrNull = (v: unknown): v is number | null => v === null || num(v);
const isoStr = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const age = (iso: unknown, nowMs: number): number => (typeof iso === "string" && Number.isFinite(Date.parse(iso)) ? nowMs - Date.parse(iso) : Number.POSITIVE_INFINITY);

// Stale live snapshot: value null, asOf kept (the UI says "stale since"). Wrong schema or unreadable: both null.
export function readRunTokens(runDir: string, nowMs: number): { value: RunTokensView | null; asOf: string | null } {
  const f = readJson(join(runDir, "tokens.json"));
  if (f === null || typeof f !== "object" || f.schema !== "oculus-tokens/v1" || typeof f.generated_at !== "string") return { value: null, asOf: null };
  if (f.final !== true && age(f.generated_at, nowMs) > STALE_MS) return { value: null, asOf: f.generated_at };
  try {
    if (f.models === null || typeof f.models !== "object" || !num(f.total?.tokens) || !num(f.total?.responses) || !numOrNull(f.total?.cost_usd) || typeof f.final !== "boolean" || !isoStr(f.generated_at)) return { value: null, asOf: null };
    if (f.unpriced_models !== undefined && !(Array.isArray(f.unpriced_models) && f.unpriced_models.every((u: unknown) => typeof u === "string"))) return { value: null, asOf: null };
    for (const m of Object.values(f.models) as Json[]) {
      if (m === null || typeof m !== "object" || ![m.input, m.output, m.cache_read, m.cache_write_5m, m.cache_write_1h, m.responses, m.tokens].every(num) || !numOrNull(m.cost_usd ?? null)) return { value: null, asOf: null };
    }
    const models = Object.entries(f.models).map(([model, m]: [string, Json]) => ({
      model, input: m.input, output: m.output, cacheRead: m.cache_read, cacheWrite5m: m.cache_write_5m, cacheWrite1h: m.cache_write_1h,
      responses: m.responses, tokens: m.tokens, costUsd: m.cost_usd ?? null,
    }));
    return {
      value: {
        generatedAt: f.generated_at, final: f.final === true, priceVersion: String(f.price_table?.version ?? ""), models,
        total: { tokens: f.total.tokens, responses: f.total.responses, costUsd: f.total.cost_usd ?? null }, unpriced: Array.isArray(f.unpriced_models) ? f.unpriced_models : [],
      },
      asOf: f.generated_at,
    };
  } catch { return { value: null, asOf: null }; }
}

export function rowTokensOf(v: RunTokensView | null): RowTokens | null {
  return v === null ? null : { total: v.total.tokens, costUsd: v.total.costUsd, unpriced: v.unpriced };
}

export function readBurn(env: NodeJS.ProcessEnv, nowMs: number): BurnView | null {
  const f = readJson(join(runsDir(env), ".tokens", "burn.json"));
  if (f === null || typeof f !== "object" || f.schema !== "oculus-burn/v1" || !isoStr(f.generated_at) || age(f.generated_at, nowMs) > STALE_MS) return null;
  if (!num(f.tokens) || !numOrNull(f.cost_usd ?? null)) return null;
  return { tokensPerH: f.tokens, usdPerH: f.cost_usd ?? null, asOf: f.generated_at };
}

// A window past its reset is known to be wrong, so it is dropped.
function windowOf(w: Json, nowMs: number): SeatWindowView | null {
  if (w === null || typeof w !== "object" || !isoStr(w.resets_at) || !(Date.parse(w.resets_at) > nowMs) || !num(w.used_pct) || w.used_pct > 100) return null;
  return { usedPct: w.used_pct, resetsAt: w.resets_at };
}

export function readSeatsView(env: NodeJS.ProcessEnv, nowMs: number): SeatsView | null {
  const f = readJson(join(depotDir(env), "usage-probe", "seats.json"));
  if (f === null || typeof f !== "object" || f.schema !== "oculus-seats/v1" || !Array.isArray(f.seats) || age(f.generated_at, nowMs) > STALE_MS) return null;
  if (!isoStr(f.generated_at)) return null;
  // A seat with a wrong-typed name or time is dropped; the rest of the view stays.
  const good = f.seats.filter((s: Json) => s !== null && typeof s === "object" && typeof s.seat === "string" && isoStr(s.read_at));
  return {
    asOf: f.generated_at,
    seats: good.map((s: Json) => ({ seat: s.seat, readAt: s.read_at, stale: age(s.read_at, nowMs) > STALE_MS, fiveHour: windowOf(s.five_hour, nowMs), weekly: windowOf(s.weekly, nowMs) })),
  };
}
