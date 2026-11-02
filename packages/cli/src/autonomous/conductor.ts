import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { herdrSessionArgs, readRegistryFile, scopeFor, type ConductorEntry } from "../conductor-registry/registry.ts";

export type Exec = (file: string, args: string[], env?: Record<string, string>) => Promise<{ code: number; stderr: string }>;

const CONDUCTOR_KEY = "DigiSmith/digismith-conductor";

export const realExec: Exec = (file, args, env) =>
  new Promise((resolve) => {
    const opts = env ? { env: { ...process.env, ...env } } : {};
    execFile(file, args, opts, (err, _stdout, stderr) => {
      if (!err) return resolve({ code: 0, stderr: String(stderr) });
      const code = typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1;
      resolve({ code, stderr: String(stderr) || err.message });
    });
  });

function readConductor(conductorsJson: string): { entry: ConductorEntry; workspace: string; scope: string } {
  let reg: ReturnType<typeof readRegistryFile>;
  try {
    reg = readRegistryFile(conductorsJson);
  } catch (e) {
    throw new Error(`cannot read ${conductorsJson}: ${(e as Error).message}`);
  }
  // the factory conductor; with none, the DigiSmith key (the old single conductor)
  const factory = Object.values(reg.entries).filter((x) => x.status === "open" && x.kinds.includes("factory")).sort((a, b) => a.key.localeCompare(b.key))[0];
  const key = factory?.key ?? CONDUCTOR_KEY;
  const own = reg.problems.find((p) => p.key === key);
  if (own) {
    if (/workspace/.test(own.message)) {
      throw Object.assign(new Error(`no workspace for ${key} in ${conductorsJson}: ${own.message}`), { workspaceProblem: true });
    }
    throw new Error(`conductor-config: ${own.message} (in ${conductorsJson})`);
  }
  const entry = reg.entries[key];
  if (!entry) throw new Error(`no ${key} entry in ${conductorsJson}`);
  if (entry.workspace === undefined) {
    throw Object.assign(new Error(`no workspace for ${key} (session ${entry.session}) in ${conductorsJson}`), { workspaceProblem: true });
  }
  return { entry, workspace: entry.floor ?? entry.workspace, scope: scopeFor(entry, undefined, Object.values(reg.entries)) };
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
  const { entry, workspace, scope } = readConductor(conductorsJson);
  const herdr = join(homedir(), ".digismith-depot", "bin", "herdr-ws");
  const sess = entry.session === "default" ? [] : herdrSessionArgs(entry);
  const r = await exec(herdr, [...sess, "agent", "prompt", entry.name, message], { HERDR_WS: workspace, HERDR_SCOPE: scope });
  if (r.code !== 0) throw new Error(`herdr-ws agent prompt failed (exit ${r.code}): ${r.stderr}`);
}
