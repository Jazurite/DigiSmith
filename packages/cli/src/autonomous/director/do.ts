import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkAuthority, type AuthorityCheck } from "./authority.ts";
import { escalate } from "./escalate.ts";
import { planLoop, type PlanWorld } from "./plan.ts";
import { readDecisions, recordDecision, type RecordDeps } from "./record.ts";
import type { StatusPort } from "./status.ts";
import { retryRunKey, type Move } from "./unblock.ts";

export interface Effects {
  /** a build move goes to the ticket's driver (the conductor), never to the worker */
  promptDriver(ticket: string, text: string): Promise<void>;
  /** dg autonomous release --ticket T --result stopped --reason R */
  releaseBuild(ticket: string, reason: string): Promise<void>;
  refineRelease(a: { ticket: string; result: "failed" | "escalated"; question?: string; cause?: string }): Promise<{ code: number; text: string }>;
  /** dg run start for the refine worker, inside the run limit; a refused start throws */
  startRefine(ticket: string): Promise<void>;
  promptSelf(run: string, text: string): Promise<void>;
}
export type DoDeps = RecordDeps & { status: StatusPort; effects: Effects; check?: (id: string) => AuthorityCheck };

/** The authority id a move is decided under (spec 4.1). */
export function authorityIdOf(m: Move): string | null {
  switch (m.kind) {
    case "reprompt": case "retry-once": return "reprompt-run";
    case "start-again": return "restart-run";
    case "release": case "refine-release": return "release-stopped";
    case "gate-wait": return "record-decision";
    default: return null;
  }
}

interface Spec { ticket: string; runKey: string; what: string; why: string }

function specOf(m: Move): Spec | null {
  switch (m.kind) {
    case "reprompt": return { ticket: m.ticket, runKey: m.run, what: `asked ${m.to === "driver" ? "the driver" : "the refine worker"} to re-prompt run ${m.run}`, why: "the run is stalled" };
    case "retry-once": return { ticket: m.ticket, runKey: retryRunKey(m.run), what: `asked the driver to retry run ${m.run} once`, why: "a transient failure and the tick did not retry it" };
    case "start-again": return { ticket: m.ticket, runKey: m.run, what: `started the refine worker again (run ${m.run} was lost)`, why: "first loss of the refine worker" };
    case "release": return { ticket: m.ticket, runKey: m.id, what: `stopped the ticket (release stopped): ${m.reason}`, why: "the run cannot go on and the restart did not help" };
    case "refine-release": return { ticket: m.ticket, runKey: m.id, what: `released the refine run as ${m.result}: ${m.reason}`, why: "the refine run cannot go on" };
    case "gate-wait": return { ticket: m.ticket, runKey: m.id, what: `a protected-path merge has waited ${m.ageMin} minutes for the Maestro`, why: "the merge gate refused; the Maestro answers protected merges" };
    default: return null;
  }
}

const REPROMPT = (run: string): string => `Director: run ${run} has not answered for a long time. Re-prompt it, and report its state.`;

async function effect(d: DoDeps, w: PlanWorld, m: Move): Promise<string> {
  const e = d.effects;
  switch (m.kind) {
    case "reprompt":
      if (m.to === "driver") await e.promptDriver(m.ticket, `${m.ticket}: ${REPROMPT(m.run)}`);
      else await e.promptSelf(m.run, REPROMPT(m.run));
      return "re-prompt sent";
    case "retry-once":
      await e.promptDriver(m.ticket, `${m.ticket}: run ${m.run} failed with a transient cause. Retry it once. If it fails again, stop and report.`);
      return "retry order sent";
    case "start-again":
      await e.startRefine(m.ticket);
      return "refine worker started";
    case "release": {
      // idempotent: when the lock is already clear (an earlier run released and then failed in the escalate step) the release is skipped
      if (w.lockTicket === m.ticket) await e.releaseBuild(m.ticket, m.reason);
      if (m.escalate === null) return "released stopped";
      const r = await escalate(d, { ticket: m.ticket, taskId: "", id: m.escalate.id, question: m.escalate.question, viaRelease: true });
      return r.outcome === "refused" ? `released stopped; ${r.text}` : `released stopped and escalated (${r.outcome})`;
    }
    case "refine-release": {
      const r = await e.refineRelease({ ticket: m.ticket, result: m.result, cause: m.reason, question: m.result === "escalated" ? m.reason : undefined });
      if (r.code !== 0) throw new Error(r.text);
      return r.text;
    }
    case "gate-wait": return "recorded";
    default: throw new Error(`move kind ${m.kind} has no effect`);
  }
}

/**
 * dg director do <move-id>: recompute the plan, find the move, check its authority id, write the decision line BEFORE the effect,
 * run the effect, write done or failed. A move is "already done" only for the SAME id; another run or result is a new move.
 */
const MOVE_ID = /^m-[0-9a-f]{8}$/;

export async function doMove(d: DoDeps, w: PlanWorld, id: string): Promise<{ code: 0 | 4 | 5; text: string }> {
  // The id names a file below: anything but m-<8 hex> is refused before a marker is made.
  if (!MOVE_ID.test(id)) return { code: 4, text: `unknown move id ${JSON.stringify(id)}: a move id looks like m-0123abcd; run dg director plan` };
  // One process per move: an exclusive-create marker held while the move runs (two simultaneous `dg director do` cannot both pass).
  const marks = join(d.dir, "director", "moves");
  const mark = join(marks, `${id}.running`);
  try {
    mkdirSync(marks, { recursive: true });
    writeFileSync(mark, `${process.pid}\n`, { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return { code: 5, text: `move ${id} is being run by another process (marker ${mark}); if none is running, remove the marker` };
    throw e;
  }
  try { return await runMove(d, w, id); } finally { rmSync(mark, { force: true }); }
}

async function runMove(d: DoDeps, w: PlanWorld, id: string): Promise<{ code: 0 | 4 | 5; text: string }> {
  const mine = readDecisions(d.dir).filter((x) => x.move === id);
  const last = mine[mine.length - 1];
  if (last?.outcome === "done") return { code: 0, text: `move ${id} is already done` };
  if (last?.outcome === "started") return { code: 5, text: `move ${id} was started earlier and its outcome is unknown: check by hand before running it again` };

  // Only a RELEASE that left the plan (it cleared the lock, then failed to escalate) is run again from the move saved in its first line.
  // Any other failed move that is no longer in the plan is unknown now (exit 4): it never runs from a stale payload.
  let m = planLoop(w).moves.find((x) => x.id === id);
  if (m === undefined && last?.outcome === "failed") {
    const saved = mine.find((x) => x.outcome === "started")?.payload as Move | undefined;
    if (saved !== undefined && saved.id === id && saved.kind === "release") m = saved;
  }
  if (m === undefined) return { code: 4, text: `unknown move id ${id}: run dg director plan` };
  const authId = authorityIdOf(m);
  const spec = specOf(m);
  if (authId === null || spec === null) return { code: 4, text: `move ${id} (${m.kind}) is not something to do` };
  const ok = (d.check ?? checkAuthority)(authId);
  if (!ok.ok) return { code: 5, text: ok.text };

  const base = { ticket: spec.ticket, run: spec.runKey, id: authId, side: "within" as const, move: id };
  // "started" is the journal line before the effect: no ClickUp comment yet (the effect has not happened); the comment goes out with "done".
  await recordDecision(d, { ...base, what: spec.what, why: spec.why, outcome: "started", noComment: true, payload: m });
  try {
    const text = await effect(d, w, m);
    await recordDecision(d, { ...base, what: `${spec.what}: ${text}`, why: spec.why, outcome: "done" });
    return { code: 0, text: `${m.kind} ${spec.ticket}: ${text}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try { await recordDecision(d, { ...base, what: `${spec.what}: FAILED: ${msg}`, why: spec.why, outcome: "failed", noComment: true }); } catch { /* the first line stays "started" */ }
    return { code: 5, text: `${m.kind} ${spec.ticket} failed: ${msg}. The same move can be run again` };
  }
}
