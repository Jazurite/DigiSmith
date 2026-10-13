// Read-only check for DGS-443: after a note moved into the depot, did anyone still write the old copy?
// Never writes, never deletes. Prints the old files whose copy is missing or older than the old file.

import * as fs from "node:fs";
import * as path from "node:path";
import { listNoteSessionNames, noteLocation, projectName, sessionsRoot, SESSIONS_DIR_PATH } from "./session-path.ts";

export const RUNBOOKS = ["workbox.md", "workbox-macos.md"];

export type Drift = { title: string; old: string; copy: string; problem: "no depot copy" | "old copy changed after the depot copy" };

function check(title: string, old: string, copy: string, out: Drift[]): void {
  if (!fs.existsSync(copy)) return void out.push({ title, old, copy, problem: "no depot copy" });
  if (fs.readFileSync(old).equals(fs.readFileSync(copy))) return;
  if (fs.statSync(old).mtimeMs > fs.statSync(copy).mtimeMs) out.push({ title, old, copy, problem: "old copy changed after the depot copy" });
}

export function findDrift(mainRoot: string, env: NodeJS.ProcessEnv = process.env): Drift[] {
  const project = projectName(mainRoot);
  const oldDir = path.join(mainRoot, ...SESSIONS_DIR_PATH.split("/"));
  const out: Drift[] = [];
  for (const title of listNoteSessionNames(mainRoot)) {
    const old = path.join(oldDir, title, "note.md");
    const copy = noteLocation(project, title, env);
    check(title, old, copy, out);
  }
  for (const name of RUNBOOKS) {
    const old = path.join(oldDir, name);
    if (fs.existsSync(old)) check(name, old, path.join(sessionsRoot(project, env), name), out);
  }
  return out;
}

export function main(): void {
  const mainRoot = process.argv[2] ?? process.cwd();
  const drift = findDrift(mainRoot);
  for (const d of drift) console.log(`${d.problem}: ${d.old} -> ${d.copy}`);
  if (drift.length === 0) console.log("notes-drift: no drift");
  process.exitCode = drift.length === 0 ? 0 : 1;
}

if (import.meta.filename === process.argv[1]) main();
