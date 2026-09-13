import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ensureProcess, stopProcess } from "./process-lifecycle.ts";

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

export function run(
  argv: string[],
  trackingFile: string = DEFAULT_TRACKING_FILE,
  logFile: string = DEFAULT_LOG_FILE
): void {
  const verb = argv[0];
  if (verb !== "ensure" && verb !== "stop") {
    console.error("usage: digismith depot bridge <ensure|stop> [--repo <path>]");
    process.exitCode = 1;
    return;
  }

  if (verb === "stop") {
    const result = stopProcess({ label: "agentic-bridge", trackingFile });
    if (result.error) {
      console.error(`depot bridge: failed to stop — ${result.error}`);
      process.exitCode = 1;
    } else if (result.stopped) {
      console.log("depot bridge: stopped");
    } else {
      console.log("depot bridge: nothing to stop");
    }
    return;
  }

  const repoFlagIndex = argv.indexOf("--repo");
  const explicitRepo = repoFlagIndex !== -1 ? argv[repoFlagIndex + 1] : undefined;

  let repo: string;
  try {
    repo = resolveDigismithRepo(explicitRepo);
  } catch (err) {
    console.error(`depot bridge: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  try {
    const { port } = ensureProcess({
      label: "agentic-bridge",
      trackingFile,
      logFile,
      spawnCommand: () => ({
        command: "node",
        args: [
          "--experimental-strip-types",
          path.join(repo, "scripts", "agentic-bridge", "server.ts"),
          "--port",
          "0",
        ],
      }),
    });
    console.log(`depot bridge: ready on port ${port}`);
  } catch (err) {
    console.error(`depot bridge: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
