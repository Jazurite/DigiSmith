import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fmtUtc7 } from "../clock.ts";
import type { Tracker } from "../types.ts";

export interface DecisionInput { ticket: string; run?: string | null; id: string; side: "within" | "escalated"; what: string; why: string; noComment?: boolean; move?: string; outcome?: Outcome }
/** A move is written "started" before its effect, then "done" or "failed" after it. */
export type Outcome = "started" | "done" | "failed";
export interface Decision { ts: string; tsUtc7: string; ticket: string; run: string | null; id: string; side: "within" | "escalated"; what: string; why: string; by: "director"; move?: string; outcome?: Outcome }
export interface RecordDeps { dir: string; now: () => Date; tracker: Tracker }

export const NO_COMMENT = new Set(["reprompt-run", "pick-seat"]);
const PENDING = "comment-pending.jsonl";

export function directorDir(dir: string): string {
  const d = join(dir, "director");
  mkdirSync(d, { recursive: true });
  return d;
}

/** Sends a comment; a failure queues it in comment-pending.jsonl (never throws on the comment). */
export async function sendOrQueue(d: RecordDeps, ref: string, text: string): Promise<void> {
  try {
    await d.tracker.comment(ref, text);
  } catch {
    try {
      mkdirSync(d.dir, { recursive: true });
      appendFileSync(join(d.dir, PENDING), `${JSON.stringify({ ref, text, queuedAt: d.now().toISOString() })}\n`);
    } catch (e) {
      process.stderr.write(`director: comment for ${ref} lost, queue write failed: ${(e as Error).message}\n`);
    }
  }
}

/** Journal first (a failure throws and sends nothing), then the ClickUp comment. */
export async function recordDecision(d: RecordDeps, e: DecisionInput): Promise<void> {
  const now = d.now();
  const line: Decision = { ts: now.toISOString(), tsUtc7: fmtUtc7(now), ticket: e.ticket, run: e.run ?? null, id: e.id, side: e.side, what: e.what, why: e.why, by: "director", ...(e.move === undefined ? {} : { move: e.move }), ...(e.outcome === undefined ? {} : { outcome: e.outcome }) };
  appendFileSync(join(directorDir(d.dir), "decisions.jsonl"), `${JSON.stringify(line)}\n`);
  if (NO_COMMENT.has(e.id) || e.noComment === true) return;
  await sendOrQueue(d, e.ticket, `Director decision (${line.tsUtc7} UTC+7): ${e.what}. Why: ${e.why}.`);
}

export function readDecisions(dir: string): Decision[] {
  const file = join(dir, "director", "decisions.jsonl");
  if (!existsSync(file)) return [];
  const out: Decision[] = [];
  for (const l of readFileSync(file, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    try {
      const v = JSON.parse(l) as Decision;
      if (v && typeof v.ticket === "string" && typeof v.id === "string") out.push(v);
    } catch { /* skipped */ }
  }
  return out;
}

/** The newest line for ticket + run + id; run is part of the key. */
export function hasDecision(dir: string, ticket: string, run: string | null, id: string): Decision | null {
  const all = readDecisions(dir);
  for (let i = all.length - 1; i >= 0; i--) {
    const x = all[i];
    if (x.ticket === ticket && x.id === id && (x.run ?? null) === run) return x;
  }
  return null;
}

/**
 * Sends the queue; what still fails stays queued. Returns how many were sent.
 * The queue is renamed to comment-pending.retrying.jsonl first, so a comment queued meanwhile lands in a fresh file;
 * a leftover retrying file (a crash) is processed before anything else.
 */
export async function retryPendingComments(d: RecordDeps): Promise<number> {
  const file = join(d.dir, PENDING);
  const work = join(d.dir, "comment-pending.retrying.jsonl");
  if (!existsSync(work)) {
    if (!existsSync(file)) return 0;
    try { renameSync(file, work); } catch { return 0; }
  }
  const queue: { ref: string; text: string }[] = [];
  for (const l of readFileSync(work, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    try { queue.push(JSON.parse(l)); } catch { /* skipped */ }
  }
  const left: string[] = [];
  let sent = 0;
  for (const q of queue) {
    try { await d.tracker.comment(q.ref, q.text); sent++; } catch { left.push(JSON.stringify(q)); }
  }
  if (left.length > 0) appendFileSync(file, `${left.join("\n")}\n`);
  rmSync(work, { force: true });
  return sent;
}
