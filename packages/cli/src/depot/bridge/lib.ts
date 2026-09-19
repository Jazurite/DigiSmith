import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_TRACKING_FILE = path.join(os.homedir(), ".digismith-depot", "agentic-bridge.json");
export const DEFAULT_LOG_FILE = path.join(os.homedir(), ".digismith-depot", "agentic-bridge.log");

function isDigismithCheckout(dir: string): boolean {
  const marker = path.join(dir, ".claude-plugin", "plugin.json");
  if (!fs.existsSync(marker)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(marker, "utf-8")) as { name?: unknown };
    return parsed.name === "digismith";
  } catch {
    return false;
  }
}

export function findDigismithRepoMarker(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    if (isDigismithCheckout(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function resolveDigismithRepo(explicitRepo: string | undefined, cwd: string = process.cwd()): string {
  if (explicitRepo !== undefined) {
    if (!isDigismithCheckout(explicitRepo)) {
      throw new Error(
        `--repo ${explicitRepo} does not look like a DigiSmith checkout (no .claude-plugin/plugin.json with "name": "digismith")`
      );
    }
    return explicitRepo;
  }
  const found = findDigismithRepoMarker(cwd);
  if (!found) {
    throw new Error("not inside a DigiSmith checkout and no --repo <path> given");
  }
  return found;
}
