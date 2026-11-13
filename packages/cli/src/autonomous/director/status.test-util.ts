import { evaluate } from "../../steward/rules.ts";
import type { EventInput } from "../../steward/types.ts";
import type { FakeTracker } from "../fake-tracker.test-util.ts";
import type { StatusPort } from "./status.ts";

/**
 * A StatusPort for the Director's tests over the autonomous FakeTracker. It follows the REAL Steward rules (steward/rules.ts `evaluate`):
 * a move is applied only from a status the event allows, and a refusal comes back as ok false with the Steward's own reason.
 * `refuse` forces a refusal text for a test that needs one whatever the status.
 */
export function fakeStatus(tracker: FakeTracker): StatusPort & { sent: { ticket: string; event: string; quote?: string }[]; refuse: string | null } {
  const port = {
    sent: [] as { ticket: string; event: string; quote?: string }[],
    refuse: null as string | null,
    async send(ticket: string, input: EventInput) {
      port.sent.push({ ticket, event: input.event, ...(input.quote === undefined ? {} : { quote: input.quote }) });
      if (port.refuse !== null) return { ok: false, text: port.refuse };
      const task = [...tracker.tasks.values()].find((t) => (t.key ?? t.id) === ticket);
      if (task === undefined) return { ok: false, text: `no ticket ${ticket}` };
      const r = evaluate(input, { status: task.status, signoff: null, mergedRecorded: false, acceptedYes: false }, { releaseStage: false });
      if (r.kind === "refuse") return { ok: false, text: `steward: refused ${input.event}: ${ticket} ${r.reason}` };
      if (r.kind === "noop") return { ok: true, text: `${ticket}: already there` };
      if (r.kind !== "move") return { ok: true, text: `${ticket}: recorded` };
      try { await tracker.setStatus(task.id, r.to); } catch (e) { return { ok: false, text: (e as Error).message }; }
      return { ok: true, text: `${ticket} -> ${r.to}` };
    },
  };
  return port;
}
