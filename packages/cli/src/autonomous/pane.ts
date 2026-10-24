import { execFile } from "node:child_process";
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

/** One read-only `pane list` per workspace: pane id -> agent_status. null means herdr did not answer, never "the pane is gone". */
export function herdrPaneLookup(exec: Exec = realExec): PaneLookup {
  return async (workspace) => {
    try {
      const r = await exec(workspace);
      if (r.code !== 0) return null;
      const j = JSON.parse(r.stdout) as { result?: { panes?: { pane_id?: unknown; agent_status?: unknown }[] } };
      const panes = j.result?.panes;
      if (!Array.isArray(panes)) return null;
      const out = new Map<string, string>();
      for (const p of panes) {
        if (typeof p?.pane_id === "string") out.set(p.pane_id, typeof p.agent_status === "string" ? p.agent_status : "unknown");
      }
      return out;
    } catch {
      return null;
    }
  };
}
