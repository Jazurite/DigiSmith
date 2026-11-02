import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TICKET_PATTERN, depotRegistryDir, endsTorn } from "./registry.ts";

export interface StampModel {
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  responses: number;
  cost_usd: number | null;
}

export interface StampReviews {
  rounds: number;
  findings: number;
  fixed: number;
  parked: number;
  rejected: number;
  open: number;
  fix_rounds: number;
  source: string;
}

// Counts and ids only; never message text.
export interface StampLine {
  task: string;
  comment_id: string;
  window_start: string;
  window_end: string;
  agent_seconds: number;
  models: Record<string, StampModel>;
  reviews: StampReviews;
  partial: boolean;
  stamped_at: string;
}

function fileFor(ticket: string): string {
  if (!TICKET_PATTERN.test(ticket)) throw new Error(`invalid ticket key: ${ticket}`);
  return join(depotRegistryDir(), `${ticket}.stamps.jsonl`);
}

export function appendStamp(ticket: string, stamp: StampLine): void {
  const file = fileFor(ticket);
  mkdirSync(depotRegistryDir(), { recursive: true });
  appendFileSync(file, `${endsTorn(file) ? "\n" : ""}${JSON.stringify(stamp)}\n`);
}

export function readStamps(ticket: string): StampLine[] {
  const file = fileFor(ticket);
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf-8");
  const lines = text.split("\n");
  if (!text.endsWith("\n")) lines.pop(); // torn tail: no newline, ignored
  const out: StampLine[] = [];
  for (const raw of lines) {
    if (!raw) continue;
    try {
      const p: unknown = JSON.parse(raw);
      if (typeof p === "object" && p !== null && typeof (p as StampLine).task === "string") out.push(p as StampLine);
    } catch {
      // a hand-edited line never breaks a read
    }
  }
  return out;
}

export function stampOf(ticket: string, task: string): StampLine | undefined {
  const all = readStamps(ticket).filter((s) => s.task === task);
  return all[all.length - 1];
}
