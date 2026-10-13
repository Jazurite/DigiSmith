// The idle trigger (design section 7, second trigger), reworked in DGS-438. A pre-prompt handler in
// DGS-418's hook-cli.ts list. It asks for a catch-up when JACK has been away from THIS session for
// IDLE_MIN minutes AND something changed since the last catch-up this session asked for (the repo's
// origin/main head moved, or the conductor's state block "Updated:" stamp differs). Other sessions'
// activity is not read. It never throws; any doubt = silent (undefined). Its only write is the
// per-session stamp (idle-stamp.ts), made on every real Jack prompt.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { isSafeName } from "./safe-name.ts";
import { findCardBySession } from "../session-card.ts";
import { readIdentity } from "../identity.ts";
import { isHarnessNotice } from "../session-cards/prompt-kind.ts";
import { readStamp, writeStamp, type IdleStamp } from "./idle-stamp.ts";
import { resolveNotePath } from "./state.ts";
import { extractBlock, parseStateBody, STATE_MARKER } from "./state-block.ts";
import type { CardRow } from "./catch-up-window.ts";

export type { IdleStamp } from "./idle-stamp.ts";

export const IDLE_CONTEXT_MARKER = "[digismith catch-up: idle Maestro session]";
/** Minutes without a Jack message in this session before an idle catch-up may fire. */
export const IDLE_MIN = 30;

export interface IdleDeps {
  findCardBySession(session: string): CardRow | undefined;
  /** The conductor that answers for this domain; undefined = unknown, stay silent. */
  conductorFor(card: CardRow): string | undefined;
  now(): Date;
  readStamp(card: CardRow): IdleStamp | undefined;
  writeStamp(card: CardRow, stamp: IdleStamp): void;
  /** origin/main of the identity's repo; undefined = unknown. */
  readHead(card: CardRow): string | undefined;
  /** The conductor state block's "Updated:" value; undefined = unknown. */
  readUpdated(card: CardRow, conductor: string): string | undefined;
}

/** 422's convention: '<domain lowercased>-conductor', overridable by DIGISMITH_CONDUCTOR; unknown = undefined (never guess). */
export function defaultConductorFor(card: CardRow, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.DIGISMITH_CONDUCTOR) return env.DIGISMITH_CONDUCTOR;
  const fromRecord = readIdentity(card.id, env)?.conductors[0]; // DGS-411: a Maestro's record names its conductors
  if (fromRecord) return fromRecord;
  return card.domain ? `${card.domain.toLowerCase()}-conductor` : undefined;
}

// Values printed below are fixed text plus card values that passed the charset check (isSafeName),
// quoted as data.
export function idleCheck(event: { session_id?: string; prompt?: string }, deps: IdleDeps): string | undefined {
  try {
    if (!event.session_id || isHarnessNotice(event.prompt)) return undefined;
    const own = deps.findCardBySession(event.session_id);
    if (!own || own.role !== "maestro" || own.status !== "open") return undefined;
    const conductor = deps.conductorFor(own);
    if (!conductor) return undefined;
    if (![own.id, own.session, own.domain, conductor].every(isSafeName)) return undefined;
    const now = deps.now();
    const stamp = deps.readStamp(own);
    const lastMs = stamp ? Date.parse(stamp.last_prompt) : NaN;
    const idleMin = (now.getTime() - lastMs) / 60_000;
    const head = deps.readHead(own);
    const updated = deps.readUpdated(own, conductor);
    const changed = (head !== undefined && head !== stamp?.caught_up_head) || (updated !== undefined && updated !== stamp?.caught_up_updated);
    const fire = !Number.isNaN(idleMin) && idleMin >= IDLE_MIN && changed;
    const next: IdleStamp = { ...(stamp ?? {}), last_prompt: now.toISOString() };
    if (fire) {
      if (head !== undefined) next.caught_up_head = head;
      if (updated !== undefined) next.caught_up_updated = updated;
      next.caught_up_at = now.toISOString();
    }
    deps.writeStamp(own, next); // before the text: a failed write means silence, never a repeat
    if (!fire) return undefined;
    return [
      IDLE_CONTEXT_MARKER,
      `Jack has been away from this session for ${Math.floor(idleMin)} minutes and the project changed since the last catch-up (a merge or a conductor update).`,
      "Before you answer Jack's message, run:",
      `node --experimental-strip-types scripts/conductor/catch-up-cli.ts --maestro '${own.id}' --session '${own.session}' --conductor '${conductor}' --project '${own.domain}'`,
      "Give its output first, unchanged, then answer Jack's message.",
    ].join("\n");
  } catch {
    return undefined;
  }
}

function gitHead(folder: string | undefined): string | undefined {
  if (!folder || !fs.existsSync(folder)) return undefined;
  const r = spawnSync("git", ["rev-parse", "--verify", "-q", "origin/main"], { encoding: "utf8", timeout: 2000, cwd: folder, stdio: ["ignore", "pipe", "ignore"] });
  const sha = (r.stdout ?? "").trim();
  return r.status === 0 && /^[0-9a-f]{7,64}$/.test(sha) ? sha : undefined;
}

function noteUpdated(project: string, conductor: string, env: NodeJS.ProcessEnv): string | undefined {
  const file = resolveNotePath({ project, conductor }, env);
  if (!fs.existsSync(file)) return undefined;
  const m = extractBlock(fs.readFileSync(file, "utf8"), STATE_MARKER);
  return m.found ? parseStateBody(m.body).state.updated : undefined;
}

/** The handler for DGS-418's pre-prompt list (scripts/session-cards/hook-cli.ts). */
export function idleHandler(event: { session_id?: string; prompt?: string; cwd?: string }, env: NodeJS.ProcessEnv): string | undefined {
  const folder = (card: CardRow) => readIdentity(card.id, env)?.folder ?? event.cwd;
  return idleCheck(event, {
    findCardBySession: (session) => findCardBySession(session, undefined, env)?.card,
    conductorFor: (card) => defaultConductorFor(card, env),
    now: () => new Date(),
    readStamp: (card) => readStamp(card.domain, card.session, env),
    writeStamp: (card, st) => writeStamp(card.domain, card.session, st, env),
    readHead: (card) => gitHead(folder(card)),
    readUpdated: (card, conductor) => {
      try { return noteUpdated(card.domain, conductor, env); } catch { return undefined; }
    },
  });
}
