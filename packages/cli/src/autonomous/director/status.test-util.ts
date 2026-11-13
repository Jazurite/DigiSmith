import type { FakeTracker } from "../fake-tracker.test-util.ts";
import type { StatusPort } from "./status.ts";

/**
 * A StatusPort for the Director's tests over the autonomous FakeTracker: it applies the move the Steward event stands for
 * (returned -> concept, approved -> to do), so a test still sees the status change, a failed write and a wrong read-back.
 */
export function fakeStatus(tracker: FakeTracker): StatusPort & { sent: { ticket: string; event: string; quote?: string }[]; refuse: string | null } {
  const port = {
    sent: [] as { ticket: string; event: string; quote?: string }[],
    refuse: null as string | null,
    async send(ticket: string, input: { event: string; quote?: string }) {
      port.sent.push({ ticket, event: input.event, ...(input.quote === undefined ? {} : { quote: input.quote }) });
      if (port.refuse !== null) return { ok: false, text: port.refuse };
      const task = [...tracker.tasks.values()].find((t) => (t.key ?? t.id) === ticket);
      if (task === undefined) return { ok: false, text: `no ticket ${ticket}` };
      const to = input.event === "returned" ? "concept" : "to do";
      try { await tracker.setStatus(task.id, to); } catch (e) { return { ok: false, text: (e as Error).message }; }
      return { ok: true, text: `${ticket} -> ${to}` };
    },
  };
  return port as never;
}
