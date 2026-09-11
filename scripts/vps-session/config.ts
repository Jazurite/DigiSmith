import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_VPS_CONFIG_PATH = path.join(os.homedir(), ".digismith-depot", "vps.json");

export interface VpsConfig {
  host: string;
  user: string;
  identity_file: string;
  tmux_session: string;
}

const REQUIRED_FIELDS: (keyof VpsConfig)[] = ["host", "user", "identity_file", "tmux_session"];

export function loadVpsConfig(filePath: string = DEFAULT_VPS_CONFIG_PATH): VpsConfig | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`vps-session: ${filePath} is not valid JSON (${(err as Error).message})`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`vps-session: ${filePath} must contain a JSON object`);
  }

  const record = parsed as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter((field) => typeof record[field] !== "string");
  if (missing.length > 0) {
    throw new Error(`vps-session: ${filePath} is missing required field(s): ${missing.join(", ")}`);
  }

  return parsed as VpsConfig;
}
