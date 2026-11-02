import { formatDuration, utc7 } from "./stamp.ts";
import type { Counts } from "./types.ts";

export const START = "Hallmark totals begin (dg clickup ticket-total)";
export const END = "Hallmark totals end";
// The first form: ClickUp returns a line that starts with --- with a backslash in front.
// Whole lines only: a prose line that merely contains the text is not a sentinel.
export const LEGACY_START = /^\\?--- Hallmark \(dg clickup ticket-total\) ---(?=\r?$)/gm;
export const LEGACY_END = /^\\?--- end Hallmark ---(?=\r?$)/gm;
const hits = (text: string, re: RegExp): { index: number; length: number }[] => [...text.matchAll(re)].map((m) => ({ index: m.index as number, length: m[0].length }));
const literal = (text: string, needle: string) => hits(text, new RegExp(`^${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\r?$)`, "gm"));

/** Sentinel lines left in a description: the new ones (once each) and any legacy ones (none). */
export function sentinelCounts(text: string): { start: number; end: number; legacy: number } {
  return { start: literal(text, START).length, end: literal(text, END).length, legacy: hits(text, LEGACY_START).length + hits(text, LEGACY_END).length };
}

export interface BlockRow {
  task: string;
  agentSeconds: number;
  cost_usd: number | null;
  rounds: number | null; // null = reviews not recorded
  findings: number | null;
  fixRounds: number | null;
  stamped: boolean;
  partial?: boolean; // the stamp was posted with partial data
}

export interface BlockTotals {
  counts: Counts;
  cost_usd: number; // sum of the priced responses
  unpriced: boolean; // at least one response had no list price
}

const usd = (n: number) => `$${n.toFixed(4)}`;
const nr = "not recorded";

function totalLine(t: BlockTotals): string {
  const c = t.counts;
  const head = `Total: in ${c.input}, out ${c.output}, cache read ${c.cache_read}, cache write ${c.cache_write_5m + c.cache_write_1h}`;
  if (!t.unpriced) return `${head} = ${usd(t.cost_usd)} list price`;
  return t.cost_usd > 0 ? `${head} = ${usd(t.cost_usd)} (partly priced)` : `${head} cost not priced`;
}

/**
 * The Hallmark block. A blank line sits between the lines so ClickUp does not merge them;
 * the table rows stay together. Only the Updated line changes between two runs on the same data.
 */
export function renderBlock(rows: BlockRow[], totals: BlockTotals, opts: { now?: string; missing?: number } = {}): string {
  const seconds = rows.reduce((s, r) => s + r.agentSeconds, 0);
  const recorded = rows.filter((r) => r.rounds !== null || r.findings !== null || r.fixRounds !== null);
  const sum = (f: (r: BlockRow) => number | null) => recorded.reduce((s, r) => s + (f(r) ?? 0), 0);
  const gap = rows.length - recorded.length;
  const reviews = `Reviews: ${sum((r) => r.rounds)} rounds, ${sum((r) => r.findings)} findings, ${sum((r) => r.fixRounds)} fix rounds${gap > 0 ? ` (${gap} task(s) ${nr})` : ""}`;
  const table = [
    "| Task | Agent time | Cost | Findings | Fix rounds |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.task}${r.stamped ? "" : " (not stamped)"} | ${formatDuration(r.agentSeconds)} | ${r.cost_usd === null ? "cost not priced" : usd(r.cost_usd)} | ${r.findings ?? nr} | ${r.fixRounds ?? nr} |`),
  ].join("\n");
  const parts = [START, totalLine(totals), `Agent time: ${formatDuration(seconds)} over ${rows.length} ${rows.length === 1 ? "task" : "tasks"} (sum of task windows)`, reviews];
  if ((opts.missing ?? 0) > 0) parts.push(`Partial: ${opts.missing} session(s) without transcript`);
  const stampsPartial = rows.filter((r) => r.stamped && r.partial).length;
  if (stampsPartial > 0) parts.push(`Partial: ${stampsPartial} task stamp(s) were posted with partial data`);
  parts.push(table, `Updated ${utc7(opts.now ?? new Date().toISOString()).slice(0, 16)} UTC+7`, END);
  return parts.join("\n\n");
}

/** Appends the block after a blank line, or replaces the old one (new or legacy form) in place. Text outside it is untouched. */
export function applyBlock(description: string, block: string): string {
  const ns = literal(description, START), ne = literal(description, END);
  const ls = hits(description, LEGACY_START), le = hits(description, LEGACY_END);
  const total = ns.length + ne.length + ls.length + le.length;
  if (total === 0) {
    if (description === "") return block;
    const gap = description.endsWith("\n\n") ? "" : description.endsWith("\n") ? "\n" : "\n\n";
    return `${description}${gap}${block}`;
  }
  const newForm = ns.length + ne.length > 0;
  const legacyForm = ls.length + le.length > 0;
  const [s, e] = newForm ? [ns, ne] : [ls, le];
  if ((newForm && legacyForm) || s.length !== 1 || e.length !== 1 || e[0].index < s[0].index) {
    throw new Error("the description holds a lone, reversed, repeated or mixed Hallmark sentinel; fix it by hand");
  }
  return description.slice(0, s[0].index) + block + description.slice(e[0].index + e[0].length);
}
