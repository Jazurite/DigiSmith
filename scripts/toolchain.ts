import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs, requireArgs } from "./cli-args.ts";

export const DEFAULT_TOOLCHAIN_PATH = "toolchain.yml";

const HEADER = "# DigiSmith-managed. Standing toolchain defaults, dictated by Jack.";

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
// shape as scripts/preferences.ts's parseFieldValue — not imported from
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

export function readToolchain(filePath: string): Map<string, string> {
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
    const domain = line.slice(0, colonIndex).trim();
    if (!domain) continue;
    result.set(domain, parseFieldValue(line));
  }
  return result;
}

function writeToolchain(filePath: string, entries: Map<string, string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [HEADER, ...Array.from(entries, ([domain, value]) => `${domain}: ${value}`)];
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}

export function setToolchainDefault(domain: string, value: string, filePath: string): void {
  const entries = readToolchain(filePath);
  entries.set(domain, value);
  writeToolchain(filePath, entries);
}

export function clearToolchainDefault(domain: string, filePath: string): void {
  const entries = readToolchain(filePath);
  if (!entries.has(domain)) return;
  entries.delete(domain);
  writeToolchain(filePath, entries);
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));

  try {
    requireArgs(args, ["action"]);
  } catch (err) {
    console.error(`toolchain: failed (${(err as Error).message})`);
    process.exitCode = 1;
    return;
  }

  const filePath = args.path ?? DEFAULT_TOOLCHAIN_PATH;

  switch (args.action) {
    case "list": {
      for (const [domain, value] of readToolchain(filePath)) {
        console.log(`${domain}: ${value}`);
      }
      return;
    }
    case "set": {
      if (args.domain === undefined) {
        console.error("toolchain: failed (missing required flag: --domain)");
        process.exitCode = 1;
        return;
      }
      if (args.value === undefined) {
        console.error("toolchain: failed (missing required flag: --value)");
        process.exitCode = 1;
        return;
      }
      setToolchainDefault(args.domain, args.value, filePath);
      console.log(`toolchain: set ${args.domain}=${args.value}`);
      return;
    }
    case "clear": {
      if (args.domain === undefined) {
        console.error("toolchain: failed (missing required flag: --domain)");
        process.exitCode = 1;
        return;
      }
      clearToolchainDefault(args.domain, filePath);
      console.log(`toolchain: cleared ${args.domain}`);
      return;
    }
    default:
      console.error(`toolchain: failed (unknown action: ${args.action})`);
      process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
