import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";

export type Exec = (file: string, args: string[], env?: Record<string, string>) => Promise<{ code: number; stderr: string }>;

const CONDUCTOR_KEY = "DigiSmith/digismith-conductor";
const WORKSPACE_RE = /^w\d+$/;

export const realExec: Exec = (file, args, env) =>
  new Promise((resolve) => {
    const opts = env ? { env: { ...process.env, ...env } } : {};
    execFile(file, args, opts, (err, _stdout, stderr) => {
      if (!err) return resolve({ code: 0, stderr: String(stderr) });
      const code = typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1;
      resolve({ code, stderr: String(stderr) || err.message });
    });
  });

function readConductor(conductorsJson: string): { workspace: string } {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(readFileSync(conductorsJson, "utf8")) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`cannot read ${conductorsJson}: ${(e as Error).message}`);
  }
  if (!data || typeof data !== "object" || !Object.prototype.hasOwnProperty.call(data, CONDUCTOR_KEY)) {
    throw new Error(`no ${CONDUCTOR_KEY} entry in ${conductorsJson}`);
  }
  const entry = data[CONDUCTOR_KEY] as { workspace?: unknown } | null;
  const workspace = entry && typeof entry === "object" ? entry.workspace : undefined;
  if (typeof workspace !== "string" || !WORKSPACE_RE.test(workspace)) {
    throw Object.assign(new Error(`no workspace for ${CONDUCTOR_KEY} in ${conductorsJson}`), { workspaceProblem: true });
  }
  return { workspace };
}

export type ConductorCause = "conductor-workspace-missing" | "conductor-config-unreadable";

export function conductorCheck(conductorsJson: string): { cause: ConductorCause; text: string } | null {
  try {
    readConductor(conductorsJson);
    return null;
  } catch (e) {
    const cause = (e as { workspaceProblem?: boolean }).workspaceProblem ? "conductor-workspace-missing" : "conductor-config-unreadable";
    return { cause, text: (e as Error).message };
  }
}

export async function promptConductor(exec: Exec, conductorsJson: string, message: string): Promise<void> {
  const { workspace } = readConductor(conductorsJson);
  const name = CONDUCTOR_KEY.split("/")[1];
  const herdr = join(homedir(), ".digismith-depot", "bin", "herdr-ws");
  const r = await exec(herdr, ["agent", "prompt", name, message], { HERDR_WS: workspace });
  if (r.code !== 0) throw new Error(`herdr-ws agent prompt failed (exit ${r.code}): ${r.stderr}`);
}
