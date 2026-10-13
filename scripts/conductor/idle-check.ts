// The idle trigger (design section 7, second trigger). A pre-prompt handler: at my merge it is
// added to DGS-418's hook-cli.ts handler list (S7), so it reads the card BEFORE the heartbeat
// refreshes last_seen. It never throws and never writes; any doubt = silent (undefined).
import { isIdle, type WindowCard } from "./catch-up-window.ts";
import { isSafeName } from "./safe-name.ts";
import { findCardBySession, listCards } from "../session-card.ts";
import { readIdentity } from "../identity.ts";
import type { CardRow } from "./catch-up-window.ts";

export const IDLE_CONTEXT_MARKER = "[digismith catch-up: idle Maestro session]";

export interface IdleDeps {
  findCardBySession(session: string): CardRow | undefined;
  listCards(project: string): CardRow[];
  /** The conductor that answers for this domain; undefined = unknown, stay silent. */
  conductorFor(card: CardRow): string | undefined;
}

/** 422's convention: '<domain lowercased>-conductor', overridable by DIGISMITH_CONDUCTOR; unknown = undefined (never guess). */
export function defaultConductorFor(card: CardRow, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.DIGISMITH_CONDUCTOR) return env.DIGISMITH_CONDUCTOR;
  const fromRecord = readIdentity(card.id, env)?.conductors[0]; // DGS-411: a Maestro's record names its conductors
  if (fromRecord) return fromRecord;
  return card.domain ? `${card.domain.toLowerCase()}-conductor` : undefined;
}

// Values printed below are fixed text plus card values that passed the charset check (isSafeName),
// quoted as data. At rebase this check also calls 417's validateCard (secret-like and charset rules).
export function idleCheck(event: { session_id?: string }, deps: IdleDeps): string | undefined {
  try {
    if (!event.session_id) return undefined;
    const own = deps.findCardBySession(event.session_id);
    if (!own || own.role !== "maestro" || own.status !== "open") return undefined;
    const cards = deps.listCards(own.domain) as WindowCard[];
    if (!isIdle({ cards, identity: own.id, askingSession: own.session })) return undefined;
    const conductor = deps.conductorFor(own);
    if (!conductor) return undefined;
    if (![own.id, own.session, own.domain, conductor].every(isSafeName)) return undefined;
    return [
      IDLE_CONTEXT_MARKER,
      "Another session of this Maestro identity has been active since this one last was.",
      "Before you answer Jack's message, run:",
      `node --experimental-strip-types scripts/conductor/catch-up-cli.ts --maestro '${own.id}' --session '${own.session}' --conductor '${conductor}' --project '${own.domain}'`,
      "Give its output first, unchanged, then answer Jack's message.",
    ].join("\n");
  } catch {
    return undefined;
  }
}

/** The handler for DGS-418's pre-prompt list (scripts/session-cards/hook-cli.ts). It reads the card BEFORE the heartbeat. */
export function idleHandler(event: { session_id?: string }, env: NodeJS.ProcessEnv): string | undefined {
  return idleCheck(event, {
    findCardBySession: (session) => findCardBySession(session, undefined, env)?.card,
    listCards: (project) => listCards(project, { env }).map((r) => r.card),
    conductorFor: (card) => defaultConductorFor(card, env),
  });
}
