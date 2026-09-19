#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import yargs, { type Argv } from "yargs";
import { hideBin } from "yargs/helpers";
import { applyBranding } from "./lib/brand-help.ts";
import vpsCommand from "./vps/index.ts";
import depotCommand from "./depot/index.ts";

const OWN_PACKAGE_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");

export function readVersion(packageJsonPath: string = OWN_PACKAGE_JSON): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

export function buildCli(argv: string[]): Argv {
  const cli = yargs(argv)
    .scriptName("digismith")
    .command(vpsCommand)
    .command(depotCommand)
    .demandCommand(1, "")
    .strict()
    .version(readVersion());
  return applyBranding(cli);
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
  buildCli(hideBin(process.argv)).parse();
}
