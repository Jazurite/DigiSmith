import * as fs from "node:fs";
import * as path from "node:path";
import { depotDir } from "../depot-dir.ts";

export type Kind = "project" | "factory" | "standing" | "ticket";

export interface ConductorEntry {
  key: string;            // "Project/name"
  project: string;
  name: string;
  note?: string;
  session: string;        // "default" when absent
  workspace?: string;     // id in `session`
  floor?: string;         // Floor workspace id in "default"
  kinds: Kind[];          // ["project"] when absent
  ticket?: string;
  under?: string;
  status: "open" | "closed";
}

const KINDS: readonly Kind[] = ["project", "factory", "standing", "ticket"];
const SESSION = /^[A-Za-z][\w-]*$/;
const WORKSPACE = /^w\d+$/;

function file(env?: NodeJS.ProcessEnv): string {
  return path.join(depotDir(env), "conductors.json");
}

function readRaw(env?: NodeJS.ProcessEnv): Record<string, unknown> {
  const p = file(env);
  let text: string;
  try {
    text = fs.readFileSync(p, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`conductors.json at ${p} is not valid JSON: ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`conductors.json at ${p} must hold a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function normalize(key: string, raw: unknown): ConductorEntry {
  const slash = key.indexOf("/");
  if (slash <= 0 || slash === key.length - 1) throw new Error(`conductor key "${key}" must be Project/name`);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${key}: entry must be an object`);
  const r = raw as Record<string, unknown>;
  const str = (field: string): string | undefined => {
    const v = r[field];
    if (v === undefined) return undefined;
    if (typeof v !== "string") throw new Error(`${key}: ${field} must be a string`);
    return v;
  };

  const session = str("session") ?? "default";
  if (!SESSION.test(session)) throw new Error(`${key}: session "${session}" is not a valid session name`);
  const workspace = str("workspace");
  if (workspace !== undefined && !WORKSPACE.test(workspace)) throw new Error(`${key}: workspace "${workspace}" must match ^w\\d+$`);
  const floor = str("floor") ?? (session === "default" ? workspace : undefined);
  if (floor !== undefined && !WORKSPACE.test(floor)) throw new Error(`${key}: floor "${floor}" must match ^w\\d+$`);

  let kinds: Kind[] = ["project"];
  if (r.kind !== undefined) {
    const list: unknown[] = Array.isArray(r.kind) ? r.kind : [r.kind];
    if (list.length === 0) throw new Error(`${key}: kind must list at least one kind`);
    for (const k of list) {
      if (!KINDS.includes(k as Kind)) throw new Error(`${key}: unknown kind ${JSON.stringify(k)}`);
    }
    kinds = list as Kind[];
  }

  const status = str("status") ?? "open";
  if (status !== "open" && status !== "closed") throw new Error(`${key}: unknown status "${status}"`);

  return {
    key,
    project: key.slice(0, slash),
    name: key.slice(slash + 1),
    note: str("note"),
    session,
    workspace,
    floor,
    kinds,
    ticket: str("ticket"),
    under: str("under"),
    status,
  };
}

export interface RegistryProblem {
  key: string;
  message: string;
}

/** Every valid entry, and the problems of the invalid ones; only an unreadable file throws. */
export function readRegistryChecked(env?: NodeJS.ProcessEnv): { entries: Record<string, ConductorEntry>; problems: RegistryProblem[] } {
  const entries: Record<string, ConductorEntry> = {};
  const problems: RegistryProblem[] = [];
  for (const [key, raw] of Object.entries(readRaw(env))) {
    try {
      entries[key] = normalize(key, raw);
    } catch (err) {
      problems.push({ key, message: (err as Error).message });
    }
  }
  return { entries, problems };
}

/** Strict: throws on the first invalid entry. */
export function readRegistry(env?: NodeJS.ProcessEnv): Record<string, ConductorEntry> {
  const { entries, problems } = readRegistryChecked(env);
  if (problems.length > 0) throw new Error(problems[0].message);
  return entries;
}

/** One entry. Another entry's problem does not matter here; this entry's own problem throws. */
export function resolveConductor(key: string, env?: NodeJS.ProcessEnv): ConductorEntry | undefined {
  const { entries, problems } = readRegistryChecked(env);
  const own = problems.find((p) => p.key === key);
  if (own) throw new Error(own.message);
  return entries[key];
}

export function findByKind(kind: Kind, env?: NodeJS.ProcessEnv): ConductorEntry[] {
  return Object.values(readRegistryChecked(env).entries).filter((e) => e.status === "open" && e.kinds.includes(kind));
}

export function floorWorkspaces(env?: NodeJS.ProcessEnv): string[] {
  const floors = new Set<string>();
  for (const e of Object.values(readRegistryChecked(env).entries)) if (e.floor !== undefined) floors.add(e.floor);
  return [...floors].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export function herdrSessionArgs(e: Pick<ConductorEntry, "session">): string[] {
  return ["--session", e.session];
}

export function scopeFor(e: ConductorEntry, env?: NodeJS.ProcessEnv): string {
  if (e.workspace === undefined) throw new Error(`${e.key}: no workspace, so no herdr scope`);
  if (e.session === "default") return `default:${e.workspace}`;
  return [`${e.session}:${e.workspace}`, ...floorWorkspaces(env).map((f) => `default:${f}`)].join(",");
}

function writeAtomic(data: Record<string, unknown>, env?: NodeJS.ProcessEnv): void {
  const p = file(env);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
    fs.renameSync(tmp, p);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

export function putEntry(key: string, raw: Record<string, unknown>, env?: NodeJS.ProcessEnv): void {
  normalize(key, raw);
  const all = readRaw(env);
  all[key] = raw;
  writeAtomic(all, env);
}

export function removeEntry(key: string, env?: NodeJS.ProcessEnv): boolean {
  const all = readRaw(env);
  if (!Object.prototype.hasOwnProperty.call(all, key)) return false;
  delete all[key];
  writeAtomic(all, env);
  return true;
}
