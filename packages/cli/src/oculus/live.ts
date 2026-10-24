// packages/cli/src/oculus/live.ts
// DGS-599: every herdr agent on the Workbox for Oculus. Reads only: one herdr call with a fixed argv and the run records.
// Never reads pane text; drops terminal_title (Claude sets it from the conversation) and the folder path.
import { spawnSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { isSafe } from "../run/paths.ts";
import { listRuns } from "../run/read.ts";
import { roleOf } from "../run/role.ts";
import type { Role } from "../run/schema.ts";

export const HERDR_ARGS = ["--session", "default", "agent", "list"] as const;
export const AGENT_STATUSES = ["working", "idle", "blocked", "done", "unknown"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type AgentRole = Role;   // the DGS-598 role set (run/schema.ts ROLES)
export interface LiveAgent { name: string | null; pane: string; tab: string | null; workspace: string | null; role: AgentRole; project: string | null; status: AgentStatus; run: string | null }
export interface LiveView { readAt: string; herdr: "ok" | "unreachable"; agents: LiveAgent[] }
export type HerdrCall = () => { ok: true; stdout: string } | { ok: false };

const NAME_MAX = 64;
const ORDER: Record<AgentStatus, number> = { blocked: 0, working: 1, idle: 2, unknown: 3, done: 4 };

/** The real herdr: fixed argv, no shell, 3 s, only HOME, PATH and the XDG_CONFIG_HOME herdr-ws uses. */
export function realHerdr(): HerdrCall {
  const home = os.homedir();
  return () => {
    const r = spawnSync(path.join(home, ".local", "bin", "herdr"), [...HERDR_ARGS], {
      encoding: "utf8", timeout: 3000, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024, shell: false,
      env: { HOME: home, PATH: "/usr/bin:/bin", XDG_CONFIG_HOME: path.join(home, ".config") },
    });
    return r.status === 0 && !r.error ? { ok: true, stdout: r.stdout } : { ok: false };
  };
}

// The DGS-598 rule (run/role.ts), inside herdr: the name alone decides; a Maestro runs outside herdr, so a pane named
// like a maestro is "other".
const herdrRole = (name: string | null): AgentRole => roleOf({ inHerdr: true, looked: true, agentName: name, maestroIdentity: false }).role;

export function projectOf(cwd: unknown, home: string): string | null {
  if (typeof cwd !== "string") return null;
  const rel = path.relative(path.join(home, "Workspace"), cwd);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  return parts.length >= 2 && isSafe(parts[1]) ? parts[1] : null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

// Open runs, the newest per herdr pane and per Claude session id. The session id is only a join key: never output.
function openRuns(env: NodeJS.ProcessEnv): { byPane: Map<string, string>; bySession: Map<string, string> } {
  const pane = new Map<string, { run: string; at: string }>();
  const session = new Map<string, { run: string; at: string }>();
  const keep = (m: Map<string, { run: string; at: string }>, k: string, run: string, at: string) => {
    const prev = m.get(k);
    if (!prev || at > prev.at) m.set(k, { run, at });
  };
  for (const { record, summary } of listRuns(env)) {
    if (summary.ended) continue;
    if (record.herdr?.pane) keep(pane, record.herdr.pane, record.run, record.created_at);
    if (typeof record.session_id === "string" && record.session_id !== "") keep(session, record.session_id, record.run, record.created_at);
  }
  const runs = (m: Map<string, { run: string; at: string }>) => new Map([...m].map(([k, v]) => [k, v.run]));
  return { byPane: runs(pane), bySession: runs(session) };
}

export function liveView(env: NodeJS.ProcessEnv, now: Date, herdr: HerdrCall, home: string = os.homedir()): LiveView {
  const readAt = now.toISOString();
  const down: LiveView = { readAt, herdr: "unreachable", agents: [] };
  const r = herdr();
  if (!r.ok) return down;
  let raw: unknown;
  try { raw = (JSON.parse(r.stdout) as { result?: { agents?: unknown } }).result?.agents; } catch { return down; }
  if (!Array.isArray(raw)) return down;
  const runs = openRuns(env);
  const agents: LiveAgent[] = [];
  for (const a of raw as Record<string, unknown>[]) {
    const pane = str(a?.pane_id);
    if (!pane) continue;
    const name = str(a.name)?.slice(0, NAME_MAX) ?? null;
    const sessionId = str((a.agent_session as { value?: unknown } | undefined)?.value);
    const run = runs.byPane.get(pane) ?? (sessionId ? runs.bySession.get(sessionId) : undefined) ?? null;   // the pane match wins
    const status = (AGENT_STATUSES as readonly string[]).includes(a.agent_status as string) ? (a.agent_status as AgentStatus) : "unknown";
    agents.push({ name, pane: pane.slice(0, NAME_MAX), tab: str(a.tab_id)?.slice(0, NAME_MAX) ?? null, workspace: str(a.workspace_id)?.slice(0, NAME_MAX) ?? null, role: herdrRole(name), project: projectOf(a.cwd, home), status, run });
  }
  const cmp = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });   // w2 before w10
  agents.sort((x, y) => ORDER[x.status] - ORDER[y.status] || cmp(x.workspace ?? "~", y.workspace ?? "~") || cmp(x.name ?? "~", y.name ?? "~") || cmp(x.pane, y.pane));
  return { readAt, herdr: "ok", agents };
}
