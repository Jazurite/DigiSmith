// packages/cli/src/run/identity-folder.ts
// Is this root the folder of exactly one Maestro identity card (DGS-411)? A line regex, no YAML parser: the hook must stay fast.
import * as fs from "node:fs";
import * as path from "node:path";
import { depotDir } from "./paths.ts";

const strip = (p: string): string => (p.length > 1 ? p.replace(/[\\/]+$/, "") : p);

export function maestroIdentityAt(root: string | null, env: NodeJS.ProcessEnv): boolean {
  if (root === null) return false;
  const dir = path.join(depotDir(env), "identities");
  let files: string[];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".yml")); } catch { return false; }
  let hits = 0;
  for (const f of files) {
    try {
      const m = /^folder:\s*(.+?)\s*$/m.exec(fs.readFileSync(path.join(dir, f), "utf8"));
      if (m && strip(m[1]) === strip(root)) hits++;
    } catch { /* unreadable card: not a match */ }
  }
  return hits === 1;
}
