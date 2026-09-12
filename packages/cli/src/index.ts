#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { run as runVps } from "./vps/index.ts";

export type GroupRunner = (argv: string[]) => void;

export const GROUPS: Record<string, GroupRunner> = {
  vps: runVps,
};

export function usage(): string {
  const groups = Object.keys(GROUPS)
    .map((name) => `  ${name}`)
    .join("\n");
  return `usage: digismith <group> [args]\n       digismith --version\n\ngroups:\n${groups}`;
}

export function resolveGroup(name: string | undefined): GroupRunner | undefined {
  if (name === undefined) return undefined;
  return Object.prototype.hasOwnProperty.call(GROUPS, name) ? GROUPS[name] : undefined;
}

const OWN_PACKAGE_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");

export function readVersion(packageJsonPath: string = OWN_PACKAGE_JSON): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

function main(): void {
  const [group, ...rest] = process.argv.slice(2);
  if (group === "--version") {
    console.log(readVersion());
    return;
  }
  const run = resolveGroup(group);
  if (run === undefined) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  run(rest);
}

// pnpm installs global packages behind symlinks, and Node resolves
// import.meta.url to the real path — so argv[1] must be realpath'd too or the
// installed binary compares unequal and silently does nothing.
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(fs.realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
