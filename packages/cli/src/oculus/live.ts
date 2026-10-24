// packages/cli/src/oculus/live.ts
// DGS-599: every herdr agent on the Workbox for Oculus. Reads only: one herdr call with a fixed argv, the identity cards, the run records.
// Never reads pane text; drops terminal_title (Claude sets it from the conversation) and the folder path.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { depotDir, isSafe } from "../run/paths.ts";
import { listRuns } from "../run/read.ts";

export const HERDR_ARGS = ["--session", "default", "agent", "list"] as const;
export const AGENT_STATUSES = ["working", "idle", "blocked", "done", "unknown"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type AgentRole = "maestro" | "conductor" | "builder" | "reviewer" | "scout" | "other";
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

export function roleOf(name: string | null, maestros: ReadonlySet<string>): AgentRole {
  if (!name) return "other";
  if (maestros.has(name)) return "maestro";
  if (/-conductor$/.test(name)) return "conductor";
  if (/-rev/.test(name)) return "reviewer";
  if (/-scout|probe/.test(name)) return "scout";
  if (/^[A-Za-z]+-\d+$/.test(name)) return "builder";
  return "other";
}

export function projectOf(cwd: unknown, home: string): string | null {
  if (typeof cwd !== "string") return null;
  const rel = path.relative(path.join(home, "Workspace"), cwd);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  return parts.length >= 2 && isSafe(parts[1]) ? parts[1] : null;
}

export function maestroNames(env: NodeJS.ProcessEnv): Set<string> {
  const dir = path.join(depotDir(env), "identities");
  const out = new Set<string>();
  let files: string[];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".yml")); } catch { return out; }
  for (const f of files) {
    let text: string;
    try { text = fs.readFileSync(path.join(dir, f), "utf8"); } catch { continue; }
    const id = /^id:\s*(["']?)([^\s"']+)\1\s*$/m.exec(text)?.[2];   // one optional pair of quotes
    if (id && /^role:\s*maestro\s*$/m.test(text)) out.add(id);
  }
  return out;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function runsByPane(env: NodeJS.ProcessEnv): Map<string, string> {
  const best = new Map<string, { run: string; at: string }>();
  for (const { record, summary } of listRuns(env)) {
    const pane = record.herdr?.pane;
    if (!pane || summary.ended) continue;
    const prev = best.get(pane);
    if (!prev || record.created_at > prev.at) best.set(pane, { run: record.run, at: record.created_at });
  }
  return new Map([...best].map(([k, v]) => [k, v.run]));
}

export function liveView(env: NodeJS.ProcessEnv, now: Date, herdr: HerdrCall, home: string = os.homedir()): LiveView {
  const readAt = now.toISOString();
  const down: LiveView = { readAt, herdr: "unreachable", agents: [] };
  const r = herdr();
  if (!r.ok) return down;
  let raw: unknown;
  try { raw = (JSON.parse(r.stdout) as { result?: { agents?: unknown } }).result?.agents; } catch { return down; }
  if (!Array.isArray(raw)) return down;
  const maestros = maestroNames(env);
  const runs = runsByPane(env);
  const agents: LiveAgent[] = [];
  for (const a of raw as Record<string, unknown>[]) {
    const pane = str(a?.pane_id);
    if (!pane) continue;
    const name = str(a.name)?.slice(0, NAME_MAX) ?? null;
    const status = (AGENT_STATUSES as readonly string[]).includes(a.agent_status as string) ? (a.agent_status as AgentStatus) : "unknown";
    agents.push({ name, pane: pane.slice(0, NAME_MAX), tab: str(a.tab_id)?.slice(0, NAME_MAX) ?? null, workspace: str(a.workspace_id)?.slice(0, NAME_MAX) ?? null, role: roleOf(name, maestros), project: projectOf(a.cwd, home), status, run: runs.get(pane) ?? null });
  }
  const cmp = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });   // w2 before w10
  agents.sort((x, y) => ORDER[x.status] - ORDER[y.status] || cmp(x.workspace ?? "~", y.workspace ?? "~") || cmp(x.name ?? "~", y.name ?? "~") || cmp(x.pane, y.pane));
  return { readAt, herdr: "ok", agents };
}
