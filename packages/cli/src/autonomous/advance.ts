import { adoptUsed, restartsOf, retrySucceeded } from "./journal.ts";
import { MAX_ATTEMPTS, WORKTREE_GONE } from "./phase-types.ts";
import type { Action, JournalResults, MarkerPhase, Observations, Phase, TicketState } from "./phase-types.ts";

const MARKER: Partial<Record<Phase, MarkerPhase>> = { building: "building", review: "review", "merge-ready": "merge" };

const keyOf = (s: TicketState, action: string) => `${s.ticket}:${s.phase}:${s.attempt}:${action}`;
// a key is used unless its last result is retryable
const used = (j: JournalResults, key: string) => j[key] !== undefined && j[key] !== "retryable";
const wait = (reason: string): Action => ({ kind: "wait", reason });
const note = (cause: string, attKind: "unknown" | "failed" = "unknown"): Action => ({ kind: "attention", cause, attKind });
const sha7 = (v: string) => v.slice(0, 7);

// null = the conductor may be prompted; otherwise the action to return instead
function gate(obs: Observations): Action | null {
  if (!obs.herdr.ok) return note("obs-herdr-failed");
  const h = obs.herdr.value;
  if (!h.conductorPresent) return note("conductor-missing");
  if (h.conductorWorking) return wait("conductor-working");
  if (h.input === "typed") return wait("conductor-input-typed");
  if (h.input === "unknown") return note("obs-input-unknown");
  return null;
}

// null = marker fine or already sent
function marker(s: TicketState, obs: Observations, j: JournalResults): Action | null {
  const want = MARKER[s.phase];
  if (want === undefined || s.runs.builder === null) return null;
  if (!obs.runs.ok) return note("obs-runs-failed");
  const r = obs.runs.value.find((x) => x.id === s.runs.builder);
  if (r === undefined) return note("builder-run-missing");
  if (r.phaseEvent === want || used(j, keyOf(s, "phase-marker"))) return null;
  return { kind: "marker", phase: want, run: r.id };
}

// the journal decides first: open or succeeded holds, uncertain and permanent are notes, retryable or unseen may send
function order(o: "merge" | "restart", s: TicketState, obs: Observations, j: JournalResults, head: string | null): Action {
  const st = j[keyOf(s, `order-${o}`)];
  if (st === "uncertain") return note(`order-${o}-uncertain`);
  if (st === "permanent") return note(`order-${o}-permanent`, "failed");
  if (st === "open" || st === "succeeded") return wait(`order-${o}-sent`);
  if (head === null || head === "") return note("no-head");
  return gate(obs) ?? { kind: "order", order: o, head };
}

const RETRY_KINDS = ["lost", "failed"];
// the newest builder run by createdAt; null when the runs read failed or holds no builder run
const newestBuilder = (obs: Observations) =>
  obs.runs.ok ? obs.runs.value.filter((x) => x.role === "builder").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null : null;

// an item passes only for the newest builder run, or for a run id obs.runs does not list ("-", the ticket key)
const eligible = (s: TicketState, obs: Observations) => {
  if (!obs.attention.ok || !obs.runs.ok) return [];
  const newest = newestBuilder(obs);
  const known = new Map(obs.runs.ok ? obs.runs.value.map((x) => [x.id, x]) : []);
  const passes = (run: string | undefined) => {
    const r = run === undefined ? undefined : known.get(run);
    return r === undefined || (r.role === "builder" && (newest === null || r.id === newest.id));
  };
  return obs.attention.value.filter((i) => i.ticket === s.ticket && i.retryEligible && RETRY_KINDS.includes(i.kind) && passes(i.run));
};

// null = no retry business this tick
function retryStep(s: TicketState, obs: Observations, j: JournalResults): Action | null {
  // adopt resolves the attention items, so it waits for a good attention read; the obs-attention-failed note covers the wait
  if (s.phase === "merged" || s.phase === "released" || !obs.attention.ok) return null;
  const items = eligible(s, obs);
  if (retrySucceeded(j, s.ticket) && !adoptUsed(j, s.ticket) && obs.runs.ok) {
    const cur = obs.runs.value.find((x) => x.id === s.runs.builder);
    const later = obs.runs.value
      .filter((x) => x.role === "builder" && x.started && x.id !== s.runs.builder && (cur === undefined || Date.parse(x.createdAt) > Date.parse(cur.createdAt)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    // act resolves only the item named in the retry journal line; items is informational
    // the items span all runs of the ticket: the retried item sits on the older run
    const open = obs.attention.value.filter((i) => i.ticket === s.ticket && i.retryEligible && RETRY_KINDS.includes(i.kind));
    if (later !== undefined) return { kind: "adopt", run: later.id, items: open.map((i) => i.id) };
  }
  if (items.length === 0 || restartsOf(j, s.ticket) > 0 || gate(obs) !== null) return null;
  return { kind: "retry", item: items[0].id, run: newestBuilder(obs)?.id ?? s.runs.builder ?? "-" };
}

function claimed(s: TicketState, obs: Observations): Action {
  if (!obs.runs.ok) return note("obs-runs-failed");
  const r = obs.runs.value.find((x) => x.role === "builder" && x.started);
  if (r === undefined) return wait("no-builder-run");
  return { kind: "move", to: "building", proof: `run ${r.id} started`, builder: r.id };
}

const DONE = new Set(["complete", "done", "closed"]);
const ticketDone = (obs: Observations): boolean => obs.tracker.ok && DONE.has(obs.tracker.value.status.toLowerCase());
// the action for a failed git read
function gitFailed(obs: Observations, phase: Phase): Action {
  if (obs.git.ok) throw new Error("gitFailed called with a good git read");
  if (ticketDone(obs)) return wait("ticket-done");
  if (phase === "merge-ready" && obs.git.error.startsWith(WORKTREE_GONE)) return wait("worktree-gone");
  return note("obs-git-failed");
}

function building(s: TicketState, obs: Observations, j: JournalResults): Action {
  const m = marker(s, obs, j);
  if (m !== null) return m;
  if (!obs.packs.ok) return note("obs-packs-failed");
  if (!obs.git.ok) return gitFailed(obs, s.phase);
  const g = obs.git.value;
  if (g.head !== null && g.head !== g.base && obs.packs.value.some((p) => p.round >= s.attempt && p.head === g.head))
    return { kind: "move", to: "review", proof: `pack for ${sha7(g.head)}` };
  if (!obs.herdr.ok) return note("obs-herdr-failed");
  if (!obs.runs.ok) return note("obs-runs-failed");
  const r = obs.runs.value.find((x) => x.id === s.runs.builder);
  // one restart per ticket: restartsOf counts every retry and order-restart key, and order() holds the key once sent
  if (obs.herdr.value.builderPane === "gone" && r !== undefined && !r.ended) {
    const own = j[keyOf(s, "order-restart")];
    if ((own === undefined || own === "retryable") && restartsOf(j, s.ticket) > 0) return wait("restart-used");
    return order("restart", s, obs, j, g.head);
  }
  // a run with no recorded pane: we cannot tell, so no restart order, one note
  if (obs.herdr.value.builderPane === "unknown" && r !== undefined && !r.ended) return note("builder-pane-unknown");
  return wait("building");
}

// F11 parked: a lost builder run in review is covered by the DGS-583 watchdog (lost -> attention), not here
function review(s: TicketState, obs: Observations, j: JournalResults): Action {
  const m = marker(s, obs, j);
  if (m !== null) return m;
  if (!obs.git.ok) return gitFailed(obs, s.phase);
  if (!obs.verdicts.ok) return note("obs-verdicts-failed");
  const head = obs.git.value.head;
  // the latest ticket row for this head wins
  const rows = obs.verdicts.value.filter((v) => v.scope === "ticket" && head !== null && v.head === head);
  const row = rows[rows.length - 1];
  if (row === undefined || head === null) return wait("review-running");
  if (row.result === "clean") return { kind: "move", to: "merge-ready", proof: `clean verdict for ${sha7(head)}`, head };
  // Open findings: the phase stays review. The conductor and builder run the fix wave; the tick sends no order.
  // The round is the latest ticket pack for this head (the highest round if none matches).
  if (!obs.packs.ok) return note("obs-packs-failed");
  const forHead = obs.packs.value.filter((p) => p.head === head);
  const round = Math.max(0, ...(forHead.length > 0 ? forHead : obs.packs.value).map((p) => p.round));
  if (round >= MAX_ATTEMPTS) return note("review-rounds-exhausted", "failed");
  return wait("review-findings-open");
}

function mergeReady(s: TicketState, obs: Observations, j: JournalResults): Action {
  const m = marker(s, obs, j);
  if (m !== null) return m;
  if (!obs.git.ok) return gitFailed(obs, s.phase);
  const g = obs.git.value;
  if (g.head !== null && g.onOriginMain) return { kind: "move", to: "merged", proof: `${sha7(g.head)} on origin/main` };
  if (obs.runs.ok && obs.runs.value.some((r) => r.id === s.runs.builder && (r.merged || r.pushed))) return note("proof-disagree");
  return order("merge", s, obs, j, g.head);
}

export function advanceTicket(s: TicketState, obs: Observations, j: JournalResults): Action {
  if (obs.tracker.ok && obs.tracker.value.status === "to do" && s.phase !== "merged" && s.phase !== "released" && !used(j, keyOf(s, "status-write")))
    return { kind: "status", status: s.phase === "claimed" ? "claimed" : "in progress" };
  const r = retryStep(s, obs, j);
  if (r !== null) return r;
  let a: Action;
  switch (s.phase) {
    case "claimed": a = claimed(s, obs); break;
    case "building": a = building(s, obs, j); break;
    case "review": a = review(s, obs, j); break;
    case "merge-ready": a = mergeReady(s, obs, j); break;
    case "merged": a = wait("merged-awaiting-release"); break;
    case "released": a = wait("released"); break;
  }
  if (a.kind === "move" && used(j, keyOf(s, `move-to-${a.to}`))) return note("move-key-used");
  if (a.kind === "wait" && !obs.tracker.ok && s.phase !== "merged") return note("obs-tracker-failed");
  if (a.kind === "wait" && !obs.attention.ok && s.phase !== "merged" && s.phase !== "released") return note("obs-attention-failed");
  return a;
}
