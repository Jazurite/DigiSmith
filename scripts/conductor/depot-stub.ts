// Stub until DGS-417 merges scripts/depot-dir.ts; at the rebase this file is deleted and the imports switch.
import * as os from "node:os";
import * as path from "node:path";

export function depotDir(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.DIGISMITH_DEPOT_DIR;
  return v && v.trim() !== "" ? v : path.join(os.homedir(), ".digismith-depot");
}
