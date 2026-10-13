import * as os from "node:os";
import * as path from "node:path";

// The machine-wide depot root. DIGISMITH_DEPOT_DIR overrides it (tests use a temp dir).
export function depotDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.DIGISMITH_DEPOT_DIR;
  return override !== undefined && override !== "" ? override : path.join(os.homedir(), ".digismith-depot");
}
