import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appendAttention } from "../attention-write.ts";
import { fmtUtc7 } from "../clock.ts";
import { recordDecision, sendOrQueue, type RecordDeps } from "./record.ts";
import type { StatusPort } from "./status.ts";

export interface EscalateArgs { ticket: string; taskId: string; id: string; question: string; viaRelease: boolean }
export type EscalateResult = { outcome: "asked" } | { outcome: "already-open" } | { outcome: "refused"; text: string };
interface Line { key: string; ticket: string; id: string; question: string; askedAt: string; askedAtUtc7: string; state: "open" | "returned"; returnedAt?: string }

const FILE = "escalations.jsonl";

export const questionKey = (ticket: string, id: string, question: string): string =>
  `${ticket}|${id}|${createHash("sha1").update(question.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex")}`;

function readLines(dir: string): Line[] {
  const file = join(dir, FILE);
  if (!existsSync(file)) return [];
  const out: Line[] = [];
  for (const l of readFileSync(file, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    try {
      const v = JSON.parse(l) as Line;
      if (v && typeof v.key === "string") out.push(v);
    } catch { /* skipped */ }
  }
  return out;
}

/** The newest line per key: a later "returned" line supersedes the open one. */
function current(dir: string): Map<string, Line> {
  const m = new Map<string, Line>();
  for (const l of readLines(dir)) m.set(l.key, l);
  return m;
}

function append(dir: string, line: Line): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, FILE), `${JSON.stringify(line)}\n`);
}

/** Marks the open escalations of a ticket "returned". Returns how many. */
export function markReturned(dir: string, ticket: string, now: Date): number {
  let n = 0;
  for (const l of current(dir).values()) {
    if (l.ticket !== ticket || l.state !== "open") continue;
    append(dir, { ...l, state: "returned", returnedAt: now.toISOString() });
    n++;
  }
  return n;
}

function refuse(d: RecordDeps, a: EscalateArgs, text: string): EscalateResult {
  appendAttention(d.dir, d.now(), { ticket: a.ticket, run: `${a.ticket}/escalation`, kind: "unknown", cause: "question-already-asked" });
  return { outcome: "refused", text };
}

export async function escalate(d: RecordDeps & { status: StatusPort }, a: EscalateArgs): Promise<EscalateResult> {
  const now = d.now();
  const key = questionKey(a.ticket, a.id, a.question);
  const all = current(d.dir);
  const same = all.get(key);
  if (same) {
    if (same.state === "returned") return refuse(d, a, `already asked and answered at ${fmtUtc7(new Date(same.returnedAt ?? same.askedAt))}: decide it yourself or ask a different question`);
    return refuse(d, a, `already asked at ${same.askedAtUtc7}: waiting for Jack`);
  }
  const hasOpen = [...all.values()].some((l) => l.ticket === a.ticket && l.state === "open");
  if (hasOpen && !a.viaRelease && (await d.tracker.getStatus(a.taskId)) === "concept") return { outcome: "already-open" };

  if (!a.viaRelease) {
    // DGS-739: the Steward is the only status writer; `returned` is its event for refinement, discovery or to do back to concept
    const moved = await d.status.send(a.ticket, { event: "returned", by: "director" });
    if (!moved.ok) throw new Error(`the Steward did not move ${a.ticket} to concept: ${moved.text}`);
    const back = await d.tracker.getStatus(a.taskId);
    if (back !== "concept") throw new Error(`status read-back of ${a.ticket} is "${back}", expected "concept"`);
  }
  await sendOrQueue(d, a.ticket, `Director (${fmtUtc7(now)} UTC+7): ${a.question}. Needs: ${a.id}. Answer here, then move the ticket back to refinement.`);
  append(d.dir, { key, ticket: a.ticket, id: a.id, question: a.question, askedAt: now.toISOString(), askedAtUtc7: fmtUtc7(now), state: "open" });
  await recordDecision(d, { ticket: a.ticket, id: "escalate-concept", side: "escalated", what: `asked Jack (needs ${a.id}): ${a.question}`, why: `outside the Director's authority: ${a.id}`, noComment: true });
  return { outcome: "asked" };
}

/** True when any escalation of the ticket came back (an answer exists). */
export function hasReturned(dir: string, ticket: string): boolean {
  for (const l of current(dir).values()) if (l.ticket === ticket && l.state === "returned") return true;
  return false;
}
