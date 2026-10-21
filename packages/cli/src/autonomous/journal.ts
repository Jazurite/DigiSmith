import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_TRIES } from "./phase-types.ts";
import type { JournalResults, JournalState, SettleResult } from "./phase-types.ts";

export interface JournalLine {
  schema: string; ts: string; key: string; status: "planned" | "settled";
  ticket?: string; phase?: string; attempt?: number; action?: string; try?: number;
  detail?: Record<string, string>; result?: SettleResult; note?: string; by?: string;
}
const SCHEMA = "nightwatch-journal/v1";
export const journalPath = (dir: string) => join(dir, "journal.jsonl");

function append(dir: string, line: JournalLine): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(journalPath(dir), `${JSON.stringify(line)}\n`);
}

export function readJournal(dir: string): JournalLine[] {
  if (!existsSync(journalPath(dir))) return [];
  const out: JournalLine[] = [];
  for (const text of readFileSync(journalPath(dir), "utf8").split("\n")) {
    if (text === "") continue;
    try {
      const l = JSON.parse(text) as JournalLine;
      if (l.schema === SCHEMA && typeof l.key === "string" && (l.status === "planned" || l.status === "settled")) out.push(l);
    } catch { /* a line that does not parse is skipped */ }
  }
  return out;
}

function stateMap(lines: JournalLine[]): Map<string, JournalState> {
  const m = new Map<string, JournalState>();
  for (const l of lines) m.set(l.key, l.status === "planned" ? "open" : (l.result ?? "uncertain"));
  return m;
}

export function resultsOf(dir: string): JournalResults {
  return Object.fromEntries(stateMap(readJournal(dir)));
}

export function keyOf(e: { ticket: string; phase: string; attempt: number; action: string }): string {
  return `${e.ticket}:${e.phase}:${e.attempt}:${e.action}`;
}

export function plan(dir: string, now: Date, e: { ticket: string; phase: string; attempt: number; action: string; detail?: Record<string, string> }): string {
  const key = keyOf(e);
  const lines = readJournal(dir);
  const state = stateMap(lines).get(key);
  if (state !== undefined && state !== "retryable") throw new Error(`journal key already used: ${key}`);
  const tries = lines.filter((l) => l.key === key && l.status === "planned").length;
  append(dir, { schema: SCHEMA, ts: now.toISOString(), key, status: "planned", ticket: e.ticket, phase: e.phase, attempt: e.attempt, action: e.action, try: tries + 1, ...(e.detail ? { detail: e.detail } : {}) });
  return key;
}

export function settle(dir: string, now: Date, key: string, result: SettleResult, note = "", by = "controller"): SettleResult {
  let final = result;
  let text = note;
  if (result === "retryable" && readJournal(dir).filter((l) => l.key === key && l.status === "planned").length >= MAX_TRIES) {
    final = "permanent";
    text = note === "" ? "retries exhausted" : `${note}; retries exhausted`;
  }
  append(dir, { schema: SCHEMA, ts: now.toISOString(), key, status: "settled", result: final, note: text, by });
  return final;
}

export function openLines(dir: string): { key: string; state: "open" | "uncertain"; planned: JournalLine }[] {
  const lines = readJournal(dir);
  const states = stateMap(lines);
  const out: { key: string; state: "open" | "uncertain"; planned: JournalLine }[] = [];
  for (const [key, state] of states) {
    if (state !== "open" && state !== "uncertain") continue;
    const planned = [...lines].reverse().find((l) => l.key === key && l.status === "planned");
    if (planned !== undefined) out.push({ key, state, planned });
  }
  return out;
}

export function closeOpen(dir: string, now: Date, ticket: string, note: string): number {
  const mine = openLines(dir).filter((l) => l.planned.ticket === ticket);
  for (const l of mine) settle(dir, now, l.key, "permanent", note);
  return mine.length;
}
