// Maestro identity records (DGS-411): ~/.digismith-depot/identities/<id>.yml. No secrets, live data stays in the depot.
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { depotDir, looksSecret } from "./session-card.ts";

export type Identity = {
  id: string;
  name: string;
  owner: string;
  project: string;
  folder: string;
  conductors: string[];
  role: "maestro";
  machine: string;
  state: string;
  created: string;
};

const FIELDS = ["id", "name", "owner", "project", "folder", "conductors", "role", "machine", "state", "created"] as const;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SAFE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(Z|[+-]\d{2}:\d{2})$/;
const MAX = 300;

export class IdentityError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(errors.join("; "));
    this.name = "IdentityError";
    this.errors = errors;
  }
}

export function identitiesDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(depotDir(env), "identities");
}

export function validateIdentity(input: unknown): { ok: true; identity: Identity } | { ok: false; errors: string[] } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, errors: ["identity: must be an object of fields"] };
  const c = input as Record<string, unknown>;
  const errors: string[] = [];
  const known = new Set<string>(FIELDS);
  for (const k of Object.keys(c)) if (!known.has(k) && c[k] !== undefined) errors.push(`${k}: unknown field`);
  const str = (f: string, v: unknown): string | undefined => {
    if (v === undefined) { errors.push(`${f}: required`); return undefined; }
    if (typeof v !== "string" || v.trim() === "") { errors.push(`${f}: must be a non-empty string`); return undefined; }
    if (/[\r\n]/.test(v)) { errors.push(`${f}: must be a single line`); return undefined; }
    if (v.length > MAX) { errors.push(`${f}: too long`); return undefined; }
    if (looksSecret(v)) { errors.push(`${f}: looks like a secret (refused)`); return undefined; }
    return v;
  };
  const s: Record<string, string | undefined> = {};
  for (const f of FIELDS) if (f !== "conductors") s[f] = str(f, c[f]);
  if (s.id !== undefined && (!ID_RE.test(s.id) || s.id.length > 64)) errors.push("id: must be lowercase words joined by hyphens, at most 64 characters");
  if (s.project !== undefined && (!SAFE_RE.test(s.project) || s.project.length > 128)) errors.push("project: must be a folder-name-like word");
  if (s.folder !== undefined && !path.isAbsolute(s.folder)) errors.push("folder: must be an absolute path");
  if (s.state !== undefined && !path.isAbsolute(s.state)) errors.push("state: must be an absolute path");
  if (s.role !== undefined && s.role !== "maestro") errors.push("role: must be maestro");
  if (s.created !== undefined && !TS_RE.test(s.created)) errors.push("created: must be an ISO 8601 date and time with an explicit offset");
  const cond = c.conductors;
  let conductors: string[] = [];
  if (!Array.isArray(cond) || cond.length === 0) errors.push("conductors: must be a non-empty list");
  else {
    for (const x of cond) {
      if (typeof x !== "string" || !ID_RE.test(x) || x.length > 64) errors.push("conductors: each must be lowercase words joined by hyphens");
    }
    conductors = cond as string[];
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, identity: { ...(s as unknown as Identity), conductors } };
}

function needsQuote(v: string): boolean {
  return /^\s|\s$|: | #|^["'#\[]|,/.test(v);
}
const q = (v: string) => (needsQuote(v) ? JSON.stringify(v) : v);

export function formatIdentity(identity: Identity): string {
  const r = validateIdentity(identity);
  if (r.ok === false) throw new IdentityError(r.errors);
  const i = r.identity as unknown as Record<string, string | string[]>;
  return FIELDS.map((f) => (f === "conductors" ? `conductors: [${(i[f] as string[]).join(", ")}]` : `${f}: ${q(i[f] as string)}`)).join("\n") + "\n";
}

export function parseIdentity(text: string): Identity {
  const fields: Record<string, unknown> = {};
  const errors: string[] = [];
  text.replace(/^﻿/, "").split(/\r?\n/).forEach((line, n) => {
    if (line.trim() === "" || line.trimStart().startsWith("#")) return;
    const m = /^([a-z_]+):(?: (.*))?$/.exec(line);
    if (!m) { errors.push(`line ${n + 1}: not a "key: value" line`); return; }
    let value: unknown = (m[2] ?? "").trim();
    if (m[1] in fields) { errors.push(`${m[1]}: duplicate field`); return; }
    if (m[1] === "conductors") {
      const l = /^\[(.*)\]$/.exec(value as string);
      if (!l) { errors.push(`line ${n + 1}: conductors must be [a, b]`); return; }
      value = l[1].split(",").map((x) => x.trim()).filter((x) => x !== "");
    } else if ((value as string).startsWith('"')) {
      try { value = JSON.parse(value as string); } catch { errors.push(`line ${n + 1}: bad quoted value`); return; }
    }
    fields[m[1]] = value;
  });
  if (errors.length > 0) throw new IdentityError(errors);
  const r = validateIdentity(fields);
  if (r.ok === false) throw new IdentityError(r.errors);
  return r.identity;
}

export function writeIdentity(input: unknown, env: NodeJS.ProcessEnv = process.env): string {
  const r = validateIdentity(input);
  if (r.ok === false) throw new IdentityError(r.errors);
  const content = formatIdentity(r.identity);
  const dir = identitiesDir(env);
  const file = path.join(dir, `${r.identity.id}.yml`);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) throw new Error(`an identity record already exists: ${path.basename(file)} (edit it by hand)`);
  const tmp = path.join(dir, `.${r.identity.id}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  fs.writeFileSync(tmp, content, { flag: "wx", mode: 0o644 });
  fs.renameSync(tmp, file);
  return file;
}

export function readIdentity(id: string, env: NodeJS.ProcessEnv = process.env): Identity | undefined {
  if (!ID_RE.test(id) || id.length > 64) return undefined;
  try {
    return parseIdentity(fs.readFileSync(path.join(identitiesDir(env), `${id}.yml`), "utf8"));
  } catch {
    return undefined;
  }
}

export function listIdentities(env: NodeJS.ProcessEnv = process.env): Identity[] {
  let files: string[];
  try {
    files = fs.readdirSync(identitiesDir(env)).filter((f) => f.endsWith(".yml") && !f.startsWith(".")).sort();
  } catch {
    return [];
  }
  const out: Identity[] = [];
  for (const f of files) {
    try { out.push(parseIdentity(fs.readFileSync(path.join(identitiesDir(env), f), "utf8"))); } catch { /* a bad record never breaks a session start */ }
  }
  return out;
}

export function findByFolder(folder: string, env: NodeJS.ProcessEnv = process.env): { found?: Identity; ambiguous?: string[] } {
  const norm = (p: string) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const want = norm(folder);
  const hits = listIdentities(env).filter((i) => norm(i.folder) === want);
  if (hits.length === 1) return { found: hits[0] };
  if (hits.length > 1) return { ambiguous: hits.map((h) => h.id).sort() };
  return { found: undefined };
}

// The card input for a session of this identity (the SessionStart hook validates it with validateCard).
export function nowStamp(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 16) + "+07:00";
}

export function cardFromIdentity(identity: Identity, session: string, now: Date, env: NodeJS.ProcessEnv) {
  const t = nowStamp(now);
  return {
    name: identity.name,
    role: "maestro",
    id: identity.id,
    session,
    domain: identity.project,
    state: identity.state,
    runs_on: env.SSH_CONNECTION ? "ssh" : "desktop",
    machine: identity.machine,
    created_by: identity.owner,
    started: t,
    last_seen: t,
    status: "open",
  };
}
