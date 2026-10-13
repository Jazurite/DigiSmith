// Where a flux target's brief, note and wake text come from. Per conductor, not only conductors.json:
// token-economics-conductor keeps its files in the old b3-maestro folder and has no identity record.
import * as fs from "node:fs";
import * as path from "node:path";
import { depotDir } from "../depot-dir.ts";
import { resolveNotePath } from "./state.ts";
import type { FluxTarget } from "./flux.ts";

export const TARGETS_FILE = "flux-targets.json";
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface Entry {
  project?: string;
  brief?: string;
  note?: string;
  wake?: string;
  workers?: string[];
}

function readFile(env: NodeJS.ProcessEnv): Record<string, Entry> {
  const file = path.join(depotDir(env), TARGETS_FILE);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, Entry>;
  } catch (e) {
    throw new Error(`${TARGETS_FILE} (${file}) is not valid JSON: ${(e as Error).message}`);
  }
}

const abs = (p: string, root: string) => (path.isAbsolute(p) ? p : path.join(root, p));

export function loadTargets(env: NodeJS.ProcessEnv, repoRoot: string): FluxTarget[] {
  return Object.keys(readFile(env)).map((a) => resolveTarget(a, {}, env, repoRoot)!).filter(Boolean);
}

/** File entry, then flags on top; with neither, conductors.json (note) and the default brief path. */
export function resolveTarget(
  agent: string,
  flags: { project?: string; brief?: string; note?: string; wake?: string },
  env: NodeJS.ProcessEnv,
  repoRoot: string,
): FluxTarget | undefined {
  if (!SAFE.test(agent)) throw new Error(`refused: agent name ${JSON.stringify(agent)}`);
  const e = readFile(env)[agent];
  const project = flags.project ?? e?.project ?? "DigiSmith";
  let note = flags.note ?? e?.note;
  if (!note) {
    try {
      const map = JSON.parse(fs.readFileSync(path.join(depotDir(env), "conductors.json"), "utf-8")) as Record<string, { note?: string }>;
      note = map[`${project}/${agent}`]?.note;
    } catch {
      // no conductors.json
    }
  }
  if (!e && !note && !flags.brief) return undefined;
  note ??= resolveNotePath({ project, conductor: agent }, env);
  const brief = flags.brief ?? e?.brief ?? path.join(".digismith", "sessions", agent, "brief.md");
  return { agent, project, brief: abs(brief, repoRoot), note: abs(note, repoRoot), wake: flags.wake ?? e?.wake, workers: e?.workers };
}
