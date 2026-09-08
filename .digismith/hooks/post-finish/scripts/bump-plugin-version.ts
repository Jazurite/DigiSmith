import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "../../../../scripts/cli-args.ts";

export function computeNextVersion(current: string, bumpType: "patch" | "minor" = "minor"): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(current);
  if (!match) {
    throw new Error(`Cannot parse version: ${current}`);
  }
  const [, major, minor, patch, prerelease] = match;
  if (bumpType === "patch") {
    return `${major}.${minor}.${Number(patch) + 1}${prerelease ?? ""}`;
  }
  return `${major}.${Number(minor) + 1}.0${prerelease ?? ""}`;
}

export function readPluginVersion(pluginJsonPath: string): string {
  const content = fs.readFileSync(pluginJsonPath, "utf8");
  const parsed = JSON.parse(content) as { version?: string };
  if (typeof parsed.version !== "string") {
    throw new Error(`No "version" field found in ${pluginJsonPath}`);
  }
  return parsed.version;
}

export function bumpVersionInFile(filePath: string, nextVersion: string): void {
  const content = fs.readFileSync(filePath, "utf8");
  const updated = content.replace(/"version":\s*"[^"]+"/, `"version": "${nextVersion}"`);
  if (updated === content) {
    throw new Error(`No "version" field found to replace in ${filePath}`);
  }
  fs.writeFileSync(filePath, updated);
}

export function versionChangedSince(
  baseSha: string,
  pluginJsonRelPath: string,
  cwd: string = process.cwd(),
): boolean {
  const result = spawnSync("git", ["show", `${baseSha}:${pluginJsonRelPath}`], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git show failed for ${baseSha}:${pluginJsonRelPath}: ${result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout) as { version?: string };
  if (typeof parsed.version !== "string") {
    throw new Error(`No "version" field found at ${baseSha}:${pluginJsonRelPath}`);
  }
  const currentVersion = readPluginVersion(path.join(cwd, pluginJsonRelPath));
  return parsed.version !== currentVersion;
}

export function bumpTypeSince(baseSha: string, cwd: string = process.cwd()): "patch" | "minor" {
  const result = spawnSync("git", ["log", `${baseSha}..HEAD`, "--format=%s"], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git log failed for ${baseSha}..HEAD: ${result.stderr}`);
  }
  const subjects = result.stdout.split("\n").filter((line) => line.length > 0);
  if (subjects.length === 0) {
    return "minor";
  }
  const fixPattern = /^fix(\([^)]*\))?:/;
  const allFix = subjects.every((subject) => fixPattern.test(subject));
  return allFix ? "patch" : "minor";
}

const PLUGIN_JSON_PATH = ".claude-plugin/plugin.json";
const MARKETPLACE_JSON_PATH = ".claude-plugin/marketplace.json";

export function main(): void {
  const args = parseArgs(process.argv.slice(2));

  try {
    const currentVersion = readPluginVersion(PLUGIN_JSON_PATH);

    if (args.base !== undefined && versionChangedSince(args.base, PLUGIN_JSON_PATH)) {
      console.log(`SKIPPED already changed by incoming branch (current: ${currentVersion})`);
      return;
    }

    const bumpType = args.base !== undefined ? bumpTypeSince(args.base) : "minor";
    const nextVersion = computeNextVersion(currentVersion, bumpType);
    bumpVersionInFile(PLUGIN_JSON_PATH, nextVersion);
    bumpVersionInFile(MARKETPLACE_JSON_PATH, nextVersion);
    console.log(`BUMPED ${currentVersion} -> ${nextVersion}`);
  } catch (err) {
    console.error(`Cannot bump plugin version: ${(err as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
