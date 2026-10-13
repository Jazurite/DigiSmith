import * as fs from "node:fs";
import * as path from "node:path";
import { resolveMainRoot } from "../lineage-handoff.ts";
import { ROLES, closeCard, findCardBySession, listCards, nowIso, touchCard, validateCard, writeCard } from "./cards.ts";
import { cardFromIdentity, findByFolder } from "../identity.ts";
import type { Identity } from "../identity.ts";
import type { SessionCard } from "./cards.ts";

export type HookEvent = { session_id?: string; cwd?: string; source?: string; reason?: string };
export type HookDeps = { now?: Date };
export const HEARTBEAT_MIN_SECONDS = 60;

// Card fields come ONLY from this allow-list of env vars (S3), never from the whole environment.
export function readStarterEnv(env: NodeJS.ProcessEnv): { project: string; role: string } | undefined {
  const role = env.DIGISMITH_ROLE;
  if (!role || !ROLES.includes(role) || !env.DIGISMITH_PROJECT) return undefined;
  return { project: env.DIGISMITH_PROJECT, role };
}

function ref(card: SessionCard) {
  return { project: card.domain, id: card.id, session: card.session };
}

export type StartResult = { wrote: boolean; reason?: string; context?: string };

// DGS-411: a session with no card env, outside herdr, in a folder that one identity record names,
// IS that Maestro. Any read or parse problem means no card (never a failed session start).
function identityStart(event: HookEvent, env: NodeJS.ProcessEnv, deps: HookDeps): StartResult {
  const none = { wrote: false, reason: "no valid DIGISMITH_ROLE and DIGISMITH_PROJECT: no card written" };
  if (env.HERDR_PANE_ID || env.DIGISMITH_ROLE || !event.session_id || !event.cwd) return none;
  let identity: Identity;
  try {
    const r = findByFolder(resolveMainRoot(event.cwd), env);
    if (r.ambiguous) return { wrote: false, reason: `more than one identity record names this folder (${r.ambiguous.join(", ")}): no card written` };
    if (!r.found) return none;
    identity = r.found;
  } catch {
    return none;
  }
  const session = event.session_id;
  let wrote = false;
  if (!findCardBySession(session, identity.project, env)) {
    const v = validateCard(cardFromIdentity(identity, session, deps.now ?? new Date(), env));
    if (!v.ok) return { wrote: false, reason: `identity card invalid, none written: ${v.errors.join("; ")}` };
    writeCard(v.card, env);
    wrote = true;
  }
  return { wrote, context: identityContext(identity, session, env) };
}

function identityContext(identity: Identity, session: string, env: NodeJS.ProcessEnv): string {
  const others = listCards(identity.project, { scope: "open", env })
    .map((r) => r.card)
    .filter((c) => c.id === identity.id && c.session !== session);
  return [
    `[digismith identity] You are ${identity.name} (id ${identity.id}, role maestro), project ${identity.project}, session ${session}, conductor ${identity.conductors[0]}.`,
    others.length === 0
      ? "No other open session of this identity."
      : `Other open sessions of this identity: ${others.map((c) => `${c.session} (last seen ${c.last_seen})`).join(", ")}.`,
    "Any session of this identity may give orders; shared state lives in the conductor and the depot, not in this chat.",
  ].join("\n");
}

export function startHook(event: HookEvent, env: NodeJS.ProcessEnv, deps: HookDeps = {}): StartResult {
  const starter = readStarterEnv(env);
  if (!starter) return identityStart(event, env, deps);
  if (!event.session_id) return { wrote: false, reason: "no session_id in the event: no card written" };
  if (findCardBySession(event.session_id, starter.project, env)) return { wrote: false, reason: "card exists for this session" };
  const t = nowIso(deps.now);
  const runsOn = env.HERDR_PANE_ID ? `herdr ${env.HERDR_PANE_ID}` : "workbox";
  const optional = (v: string | undefined) => (v ? v : undefined);
  const card = {
    name: env.DIGISMITH_NAME || env.DIGISMITH_ID,
    role: starter.role,
    id: env.DIGISMITH_ID,
    session: event.session_id,
    under: optional(env.DIGISMITH_UNDER),
    domain: env.DIGISMITH_DOMAIN || starter.project,
    mandate: optional(env.DIGISMITH_MANDATE),
    state: optional(env.DIGISMITH_STATE),
    runs_on: runsOn,
    machine: optional(env.DIGISMITH_MACHINE),
    created_by: env.DIGISMITH_CREATED_BY,
    started: t,
    last_seen: t,
    status: "open",
  };
  const bad = Object.entries(card).find(([, val]) => typeof val === "string" && /[\r\n]/.test(val));
  if (bad) return { wrote: false, reason: `env value for ${bad[0]} holds a line break: no card written` };
  const v = validateCard(card);
  if (!v.ok) return { wrote: false, reason: `card invalid, none written: ${v.errors.join("; ")}` };
  writeCard(v.card, env);
  return { wrote: true };
}

export function touchHook(event: HookEvent, env: NodeJS.ProcessEnv, deps: HookDeps = {}): { touched: boolean } {
  if (!event.session_id) return { touched: false };
  const found = findCardBySession(event.session_id, env.DIGISMITH_PROJECT || undefined, env);
  if (!found) return { touched: false };
  const now = deps.now ?? new Date();
  const age = (now.getTime() - Date.parse(found.card.last_seen)) / 1000;
  if (age < HEARTBEAT_MIN_SECONDS) return { touched: false };
  touchCard(ref(found.card), now, env);
  return { touched: true };
}

function appendHandoff(card: SessionCard, ended: string, result: string, cwd: string | undefined): "appended" | "skipped" {
  if (!card.state) return "skipped";
  try {
    const file = path.isAbsolute(card.state) ? card.state : path.join(resolveMainRoot(cwd || process.cwd()), card.state);
    if (!fs.existsSync(path.dirname(file))) return "skipped";
    const body = [
      `## Session end ${card.id} (${card.session}) ${ended}`,
      `Result: ${result}`,
      `Handoff: card ${card.id} (${card.role}) ended; last seen ${card.last_seen}. No work summary written by the hook.`,
    ].join("\n");
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const sep = existing === "" || existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    fs.appendFileSync(file, `${sep}${body}\n`);
    return "appended";
  } catch {
    return "skipped";
  }
}

export function endHook(event: HookEvent, env: NodeJS.ProcessEnv, deps: HookDeps = {}): { closed: boolean; note?: "appended" | "skipped" } {
  if (!event.session_id) return { closed: false };
  const found = findCardBySession(event.session_id, env.DIGISMITH_PROJECT || undefined, env);
  if (!found) return { closed: false };
  const result = `ended (${event.reason || "unknown"})`;
  const ended = nowIso(deps.now);
  closeCard(ref(found.card), { now: deps.now, result, env });
  return { closed: true, note: appendHandoff(found.card, ended, result, event.cwd) };
}
