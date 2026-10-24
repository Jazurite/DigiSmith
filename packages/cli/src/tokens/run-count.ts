import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { readEvents, type EventLine } from "../run/events.ts";
import { summarize } from "../run/read.ts";
import { readRun, type RunRecord } from "../run/record.ts";
import { readUsageFrom } from "./claude-code-reader.ts";
import { ANTHROPIC_PRICES_VERSION } from "./prices/anthropic.ts";
import { costFromPricing, resolveAnthropicPrice } from "./prices/cost.ts";
import { RUN_TOKENS_SCHEMA, RUN_TOKENS_STATE_SCHEMA, type Bucket, type Counted, type ModelTotals, type RunTokens, type RunTokensState } from "./run-types.ts";
import type { UsageRecord } from "./types.ts";

const BUCKET_MS = 5 * 60_000;
const KEEP_MS = 24 * 3600_000;

export function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function bucketStart(ts: string): string {
  const t = Date.parse(ts);
  return new Date(t - (t % BUCKET_MS)).toISOString();
}

// The sessions of a run: run.json session_id (DGS-598), then every started event's session_id (DGS-581 hooks).
export function sessionsOfRun(record: RunRecord & { session_id?: string | null }, events: EventLine[]): string[] {
  const out: string[] = [];
  if (typeof record.session_id === "string" && record.session_id) out.push(record.session_id);
  for (const e of events) {
    const sid = e.type === "started" ? e.data?.session_id : undefined;
    if (typeof sid === "string" && sid && !out.includes(sid)) out.push(sid);
  }
  return out;
}

export function transcriptIndex(root: string): Map<string, string> {
  const index = new Map<string, string>();
  let dirs: string[] = [];
  try { dirs = readdirSync(root); } catch { return index; }
  for (const d of dirs) {
    let names: string[] = [];
    try { names = readdirSync(join(root, d)); } catch { continue; }
    for (const n of names) if (n.endsWith(".jsonl") && !index.has(n.slice(0, -6))) index.set(n.slice(0, -6), join(root, d, n));
  }
  return index;
}

function readState(path: string, run: string): RunTokensState {
  try {
    const s = JSON.parse(readFileSync(path, "utf8")) as RunTokensState;
    if (s.schema === RUN_TOKENS_STATE_SCHEMA && s.run === run && s.files && s.responses) return s;
  } catch { /* missing or broken: count again from 0 */ }
  return { schema: RUN_TOKENS_STATE_SCHEMA, run, files: {}, responses: {} };
}

function filesOf(sid: string, main: string): { key: string; path: string; agent: string | null }[] {
  const out = [{ key: `${sid}/main`, path: main, agent: null as string | null }];
  const sub = join(dirname(main), sid, "subagents");
  let names: string[] = [];
  try { names = readdirSync(sub); } catch { return out; }
  for (const n of names) if (n.startsWith("agent-") && n.endsWith(".jsonl")) out.push({ key: `${sid}/${n}`, path: join(sub, n), agent: n.slice(6, -6) });
  return out;
}

function countedOf(r: UsageRecord): Counted {
  const pricing = resolveAnthropicPrice(r.model);
  const cost = pricing ? costFromPricing(pricing, { inputTokens: r.input, outputTokens: r.output, cacheReadTokens: r.cache_read, cacheWrite5mTokens: r.cache_write_5m, cacheWrite1hTokens: r.cache_write_1h }) : null;
  return { model: r.model, ts: r.ts, output: r.output, input: r.input, cache_read: r.cache_read, cache_write_5m: r.cache_write_5m, cache_write_1h: r.cache_write_1h, tokens: r.input + r.output + r.cache_read + r.cache_write_5m + r.cache_write_1h, cost_usd: cost };
}

const addCost = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a + b);

function totalsOf(responses: Record<string, Counted>, nowMs: number): Pick<RunTokens, "models" | "total" | "unpriced_models" | "buckets"> {
  const models: Record<string, ModelTotals> = {};
  const buckets = new Map<string, Bucket>();
  for (const c of Object.values(responses)) {
    const m = (models[c.model] ??= { input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, responses: 0, tokens: 0, cost_usd: 0 });
    m.input += c.input; m.output += c.output; m.cache_read += c.cache_read; m.cache_write_5m += c.cache_write_5m; m.cache_write_1h += c.cache_write_1h;
    m.responses += 1; m.tokens += c.tokens; m.cost_usd = addCost(m.cost_usd, c.cost_usd);
    const t = Date.parse(c.ts);
    if (Number.isFinite(t) && t >= nowMs - KEEP_MS) {
      const start = bucketStart(c.ts);
      const b = buckets.get(start) ?? { start, tokens: 0, cost_usd: 0 };
      b.tokens += c.tokens; b.cost_usd = addCost(b.cost_usd, c.cost_usd);
      buckets.set(start, b);
    }
  }
  const all = Object.values(models);
  const unpriced = Object.entries(models).filter(([, m]) => m.cost_usd === null).map(([k]) => k).sort();
  return {
    models,
    total: { tokens: all.reduce((s, m) => s + m.tokens, 0), responses: all.reduce((s, m) => s + m.responses, 0), cost_usd: unpriced.length > 0 ? null : all.reduce((s, m) => s + (m.cost_usd ?? 0), 0) },
    unpriced_models: unpriced,
    buckets: [...buckets.values()].sort((a, b) => a.start.localeCompare(b.start)),
  };
}

export function countRun(runDir: string, opts: { now: Date; index: Map<string, string> }): RunTokens | null {
  const record = readRun(runDir) as RunRecord & { session_id?: string | null };
  const events = readEvents(runDir) as EventLine[];
  const sessions = sessionsOfRun(record, events);
  if (sessions.length === 0) return null;
  const statePath = join(runDir, "tokens.state.json");
  const state = readState(statePath, record.run);
  const created = Date.parse(record.created_at);
  if (!Number.isFinite(created)) return null; // no lower bound: never count older work
  for (const sid of sessions) {
    const main = opts.index.get(sid);
    if (!main) continue; // no file yet: the next pass tries again
    for (const f of filesOf(sid, main)) {
      let read;
      try { read = readUsageFrom(f.path, state.files[f.key] ?? null, sid, f.agent); } catch { continue; }
      state.files[f.key] = read.cursor;
      for (const r of read.records) {
        const t = Date.parse(r.ts);
        if (!Number.isFinite(t) || t < created) continue;
        const prior = state.responses[r.response_id];
        if (prior && r.output < prior.output) continue;
        state.responses[r.response_id] = countedOf(r);
      }
    }
  }
  const snapshot: RunTokens = {
    schema: RUN_TOKENS_SCHEMA, run: record.run, generated_at: opts.now.toISOString(),
    final: summarize(events).ended,
    price_table: { source: "anthropic", version: ANTHROPIC_PRICES_VERSION },
    sessions: sessions.length,
    ...totalsOf(state.responses, opts.now.getTime()),
  };
  writeJsonAtomic(statePath, state);
  writeJsonAtomic(join(runDir, "tokens.json"), snapshot);
  return snapshot;
}
