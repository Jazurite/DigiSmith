import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigError, parseConfig, type ConfigValue } from "./config-parse.ts";

export const DEFAULT_DIR = ".digismith";
export const CONFIG_FILE = "config.yml";
export const LEGACY_PROFILE_FILE = "profile";
export const LEGACY_PREFERENCES_FILE = "preferences.yml";
export const PREFERENCES_SECTION = "preferences";
export const MIGRATED_SUFFIX = ".migrated";
export const MIGRATE_COMMIT_MESSAGE = "chore(config): migrate to .digismith/config.yml";

export type Resolved = { value: ConfigValue; source: string };

export function readTextIfPresent(filePath: string): string | undefined {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new ConfigError(`${filePath}: not valid UTF-8`);
  }
}

export function readConfig(dir = DEFAULT_DIR): Map<string, ConfigValue> {
  const file = path.join(dir, CONFIG_FILE);
  const text = readTextIfPresent(file);
  return text === undefined ? new Map() : parseConfig(text, file);
}

export function readLegacyProfile(dir = DEFAULT_DIR): string | undefined {
  const trimmed = readTextIfPresent(path.join(dir, LEGACY_PROFILE_FILE))?.trim();
  return trimmed ? trimmed : undefined;
}

export function readLegacyPreferences(dir = DEFAULT_DIR): Map<string, ConfigValue> {
  const file = path.join(dir, LEGACY_PREFERENCES_FILE);
  const text = readTextIfPresent(file);
  const result = new Map<string, ConfigValue>();
  if (text === undefined) return result;
  for (const [key, value] of parseConfig(text, file)) {
    if (key.includes(".") || Array.isArray(value)) {
      throw new ConfigError(`${file}: expected flat 'key: value' lines only`);
    }
    result.set(`${PREFERENCES_SECTION}.${key}`, value);
  }
  return result;
}

type Layer = (key: string, dir: string) => Resolved | undefined;

function configLayer(key: string, dir: string): Resolved | undefined {
  const value = readConfig(dir).get(key);
  return value === undefined ? undefined : { value, source: path.join(dir, CONFIG_FILE) };
}

// A.2 fallback: the old files, until the follow-up removal ticket.
function legacyLayer(key: string, dir: string): Resolved | undefined {
  if (key === "profile") {
    const value = readLegacyProfile(dir);
    return value === undefined ? undefined : { value, source: path.join(dir, LEGACY_PROFILE_FILE) };
  }
  if (key.startsWith(`${PREFERENCES_SECTION}.`)) {
    const value = readLegacyPreferences(dir).get(key);
    return value === undefined ? undefined : { value, source: path.join(dir, LEGACY_PREFERENCES_FILE) };
  }
  return undefined;
}

// First layer with the key wins. A global layer goes at the end of this list.
const LAYERS: Layer[] = [configLayer, legacyLayer];

export function resolve(key: string, dir = DEFAULT_DIR): Resolved | undefined {
  for (const layer of LAYERS) {
    const hit = layer(key, dir);
    if (hit) return hit;
  }
  return undefined;
}
