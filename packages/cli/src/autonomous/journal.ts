import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from "node:fs";
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

function lastByteIsTorn(path: string): boolean {
  if (!existsSync(path)) return false;
  const size = statSync(path).size;
  if (size === 0) return false;
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(1);
    readSync(fd, buf, 0, 1, size - 1);
    return buf[0] !== 0x0a;
  } finally {
    closeSync(fd);
  }
}

function append(dir: string, line: JournalLine): void {
  mkdirSync(dir, { recursive: true });
  const path = journalPath(dir);
  // A torn last line (no newline) would otherwise swallow this line; start a fresh one.
  const prefix = lastByteIsTorn(path) ? "\n" : "";
  appendFileSync(path, `${prefix}${JSON.stringify(line)}\n`);
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

// The read-then-append in plan() is not atomic across processes. It is safe because the
// scan job is single-flight in the Nexus scheduler and the ticket lock allows one controller at a time.
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
  const lines = readJournal(dir);
  const plannedCount = lines.filter((l) => l.key === key && l.status === "planned").length;
  if (plannedCount === 0) throw new Error(`journal key was never planned: ${key}`);
  const current = stateMap(lines).get(key);
  if (current === "succeeded" || current === "permanent") throw new Error(`journal key already settled: ${key}`);
  let final = result;
  let text = note;
  if (result === "retryable" && plannedCount >= MAX_TRIES) {
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

/** plan() unless the key is already used (anything but absent or retryable); returns the key, or null when it was used. */
export function planIfFree(dir: string, now: Date, e: { ticket: string; phase: string; attempt: number; action: string; detail?: Record<string, string> }): string | null {
  const state = resultsOf(dir)[keyOf(e)];
  return state === undefined || state === "retryable" ? plan(dir, now, e) : null;
}

const actionOfKey = (k: string) => k.split(":").slice(3).join(":");

// Restart orders already used by this ticket, in any phase. A retryable key was never delivered, so it does not count.
export function restartsOf(results: JournalResults, ticket: string): number {
  return Object.entries(results).filter(([k, st]) => {
    const a = actionOfKey(k);
    return k.split(":")[0] === ticket && (a === "retry" || a === "order-restart") && st !== "retryable";
  }).length;
}

// The attention item named by the ticket's latest retry line (detail.item), or null when there is none.
export function retryItemOf(dir: string, ticket: string): string | null {
  const l = [...readJournal(dir)].reverse().find((x) => x.status === "planned" && x.ticket === ticket && x.action === "retry");
  const id = l?.detail?.item;
  return typeof id === "string" && id !== "" ? id : null;
}

// True when any adopt-retry key of the ticket is used (not retryable), in any phase.
export function adoptUsed(results: JournalResults, ticket: string): boolean {
  return Object.entries(results).some(([k, st]) => k.split(":")[0] === ticket && actionOfKey(k) === "adopt-retry" && st !== "retryable");
}

export function retrySucceeded(results: JournalResults, ticket: string): boolean {
  return Object.entries(results).some(([k, st]) => k.split(":")[0] === ticket && actionOfKey(k) === "retry" && st === "succeeded");
}
