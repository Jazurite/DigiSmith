import { spawnSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { ensureProcess, stopProcess } from "./process-lifecycle.ts";

export const DEFAULT_TRACKING_FILE = path.join(os.homedir(), ".digismith-depot", "opencode-server.json");
export const DEFAULT_LOG_FILE = path.join(os.homedir(), ".digismith-depot", "opencode-server.log");

const CREDENTIALS_SCRIPT = path.join(
  os.homedir(),
  ".claude",
  "skills",
  "chutes-ai",
  "scripts",
  "manage_credentials.py"
);

export function fetchChutesApiKey(): string {
  const result = spawnSync("python3", [CREDENTIALS_SCRIPT, "get", "--field", "api_key"], { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(
      `depot opencode: could not fetch the Chutes API key — ${(result.stderr ?? "").trim() || "manage_credentials.py failed"}`
    );
  }
  return result.stdout.trim();
}

export function run(
  argv: string[],
  trackingFile: string = DEFAULT_TRACKING_FILE,
  logFile: string = DEFAULT_LOG_FILE
): void {
  const verb = argv[0];
  if (verb !== "ensure" && verb !== "stop") {
    console.error("usage: digismith depot opencode <ensure|stop>");
    process.exitCode = 1;
    return;
  }

  if (verb === "stop") {
    const result = stopProcess({ label: "opencode-server", trackingFile });
    console.log(result.stopped ? "depot opencode: stopped" : "depot opencode: nothing to stop");
    return;
  }

  try {
    const { port } = ensureProcess({
      label: "opencode-server",
      trackingFile,
      logFile,
      spawnCommand: () => ({
        command: "opencode",
        args: ["serve", "--port", "0", "--hostname", "127.0.0.1"],
        env: { CHUTES_API_KEY: fetchChutesApiKey() },
      }),
    });
    console.log(`depot opencode: ready on port ${port}`);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
