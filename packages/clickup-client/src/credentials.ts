import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Credentials {
  teamId: string;
  apiToken: string;
}

export class CredentialsError extends Error {}

function defaultEnvPath(): string {
  return join(homedir(), ".digismith-depot", ".env");
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function parseEnvFile(path: string): Record<string, string> {
  const content = readFileSync(path, "utf-8");
  const result: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = stripQuotes(line.slice(eq + 1).trim());
    result[key] = value;
  }
  return result;
}

export function checkCredentials(envPath: string = defaultEnvPath()): Credentials {
  let vars: Record<string, string>;
  try {
    vars = parseEnvFile(envPath);
  } catch {
    throw new CredentialsError(`no credentials file found at ${envPath}`);
  }
  const { CLICKUP_API_TOKEN, CLICKUP_TEAM_ID } = vars;
  if (!CLICKUP_API_TOKEN || !CLICKUP_TEAM_ID) {
    throw new CredentialsError(
      `incomplete credentials in ${envPath} — need CLICKUP_API_TOKEN, CLICKUP_TEAM_ID`
    );
  }
  return { teamId: CLICKUP_TEAM_ID, apiToken: CLICKUP_API_TOKEN };
}
