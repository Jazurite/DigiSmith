// packages/cli/src/oculus/live.ts
// DGS-599: every herdr agent on the Workbox for Oculus. Reads only: one herdr call per session with a fixed argv and the run records.
// Never reads pane text; drops terminal_title (Claude sets it from the conversation) and the folder path.
import { execFile } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { isSafe } from "../run/paths.ts";
import { LIST_DAYS, listRuns } from "../run/read.ts";
import { roleOf } from "../run/role.ts";
import type { Role } from "../run/schema.ts";

// The default (Floor) session and the Suite session; the Suite may be down, the Floor may not (DGS-683).
export const HERDR_CALLS = [
  ["--session", "default", "agent", "list"],
  ["--session", "Suite", "agent", "list"],
] as const;
export const AGENT_STATUSES = ["working", "idle", "blocked", "done", "unknown"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type AgentRole = Role;   // the DGS-598 role set (run/schema.ts ROLES)
export interface LiveAgent { session: string; name: string | null; pane: string; tab: string | null; workspace: string | null; role: AgentRole; project: string | null; status: AgentStatus; run: string | null }
export interface LiveView { readAt: string; herdr: "ok" | "unreachable"; suite?: "ok" | "unavailable"; agents: LiveAgent[] }
/** One read-only herdr call: the argv is one of HERDR_CALLS. */
export type HerdrResult = { ok: true; stdout: string } | { ok: false };
export type HerdrCall = (argv: readonly string[]) => Promise<HerdrResult>;

const NAME_MAX = 64;
const ORDER: Record<AgentStatus, number> = { blocked: 0, working: 1, idle: 2, unknown: 3, done: 4 };

/** The real herdr: fixed argv, no shell, 3 s, only HOME, PATH and the XDG_CONFIG_HOME herdr-ws uses. */
export function realHerdr(): HerdrCall {
  const home = os.homedir();
  return (argv) => {
    if (!HERDR_CALLS.some((c) => c.join(" ") === argv.join(" "))) return Promise.resolve({ ok: false });   // only the fixed argvs run
    return new Promise((resolve) => {
      execFile(path.join(home, ".local", "bin", "herdr"), [...argv], {
        encoding: "utf8", timeout: 3000, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024,
        env: { HOME: home, PATH: "/usr/bin:/bin", XDG_CONFIG_HOME: path.join(home, ".config") },
      }, (err, stdout) => resolve(err ? { ok: false } : { ok: true, stdout }));
    });
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
type Open = { run: string; at: string; session: string | null };
function openRuns(env: NodeJS.ProcessEnv, now: Date): { byPane: Map<string, Open>; bySession: Map<string, Open> } {
  const pane = new Map<string, Open>();
  const session = new Map<string, Open>();
  const keep = (m: Map<string, Open>, k: string, run: string, at: string, sid: string | null) => {
    const prev = m.get(k);
    if (!prev || at > prev.at) m.set(k, { run, at, session: sid });
  };
  for (const { record, summary } of listRuns(env, undefined, { days: LIST_DAYS, nowMs: now.getTime() })) {   // the same window as the other views
    if (summary.ended) continue;
    const sid = typeof record.session_id === "string" && record.session_id !== "" ? record.session_id : null;
    if (record.herdr?.pane) keep(pane, `${record.herdr.session ?? "default"}/${record.herdr.pane}`, record.run, record.created_at, sid);
    if (sid) keep(session, sid, record.run, record.created_at, sid);
  }
  return { byPane: pane, bySession: session };
}

function parseAgents(r: HerdrResult): Record<string, unknown>[] | null {
  if (!r.ok) return null;
  try {
    const raw = (JSON.parse(r.stdout) as { result?: { agents?: unknown } }).result?.agents;
    return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : null;
  } catch {
    return null;
  }
}

export async function liveView(env: NodeJS.ProcessEnv, now: Date, herdr: HerdrCall, home: string = os.homedir()): Promise<LiveView> {
  const readAt = now.toISOString();
  const down: LiveView = { readAt, herdr: "unreachable", agents: [] };
  // the default session must answer; a Suite that does not answer only marks the view
  // both calls start together: a dead Suite adds nothing to a healthy Floor read
  const [floorRes, suiteRes] = await Promise.all(HERDR_CALLS.map((c) => (async () => herdr(c))().catch((): HerdrResult => ({ ok: false }))));
  const floor = parseAgents(floorRes);
  if (!floor) return down;
  const suiteRaw = parseAgents(suiteRes);
  const sessions: [string, Record<string, unknown>[]][] = [["default", floor], ...(suiteRaw ? [["Suite", suiteRaw] as [string, Record<string, unknown>[]]] : [])];
  const runs = openRuns(env, now);
  const agents: LiveAgent[] = [];
  for (const [session, raw] of sessions) for (const a of raw) {
    const pane = str(a?.pane_id);
    if (!pane) continue;
    const name = str(a.name)?.slice(0, NAME_MAX) ?? null;
    const sessionId = str((a.agent_session as { value?: unknown } | undefined)?.value);
    // the pane match wins, unless its run carries another Claude session (herdr reused the pane id); a pane id is only unique inside its herdr session
    const byPane = runs.byPane.get(`${session}/${pane}`);
    const paneRun = byPane && !(byPane.session && sessionId && byPane.session !== sessionId) ? byPane : undefined;
    const run = paneRun?.run ?? (sessionId ? runs.bySession.get(sessionId)?.run : undefined) ?? null;
    const status = (AGENT_STATUSES as readonly string[]).includes(a.agent_status as string) ? (a.agent_status as AgentStatus) : "unknown";
    agents.push({ session, name, pane: pane.slice(0, NAME_MAX), tab: str(a.tab_id)?.slice(0, NAME_MAX) ?? null, workspace: str(a.workspace_id)?.slice(0, NAME_MAX) ?? null, role: herdrRole(name), project: projectOf(a.cwd, home), status, run });
  }
  const cmp = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });   // w2 before w10
  agents.sort((x, y) => ORDER[x.status] - ORDER[y.status] || cmp(x.session, y.session) || cmp(x.workspace ?? "~", y.workspace ?? "~") || cmp(x.name ?? "~", y.name ?? "~") || cmp(x.pane, y.pane));
  return { readAt, herdr: "ok", suite: suiteRaw ? "ok" : "unavailable", agents };
}
