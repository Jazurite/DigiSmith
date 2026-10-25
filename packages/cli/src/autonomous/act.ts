import { appendAttention, appendResolved } from "./attention-write.ts";
import { plan, retryItemOf, settle } from "./journal.ts";
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

export const ORDER_TEXTS = {
  merge: (t: string) => `${t}: run dg autonomous merge-gate --ticket ${t} first; merge per hooks 01-03 only if it prints go, then, in the main checkout, run dg autonomous release --ticket ${t} --result merged --commit $(git rev-parse HEAD)`,
  restart: (t: string) => `${t}: restart the builder, its pane is gone; before any teardown run dg salvage --ticket ${t}, and if it fails stop and tell Jack`,
};

export function orderText(order: "merge" | "restart", ticket: string, _attempt: number): string {
  if (!TICKET_RE.test(ticket)) throw new Error(`not a ticket key: ${ticket}`);
  const text = Object.hasOwn(ORDER_TEXTS, order) ? ORDER_TEXTS[order] : undefined;
  if (text === undefined) throw new Error(`unknown order: ${String(order)}`);
  return text(ticket);
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
  const run = async (action: string, detail: Record<string, string> | undefined, effect: () => Promise<void>, onError: (e: unknown) => SettleResult, okResult: SettleResult = "succeeded") => {
    const key = planned(action, detail);
    let outcome: { ok: true } | { ok: false; result: SettleResult; note: string };
    try {
      await effect();
      outcome = { ok: true };
    } catch (e) {
      outcome = { ok: false, result: onError(e), note: e instanceof Error ? e.message : String(e) };
    }
    const r = outcome.ok
      ? settle(d.dir, d.now(), key, okResult, okResult === "succeeded" ? "done" : "order delivered, waiting for a new run")
      : settle(d.dir, d.now(), key, outcome.result, outcome.note);
    // A normal wait for the proof is not an attention item.
    if (outcome.ok && okResult !== "succeeded") return { result: r };
    return noteIfBad(action, r);
  };
  const retry = (): SettleResult => "retryable";

  // Build the text before any journal line: a bad key sends nothing, so it is refused, not uncertain.
  const textFor = (order: "merge" | "restart"): string | null => {
    try {
      return orderText(order, state.ticket, state.attempt);
    } catch (e) {
      const unknown = e instanceof Error && e.message.startsWith("unknown order");
      appendAttention(d.dir, d.now(), { ticket: state.ticket, run: state.runs.builder, kind: "failed", cause: unknown ? "order-refused-unknown-order" : "order-refused-bad-ticket-key" });
      return null;
    }
  };
  const delivery = (e: unknown): SettleResult => (e instanceof PromptError && e.delivered === "no" ? "retryable" : "uncertain");

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
      const text = textFor(a.order);
      if (text === null) return { result: null };
      return run(`order-${a.order}`, { head: a.head }, () => d.prompt(text), delivery);
    }
    case "retry": {
      const text = textFor("restart");
      if (text === null) return { result: null };
      return run("retry", { item: a.item, run: a.run }, () => d.prompt(text), delivery, "uncertain");
    }
    case "adopt":
      return run("adopt-retry", { run: a.run }, async () => {
        writePhaseState(d.dir, { runs: { builder: a.run } });
        // only the item the retry line names; any other open item stays for Jack
        const id = retryItemOf(d.dir, state.ticket);
        if (id !== null) appendResolved(d.dir, id, "controller", d.now().toISOString(), `new run ${a.run} started`);
      }, retry);
  }
}
