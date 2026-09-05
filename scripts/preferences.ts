import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs, requireArgs } from "./cli-args.ts";

export const DEFAULT_PREFERENCES_PATH = ".digismith/preferences.yml";

const HEADER = "# DigiSmith-managed. Settings decided through live interaction, not hand-authored.";

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readUtf8Strict(filePath: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(filePath));
}

// Same "colon, then strip inline comment, then strip matching quotes" line
// shape as scripts/model_offload.ts's parseFieldValue — not imported from
// there, that script is a separate concern; this is a local equivalent
// scoped to the one file this script reads, same convention that file
// itself documents.
function parseFieldValue(line: string): string {
  const colonIndex = line.indexOf(":");
  const afterColon = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
  const hashIndex = afterColon.indexOf("#");
  const beforeComment = hashIndex === -1 ? afterColon : afterColon.slice(0, hashIndex);
  return beforeComment.trim().replace(/^['"]+|['"]+$/g, "");
}

export function readPreferences(filePath: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!isFile(filePath)) return result;

  let content: string;
  try {
    content = readUtf8Strict(filePath);
  } catch {
    return result;
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    if (!key) continue;
    result.set(key, parseFieldValue(line));
  }
  return result;
}

export function getPreference(key: string, filePath: string): string | undefined {
  return readPreferences(filePath).get(key);
}

function writePreferences(filePath: string, prefs: Map<string, string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [HEADER, ...Array.from(prefs, ([key, value]) => `${key}: ${value}`)];
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}

export function setPreference(key: string, value: string, filePath: string): void {
  const prefs = readPreferences(filePath);
  prefs.set(key, value);
  writePreferences(filePath, prefs);
}

export function clearPreference(key: string, filePath: string): void {
  const prefs = readPreferences(filePath);
  if (!prefs.has(key)) return;
  prefs.delete(key);
  writePreferences(filePath, prefs);
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));

  try {
    requireArgs(args, ["key", "action"]);
  } catch (err) {
    console.error(`preferences: failed (${(err as Error).message})`);
    process.exitCode = 1;
    return;
  }

  const filePath = args.path ?? DEFAULT_PREFERENCES_PATH;
  const key = args.key;

  switch (args.action) {
    case "get": {
      const value = getPreference(key, filePath);
      console.log(value === undefined ? "unset" : value);
      return;
    }
    case "set": {
      if (args.value === undefined) {
        console.error("preferences: failed (missing required flag: --value)");
        process.exitCode = 1;
        return;
      }
      setPreference(key, args.value, filePath);
      console.log(`preferences: set ${key}=${args.value}`);
      return;
    }
    case "clear": {
      clearPreference(key, filePath);
      console.log(`preferences: cleared ${key}`);
      return;
    }
    default:
      console.error(`preferences: failed (unknown action: ${args.action})`);
      process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
