#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import yargs, { type Argv } from "yargs";
import { hideBin } from "yargs/helpers";
import { ROOT_USAGE, brandOutput } from "./lib/brand-help.ts";
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
  return yargs(argv)
    .scriptName("digismith")
    .usage(ROOT_USAGE)
    .command(vpsCommand)
    .command(depotCommand)
    .demandCommand(1, "")
    .strict()
    .version(readVersion());
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
  const argv = hideBin(process.argv);
  // yargs' single-argument `.parse(callback)` form mis-parses the callback
  // itself as the args array in this version (throws inside argsert, caught
  // and logged as a console.warn on every invocation) — passing the same
  // argv explicitly to both `buildCli` and `.parse` avoids that.
  buildCli(argv).parse(argv, {}, (err, _argv, output) => {
    if (output) {
      (err ? console.error : console.log)(brandOutput(output));
    }
    if (err) {
      process.exitCode = 1;
    }
  });
}
