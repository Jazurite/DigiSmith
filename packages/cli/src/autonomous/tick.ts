import { act, type ActDeps } from "./act.ts";
import { appendAttention } from "./attention-write.ts";
import { resultsOf } from "./journal.ts";
import { advanceTicket } from "./advance.ts";
import { observeAll, type Observers } from "./observe.ts";
import { readPhaseState } from "./phase-state.ts";
import { reconcile, type ReconcileNote } from "./reconcile.ts";
import type { Action } from "./phase-types.ts";

export interface TickDeps extends ActDeps { observers: Observers; dryRun: boolean }
export interface TickResult { outcome: "no-lock" | "corrupt-lock" | "ticked"; action?: Action; notes: ReconcileNote[] }

export async function runTick(d: TickDeps): Promise<TickResult> {
  const read = readPhaseState(d.dir);
  if (read.kind === "none") return { outcome: "no-lock", notes: [] };
  if (read.kind === "corrupt") {
    if (!d.dryRun) appendAttention(d.dir, d.now(), { ticket: "-", run: null, kind: "failed", cause: "bad-state" });
    return { outcome: "corrupt-lock", notes: [] };
  }
  const state = read.state;
  // the observations are read only; step 0 (reconcile) uses the same ones
  const obs = await observeAll(d.observers);
  let notes: ReconcileNote[] = [];
  if (!d.dryRun) {
    notes = reconcile({ dir: d.dir, now: d.now(), state, obs });
    for (const n of notes) appendAttention(d.dir, d.now(), { ticket: n.ticket, run: state.runs.builder, kind: "unknown", cause: n.cause });
  }
  const action = advanceTicket(state, obs, resultsOf(d.dir));
  if (!d.dryRun) await act(d, state, action);
  return { outcome: "ticked", action, notes };
}
