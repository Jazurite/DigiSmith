import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { depotDir } from "./depot-dir.ts";

export { depotDir };

export const ROLES = ["maestro", "conductor", "worker", "scout", "reviewer", "observer"] as const;
export const STATUSES = ["open", "closed", "lost"] as const;
export type Role = (typeof ROLES)[number];
export type Status = (typeof STATUSES)[number];

export type SessionCard = {
  name: string;
  role: Role;
  id: string;
  session: string;
  under?: string;
  domain: string;
  mandate?: string;
  state?: string;
  reviewer_type?: "task" | "ticket";
  seat?: string;
  runs_on: string;
  machine?: string;
  created_by: string;
  started: string;
  last_seen: string;
  status: Status;
  ended?: string;
  result?: string;
};

export type CardRef = { project: string; id: string; session: string };

// Field order is the file order.
const FIELDS = [
  "name", "role", "id", "session", "under", "domain", "mandate", "state", "reviewer_type", "seat", "runs_on", "machine",
  "created_by", "started", "last_seen", "status", "ended", "result",
] as const;
const ALWAYS = ["name", "role", "id", "session", "domain", "runs_on", "created_by", "started", "last_seen", "status"];
const MAX_VALUE = 300;
const MAX_RESULT = 200;

// The legal parent roles of each role. A one-card check cannot see the parent, so
// this is only exported for checks that hold two cards (the sweep).
export const LEGAL_PARENT_ROLES: Record<Role, readonly Role[]> = {
  maestro: [],
  conductor: ["maestro"],
  worker: ["conductor", "maestro"],
  scout: ["conductor", "maestro", "worker"],
  reviewer: ["conductor", "maestro"],
  observer: ["conductor", "maestro"],
};

export class CardError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(errors.join("; "));
    this.name = "CardError";
    this.errors = errors;
  }
}

const REVIEWER_TYPES = ["task", "ticket"] as const; // keep equal to packages/cli/src/reviewer/types.ts (a test checks it)
const SEAT_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SAFE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/; // a file or folder name part: no slash, no leading dot
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

const SECRET_PATTERNS: RegExp[] = [
  
  /\bgh[pousr]_[A-Za-z0-9]{16,}/,
  /github_pat_[A-Za-z0-9_]{8,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{8,}/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bAIza[A-Za-z0-9_-]{20,}/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/,
  /-----BEGIN [A-Z ]*KEY/,
  /:\/\/[^/\s:@]+:[^/\s@]+@/,
];

export function looksSecret(value: string): boolean {
  if (SECRET_PATTERNS.some((re) => re.test(value))) return true;
  for (const m of value.matchAll(/\bsk[-_][A-Za-z0-9_-]{16,}/g)) {
    if (/[A-Za-z]/.test(m[0]) && /\d/.test(m[0])) return true; // a key mixes letters and digits; "sk-learn-..." does not
  }
  // an unbroken run of 32+ base64-ish characters with both a letter and a digit
  for (const m of value.matchAll(/(?<![A-Za-z0-9+=])[A-Za-z0-9+=]{32,}(?![A-Za-z0-9+=])/g)) {
    if (/^[0-9a-f]+$/.test(m[0])) continue; // a git sha or hex id is not a secret
    if (/[A-Za-z]/.test(m[0]) && /\d/.test(m[0])) return true;
  }
  return false;
}

function parseTs(value: string): number | undefined {
  const m = TS_RE.exec(value);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s, off] = m;
  const [Y, M, D, H, I, S] = [y, mo, d, h, mi, s ?? "0"].map(Number);
  const check = new Date(Date.UTC(Y, M - 1, D, H, I, S));
  if (check.getUTCFullYear() !== Y || check.getUTCMonth() !== M - 1 || check.getUTCDate() !== D) return undefined;
  if (H > 23 || I > 59 || S > 59) return undefined;
  if (off !== "Z") {
    const oh = Number(off.slice(1, 3));
    const om = Number(off.slice(4, 6));
    if (oh > 14 || om > 59) return undefined;
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : t;
}

export function validateCard(input: unknown): { ok: true; card: SessionCard } | { ok: false; errors: string[] } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["card: must be an object of fields"] };
  }
  const c = input as Record<string, unknown>;
  const errors: string[] = [];
  const known = new Set<string>(FIELDS);
  for (const k of Object.keys(c)) if (!known.has(k) && c[k] !== undefined) errors.push(`${k}: unknown field`);

  const present = (f: string) => c[f] !== undefined;
  const str = (f: string): string | undefined => {
    const v = c[f];
    if (v === undefined) return undefined;
    if (typeof v !== "string") { errors.push(`${f}: must be a string`); return undefined; }
    if (v === "" || v.trim() === "") { errors.push(`${f}: must not be empty`); return undefined; }
    if (/[\r\n]/.test(v)) { errors.push(`${f}: must be a single line`); return undefined; }
    if (v.length > (f === "result" ? MAX_RESULT : MAX_VALUE)) { errors.push(`${f}: too long`); return undefined; }
    if (looksSecret(v)) { errors.push(`${f}: looks like a secret (refused)`); return undefined; }
    return v;
  };

  for (const f of ALWAYS) if (!present(f)) errors.push(`${f}: required`);
  const v: Record<string, string | undefined> = {};
  for (const f of FIELDS) v[f] = str(f);

  if (v.role !== undefined && !(ROLES as readonly string[]).includes(v.role)) {
    errors.push(`role: must be one of ${ROLES.join(", ")}`);
  }
  if (v.status !== undefined && !(STATUSES as readonly string[]).includes(v.status)) {
    errors.push(`status: must be one of ${STATUSES.join(", ")}`);
  }
  for (const f of ["id", "under"]) {
    if (v[f] !== undefined && (!ID_RE.test(v[f]!) || v[f]!.length > 64)) errors.push(`${f}: must be lowercase words joined by hyphens, at most 64 characters`);
  }
  for (const f of ["session", "domain"]) {
    if (v[f] !== undefined && (!SAFE_RE.test(v[f]!) || v[f]!.length > 128)) errors.push(`${f}: must be letters, digits, dot, underscore or hyphen (a file or folder name)`);
  }
  if (v.under !== undefined && v.under === v.id) errors.push("under: must not be the card's own id");

  const ts: Record<string, number | undefined> = {};
  for (const f of ["started", "last_seen", "ended"]) {
    if (v[f] === undefined) continue;
    ts[f] = parseTs(v[f]!);
    if (ts[f] === undefined) errors.push(`${f}: must be an ISO 8601 date and time with an explicit offset, like 2026-10-13T13:40+07:00`);
  }
  if (ts.started !== undefined && ts.last_seen !== undefined && ts.last_seen < ts.started) errors.push("last_seen: must not be before started");

  const role = v.role;
  if (role !== undefined && (ROLES as readonly string[]).includes(role)) {
    if (role === "maestro") {
      if (present("under")) errors.push("under: a maestro has no under (it answers to Jack)");
    } else if (!present("under")) errors.push(`under: required for role ${role}`);
    if (role === "maestro") {
      if (!present("machine")) errors.push("machine: required for role maestro");
    } else if (present("machine")) errors.push("machine: only a maestro has a machine");
    if (["conductor", "worker", "scout", "reviewer"].includes(role) && !present("mandate")) errors.push(`mandate: required for role ${role}`);
    if (["conductor", "maestro"].includes(role) && !present("state")) errors.push(`state: required for role ${role}`);
    if (present("reviewer_type")) {
      if (role !== "reviewer") errors.push("reviewer_type: only a reviewer has a reviewer_type");
      else if (!(REVIEWER_TYPES as readonly string[]).includes(v.reviewer_type ?? "")) errors.push(`reviewer_type: must be one of ${REVIEWER_TYPES.join(", ")}`);
    }
    if (present("seat")) {
      if (role !== "worker" && role !== "reviewer") errors.push("seat: only a worker or a reviewer has a seat");
      else if (v.seat !== undefined && !SEAT_RE.test(v.seat)) errors.push("seat: must be a short account name, like dev0 or jack");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  const card: Record<string, string> = {};
  for (const f of FIELDS) if (v[f] !== undefined) card[f] = v[f]!;
  return { ok: true, card: card as unknown as SessionCard };
}

function assertValid(input: unknown): SessionCard {
  const r = validateCard(input);
  if (r.ok === false) throw new CardError(r.errors);
  return r.card;
}

function needsQuote(v: string): boolean {
  return /^\s|\s$|: | #|^["'#]/.test(v);
}

export function formatCard(card: SessionCard): string {
  const c = assertValid(card) as unknown as Record<string, string>;
  return FIELDS.filter((f) => c[f] !== undefined).map((f) => `${f}: ${needsQuote(c[f]) ? JSON.stringify(c[f]) : c[f]}`).join("\n") + "\n";
}

export function parseCard(text: string): SessionCard {
  const fields: Record<string, string> = {};
  const errors: string[] = [];
  text.replace(/^﻿/, "").split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === "" || line.trimStart().startsWith("#")) return;
    const m = /^([a-z_]+):(?: (.*))?$/.exec(line);
    if (!m) { errors.push(`line ${i + 1}: not a "key: value" line`); return; }
    let value = (m[2] ?? "").trim();
    if (value.startsWith('"')) {
      try { value = JSON.parse(value) as string; } catch { errors.push(`line ${i + 1}: bad quoted value`); return; }
    }
    if (m[1] in fields) { errors.push(`${m[1]}: duplicate field`); return; }
    fields[m[1]] = value;
  });
  if (errors.length > 0) throw new CardError(errors);
  return assertValid(fields);
}

// ---- depot layout ----

function safeName(label: string, value: string): string {
  if (!SAFE_RE.test(value) || value.length > 128) throw new Error(`${label}: not a safe folder or file name`);
  return value;
}

function sessionsDir(project: string, env: NodeJS.ProcessEnv): string {
  return path.join(depotDir(env), "sessions", safeName("project", project));
}
export function cardsDir(project: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(sessionsDir(project, env), "cards");
}
export function archiveDir(project: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(sessionsDir(project, env), "archive");
}
function fileName(id: string, session: string): string {
  if (!ID_RE.test(id)) throw new Error("id: not a valid card id");
  return `${id}--${safeName("session", session)}.yml`;
}
export function cardPath(card: Pick<SessionCard, "domain" | "id" | "session">, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(cardsDir(card.domain, env), fileName(card.id, card.session));
}

export function nowIso(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 16) + "+07:00";
}

// onlyIfExists: the target must still exist right before the rename (touch must never
// recreate a card a close has just archived). A skipped temp file is renamed aside, never deleted.
function writeAtomic(file: string, content: string, opts: { onlyIfExists?: boolean; beforeRename?: () => void } = {}): boolean {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  const fd = fs.openSync(tmp, "wx", 0o644);
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  opts.beforeRename?.();
  if (opts.onlyIfExists && !fs.existsSync(file)) {
    fs.renameSync(tmp, tmp + ".abandoned");
    return false;
  }
  try {
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    try { fs.renameSync(tmp, tmp + ".failed"); } catch { /* leave the temp file; never delete */ }
    throw e;
  }
}

export function readCard(file: string): SessionCard {
  return parseCard(fs.readFileSync(file, "utf-8"));
}

export function writeCard(card: SessionCard, env: NodeJS.ProcessEnv = process.env): string {
  const content = formatCard(card); // validates first: nothing is written for a bad card
  const file = cardPath(card, env);
  // Never replace a card: a refresh is touchCard. (Also catches names that fold together on a case-insensitive disk.)
  if (fs.existsSync(file)) throw new Error(`an open card already exists: ${path.basename(file)}`);
  writeAtomic(file, content);
  return file;
}

function ymlFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".yml") && !f.startsWith(".")).sort().map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function scopeDirs(project: string, scope: "open" | "archive" | "all", env: NodeJS.ProcessEnv): string[] {
  const dirs: string[] = [];
  if (scope !== "archive") dirs.push(cardsDir(project, env));
  if (scope !== "open") dirs.push(archiveDir(project, env));
  return dirs;
}

export function listCards(
  project: string,
  opts: { scope?: "open" | "archive" | "all"; env?: NodeJS.ProcessEnv } = {},
): { card: SessionCard; path: string }[] {
  const out: { card: SessionCard; path: string }[] = [];
  for (const dir of scopeDirs(project, opts.scope ?? "all", opts.env ?? process.env)) {
    for (const file of ymlFiles(dir)) {
      try { out.push({ card: readCard(file), path: file }); } catch { /* reported by listCardProblems */ }
    }
  }
  return out;
}

export function listCardProblems(project: string, env: NodeJS.ProcessEnv = process.env): { path: string; errors: string[] }[] {
  const out: { path: string; errors: string[] }[] = [];
  for (const dir of scopeDirs(project, "all", env)) {
    for (const file of ymlFiles(dir)) {
      try { readCard(file); } catch (e) { out.push({ path: file, errors: e instanceof CardError ? e.errors : [(e as Error).message] }); }
    }
  }
  return out;
}

function refPaths(ref: CardRef, env: NodeJS.ProcessEnv): { open: string; archived: string } {
  const name = fileName(ref.id, ref.session);
  return { open: path.join(cardsDir(ref.project, env), name), archived: path.join(archiveDir(ref.project, env), name) };
}

// Finds one card by ref, open first, then archived.
export function findCard(ref: CardRef, env: NodeJS.ProcessEnv = process.env): { card: SessionCard; path: string } | undefined {
  const p = refPaths(ref, env);
  for (const file of [p.open, p.archived]) {
    if (!fs.existsSync(file)) continue;
    const card = readCard(file);
    if (card.id === ref.id && card.session === ref.session) return { card, path: file };
  }
  return undefined;
}

export function touchCard(
  ref: CardRef,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
  beforeRename?: () => void, // test seam: runs between the temp write and the rename
): SessionCard {
  const p = refPaths(ref, env);
  if (!fs.existsSync(p.open)) throw new Error(`no open card for ${ref.id} (${ref.session}) in ${ref.project}`);
  const card = readCard(p.open);
  if (card.status !== "open") throw new Error(`card ${ref.id} is ${card.status}, not open`);
  const next = assertValid({ ...card, last_seen: nowIso(now) });
  // If a close archived the card meanwhile, the write is skipped: a touch never resurrects a card.
  writeAtomic(p.open, formatCard(next), { onlyIfExists: true, beforeRename });
  return next;
}

// Rewrites the open card with its end state, then renames it into archive/. Nothing is deleted.
function archiveWith(
  ref: CardRef,
  status: "closed" | "lost",
  opts: { now?: Date; result?: string; env?: NodeJS.ProcessEnv; betweenRewriteAndRename?: () => void },
): string {
  const env = opts.env ?? process.env;
  const p = refPaths(ref, env);
  if (!fs.existsSync(p.open)) {
    if (fs.existsSync(p.archived)) return p.archived;
    throw new Error(`no card for ${ref.id} (${ref.session}) in ${ref.project}`);
  }
  const card = readCard(p.open);
  const next = assertValid({
    ...card, status, ended: nowIso(opts.now),
    ...(opts.result !== undefined ? { result: opts.result } : {}),
  });
  const content = formatCard(next);
  writeAtomic(p.open, content);
  opts.betweenRewriteAndRename?.();
  // An archived card is never overwritten: a second archive of the same session gets <id>--<session>--<n>.yml.
  const base = p.archived;
  let target = base;
  for (let n = 2; fs.existsSync(target); n++) target = base.replace(/\.yml$/, `--${n}.yml`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(p.open, target);
  // A stale touch may have landed between the rewrite and the rename: the archived card keeps the end state.
  if (readCard(target).status !== status) writeAtomic(target, content);
  return target;
}

export function closeCard(ref: CardRef, opts: { now?: Date; result?: string; env?: NodeJS.ProcessEnv; betweenRewriteAndRename?: () => void } = {}): string {
  return archiveWith(ref, "closed", opts);
}

export function markLost(ref: CardRef, opts: { now?: Date; result?: string; env?: NodeJS.ProcessEnv; betweenRewriteAndRename?: () => void } = {}): string {
  return archiveWith(ref, "lost", opts);
}

export function newestLastSeen(project: string, id: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  let best: { t: number; s: string } | undefined;
  for (const { card } of listCards(project, { env })) {
    if (card.id !== id) continue;
    const t = parseTs(card.last_seen)!;
    if (!best || t > best.t) best = { t, s: card.last_seen };
  }
  return best?.s;
}

export function findCardBySession(
  session: string,
  project?: string,
  env: NodeJS.ProcessEnv = process.env,
): { card: SessionCard; path: string } | undefined {
  if (!SAFE_RE.test(session) || session.length > 128) return undefined;
  let projects: string[];
  if (project !== undefined) projects = [project];
  else {
    try {
      projects = fs.readdirSync(path.join(depotDir(env), "sessions"), { withFileTypes: true })
        .filter((d) => d.isDirectory() && SAFE_RE.test(d.name)).map((d) => d.name).sort();
    } catch {
      return undefined;
    }
  }
  const suffix = `--${session}.yml`;
  for (const proj of projects) {
    for (const file of ymlFiles(cardsDir(proj, env))) {
      if (!file.endsWith(suffix)) continue;
      try {
        const card = readCard(file);
        if (card.session === session && card.status === "open") return { card, path: file };
      } catch { /* skipped; listCardProblems reports it */ }
    }
  }
  return undefined;
}
