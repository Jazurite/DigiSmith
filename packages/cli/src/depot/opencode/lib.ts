import { spawnSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";

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
      `could not fetch the Chutes API key — ${(result.stderr ?? "").trim() || "manage_credentials.py failed"}`
    );
  }
  return result.stdout.trim();
}
