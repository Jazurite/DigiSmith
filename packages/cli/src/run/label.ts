// packages/cli/src/run/label.ts
// The herdr labeller (DGS-598): reads this pane's agent name once from herdr-ws (read-only) and sets the role of an
// automatic run. Keeps name, pane_id, tab_id and workspace_id; drops the rest of the list (cwd, titles). Never throws.
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { logError } from "./hook.ts";
import { depotDir } from "./paths.ts";
import { readRun, rewriteRun } from "./record.ts";
import { roleOf, ticketOfAgentName } from "./role.ts";

export type AgentEntry = { name: string; pane_id: string; tab_id: string | null; workspace_id: string | null };
export type ListAgents = (workspace: string) => string;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function parseAgentList(stdout: string): AgentEntry[] {
  let v: unknown;
  try { v = JSON.parse(stdout); } catch { return []; }
  const agents = (v as { result?: { agents?: unknown } } | null)?.result?.agents;
  if (!Array.isArray(agents)) return [];
  const out: AgentEntry[] = [];
  for (const a of agents) {
    const o = (a ?? {}) as Record<string, unknown>;
    const name = str(o.name), pane = str(o.pane_id);
    if (name !== null && pane !== null) out.push({ name, pane_id: pane, tab_id: str(o.tab_id), workspace_id: str(o.workspace_id) });
  }
  return out;
}

export function defaultListAgents(env: NodeJS.ProcessEnv): ListAgents {
  const bin = env.NIGHTWATCH_HERDR_WS || path.join(depotDir(env), "bin", "herdr-ws");
  return (workspace) => execFileSync(bin, ["agent", "list"], { env: { ...env, HERDR_WS: workspace }, timeout: 3000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

export function labelRun(dir: string, env: NodeJS.ProcessEnv, list: ListAgents = defaultListAgents(env)): void {
  try {
    const record = readRun(dir);
    if (record.role_from !== "pending") return;
    const pane = record.herdr.pane;
    let entry: AgentEntry | undefined;
    if (pane !== null) {
      try {
        entry = parseAgentList(list(pane.split(":")[0])).find((e) => e.pane_id === pane);
      } catch (e) {
        logError("label", (e as Error).message, env);
      }
    }
    const r = roleOf({ inHerdr: true, looked: true, agentName: entry?.name ?? null, maestroIdentity: false });
    const probe = entry?.name.includes("probe") === true;
    rewriteRun(dir, { ...record, role: r.role, role_from: r.role_from, ticket: record.ticket ?? ticketOfAgentName(entry?.name ?? null), project: probe ? "usage-probe" : record.project });
  } catch (e) {
    logError("label", (e as Error).message, env);
  }
}
