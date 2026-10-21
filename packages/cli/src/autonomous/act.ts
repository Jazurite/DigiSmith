import { appendAttention } from "./attention-write.ts";
import { plan, settle } from "./journal.ts";
import { writePhaseState } from "./phase-state.ts";
import { TICKET_RE } from "./phase-types.ts";
import type { Action, MarkerPhase, SettleResult, TicketState } from "./phase-types.ts";

export class PromptError extends Error {
  readonly delivered: "no" | "maybe";
  constructor(message: string, delivered: "no" | "maybe") {
    super(message);
    this.delivered = delivered;
  }
}

const TEXT = {
  fix: (t: string, n: number) => `${t}: fix the review findings, attempt ${n}`,
  merge: (t: string) => `${t}: merge per hooks 01-03, then release merged`,
  restart: (t: string) => `${t}: restart the builder, its pane is gone`,
};

export function orderText(order: "fix" | "merge" | "restart", ticket: string, attempt: number): string {
  if (!TICKET_RE.test(ticket)) throw new Error(`not a ticket key: ${ticket}`);
  return TEXT[order](ticket, attempt);
}

export interface ActDeps {
  dir: string; now: () => Date;
  prompt: (text: string) => Promise<void>;
  writeMarker: (run: string, phase: MarkerPhase) => Promise<void>;
  setStatus: (status: string) => Promise<void>;
}

export async function act(d: ActDeps, state: TicketState, a: Action): Promise<{ result: SettleResult | null }> {
  const planned = (action: string, detail?: Record<string, string>) =>
    plan(d.dir, d.now(), { ticket: state.ticket, phase: state.phase, attempt: state.attempt, action, detail });

  const noteIfBad = (action: string, r: SettleResult): { result: SettleResult } => {
    if (r === "uncertain") appendAttention(d.dir, d.now(), { ticket: state.ticket, run: state.runs.builder, kind: "unknown", cause: `journal-uncertain-${action}` });
    if (r === "permanent") appendAttention(d.dir, d.now(), { ticket: state.ticket, run: state.runs.builder, kind: "failed", cause: `journal-permanent-${action}` });
    return { result: r };
  };

  // Only the effect sits in the try; settle runs once, after it, so a failed settle cannot
  // settle the same key a second time.
  const run = async (action: string, detail: Record<string, string> | undefined, effect: () => Promise<void>, onError: (e: unknown) => SettleResult) => {
    const key = planned(action, detail);
    let outcome: { ok: true } | { ok: false; result: SettleResult; note: string };
    try {
      await effect();
      outcome = { ok: true };
    } catch (e) {
      outcome = { ok: false, result: onError(e), note: e instanceof Error ? e.message : String(e) };
    }
    const r = outcome.ok ? settle(d.dir, d.now(), key, "succeeded", "done") : settle(d.dir, d.now(), key, outcome.result, outcome.note);
    return noteIfBad(action, r);
  };
  const retry = (): SettleResult => "retryable";

  switch (a.kind) {
    case "wait":
      return { result: null };
    case "attention":
      appendAttention(d.dir, d.now(), { ticket: state.ticket, run: state.runs.builder, kind: a.attKind, cause: a.cause });
      return { result: null };
    case "move":
      return run(`move-to-${a.to}`, undefined, async () => {
        writePhaseState(d.dir, {
          phase: a.to, phaseStartedAt: d.now().toISOString(),
          ...(a.attempt !== undefined ? { attempt: a.attempt } : {}),
          ...(a.to === "merge-ready" && a.head !== undefined ? { mergeHead: a.head } : {}),
          ...(a.builder !== undefined ? { runs: { builder: a.builder } } : {}),
        });
      }, retry);
    case "marker":
      return run("phase-marker", { phase: a.phase }, () => d.writeMarker(a.run, a.phase), retry);
    case "status":
      return run("status-write", undefined, () => d.setStatus(a.status), retry);
    case "order": {
      // Build the text before any journal line: a bad key sends nothing, so it is refused, not uncertain.
      let text: string;
      try {
        text = orderText(a.order, state.ticket, state.attempt);
      } catch {
        appendAttention(d.dir, d.now(), { ticket: state.ticket, run: state.runs.builder, kind: "failed", cause: "order-refused-bad-ticket-key" });
        return { result: null };
      }
      return run(`order-${a.order}`, { head: a.head }, () => d.prompt(text),
        (e) => (e instanceof PromptError && e.delivered === "no" ? "retryable" : "uncertain"));
    }
  }
}
