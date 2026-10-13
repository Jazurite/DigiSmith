// The idle trigger (design section 7, second trigger). A pre-prompt handler: at my merge it is
// added to DGS-418's hook-cli.ts handler list (S7), so it reads the card BEFORE the heartbeat
// refreshes last_seen. It never throws and never writes; any doubt = silent (undefined).
import { isIdle, type WindowCard } from "./catch-up-window.ts";
import type { CardRow } from "./deps-stub.ts";

export const IDLE_CONTEXT_MARKER = "[digismith catch-up: idle Maestro session]";

export interface IdleDeps {
  findCardBySession(session: string): CardRow | undefined;
  listCards(project: string): CardRow[];
  /** The conductor that answers for this domain; undefined = unknown, stay silent. */
  conductorFor(card: CardRow): string | undefined;
}

export function idleCheck(event: { session_id?: string }, deps: IdleDeps): string | undefined {
  try {
    if (!event.session_id) return undefined;
    const own = deps.findCardBySession(event.session_id);
    if (!own || own.role !== "maestro" || own.status !== "open") return undefined;
    const cards = deps.listCards(own.domain) as WindowCard[];
    if (!isIdle({ cards, identity: own.id, askingSession: own.session })) return undefined;
    const conductor = deps.conductorFor(own);
    if (!conductor) return undefined;
    return [
      IDLE_CONTEXT_MARKER,
      "Another session of this Maestro identity has been active since this one last was.",
      "Before you answer Jack's message, run:",
      `node --experimental-strip-types scripts/conductor/catch-up-cli.ts --maestro ${own.id} --session ${own.session} --conductor ${conductor} --project ${own.domain}`,
      "Give its output first, unchanged, then answer Jack's message.",
    ].join("\n");
  } catch {
    return undefined;
  }
}
