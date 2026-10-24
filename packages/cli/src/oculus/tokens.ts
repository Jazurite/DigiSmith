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
const age = (iso: unknown, nowMs: number): number => (typeof iso === "string" && Number.isFinite(Date.parse(iso)) ? nowMs - Date.parse(iso) : Number.POSITIVE_INFINITY);

// Stale live snapshot: value null, asOf kept (the UI says "stale since"). Wrong schema or unreadable: both null.
export function readRunTokens(runDir: string, nowMs: number): { value: RunTokensView | null; asOf: string | null } {
  const f = readJson(join(runDir, "tokens.json"));
  if (f === null || typeof f !== "object" || f.schema !== "oculus-tokens/v1" || typeof f.generated_at !== "string") return { value: null, asOf: null };
  if (f.final !== true && age(f.generated_at, nowMs) > STALE_MS) return { value: null, asOf: f.generated_at };
  try {
    const models = Object.entries(f.models ?? {}).map(([model, m]: [string, Json]) => ({
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
  if (f === null || typeof f !== "object" || f.schema !== "oculus-burn/v1" || age(f.generated_at, nowMs) > STALE_MS) return null;
  return { tokensPerH: f.tokens, usdPerH: f.cost_usd ?? null, asOf: f.generated_at };
}

// A window past its reset is known to be wrong, so it is dropped.
function windowOf(w: Json, nowMs: number): SeatWindowView | null {
  if (w === null || typeof w !== "object" || typeof w.resets_at !== "string" || !(Date.parse(w.resets_at) > nowMs)) return null;
  return { usedPct: w.used_pct, resetsAt: w.resets_at };
}

export function readSeatsView(env: NodeJS.ProcessEnv, nowMs: number): SeatsView | null {
  const f = readJson(join(depotDir(env), "usage-probe", "seats.json"));
  if (f === null || typeof f !== "object" || f.schema !== "oculus-seats/v1" || !Array.isArray(f.seats) || age(f.generated_at, nowMs) > STALE_MS) return null;
  return {
    asOf: f.generated_at,
    seats: f.seats.map((s: Json) => ({ seat: s.seat, readAt: s.read_at, stale: age(s.read_at, nowMs) > STALE_MS, fiveHour: windowOf(s.five_hour, nowMs), weekly: windowOf(s.weekly, nowMs) })),
  };
}
