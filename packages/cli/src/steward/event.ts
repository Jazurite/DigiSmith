import { evaluate } from "./rules.ts";
import { DEFAULT_LOCK, readState, rebuildState, withLock, writeState, type LockOptions, type PendingWrite, type StewardState } from "./state.ts";
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

const TRACKER_NAME = "clickup";
const LOG_LIMIT = 200;
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

/** One status write, its dates and comment, then a read back. Returns an error text, or null when the tracker shows the new status. */
async function write(tracker: Tracker, ticket: string, st: StewardState, p: PendingWrite, now: Date, snap: TicketSnapshot): Promise<string | null> {
  try {
    if (!snap.statuses.includes(p.to)) return `status "${p.to}" is not on the list (${snap.statuses.join(", ")})`;
    await tracker.setStatus(ticket, p.to);
    if (p.start || p.due) await tracker.setDates(ticket, { start: p.start, due: p.due });
    if (p.comment) await tracker.addComment(ticket, p.comment);
    const back = await tracker.getTicket(ticket);
    if (back.status !== p.to) return `read back shows "${back.status}", wanted "${p.to}"`;
    st.status_written = p.to;
    st.status_seen = p.to;
    if (p.start) st.start_written = p.start;
    if (p.due) st.due_written = p.due;
    if (CLOSING.includes(p.to)) st.closed_at = now.toISOString();
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

function pendingOf(move: Move, st: StewardState, snap: TicketSnapshot, today: string): PendingWrite {
  const p: PendingWrite = { to: move.to };
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

async function loadState(deps: EventDeps, tracker: Tracker, ticket: string, snap: TicketSnapshot): Promise<StewardState> {
  return readState(deps.dir, ticket) ?? rebuildState(ticket, TRACKER_NAME, snap, deps.sessionIds(ticket));
}

async function apply(deps: EventDeps, tracker: Tracker, ticket: string, input: EventInput): Promise<string[]> {
  const out: string[] = [];
  const now = deps.now();
  const today = todayUtc7(now);
  let snap = await tracker.getTicket(ticket);
  const st = await loadState(deps, tracker, ticket, snap);

  // Writes that failed earlier go first, in order.
  const stillPending: PendingWrite[] = [];
  for (const p of st.pending) {
    const err = await write(tracker, ticket, st, p, now, snap);
    if (err) stillPending.push(p);
    else out.push(`steward: ${ticket}: retried the earlier move to ${p.to}`);
  }
  st.pending = stillPending;
  if (st.pending.length === 0 && out.length > 0) snap = await tracker.getTicket(ticket);

  st.signoff = snap.signoff;
  st.status_seen = snap.status;
  const result = evaluate(input, viewOf(snap, st), deps.config);
  const stamp = `${input.event}:${input.sha ?? today}`;

  if (result.kind === "refuse") {
    log(st, now, input, "refused", result.reason);
    out.push(`steward: refused ${input.event}: ${ticket} ${result.reason}`);
  } else if (result.kind === "noop") {
    log(st, now, input, "noop", "already at the target");
  } else {
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
      const err = await write(tracker, ticket, st, p, now, snap);
      if (err === null) {
        log(st, now, input, "applied", `${snap.status} -> ${result.to}`);
        st.applied.push(stamp);
        out.push(`steward: ${describe(ticket, snap.status, result)}${p.start ? ` (start ${p.start})` : ""}${p.due ? ` (due ${p.due})` : ""}`);
      } else if (err.includes("is not on the list")) {
        log(st, now, input, "refused", err);
        out.push(`steward: refused ${input.event}: ${ticket} ${err}`);
      } else {
        st.pending.push(p);
        log(st, now, input, "pending", err);
        out.push(`steward: ${ticket}: could not move to ${result.to} (${err}); will retry at the next event`);
      }
    }
  }
  writeState(deps.dir, st);
  return out;
}

/** Applies one event. Returns the lines to print. Throws UsageError on a bad call; the caller handles every other error. */
export async function runEvent(deps: EventDeps, ticket: string, input: EventInput, dryRun = false): Promise<string[]> {
  assertUsage(input);
  const tracker = deps.tracker;
  if (!tracker) return [];
  if (dryRun) {
    const snap = await tracker.getTicket(ticket);
    const st = readState(deps.dir, ticket) ?? rebuildState(ticket, TRACKER_NAME, snap, []);
    return [`steward: dry run: ${describe(ticket, snap.status, evaluate(input, viewOf(snap, st), deps.config))}`];
  }
  const locked = await withLock(deps.dir, ticket, () => apply(deps, tracker, ticket, input), deps.lock ?? DEFAULT_LOCK);
  if (!locked.locked) return [`steward: ${ticket}: another call holds the lock; ${input.event} was not applied. Send it again.`];
  return locked.value;
}

/** Rebuilds the state file from the tracker and the token registry. ClickUp wins. */
export async function rebuild(deps: EventDeps, ticket: string): Promise<string[]> {
  const tracker = deps.tracker;
  if (!tracker) return [];
  const locked = await withLock(deps.dir, ticket, async () => {
    const snap = await tracker.getTicket(ticket);
    const before = readState(deps.dir, ticket);
    const st = rebuildState(ticket, TRACKER_NAME, snap, deps.sessionIds(ticket));
    if (before) { st.gates = before.gates; st.log = before.log; st.applied = before.applied; st.pending = before.pending; if (before.merged) st.merged = before.merged; }
    writeState(deps.dir, st);
    const note = before && before.status_written !== snap.status ? ` (the file said ${before.status_written}; ClickUp says ${snap.status})` : "";
    return [`steward: ${ticket}: state rebuilt, status ${snap.status}${note}`];
  }, deps.lock ?? DEFAULT_LOCK);
  return locked.locked ? locked.value : [`steward: ${ticket}: another call holds the lock; nothing rebuilt`];
}
