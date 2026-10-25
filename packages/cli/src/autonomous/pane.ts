import { execFile, execFileSync } from "node:child_process";
import { join } from "node:path";
import { depotDir } from "../run/paths.ts";

export type PaneLookup = (workspace: string) => Promise<Map<string, string> | null>;
type Exec = (workspace: string) => Promise<{ code: number; stdout: string }>;

export function buildHerdrCall(workspace: string, env: NodeJS.ProcessEnv = process.env): { file: string; args: string[]; env: NodeJS.ProcessEnv } {
  return { file: join(depotDir(env), "bin", "herdr-ws"), args: ["pane", "list"], env: { ...env, HERDR_WS: workspace } };
}

const realExec: Exec = (workspace) =>
  new Promise((resolve) => {
    const c = buildHerdrCall(workspace);
    execFile(c.file, c.args, { env: c.env, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      const code = err && typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ code, stdout: String(stdout ?? "") });
    });
  });

/** Pane id -> agent_status from `pane list` JSON; null when the output is not a pane list. */
export function parsePaneList(stdout: string): Map<string, string> | null {
  const j = JSON.parse(stdout) as { result?: { panes?: { pane_id?: unknown; agent_status?: unknown }[] } };
  const panes = j.result?.panes;
  if (!Array.isArray(panes)) return null;
  const out = new Map<string, string>();
  for (const p of panes) {
    if (typeof p?.pane_id === "string") out.set(p.pane_id, typeof p.agent_status === "string" ? p.agent_status : "unknown");
  }
  return out;
}

/** One read-only `pane list` per workspace: pane id -> agent_status. null means herdr did not answer, never "the pane is gone". */
export function herdrPaneLookup(exec: Exec = realExec): PaneLookup {
  return async (workspace) => {
    try {
      const r = await exec(workspace);
      if (r.code !== 0) return null;
      return parsePaneList(r.stdout);
    } catch {
      return null;
    }
  };
}

export type PaneLookupSync = (workspace: string) => Map<string, string> | null;
type ExecSync = (workspace: string) => { code: number; stdout: string };

const realExecSync: ExecSync = (workspace) => {
  const c = buildHerdrCall(workspace);
  try {
    const stdout = execFileSync(c.file, c.args, { env: c.env, timeout: 3_000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    return { code: 0, stdout: String(stdout) };
  } catch {
    return { code: 1, stdout: "" };
  }
};

const SYNC_TTL_MS = 15_000;
const syncCache = new Map<string, { at: number; value: Map<string, string> | null }>();
export const clearPaneSyncCache = (): void => syncCache.clear();

/** Synchronous `pane list` for Oculus: cached per workspace for 15 s (herdr down is cached too); null on any failure. */
export function herdrPaneLookupSync(exec: ExecSync = realExecSync, now: () => number = Date.now): PaneLookupSync {
  return (workspace) => {
    const hit = syncCache.get(workspace);
    if (hit !== undefined && now() - hit.at < SYNC_TTL_MS) return hit.value;
    let value: Map<string, string> | null = null;
    try {
      const r = exec(workspace);
      if (r.code === 0) value = parsePaneList(r.stdout);
    } catch {
      value = null;
    }
    syncCache.set(workspace, { at: now(), value });
    return value;
  };
}
