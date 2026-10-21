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

function order(o: "fix" | "merge" | "restart", s: TicketState, obs: Observations, j: JournalResults, head: string): Action {
  if (used(j, keyOf(s, `order-${o}`))) return wait(`order-${o}-sent`);
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
  if (s.attempt > 1 && !used(j, keyOf(s, "order-fix"))) return order("fix", s, obs, j, g.head ?? "");
  if (obs.herdr.ok && obs.runs.ok && !obs.herdr.value.builderPanePresent) {
    const r = obs.runs.value.find((x) => x.id === s.runs.builder);
    if (r !== undefined && !r.ended) return order("restart", s, obs, j, g.head ?? "");
  }
  return wait("building");
}

function review(s: TicketState, obs: Observations, j: JournalResults): Action {
  const m = marker(s, obs, j);
  if (m !== null) return m;
  if (!obs.git.ok) return note("obs-git-failed");
  if (!obs.verdicts.ok) return note("obs-verdicts-failed");
  const head = obs.git.value.head;
  const row = obs.verdicts.value.find((v) => v.scope === "ticket" && head !== null && v.head === head);
  if (row === undefined || head === null) return wait("review-running");
  if (row.result === "clean") return { kind: "move", to: "merge-ready", proof: `clean verdict for ${sha7(head)}` };
  if (s.attempt >= MAX_ATTEMPTS) return note("attempts-exhausted", "failed");
  return { kind: "move", to: "building", proof: `findings for ${sha7(head)}`, attempt: s.attempt + 1 };
}

function mergeReady(s: TicketState, obs: Observations, j: JournalResults): Action {
  const m = marker(s, obs, j);
  if (m !== null) return m;
  if (!obs.git.ok) return note("obs-git-failed");
  const g = obs.git.value;
  if (g.head !== null && g.onOriginMain) return { kind: "move", to: "merged", proof: `${sha7(g.head)} on origin/main` };
  if (obs.runs.ok && obs.runs.value.some((r) => r.id === s.runs.builder && (r.merged || r.pushed))) return note("proof-disagree");
  return order("merge", s, obs, j, g.head ?? "");
}

export function advanceTicket(s: TicketState, obs: Observations, j: JournalResults): Action {
  if (obs.tracker.ok && obs.tracker.value.status === "to do" && s.phase !== "merged" && !used(j, keyOf(s, "status-write")))
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
  if (a.kind === "wait" && !obs.tracker.ok && s.phase !== "merged") return note("obs-tracker-failed");
  return a;
}
