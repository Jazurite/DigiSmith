import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, requireArgs } from "./cli-args.ts";

export const DOCS_DIR_PATH = ".digismith/docs";
export const NOTE_FILENAME = "handoff.md";
export const UNLETTERED_KEY = "_unlettered";
export const EXCLUDE_PATTERN = ".digismith/docs/**/handoff.md";

export type LineageKey = { clan: string; lineage?: string };
export type ExcludeResult = "already-ignored" | "added" | "not-a-repo";

export function parseLineageKey(title: string): LineageKey | null {
  const match = /^\s*([A-Z])(?:\.(\d+))?\s*(?::|$)/.exec(title);
  if (!match) return null;
  const [, clan, number] = match;
  return number === undefined ? { clan } : { clan, lineage: `${clan}.${number}` };
}

function keySegments(key: LineageKey | null): string[] {
  if (key === null) return [UNLETTERED_KEY];
  return key.lineage === undefined ? [key.clan] : [key.clan, key.lineage];
}

export function noteRelPath(key: LineageKey | null): string {
  return [DOCS_DIR_PATH, ...keySegments(key), NOTE_FILENAME].join("/");
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

export function resolveMainRoot(cwd: string): string {
  const result = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const commonDir = result.status === 0 ? result.stdout.trim() : "";
  return commonDir ? path.dirname(path.resolve(commonDir)) : cwd;
}

function subdirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function hasNote(dir: string): boolean {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name === NOTE_FILENAME);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

function keyRelPath(key: string): string {
  return `${DOCS_DIR_PATH}/${key}/${NOTE_FILENAME}`;
}

export function listNotes(mainRoot: string): string[] {
  const docsDir = path.join(mainRoot, ...DOCS_DIR_PATH.split("/"));
  const found: string[] = [];
  for (const clan of subdirs(docsDir)) {
    if (hasNote(path.join(docsDir, clan))) found.push(clan);
    for (const lineage of subdirs(path.join(docsDir, clan))) {
      if (hasNote(path.join(docsDir, clan, lineage))) found.push(`${clan}/${lineage}`);
    }
  }
  if (found.length === 0) return [];
  const tracked = git(mainRoot, ["ls-files", "--", ...found.map(keyRelPath)]);
  const trackedPaths = new Set(
    tracked.status === 0 ? tracked.stdout.split(/\r?\n/).filter((line) => line !== "") : [],
  );
  return found.filter((key) => !trackedPaths.has(keyRelPath(key)));
}

export function ensureExcluded(mainRoot: string, relPath: string): ExcludeResult {
  // --no-index: check-ignore never reports a tracked path as ignored otherwise,
  // which would re-append EXCLUDE_PATTERN on every call for a committed note.
  const check = git(mainRoot, ["check-ignore", "-q", "--no-index", relPath]);
  if (check.status === 0) return "already-ignored";
  if (check.status !== 1) return "not-a-repo";
  const excludePath = git(mainRoot, ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"]).stdout.trim();
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
  const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(excludePath, `${separator}${EXCLUDE_PATTERN}\n`);
  return "added";
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  try {
    requireArgs(args, ["action"]);
    const mainRoot = resolveMainRoot(process.cwd());
    switch (args.action) {
      case "path": {
        requireArgs(args, ["title"]);
        const relPath = noteRelPath(parseLineageKey(args.title));
        console.log(path.join(mainRoot, ...relPath.split("/")));
        break;
      }
      case "ensure-excluded": {
        requireArgs(args, ["title"]);
        console.log(`lineage-handoff: ${ensureExcluded(mainRoot, noteRelPath(parseLineageKey(args.title)))}`);
        break;
      }
      case "list": {
        for (const key of listNotes(mainRoot)) console.log(key);
        break;
      }
      default:
        throw new Error(`unknown --action "${args.action}" — expected path, ensure-excluded, or list`);
    }
  } catch (err) {
    console.error(`lineage-handoff: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
