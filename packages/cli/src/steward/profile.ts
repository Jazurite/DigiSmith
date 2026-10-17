import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface StewardProfile {
  tracker: "clickup" | "jira" | "none";
  releaseStage: boolean;
}

const NONE: StewardProfile = { tracker: "none", releaseStage: false };

function scalar(text: string, key: string): string | null {
  const m = new RegExp(`^${key}:[ \\t]*([^#\\r\\n]*?)[ \\t]*(#.*)?$`, "m").exec(text);
  return m ? m[1].replace(/^["']|["']$/g, "") : null;
}

function read(file: string): string | null {
  try {
    return existsSync(file) ? readFileSync(file, "utf-8") : null;
  } catch {
    return null;
  }
}

/** The profile name comes from .digismith/config.yml in cwd. The file is profiles/<name>.yml in cwd, else in the depot clone. Anything missing means no tracker. */
export function readStewardProfile(cwd: string, env: NodeJS.ProcessEnv = process.env): StewardProfile {
  const config = read(join(cwd, ".digismith", "config.yml"));
  const name = config ? scalar(config, "profile") : null;
  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) return NONE;
  const depotProfiles = env.DIGISMITH_PROFILES_DIR || join(homedir(), ".digismith-depot", "repo", "profiles");
  const text = read(join(cwd, "profiles", `${name}.yml`)) ?? read(join(depotProfiles, `${name}.yml`));
  if (!text) return NONE;
  const tracker = scalar(text, "tracker");
  return {
    tracker: tracker === "clickup" || tracker === "jira" ? tracker : "none",
    releaseStage: scalar(text, "release_stage") === "true",
  };
}
