// digismith catch-up for one conductor and one Maestro identity (DGS-428).
// node --experimental-strip-types scripts/conductor/catch-up-cli.ts --maestro <id> --session <id> --conductor <id> [flags]
// Exit: 0 ok, 2 bad arguments, 3 conductor note missing (catch-up printed, nothing written), 4 note write failed (printed).
import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { buildCatchUp, type CatchUpDeps, type ClickUpInfo } from "./catch-up.ts";
import * as stub from "./deps-stub.ts";
import { isSafeName } from "./safe-name.ts";

const run = promisify(execFile);

export interface CliArgs {
  identity: string;
  session: string;
  conductor: string;
  project: string;
  maxAgeMin: number;
  refresh: boolean;
  noWrite: boolean;
  now?: string;
}

const VALUE_FLAGS = new Set(["--maestro", "--session", "--conductor", "--project", "--max-age-min", "--now"]);
const BOOL_FLAGS = new Set(["--refresh", "--no-write"]);

export function parseArgs(argv: string[]): CliArgs {
  const v = new Map<string, string>();
  const b = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (BOOL_FLAGS.has(a)) b.add(a);
    else if (VALUE_FLAGS.has(a)) {
      const val = argv[++i];
      if (val === undefined || val.startsWith("--")) throw new Error(`${a} needs a value`);
      v.set(a, val);
    } else throw new Error(`unknown argument ${a}`);
  }
  for (const req of ["--maestro", "--session", "--conductor"]) if (!v.get(req)) throw new Error(`${req} is required`);
  for (const flag of ["--maestro", "--session", "--conductor", "--project"]) {
    const val = v.get(flag);
    if (val !== undefined && !isSafeName(val)) throw new Error(`${flag} may hold only letters, digits, . _ - (no ..)`);
  }
  const maxAgeMin = v.has("--max-age-min") ? Number(v.get("--max-age-min")) : 30;
  if (!Number.isFinite(maxAgeMin) || maxAgeMin < 0) throw new Error("--max-age-min must be a number of minutes");
  const now = v.get("--now");
  if (now !== undefined && Number.isNaN(Date.parse(now))) throw new Error("--now must be an ISO time");
  return {
    identity: v.get("--maestro")!, session: v.get("--session")!, conductor: v.get("--conductor")!,
    project: v.get("--project") ?? "DigiSmith", maxAgeMin, refresh: b.has("--refresh"), noWrite: b.has("--no-write"), now,
  };
}

const KEY = /^DGS-\d+$/;
const TASK_ID = /\b(14z[a-z0-9]{8,})\b/;

/** S12: a key needs its task id first: read it from the board folder (ticket.md or plan.md); else unresolved. */
export function taskIdForKey(key: string, repoRoot: string): string | undefined {
  const board = path.join(repoRoot, ".digismith", "board");
  if (!KEY.test(key) || !fs.existsSync(board)) return undefined;
  for (const dir of fs.readdirSync(board).filter((d) => d.startsWith(`${key}—`) || d.startsWith(`${key}-`))) {
    for (const f of ["ticket.md", "plan.md"]) {
      const p = path.join(board, dir, f);
      if (fs.existsSync(p)) {
        const m = TASK_ID.exec(fs.readFileSync(p, "utf8"));
        if (m) return m[1];
      }
    }
  }
  return undefined;
}

async function clickup(keys: string[]): Promise<ClickUpInfo[]> {
  const root = process.cwd();
  const out: ClickUpInfo[] = [];
  for (const key of keys) {
    const id = taskIdForKey(key, root);
    if (!id) { out.push({ key, unresolved: true }); continue; }
    try {
      const { stdout } = await run("dg", ["clickup", "get-task", id], { timeout: 20_000 });
      const status = (JSON.parse(stdout) as { status?: { status?: string } }).status?.status;
      out.push(status ? { key, status } : { key, unresolved: true });
    } catch {
      out.push({ key, unresolved: true });
    }
  }
  return out;
}

export function realDeps(nowIso?: string): CatchUpDeps {
  return {
    listCards: stub.listCards,
    collectState: stub.collectState,
    renderCatchUp: stub.renderCatchUp,
    resolveNotePath: stub.resolveNotePath,
    readNote: (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : undefined),
    writeStateBlock: stub.writeStateBlock,
    clickup,
    now: () => (nowIso ? new Date(nowIso) : new Date()),
  };
}

export async function main(argv: string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`catch-up: ${(err as Error).message}`);
    return 2;
  }
  try {
    const r = await buildCatchUp(
      { project: args.project, conductor: args.conductor, identity: args.identity, session: args.session, maxAgeMin: args.maxAgeMin, refresh: args.refresh, noWrite: args.noWrite },
      realDeps(args.now),
    );
    console.log(r.text);
    for (const w of r.warnings) console.error(`catch-up: ${w}`);
    if (r.warnings.some((w) => w.startsWith("conductor note not found"))) return 3;
    if (r.warnings.some((w) => w.startsWith("catch-up note write failed"))) return 4;
    return 0;
  } catch (err) {
    console.error(`catch-up: ${(err as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
