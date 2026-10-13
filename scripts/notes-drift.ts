// Read-only check for DGS-443: did anyone write an old note after its switch time (recorded by notes-switch.ts)?
// Never writes, never deletes. Exit code 1 only when drift is found.

import * as fs from "node:fs";
import * as path from "node:path";
import { listNoteSessionNames, projectName, SESSIONS_DIR_PATH } from "./session-path.ts";
import { noteTarget, readSwitches, RUNBOOKS } from "./notes-switch.ts";

export type Drift = {
  key: string;
  old: string;
  copy: string;
  problem: "old path written after the switch" | "depot copy missing" | "old note missing";
  detail: string;
};

export function findDrift(mainRoot: string, env: NodeJS.ProcessEnv = process.env): { drift: Drift[]; pending: string[] } {
  const project = projectName(mainRoot);
  const switches = readSwitches(project, env);
  const drift: Drift[] = [];
  for (const [key, rec] of Object.entries(switches)) {
    const base = { key, old: rec.old, copy: rec.copy };
    if (!fs.existsSync(rec.copy)) drift.push({ ...base, problem: "depot copy missing", detail: "" });
    if (!fs.existsSync(rec.old)) continue; // an old file removed later (by Jack) is not a write
    const mtime = fs.statSync(rec.old).mtimeMs;
    if (mtime > Date.parse(rec.at)) {
      drift.push({ ...base, problem: "old path written after the switch", detail: `old modified ${new Date(mtime).toISOString()}, switched ${rec.at}` });
    }
  }
  const oldDir = path.join(mainRoot, ...SESSIONS_DIR_PATH.split("/"));
  const keys = [...listNoteSessionNames(mainRoot), ...RUNBOOKS.filter((n) => fs.existsSync(path.join(oldDir, n)))];
  const pending = keys.filter((key) => !switches[key] && fs.existsSync(noteTarget(mainRoot, key, env).old));
  return { drift, pending };
}

export function main(): void {
  const { drift, pending } = findDrift(process.argv[2] ?? process.cwd());
  for (const d of drift) console.log(`${d.problem}: ${d.key}: ${d.old} -> ${d.copy} ${d.detail}`.trimEnd());
  if (pending.length > 0) console.log(`not switched yet: ${pending.join(", ")}`);
  if (drift.length === 0) console.log("notes-drift: no drift");
  process.exitCode = drift.length === 0 ? 0 : 1;
}

if (import.meta.filename === process.argv[1]) main();
