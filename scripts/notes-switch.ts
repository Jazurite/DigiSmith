// DGS-443: the per-owner switch of a live note into the depot, one repeatable command.
//   notes-switch.ts <title | workbox.md> [--main <root>] [--repoint [--identities]]
// Step 1 (no --repoint): copy the old note into the depot (never over an existing file), verify it
// byte for byte, record the copy time in <depot>/sessions/<project>/switches.json. The old file is
// only read. Then tell the owner "switch now".
// Step 2 (--repoint, after the owner confirmed): rewrite the `state:` line of open cards (and with
// --identities the identity record) from the old path to the depot path.
// notes-drift.ts later flags any write to the old path after the recorded time.

import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { identitiesDir } from "./identity.ts";
import { cardsDir } from "./session-card.ts";
import { isSafeSessionName, noteLocation, projectName, sessionsRoot, SESSIONS_DIR_PATH } from "./session-path.ts";

export const RUNBOOKS = ["workbox.md", "workbox-macos.md"];

export type SwitchRecord = { old: string; copy: string; at: string; bytes: number };
export type Switches = Record<string, SwitchRecord>;

export function switchesFile(project: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(sessionsRoot(project, env), "switches.json");
}

export function readSwitches(project: string, env: NodeJS.ProcessEnv = process.env): Switches {
  try {
    return JSON.parse(fs.readFileSync(switchesFile(project, env), "utf8")) as Switches;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

function writeSwitches(project: string, switches: Switches, env: NodeJS.ProcessEnv): void {
  const file = switchesFile(project, env);
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(switches, null, 2)}\n`, { flag: "wx" });
  fs.renameSync(tmp, file);
}

// Old and new location of a note (a session title) or a runbook (a file name).
export function noteTarget(mainRoot: string, key: string, env: NodeJS.ProcessEnv = process.env): { old: string; copy: string } {
  const project = projectName(mainRoot);
  const oldDir = path.join(mainRoot, ...SESSIONS_DIR_PATH.split("/"));
  if (RUNBOOKS.includes(key)) return { old: path.join(oldDir, key), copy: path.join(sessionsRoot(project, env), key) };
  if (!isSafeSessionName(key)) throw new Error(`unsafe session title: ${JSON.stringify(key)}`);
  return { old: path.join(oldDir, key, "note.md"), copy: noteLocation(project, key, env) };
}

export type SwitchOpts = { env?: NodeJS.ProcessEnv; now?: () => Date; afterCopy?: () => void };

export function switchNote(mainRoot: string, key: string, opts: SwitchOpts = {}): SwitchRecord {
  const env = opts.env ?? process.env;
  const project = projectName(mainRoot);
  const { old, copy } = noteTarget(mainRoot, key, env);
  const recorded = readSwitches(project, env)[key];
  if (recorded) throw new Error(`${key} already switched at ${recorded.at}`);
  if (!fs.existsSync(old)) throw new Error(`no old note at ${old}`);
  if (fs.existsSync(copy)) throw new Error(`${copy} already exists; this command never overwrites it`);
  const at = (opts.now ?? (() => new Date()))().toISOString();
  const data = fs.readFileSync(old);
  const mtime = fs.statSync(old).mtimeMs;
  fs.mkdirSync(path.dirname(copy), { recursive: true });
  fs.writeFileSync(copy, data, { flag: "wx" });
  opts.afterCopy?.();
  if (!fs.readFileSync(copy).equals(data)) throw new Error(`the copy differs from what was read: ${copy}`);
  if (!fs.readFileSync(old).equals(data) || fs.statSync(old).mtimeMs !== mtime) {
    throw new Error(`${old} changed during the copy: pause the owner, then move the unrecorded copy ${copy} aside by hand (needs Jack) and rerun`);
  }
  const record: SwitchRecord = { old, copy, at, bytes: data.length };
  const all = readSwitches(project, env);
  all[key] = record;
  writeSwitches(project, all, env);
  return record;
}

function rewriteState(file: string, from: string[], to: string): boolean {
  const text = fs.readFileSync(file, "utf8");
  let changed = false;
  const next = text.replace(/^state:[ \t]*(.*)$/m, (line, value: string) => {
    if (!from.includes(value.trim())) return line;
    changed = true;
    return `state: ${to}`;
  });
  if (!changed) return false;
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, next, { flag: "wx" });
  fs.renameSync(tmp, file);
  return true;
}

function ymlFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((n) => n.endsWith(".yml") && !n.startsWith(".")).map((n) => path.join(dir, n)).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export function repointState(
  mainRoot: string,
  key: string,
  opts: { env?: NodeJS.ProcessEnv; identities?: boolean } = {},
): { cards: string[]; identities: string[] } {
  const env = opts.env ?? process.env;
  const project = projectName(mainRoot);
  const record = readSwitches(project, env)[key];
  if (!record) throw new Error(`${key} not switched yet: run the switch step first`);
  const from = [record.old, path.relative(mainRoot, record.old)];
  const cards = ymlFiles(cardsDir(project, env)).filter(
    (f) => /^status:[ \t]*open[ \t]*$/m.test(fs.readFileSync(f, "utf8")) && rewriteState(f, from, record.copy),
  );
  const identities = opts.identities ? ymlFiles(identitiesDir(env)).filter((f) => rewriteState(f, from, record.copy)) : [];
  return { cards, identities };
}

export function main(): void {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.includes(`--${name}`);
  const mainIdx = argv.indexOf("--main");
  const mainArg = mainIdx >= 0 ? argv[mainIdx + 1] : undefined;
  const key = argv.find((a, i) => !a.startsWith("--") && i !== mainIdx + 1);
  try {
    if (!key) throw new Error("usage: notes-switch.ts <title | workbox.md> [--main <root>] [--repoint [--identities]]");
    const mainRoot = mainArg ?? process.cwd();
    if (flag("repoint")) {
      const r = repointState(mainRoot, key, { identities: flag("identities") });
      console.log(`repointed ${r.cards.length} card(s), ${r.identities.length} identity record(s)`);
      for (const f of [...r.cards, ...r.identities]) console.log(f);
    } else {
      const r = switchNote(mainRoot, key);
      console.log(`copied and verified (${r.bytes} bytes), switch time ${r.at}\n${r.old}\n-> ${r.copy}\nTell the owner: switch now. Then run with --repoint.`);
    }
  } catch (err) {
    console.error(`notes-switch: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) main();
