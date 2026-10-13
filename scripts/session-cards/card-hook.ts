import * as fs from "node:fs";
import * as path from "node:path";
import { resolveMainRoot } from "../lineage-handoff.ts";
import { ROLES, closeCard, findCardBySession, nowIso, touchCard, validateCard, writeCard } from "./cards.ts";
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

export function startHook(event: HookEvent, env: NodeJS.ProcessEnv, deps: HookDeps = {}): { wrote: boolean; reason?: string } {
  const starter = readStarterEnv(env);
  if (!starter) return { wrote: false, reason: "no valid DIGISMITH_ROLE and DIGISMITH_PROJECT: no card written" };
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
