import { ANTHROPIC_PRICES_VERSION } from "./prices/anthropic.ts";
import { costFromPricing, resolveAnthropicPrice } from "./prices/cost.ts";
import type { ReviewData } from "./review-data.ts";
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
// A second task_start while one is open in that session is ignored (the first start wins). Windows of
// different sessions are paired separately and may overlap; each counts in full, so agentSeconds is the
// plain sum of closed windows, not wall-clock time.
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
  ticketSessions: Iterable<string>,
): TaskUsage {
  const own = new Set(ticketSessions);
  const models: Record<string, ModelUsage> = {};
  let counts = emptyCounts();
  let cost: number | null = 0;
  for (const r of records) {
    if (!own.has(r.session_id)) continue; // unattributed, as in buildSnapshot
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

// UTC+7 wall time "YYYY-MM-DD HH:MM:SS" (adds 7 h; no library).
export function utc7(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

export function formatDuration(seconds: number): string {
  const t = Math.max(0, Math.round(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

const usd = (n: number) => `$${n.toFixed(4)}`;
const countsText = (c: Counts) => `in ${c.input}, out ${c.output}, cache read ${c.cache_read}, cache write ${c.cache_write_5m + c.cache_write_1h}`;
const nr = "not recorded";

export interface StampInput {
  key: string;
  task: string; // "1", "2", ... or "final"
  usage: TaskUsage;
  review: ReviewData;
  missingSessions?: string[];
}

// Plain text (ClickUp does not render Markdown); the first line is the idempotence marker.
export function renderStamp(i: StampInput): string {
  const { usage, review: r } = i;
  const lines: string[] = [i.task === "final" ? `Hallmark final review of ${i.key}` : `Hallmark task ${i.task} of ${i.key}`];

  if (usage.windows.length > 0) {
    const firstStart = usage.windows.reduce((a, w) => (Date.parse(w.start) < Date.parse(a) ? w.start : a), usage.windows[0].start);
    const start = utc7(firstStart);
    const lastEnd = usage.windows.reduce((a, w) => (Date.parse(w.end) > Date.parse(a) ? w.end : a), usage.windows[0].end);
    const end = utc7(lastEnd);
    const endText = end.slice(0, 10) === start.slice(0, 10) ? end.slice(11) : end;
    lines.push(`Window: ${start} to ${endText} UTC+7 (agent time ${formatDuration(usage.agentSeconds)})`);
  } else {
    lines.push(`Window: ${nr}`);
  }

  let partial = 0;
  let anyPriced = false;
  for (const [model, m] of Object.entries(usage.models)) {
    const head = `${model}: ${countsText(m)} (${m.responses} ${m.responses === 1 ? "response" : "responses"})`;
    if (m.cost_usd === null) lines.push(`${head} cost not priced`);
    else { lines.push(`${head} = ${usd(m.cost_usd)}`); partial += m.cost_usd; anyPriced = true; }
  }

  const totalHead = `Task total: ${countsText(usage.total.counts)}`;
  if (usage.total.cost_usd !== null) lines.push(`${totalHead} = ${usd(usage.total.cost_usd)} (list price)`);
  else if (anyPriced) lines.push(`${totalHead} = ${usd(partial)} (partly priced)`);
  else lines.push(`${totalHead} cost not priced`);

  const n = i.missingSessions?.length ?? 0;
  if (n > 0) lines.push(`Partial: ${n} session(s) without transcript`);

  const reviews = r.rounds === null ? nr : `${r.rounds} round${r.rounds === 1 ? "" : "s"}`;
  let findings = nr;
  if (r.findings !== null) {
    const parts = [`${r.fixed ?? 0} fixed`, `${r.parked ?? 0} parked`, `${r.open ?? 0} open`];
    if (r.rejected !== null && r.rejected > 0) parts.push(`${r.rejected} rejected`);
    findings = `${r.findings} (${parts.join(", ")})`;
  }
  lines.push(`Reviews: ${reviews} | Findings: ${findings} | Fix rounds: ${r.fixRounds ?? nr}`);
  lines.push(`Source: registry window + transcripts, per-response list prices (list prices version ${ANTHROPIC_PRICES_VERSION}); agent time = sum of closed windows`);
  return lines.join("\n");
}
