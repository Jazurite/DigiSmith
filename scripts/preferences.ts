import { parseArgs, requireArgs } from "./cli-args.ts";
import {
  DEFAULT_DIR,
  PREFERENCES_SECTION,
  clearKey,
  formatMigrateReport,
  migrate,
  resolve,
  setKey,
  type WriteResult,
} from "./config.ts";

export { DEFAULT_DIR };

// Callers keep bare names: --key finish_option means preferences.finish_option.
function address(key: string): string {
  return `${PREFERENCES_SECTION}.${key}`;
}

export function getPreference(key: string, dir = DEFAULT_DIR): string | undefined {
  const hit = resolve(address(key), dir);
  return typeof hit?.value === "string" ? hit.value : undefined;
}

export function setPreference(key: string, value: string, dir = DEFAULT_DIR): WriteResult {
  return setKey(address(key), value, dir);
}

export function clearPreference(key: string, dir = DEFAULT_DIR): WriteResult {
  return clearKey(address(key), dir);
}

function printMigration(result: WriteResult, dir: string): void {
  if (result.migration) for (const line of formatMigrateReport(result.migration, dir)) console.log(line);
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir ?? DEFAULT_DIR;

  try {
    requireArgs(args, args.action === "migrate" ? ["action"] : ["key", "action"]);
    switch (args.action) {
      case "get": {
        const value = getPreference(args.key, dir);
        console.log(value === undefined ? "unset" : value);
        return;
      }
      case "set": {
        requireArgs(args, ["value"]);
        printMigration(setPreference(args.key, args.value, dir), dir);
        console.log(`preferences: set ${args.key}=${args.value}`);
        return;
      }
      case "clear": {
        printMigration(clearPreference(args.key, dir), dir);
        console.log(`preferences: cleared ${args.key}`);
        return;
      }
      case "migrate":
        for (const line of formatMigrateReport(migrate(dir), dir)) console.log(line);
        return;
      default:
        throw new Error(`unknown action: ${args.action}`);
    }
  } catch (err) {
    console.error(`preferences: failed (${(err as Error).message})`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
