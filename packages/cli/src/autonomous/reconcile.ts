import { openLines, settle } from "./journal.ts";
import { PHASES, RETRY_PROOF_WAIT_MS } from "./phase-types.ts";
import type { Observations, Phase, SettleResult, TicketState } from "./phase-types.ts";
import type { JournalLine } from "./journal.ts";

export interface ReconcileNote { ticket: string; cause: string }
type Verdict = { result: SettleResult; note: string } | "unknown";
const r = (result: SettleResult, note: string): Verdict => ({ result, note });
const rank = (p: string) => PHASES.indexOf(p as Phase);

// succeeded is only ever settled with proof: a missing detail field or an unknown phase is uncertain.
function check(action: string, line: JournalLine, state: TicketState | null, obs: Observations, now: Date): Verdict {
  if (action === "claim") {
    if (state === null) return r("permanent", "no lock");
    if (state.ticket !== line.ticket) return r("uncertain", "lock names another ticket");
    // unknown is not progress: an unreadable tracker keeps the claim uncertain
    if (!obs.tracker.ok) return r("uncertain", "tracker not observed");
    if (obs.tracker.value.status !== "in progress") return r("uncertain", "tracker is not in progress");
    return r("succeeded", "lock held");
  }
  if (action.startsWith("move-to-")) {
    const to = action.slice("move-to-".length);
    if (rank(to) < 0) return r("uncertain", `unknown phase ${to}`);
    // the lock must be at the target phase; a backward move (review to building) also raises the attempt
    const attempt = (line.attempt ?? 1) + (line.phase === "review" && to === "building" ? 1 : 0);
    return state !== null && state.phase === to && state.attempt === attempt ? r("succeeded", `lock at ${state.phase}`) : r("retryable", "lock not moved");
  }
  if (action === "status-write") {
    if (!obs.tracker.ok) return "unknown";
    return obs.tracker.value.status === "in progress" ? r("succeeded", "status read back") : r("retryable", "status not set");
  }
  if (action === "order-merge") {
    if (!obs.git.ok) return "unknown";
    return obs.git.value.onOriginMain ? r("succeeded", "head on origin/main") : r("uncertain", "merge not seen on origin/main");
  }
  if (action === "order-restart") {
    if (!obs.herdr.ok) return "unknown";
    if (obs.herdr.value.builderPane === "unknown") return "unknown";
    return obs.herdr.value.builderPane === "present" ? r("succeeded", "builder pane present") : r("uncertain", "builder pane still gone");
  }
  if (action === "phase-marker") {
    if (state === null) return r("permanent", "no lock");
    const want = line.detail?.phase;
    if (want === undefined) return r("uncertain", "no phase recorded in the marker");
    if (!obs.runs.ok) return "unknown";
    const run = obs.runs.value.find((x) => x.id === state.runs.builder);
    return run !== undefined && run.phaseEvent === want ? r("succeeded", "phase event seen") : r("retryable", "phase event missing");
  }
  if (action === "retry") {
    // proof is an artefact: a new started builder run of the ticket that began after the planned line
    if (!obs.runs.ok) return "unknown";
    const t = Date.parse(line.ts);
    const fresh = obs.runs.value.some((x) => x.role === "builder" && x.started && x.id !== line.detail?.run && Date.parse(x.createdAt) > t);
    if (fresh) return r("succeeded", "new run started");
    // the worker needs time to start: no note until the wait is over; never retryable, the order may have been delivered
    if (now.getTime() - t < RETRY_PROOF_WAIT_MS) return "unknown";
    return r("uncertain", "no new run after the retry order");
  }
  if (action === "adopt-retry") {
    if (state === null) return r("permanent", "no lock");
    return state.runs.builder === line.detail?.run ? r("succeeded", "lock names the new run") : r("retryable", "lock not updated");
  }
  return r("uncertain", "no check for this action");
}

// Only succeeded and permanent settle a key that is already uncertain. A retryable check
// leaves it uncertain: the order may have run, so it must not be freed to run again.
export function reconcile(d: { dir: string; now: Date; state: TicketState | null; obs: Observations }): ReconcileNote[] {
  const notes: ReconcileNote[] = [];
  // only this ticket's lines; with no lock, only claim lines (a claim has no lock to prove it yet)
  const mine = openLines(d.dir).filter((l) => (d.state !== null ? l.planned.ticket === d.state.ticket : l.planned.action === "claim"));
  for (const l of mine) {
    const action = l.key.split(":").slice(3).join(":");
    const v = check(action, l.planned, d.state, d.obs, d.now);
    if (v === "unknown") continue;
    if (l.state === "open") settle(d.dir, d.now, l.key, v.result, v.note);
    else if (v.result === "succeeded" || v.result === "permanent") settle(d.dir, d.now, l.key, v.result, `reconciled: ${v.note}`);
    // A key still uncertain after this pass gets a note on every call; no new line is written for it.
    const stillUncertain = l.state === "open" ? v.result === "uncertain" : v.result === "uncertain" || v.result === "retryable";
    if (stillUncertain) notes.push({ ticket: l.planned.ticket ?? "-", cause: `journal-uncertain-${action}` });
  }
  return notes;
}
