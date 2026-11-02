import { createHash } from "node:crypto";
import type { OpenItem } from "../attention.ts";
import { CAUSES, classOfCause } from "../causes.ts";
import type { JournalLine } from "../journal.ts";
import type { Decision } from "./record.ts";
import { lockAgeMinutes, REFINE_LOCK_MAX_AGE_MINUTES, type RefineLock } from "./refine.ts";

/**
 * `none` is a fourth outcome the plan's union did not list: the table says "none" for several rows
 * (the tick restarts it, a wait is running). It is never shown and never wakes the Director.
 */
export type Move = { id: string } & (
  | { kind: "none" }
  | { kind: "reprompt"; ticket: string; run: string; to: "driver" | "self" }
  | { kind: "start-again"; ticket: string; run: string }              // refine worker only
  | { kind: "retry-once"; ticket: string; run: string; to: "driver" }
  | { kind: "release"; lane: "build"; ticket: string; result: "stopped"; reason: string; escalate: { id: string; question: string } | null }
  | { kind: "refine-release"; lane: "refine"; ticket: string; result: "failed" | "escalated"; reason: string }
  | { kind: "gate-wait"; ticket: string; ageMin: number }
  | { kind: "list-only"; item: string; why: string });

export interface History { decisions: Decision[]; journal: JournalLine[] }
export interface UnblockCtx {
  lockTicket: string | null;     // the factory ticket (lock.json)
  refineTicket: string | null;   // the refine-lock ticket
  now: Date;
  /** Required: the role of a run from its run record ("builder", "reviewer", "scout", "other", ...), null when unknown. Fail closed: only a builder (lock ticket) or an "other"/"refine" run (refine ticket) is acted on. */
  roleOf: (run: string) => string | null;
}

const WAIT_MIN = 30;
const ESCALATE_ID = "product-taste-names-scope";

type Body = Move extends infer M ? (M extends { id: string } ? Omit<M, "id"> : never) : never;
const mid = (kind: string, ticket: string, run: string): string => `m-${createHash("sha1").update(`${kind}|${ticket}|${run}`).digest("hex").slice(0, 8)}`;
/** The id input is kind (plus the result of a release), ticket and run, so two releases of different runs, or a failed and an escalated refine-release, never share an id. */
const withId = (b: Body, run = ""): Move => {
  const ticket = "ticket" in b ? b.ticket : "";
  const r = "run" in b ? b.run : "item" in b ? b.item : run;
  const label = "result" in b ? `${b.kind}:${b.result}` : b.kind;
  return { ...b, id: mid(label, ticket, r) } as Move;
};

/** The run key a retry-once decision is recorded under (distinct from a re-prompt of the same run). */
export const retryRunKey = (run: string): string => `${run}#retry`;

const ageMin = (iso: string, now: Date): number => Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);

/** The newest decision for ticket + run + id; null when none, or when the newest line of that move says it failed (a failed move did not happen). */
function find(h: History, ticket: string, run: string, id: string): Decision | null {
  for (let i = h.decisions.length - 1; i >= 0; i--) {
    const d = h.decisions[i];
    if (d.ticket === ticket && d.id === id && (d.run ?? null) === run) return d.outcome === "failed" ? null : d;
  }
  return null;
}

/** The tick's own retry of THIS run (journal action "retry", detail.run or detail.item matches), unless the journal settled it retryable (never delivered). */
function tickRetry(journal: JournalLine[], ticket: string, run: string, itemId: string): { ts: string } | null {
  const last = new Map<string, JournalLine>();
  for (const l of journal) last.set(l.key, l);
  let found: JournalLine | null = null;
  for (const l of journal) {
    if (l.status !== "planned" || l.ticket !== ticket || l.action !== "retry") continue;
    if (l.detail?.run !== run && l.detail?.item !== itemId) continue;
    const end = last.get(l.key);
    if (end !== undefined && end.status === "settled" && end.result === "retryable") continue;
    found = l;
  }
  return found === null ? null : { ts: found.ts };
}

const listOnly = (item: OpenItem, why: string): Move => withId({ kind: "list-only", item: item.id, why });
const none = (ticket: string, run: string): Move => ({ id: mid("none", ticket, run), kind: "none" });

function releaseBuild(ticket: string, run: string, reason: string, question: string): Move {
  return withId({ kind: "release", lane: "build", ticket, result: "stopped", reason, escalate: { id: ESCALATE_ID, question } }, run);
}

function classOf(item: OpenItem): "transient" | "durable" | "unknown" {
  if (Object.hasOwn(CAUSES, item.cause)) return classOfCause(item.cause);
  return item.causeClass ?? "unknown";
}

function buildLane(item: OpenItem, h: History, now: Date, ticket: string): Move {
  const run = item.run;
  const stoppedAfterWait = (what: string): Move => releaseBuild(ticket, run, `${what}: stopped by the Director after ${WAIT_MIN} minutes`, `The Builder run ${run} ${what} and did not recover. Say how to go on`);
  switch (item.kind) {
    case "lost": {
      const retry = tickRetry(h.journal, ticket, run, item.id);
      if (retry === null && item.retryEligible === true) return none(ticket, run);   // the tick restarts it
      return ageMin(retry?.ts ?? item.since, now) >= WAIT_MIN ? stoppedAfterWait(`was lost (${item.cause})`) : none(ticket, run);
    }
    case "stalled": {
      const rp = find(h, ticket, run, "reprompt-run");
      if (rp === null) return withId({ kind: "reprompt", ticket, run, to: "driver" });
      return ageMin(rp.ts, now) >= WAIT_MIN ? stoppedAfterWait(`stalled (${item.cause}) and a re-prompt did not help`) : none(ticket, run);
    }
    case "failed": {
      const cls = classOf(item);
      if (cls === "unknown") return listOnly(item, "cause class unknown");
      if (cls === "durable") return releaseBuild(ticket, run, `failed: ${item.cause}`, `The Builder run ${run} failed with a cause only a person can fix: ${item.cause}. Say how to go on`);
      const tick = tickRetry(h.journal, ticket, run, item.id);
      if (tick !== null) return ageMin(tick.ts, now) >= WAIT_MIN ? stoppedAfterWait(`failed (${item.cause}) and the retry did not help`) : none(ticket, run);
      const used = find(h, ticket, retryRunKey(run), "reprompt-run");
      if (used === null) return withId({ kind: "retry-once", ticket, run, to: "driver" });
      return ageMin(used.ts, now) >= WAIT_MIN ? stoppedAfterWait(`failed (${item.cause}) and the one retry did not help`) : none(ticket, run);
    }
    case "refused": {
      if (!item.cause.startsWith("merge-refused")) return listOnly(item, "refused for another cause");
      const age = ageMin(item.since, now);
      return age >= WAIT_MIN ? withId({ kind: "gate-wait", ticket, ageMin: age }, run) : listOnly(item, "waiting for the Maestro (protected-path merge), under 30 minutes");
    }
    case "blocked": return listOnly(item, "a prompt waits for Jack (answer-prompt): the Director never answers it");
    default: return listOnly(item, "not an item the Director acts on");
  }
}

function refineLane(item: OpenItem, h: History, now: Date, ticket: string): Move {
  const run = item.run;
  // The refine worker is one chain per ticket: each restart-run decision of the ticket counts, whatever its run.
  const lostLike = (): Move => {
    if (find(h, ticket, run, "restart-run") !== null) return none(ticket, run);   // already started again for this run
    // one restart per run: a move's started and done lines count once, and a failed start did not happen
    const effective = new Map<string, Decision>();
    for (const d of h.decisions) if (d.ticket === ticket && d.id === "restart-run") effective.set(d.run ?? "", d);
    const restarts = [...effective.values()].filter((d) => d.outcome !== "failed").length;
    if (restarts === 0) return withId({ kind: "start-again", ticket, run });
    return withId({ kind: "refine-release", lane: "refine", ticket, result: restarts === 1 ? "failed" : "escalated", reason: `the refine worker was lost ${restarts + 1} times (${item.cause})` }, run);
  };
  switch (item.kind) {
    case "lost": return lostLike();
    case "stalled": {
      const rp = find(h, ticket, run, "reprompt-run");
      if (rp === null) return withId({ kind: "reprompt", ticket, run, to: "self" });
      return ageMin(rp.ts, now) >= WAIT_MIN ? lostLike() : none(ticket, run);
    }
    case "failed": {
      const cls = classOf(item);
      if (cls === "unknown") return listOnly(item, "cause class unknown");
      if (cls === "durable") return withId({ kind: "refine-release", lane: "refine", ticket, result: "escalated", reason: `the refine worker failed: ${item.cause}` }, run);
      return lostLike();
    }
    case "blocked": return listOnly(item, "a prompt waits for Jack (answer-prompt): the Director never answers it");
    default: return listOnly(item, "not an item the Director acts on");
  }
}

/** The unblock table (spec 7). Pure: the same item, history and context give the same move. */
export function movesFor(item: OpenItem, h: History, ctx: UnblockCtx): Move {
  if (item.ticket === null) return listOnly(item, "item has no ticket");
  if (item.run === "breaker") return listOnly(item, "breaker: closing it is Jack's (close-breaker)");
  const role = ctx.roleOf(item.run);
  if (item.ticket === ctx.refineTicket) {
    return role === "other" || role === "refine" ? refineLane(item, h, ctx.now, item.ticket) : listOnly(item, `run role ${role ?? "unknown"} is not the refine worker: a conductor owns it`);
  }
  if (item.ticket === ctx.lockTicket) {
    return role === "builder" ? buildLane(item, h, ctx.now, item.ticket) : listOnly(item, `run role ${role ?? "unknown"} is not the Builder: a conductor owns it`);
  }
  return listOnly(item, "not the factory ticket or the refine ticket: a conductor owns it");
}

/** A refine lock older than REFINE_LOCK_MAX_AGE_MINUTES is a world input of its own. */
export function stuckLockMove(lock: RefineLock | null, now: Date): Move | null {
  if (lock === null || lockAgeMinutes(lock, now) <= REFINE_LOCK_MAX_AGE_MINUTES) return null;
  return withId({ kind: "refine-release", lane: "refine", ticket: lock.ticket, result: "escalated", reason: `refine lock older than ${REFINE_LOCK_MAX_AGE_MINUTES} minutes` });
}
