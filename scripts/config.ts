import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ConfigError, parseConfig, type ConfigValue } from "./config-parse.ts";
import { clearInText, formatScalar, setInText, splitKey } from "./config-write.ts";
import { resolveMainRoot } from "./lineage-handoff.ts";
import { parseArgs, requireArgs } from "./cli-args.ts";

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

const LEGACY_FILES = [LEGACY_PROFILE_FILE, LEGACY_PREFERENCES_FILE];
const SCRIPT_PATH = fileURLToPath(import.meta.url);

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function checkoutRoot(dir: string): string {
  return path.dirname(path.resolve(dir));
}

export function isLinkedWorktree(cwd: string): boolean {
  const gitDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const commonDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (gitDir.status !== 0 || commonDir.status !== 0) return false;
  return path.resolve(gitDir.stdout.trim()) !== path.resolve(commonDir.stdout.trim());
}

function isTracked(root: string, filePath: string): boolean {
  return git(root, ["ls-files", "--error-unmatch", "--", filePath]).status === 0;
}

export function writeAtomic(filePath: string, content: string): void {
  const folder = path.dirname(filePath);
  fs.mkdirSync(folder, { recursive: true });
  const tmp = path.join(folder, `.${path.basename(filePath)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, filePath);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

export function worktreeMessage(root: string): string {
  return `this worktree still has .digismith/profile or preferences.yml. Run migrate in the main checkout ${resolveMainRoot(root)}, then remove or recreate this worktree`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function migrateCommand(dir: string): string {
  return `node --experimental-strip-types ${shellQuote(SCRIPT_PATH)} --action migrate --dir ${shellQuote(path.resolve(dir))}`;
}

export function commitCommands(dir: string, moved: string[]): string[] {
  const root = checkoutRoot(dir);
  const rel = (file: string) => path.relative(root, path.join(path.resolve(dir), file)).split(path.sep).join("/");
  const paths = [rel(CONFIG_FILE), ...moved.flatMap((file) => [rel(file), rel(file + MIGRATED_SUFFIX)])];
  return [`git add ${paths.map(shellQuote).join(" ")}`, `git commit -m ${shellQuote(MIGRATE_COMMIT_MESSAGE)}`];
}

export type MigrateConflict = { key: string; kept: ConfigValue; old: ConfigValue; file: string };
export type MigrateReport = { moved: string[]; added: string[]; conflicts: MigrateConflict[]; commit: string[] | null };

export function migrate(dir = DEFAULT_DIR): MigrateReport {
  const root = checkoutRoot(dir);
  if (isLinkedWorktree(root)) throw new ConfigError(worktreeMessage(root));

  const toMove: string[] = [];
  for (const file of LEGACY_FILES) {
    const original = fs.existsSync(path.join(dir, file));
    const copy = fs.existsSync(path.join(dir, file + MIGRATED_SUFFIX));
    if (original && copy) {
      throw new ConfigError(
        `${path.join(dir, file)} and ${path.join(dir, file + MIGRATED_SUFFIX)} both exist. Move one of them out of ${dir}, then run migrate again`,
      );
    }
    if (original) toMove.push(file);
  }
  if (toMove.length === 0) return { moved: [], added: [], conflicts: [], commit: null };

  const tracked = toMove.some((file) => isTracked(root, path.join(path.resolve(dir), file)));
  const old: { key: string; value: ConfigValue; file: string }[] = [];
  if (toMove.includes(LEGACY_PROFILE_FILE)) {
    const value = readLegacyProfile(dir);
    if (value !== undefined) old.push({ key: "profile", value, file: LEGACY_PROFILE_FILE });
  }
  if (toMove.includes(LEGACY_PREFERENCES_FILE)) {
    for (const [key, value] of readLegacyPreferences(dir)) old.push({ key, value, file: LEGACY_PREFERENCES_FILE });
  }

  const configPath = path.join(dir, CONFIG_FILE);
  let text = readTextIfPresent(configPath) ?? "";
  const current = parseConfig(text, configPath);
  const added: string[] = [];
  const conflicts: MigrateConflict[] = [];
  for (const { key, value, file } of old) {
    const existing = current.get(key);
    if (existing === undefined) {
      text = setInText(text, key, value as string, configPath);
      added.push(key);
    } else if (JSON.stringify(existing) !== JSON.stringify(value)) {
      conflicts.push({ key, kept: existing, old: value, file });
    }
  }

  if (added.length > 0) writeAtomic(configPath, text);
  for (const file of toMove) fs.renameSync(path.join(dir, file), path.join(dir, file + MIGRATED_SUFFIX));
  return { moved: toMove, added, conflicts, commit: tracked ? commitCommands(dir, toMove) : null };
}

export function formatMigrateReport(report: MigrateReport, dir = DEFAULT_DIR): string[] {
  if (report.moved.length === 0) return ["config: nothing to migrate"];
  const lines = [
    `config: migrated ${report.moved.map((file) => path.join(dir, file)).join(", ")} into ${path.join(dir, CONFIG_FILE)}`,
  ];
  if (report.added.length > 0) lines.push(`config: added ${report.added.join(", ")}`);
  for (const c of report.conflicts) {
    lines.push(
      `config: conflict on ${c.key}: kept ${JSON.stringify(c.kept)} from ${CONFIG_FILE}, the old value ${JSON.stringify(c.old)} stays in ${c.file}${MIGRATED_SUFFIX}`,
    );
  }
  lines.push(`config: moved aside ${report.moved.map((file) => `${file} -> ${file}${MIGRATED_SUFFIX}`).join(", ")}`);
  lines.push("config: if a branch from before this migration changes an old file, apply that change again with set");
  if (report.commit) {
    lines.push("config: commit needed:");
    for (const command of report.commit) lines.push(`  ${command}`);
  }
  return lines;
}

export type WriteCheck = { kind: "write" } | { kind: "migrate" } | { kind: "stop"; message: string };
export type WriteResult = { migration: MigrateReport | null };

export function checkWrite(dir = DEFAULT_DIR): WriteCheck {
  const present = LEGACY_FILES.filter((file) => fs.existsSync(path.join(dir, file)));
  if (present.length === 0) return { kind: "write" };
  const root = checkoutRoot(dir);
  if (isLinkedWorktree(root)) return { kind: "stop", message: worktreeMessage(root) };
  const tracked = present.filter((file) => isTracked(root, path.join(path.resolve(dir), file)));
  if (tracked.length === 0) return { kind: "migrate" };
  const message = [
    `git tracks ${tracked.map((file) => path.join(dir, file)).join(", ")}, so this write needs a migration commit first. Run these in ${root}, then try again:`,
    `  ${migrateCommand(dir)}`,
    ...commitCommands(dir, present).map((command) => `  ${command}`),
  ].join("\n");
  return { kind: "stop", message };
}

function prepareWrite(dir: string): MigrateReport | null {
  const check = checkWrite(dir);
  if (check.kind === "stop") throw new ConfigError(check.message);
  return check.kind === "migrate" ? migrate(dir) : null;
}

export function setKey(key: string, value: string, dir = DEFAULT_DIR): WriteResult {
  splitKey(key);
  formatScalar(value);
  const migration = prepareWrite(dir);
  const file = path.join(dir, CONFIG_FILE);
  writeAtomic(file, setInText(readTextIfPresent(file) ?? "", key, value, file));
  return { migration };
}

export function clearKey(key: string, dir = DEFAULT_DIR): WriteResult {
  splitKey(key);
  const migration = prepareWrite(dir);
  const file = path.join(dir, CONFIG_FILE);
  const text = readTextIfPresent(file);
  if (text !== undefined) {
    const next = clearInText(text, key, file);
    if (next !== text) writeAtomic(file, next);
  }
  return { migration };
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir ?? DEFAULT_DIR;
  try {
    requireArgs(args, ["action"]);
    switch (args.action) {
      case "get": {
        requireArgs(args, ["key"]);
        const hit = resolve(args.key, dir);
        if (!hit) console.log("unset");
        else if (Array.isArray(hit.value)) for (const item of hit.value) console.log(item);
        else console.log(hit.value);
        return;
      }
      case "set": {
        requireArgs(args, ["key", "value"]);
        const { migration } = setKey(args.key, args.value, dir);
        if (migration) for (const line of formatMigrateReport(migration, dir)) console.log(line);
        console.log(`config: set ${args.key}=${args.value}`);
        return;
      }
      case "clear": {
        requireArgs(args, ["key"]);
        const { migration } = clearKey(args.key, dir);
        if (migration) for (const line of formatMigrateReport(migration, dir)) console.log(line);
        console.log(`config: cleared ${args.key}`);
        return;
      }
      case "migrate":
        for (const line of formatMigrateReport(migrate(dir), dir)) console.log(line);
        return;
      default:
        throw new ConfigError(`unknown action: ${args.action}`);
    }
  } catch (err) {
    console.error(`config: failed (${(err as Error).message})`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
