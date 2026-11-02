import { formatDuration, utc7 } from "./stamp.ts";
import type { Counts } from "./types.ts";

export const START = "--- Hallmark (dg clickup ticket-total) ---";
export const END = "--- end Hallmark ---";

export interface BlockRow {
  task: string;
  agentSeconds: number;
  cost_usd: number | null;
  rounds: number | null; // null = reviews not recorded
  findings: number | null;
  fixRounds: number | null;
  stamped: boolean;
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
  const parts = [START, totalLine(totals), `Agent time: ${formatDuration(seconds)} over ${rows.length} tasks (sum of task windows)`, reviews];
  if ((opts.missing ?? 0) > 0) parts.push(`Partial: ${opts.missing} session(s) without transcript`);
  parts.push(table, `Updated ${utc7(opts.now ?? new Date().toISOString()).slice(0, 16)} UTC+7`, END);
  return parts.join("\n\n");
}

/** Appends the block after a blank line, or replaces the old one in place. Text outside it is untouched. */
export function applyBlock(description: string, block: string): string {
  const s = description.indexOf(START);
  const e = description.indexOf(END);
  if (s === -1 && e === -1) {
    if (description === "") return block;
    const gap = description.endsWith("\n\n") ? "" : description.endsWith("\n") ? "\n" : "\n\n";
    return `${description}${gap}${block}`;
  }
  if (s === -1 || e === -1 || e < s || description.indexOf(START, s + 1) !== -1 || description.indexOf(END, e + 1) !== -1) {
    throw new Error("the description holds a lone, reversed or repeated Hallmark sentinel; fix it by hand");
  }
  return description.slice(0, s) + block + description.slice(e + END.length);
}
