import { evaluate } from "./rules.ts";
import { DEFAULT_LOCK, peekState, readState, rebuildState, withLock, writeState, type LockOptions, type PendingWrite, type StewardState } from "./state.ts";
import type { TicketSnapshot, Tracker } from "./tracker.ts";
import { GATE_EVENTS, type Config, type EventInput, type Move, type TicketView } from "./types.ts";

export class UsageError extends Error {}

export interface EventDeps {
  tracker: Tracker | null;
  dir: string;
  now: () => Date;
  config: Config;
  lock?: LockOptions;
  sessionIds: (ticket: string) => string[];
}

export interface EventResult { out: string[]; warn: string[] }

type WriteResult = { ok: true } | { ok: false; kind: "refused" | "failed"; message: string };

const TRACKER_NAME = "clickup";
const LOG_LIMIT = 200;
const MERGE_KEPT_IN = ["review", "acceptance", "release", "done", "documented"];
const CLOSING = ["done", "discarded", "Closed"];

export function todayUtc7(now: Date): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function assertUsage(input: EventInput): void {
  if (GATE_EVENTS.includes(input.event) && !(input.quote && input.quote.trim() !== "")) {
    throw new UsageError(`${input.event} needs Jack's own words: pass --quote "<his words>"`);
  }
  if (input.event === "accepted" && input.answer !== "yes" && input.answer !== "no") {
    throw new UsageError("accepted needs --answer yes or no");
  }
}

function viewOf(snap: TicketSnapshot, st: StewardState): TicketView {
  return {
    status: snap.status,
    signoff: snap.signoff,
    mergedRecorded: st.merged !== null,
    acceptedYes: st.gates.some((g) => g.event === "accepted" && g.answer === "yes"),
  };
}

function log(st: StewardState, now: Date, input: EventInput, outcome: StewardState["log"][number]["outcome"], note: string): void {
  st.log.push({ at: now.toISOString(), event: input.event, by: input.by ?? "", outcome, note });
  if (st.log.length > LOG_LIMIT) st.log.splice(0, st.log.length - LOG_LIMIT);
}

/** One status write, its dates and comment, then a read back. Returns ok, or why not: refused (status not on the list) or failed (tracker error or read-back mismatch). Ok when the tracker shows the new status. */
async function write(tracker: Tracker, ticket: string, st: StewardState, p: PendingWrite, now: Date, snap: TicketSnapshot): Promise<WriteResult> {
  try {
    if (!snap.statuses.includes(p.to)) return { ok: false, kind: "refused", message: `status "${p.to}" is not on the list (${snap.statuses.join(", ")})` };
    await tracker.setStatus(ticket, p.to);
    if (p.start || p.due) await tracker.setDates(ticket, { start: p.start, due: p.due });
    if (p.comment && !p.commented) {
      await tracker.addComment(ticket, p.comment);
      p.commented = true;
    }
    const back = await tracker.getTicket(ticket);
    if (back.status !== p.to) return { ok: false, kind: "failed", message: `read back shows "${back.status}", wanted "${p.to}"` };
    st.status_written = p.to;
    st.status_seen = p.to;
    if (p.start) st.start_written = p.start;
    if (p.due) st.due_written = p.due;
    if (CLOSING.includes(p.to)) st.closed_at = now.toISOString();
    return { ok: true };
  } catch (err) {
    return { ok: false, kind: "failed", message: (err as Error).message };
  }
}

function pendingOf(move: Move, st: StewardState, snap: TicketSnapshot, today: string): PendingWrite {
  const p: PendingWrite = { to: move.to, from: snap.status };
  if (move.startDate && !st.start_written && !snap.startDate) p.start = today;
  if (move.dueDate) p.due = today;
  if (move.comment) p.comment = move.comment;
  return p;
}

function describe(ticket: string, from: string, r: ReturnType<typeof evaluate>): string {
  switch (r.kind) {
    case "move": return `${ticket}: ${from} -> ${r.to}`;
    case "record": return `${ticket}: records the merge, stays in ${from}`;
    case "noop": return `${ticket}: already there, nothing to do`;
    case "refuse": return `${ticket}: refused: ${r.reason}`;
  }
}

function loadState(deps: EventDeps, ticket: string, snap: TicketSnapshot): StewardState {
  return readState(deps.dir, ticket) ?? rebuildState(ticket, TRACKER_NAME, snap, deps.sessionIds(ticket));
}

async function apply(deps: EventDeps, tracker: Tracker, ticket: string, input: EventInput): Promise<EventResult> {
  const out: string[] = [];
  const warn: string[] = [];
  const now = deps.now();
  const today = todayUtc7(now);
  let snap = await tracker.getTicket(ticket);
  const st = loadState(deps, ticket, snap);

  // Writes that failed earlier go first, in order.
  const stillPending: PendingWrite[] = [];
  for (const p of st.pending) {
    if (snap.status === p.to) continue; // already there: nothing to send, and no second comment
    if (snap.status !== p.from) {
      warn.push(`steward: ${ticket}: dropped the queued move to ${p.to} because the ticket is now in ${snap.status}`);
      continue;
    }
    const res = await write(tracker, ticket, st, p, now, snap);
    if (!res.ok) stillPending.push(p);
    else out.push(`steward: ${ticket}: retried the earlier move to ${p.to}`);
    try { snap = await tracker.getTicket(ticket); } catch { /* keep the last snapshot */ }
  }
  st.pending = stillPending;

  st.signoff = snap.signoff;
  st.status_seen = snap.status;
  const result = evaluate(input, viewOf(snap, st), deps.config);
  const stamp = `${input.event}:${input.sha ?? today}`;

  if (result.kind === "refuse") {
    log(st, now, input, "refused", result.reason);
    warn.push(`steward: refused ${input.event}: ${ticket} ${result.reason}`);
  } else if (result.kind === "noop") {
    log(st, now, input, "noop", "already at the target");
  } else {
    const gatesBefore = st.gates.length;
    const mergedBefore = st.merged;
    if (GATE_EVENTS.includes(input.event)) {
      st.gates.push({ event: input.event, ...(input.answer ? { answer: input.answer } : {}), quote: input.quote!.trim(), by: input.by ?? "", at: now.toISOString() });
    }
    if (result.recordMerge) st.merged = { sha: input.sha ?? null, at: now.toISOString() };
    if (result.kind === "record") {
      log(st, now, input, "recorded", "merge recorded, no move");
      st.applied.push(stamp);
      out.push(`steward: ${describe(ticket, snap.status, result)}`);
    } else {
      const p = pendingOf(result, st, snap, today);
      const res = await write(tracker, ticket, st, p, now, snap);
      if (res.ok) {
        log(st, now, input, "applied", `${snap.status} -> ${result.to}`);
        st.applied.push(stamp);
        if (input.event === "accepted" && input.answer === "no") st.merged = null; // the work will be redone
        out.push(`steward: ${describe(ticket, snap.status, result)}${p.start ? ` (start ${p.start})` : ""}${p.due ? ` (due ${p.due})` : ""}`);
      } else if (res.kind === "refused") {
        st.gates.length = gatesBefore;
        st.merged = mergedBefore;
        log(st, now, input, "refused", res.message);
        warn.push(`steward: refused ${input.event}: ${ticket} ${res.message}`);
      } else {
        if (!st.pending.some((q) => q.to === p.to && q.from === p.from && q.start === p.start && q.due === p.due && q.comment === p.comment)) st.pending.push(p);
        log(st, now, input, "pending", res.message);
        warn.push(`steward: ${ticket}: could not move to ${result.to} (${res.message}); will retry at the next event`);
      }
    }
  }
  writeState(deps.dir, st);
  return { out, warn };
}

/** Applies one event. Returns the lines to print. Throws UsageError on a bad call; the caller handles every other error. */
export async function runEvent(deps: EventDeps, ticket: string, input: EventInput, dryRun = false): Promise<EventResult> {
  assertUsage(input);
  const tracker = deps.tracker;
  if (!tracker) return { out: [], warn: [] };
  if (dryRun) {
    const snap = await tracker.getTicket(ticket);
    const st = peekState(deps.dir, ticket) ?? rebuildState(ticket, TRACKER_NAME, snap, []);
    return { out: [`steward: dry run: ${describe(ticket, snap.status, evaluate(input, viewOf(snap, st), deps.config))}`], warn: [] };
  }
  const locked = await withLock(deps.dir, ticket, () => apply(deps, tracker, ticket, input), deps.lock ?? DEFAULT_LOCK);
  if (!locked.locked) return { out: [], warn: [`steward: ${ticket}: another call holds the lock; ${input.event} was not applied. Send it again.`] };
  return locked.value;
}

/** Rebuilds the state file from the tracker and the token registry. ClickUp wins. */
export async function rebuild(deps: EventDeps, ticket: string): Promise<EventResult> {
  const tracker = deps.tracker;
  if (!tracker) return { out: [], warn: [] };
  const locked = await withLock(deps.dir, ticket, async () => {
    const snap = await tracker.getTicket(ticket);
    const before = readState(deps.dir, ticket);
    const st = rebuildState(ticket, TRACKER_NAME, snap, deps.sessionIds(ticket));
    if (before) { st.gates = before.gates; st.log = before.log; st.applied = before.applied; st.pending = before.pending; if (before.merged && MERGE_KEPT_IN.includes(snap.status)) st.merged = before.merged; }
    writeState(deps.dir, st);
    const note = before && before.status_written !== snap.status ? ` (the file said ${before.status_written}; ClickUp says ${snap.status})` : "";
    return { out: [`steward: ${ticket}: state rebuilt, status ${snap.status}${note}`], warn: [] };
  }, deps.lock ?? DEFAULT_LOCK);
  return locked.locked ? locked.value : { out: [], warn: [`steward: ${ticket}: another call holds the lock; nothing rebuilt`] };
}
