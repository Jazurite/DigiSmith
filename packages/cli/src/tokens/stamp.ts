import { costFromPricing, resolveAnthropicPrice } from "./prices/cost.ts";
import { ledgerTask, taskForRecord } from "./snapshot.ts";
import { addCounts, emptyCounts, type Counts, type RegistryEntry, type UsageRecord } from "./types.ts";

export interface ModelUsage extends Counts {
  cost_usd: number | null;
}

export interface TaskUsage {
  models: Record<string, ModelUsage>;
  total: { counts: Counts; cost_usd: number | null; priced: boolean };
  windows: { start: string; end: string }[];
  // Source: sum of closed windows (each task_start with its task_end).
  agentSeconds: number;
}

function priceOf(r: UsageRecord): number | null {
  const pricing = resolveAnthropicPrice(r.model);
  if (!pricing) return null;
  // One record is one request, so the long-prompt tier applies per response.
  return costFromPricing(pricing, { inputTokens: r.input, outputTokens: r.output, cacheReadTokens: r.cache_read, cacheWrite5mTokens: r.cache_write_5m, cacheWrite1hTokens: r.cache_write_1h });
}

// Closed windows of one task: a task_start paired with the next task_end of the same task and session.
function closedWindows(entries: RegistryEntry[], task: string): { start: string; end: string }[] {
  const marks = entries
    .map((e, order) => ({ e, t: Date.parse(e.ts), order }))
    .filter((x) => (x.e.kind === "task_start" || x.e.kind === "task_end") && x.e.task === task && !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t || Number(b.e.kind === "task_end") - Number(a.e.kind === "task_end") || a.order - b.order);
  const open = new Map<string, string>();
  const out: { start: string; end: string }[] = [];
  for (const { e } of marks) {
    if (e.kind === "task_start") {
      if (!open.has(e.session_id)) open.set(e.session_id, e.ts);
    } else if (e.kind === "task_end") {
      const s = open.get(e.session_id);
      if (s !== undefined) {
        out.push({ start: s, end: e.ts });
        open.delete(e.session_id);
      }
    }
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function taskUsage(
  records: UsageRecord[],
  entries: RegistryEntry[],
  taskAgents: Record<string, string[]> | undefined,
  task: string,
  inferredSessions: string[] = [],
): TaskUsage {
  const ticketSessions = new Set<string>(inferredSessions);
  for (const e of entries) if (e.kind === "session") ticketSessions.add(e.session_id);
  const models: Record<string, ModelUsage> = {};
  let counts = emptyCounts();
  let cost: number | null = 0;
  for (const r of records) {
    if (!ticketSessions.has(r.session_id)) continue; // unattributed, as in buildSnapshot
    if ((ledgerTask(r, taskAgents) ?? taskForRecord(r, entries)) !== task) continue;
    const c: Counts = { input: r.input, output: r.output, cache_read: r.cache_read, cache_write_5m: r.cache_write_5m, cache_write_1h: r.cache_write_1h, responses: 1 };
    const p = priceOf(r);
    const m = (models[r.model] ??= { ...emptyCounts(), cost_usd: 0 });
    Object.assign(m, addCounts(m, c));
    m.cost_usd = m.cost_usd === null || p === null ? null : m.cost_usd + p;
    counts = addCounts(counts, c);
    cost = cost === null || p === null ? null : cost + p;
  }
  const windows = closedWindows(entries, task);
  const agentSeconds = windows.reduce((s, w) => s + Math.max(0, (Date.parse(w.end) - Date.parse(w.start)) / 1000), 0);
  return { models, total: { counts, cost_usd: cost, priced: cost !== null }, windows, agentSeconds };
}
