import { runEvent, type EventDeps } from "../../steward/event.ts";
import type { EventInput } from "../../steward/types.ts";

/** DGS-739: the Director never writes a ticket status itself. Every status move is a Steward event (main allows the Steward as the only status writer). */
export interface StatusPort {
  /** Sends one Steward event for the ticket. Never throws: a refusal, a failed write or a bad setup comes back as ok false with one line. */
  send(ticket: string, input: EventInput): Promise<{ ok: boolean; text: string }>;
}

// The Steward prints a refusal, a move it could not make, or a busy lock as a warning line; other warnings (a date repair) do not stop the move.
const STOPPED = /: refused |could not move to |another call holds the lock/;

export function stewardStatus(makeDeps: () => EventDeps): StatusPort {
  return {
    async send(ticket, input) {
      try {
        const deps = makeDeps();
        if (deps.tracker === null) return { ok: false, text: `no ClickUp tracker: the Steward cannot move ${ticket}` };
        const r = await runEvent(deps, ticket, input);
        const stopped = r.warn.filter((w) => STOPPED.test(w));
        return stopped.length > 0 ? { ok: false, text: stopped.join("; ") } : { ok: true, text: r.out.join("; ") };
      } catch (e) {
        return { ok: false, text: `steward: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
}
