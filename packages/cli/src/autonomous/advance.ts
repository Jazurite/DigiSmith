import { MAX_ATTEMPTS } from "./phase-types.ts";
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

function claimed(s: TicketState, obs: Observations): Action {
  if (!obs.runs.ok) return note("obs-runs-failed");
  const r = obs.runs.value.find((x) => x.role === "builder" && x.started);
  if (r === undefined) return wait("no-builder-run");
  return { kind: "move", to: "building", proof: `run ${r.id} started`, builder: r.id };
}

function building(s: TicketState, obs: Observations, j: JournalResults): Action {
  const m = marker(s, obs, j);
  if (m !== null) return m;
  if (!obs.packs.ok) return note("obs-packs-failed");
  if (!obs.git.ok) return note("obs-git-failed");
  const g = obs.git.value;
  if (g.head !== null && g.head !== g.base && obs.packs.value.some((p) => p.round >= s.attempt && p.head === g.head))
    return { kind: "move", to: "review", proof: `pack for ${sha7(g.head)}` };
  if (!obs.herdr.ok) return note("obs-herdr-failed");
  if (!obs.runs.ok) return note("obs-runs-failed");
  const r = obs.runs.value.find((x) => x.id === s.runs.builder);
  // one restart per attempt: the order-restart key carries the attempt, and order() holds it once sent
  if (obs.herdr.value.builderPane === "gone" && r !== undefined && !r.ended) return order("restart", s, obs, j, g.head);
  // a run with no recorded pane: we cannot tell, so no restart order, one note
  if (obs.herdr.value.builderPane === "unknown" && r !== undefined && !r.ended) return note("builder-pane-unknown");
  return wait("building");
}

// F11 parked: a lost builder run in review is covered by the DGS-583 watchdog (lost -> attention), not here
function review(s: TicketState, obs: Observations, j: JournalResults): Action {
  const m = marker(s, obs, j);
  if (m !== null) return m;
  if (!obs.git.ok) return note("obs-git-failed");
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
  if (!obs.git.ok) return note("obs-git-failed");
  const g = obs.git.value;
  if (g.head !== null && g.onOriginMain) return { kind: "move", to: "merged", proof: `${sha7(g.head)} on origin/main` };
  if (obs.runs.ok && obs.runs.value.some((r) => r.id === s.runs.builder && (r.merged || r.pushed))) return note("proof-disagree");
  return order("merge", s, obs, j, g.head);
}

export function advanceTicket(s: TicketState, obs: Observations, j: JournalResults): Action {
  if (obs.tracker.ok && obs.tracker.value.status === "to do" && s.phase !== "merged" && s.phase !== "released" && !used(j, keyOf(s, "status-write")))
    return { kind: "status", status: "in progress" };
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
  return a;
}
