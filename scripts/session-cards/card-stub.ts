// STUB of DGS-417's scripts/session-card.ts (API of S1). Deleted at the rebase after 417 merges:
// then cards.ts re-exports from ../session-card.ts instead.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type SessionCard = {
  name: string; role: string; id: string; session: string; under?: string; domain: string;
  mandate?: string; state?: string; runs_on: string; machine?: string; created_by: string;
  started: string; last_seen: string; status: "open" | "closed" | "lost"; ended?: string; result?: string;
};
export type CardRef = { project: string; id: string; session: string };
export const ROLES = ["maestro", "conductor", "worker", "scout", "reviewer", "observer"];
const REQUIRED = ["name", "role", "id", "session", "domain", "runs_on", "created_by", "started", "last_seen", "status"];

export function depotDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.DIGISMITH_DEPOT_DIR || path.join(os.homedir(), ".digismith-depot");
}
export function nowIso(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 7 * 3600_000).toISOString();
  return `${t.slice(0, 16)}+07:00`;
}
export function validateCard(input: unknown): { ok: true; card: SessionCard } | { ok: false; errors: string[] } {
  const c = input as Record<string, unknown>;
  const errors = REQUIRED.filter((k) => typeof c?.[k] !== "string" || !c[k]).map((k) => `${k}: required`);
  if (typeof c?.role === "string" && !ROLES.includes(c.role)) errors.push("role: unknown");
  return errors.length ? { ok: false, errors } : { ok: true, card: c as unknown as SessionCard };
}
const safe = (s: string) => /^[A-Za-z0-9._-]+$/.test(s) && !s.includes("..");
export function cardsDir(project: string, env?: NodeJS.ProcessEnv): string {
  if (!safe(project)) throw new Error("bad project");
  return path.join(depotDir(env), "sessions", project, "cards");
}
export function archiveDir(project: string, env?: NodeJS.ProcessEnv): string {
  return path.join(cardsDir(project, env), "..", "archive");
}
export function cardPath(card: Pick<SessionCard, "domain" | "id" | "session">, env?: NodeJS.ProcessEnv): string {
  if (!safe(card.id) || !safe(card.session)) throw new Error("bad id or session");
  return path.join(cardsDir(card.domain, env), `${card.id}--${card.session}.yml`);
}
export function formatCard(card: SessionCard): string {
  return Object.entries(card).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n";
}
export function parseCard(text: string): SessionCard {
  const o: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^([a-z_]+): (.*)$/.exec(line);
    if (m) o[m[1]] = m[2];
  }
  const v = validateCard(o);
  if (!v.ok) throw new Error(v.errors.join("; "));
  return v.card;
}
export function readCard(file: string): SessionCard {
  return parseCard(fs.readFileSync(file, "utf8"));
}
function atomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
export function writeCard(card: SessionCard, env?: NodeJS.ProcessEnv): string {
  const v = validateCard(card);
  if (!v.ok) throw new Error(v.errors.join("; "));
  const file = cardPath(card, env);
  atomic(file, formatCard(card));
  return file;
}
export function listCards(project: string, opts: { scope?: "open" | "archive" | "all"; env?: NodeJS.ProcessEnv } = {}): { card: SessionCard; path: string }[] {
  const scope = opts.scope ?? "all";
  const dirs = [...(scope !== "archive" ? [cardsDir(project, opts.env)] : []), ...(scope !== "open" ? [archiveDir(project, opts.env)] : [])];
  const out: { card: SessionCard; path: string }[] = [];
  for (const dir of dirs) {
    let names: string[] = [];
    try { names = fs.readdirSync(dir); } catch { /* none */ }
    for (const n of names.filter((x) => x.endsWith(".yml") && !x.startsWith("."))) {
      try { out.push({ card: readCard(path.join(dir, n)), path: path.join(dir, n) }); } catch { /* skipped */ }
    }
  }
  return out;
}
export function findCardBySession(session: string, project?: string, env?: NodeJS.ProcessEnv): { card: SessionCard; path: string } | undefined {
  const root = path.join(depotDir(env), "sessions");
  let projects: string[] = [];
  try { projects = project ? [project] : fs.readdirSync(root); } catch { return undefined; }
  for (const p of projects) {
    const hit = listCards(p, { scope: "open", env }).find((x) => x.card.session === session);
    if (hit) return hit;
  }
  return undefined;
}
function archiveWith(ref: CardRef, patch: Partial<SessionCard>, env?: NodeJS.ProcessEnv): string {
  const from = cardPath({ domain: ref.project, id: ref.id, session: ref.session }, env);
  const to = path.join(archiveDir(ref.project, env), path.basename(from));
  if (!fs.existsSync(from)) return to;
  const card = { ...readCard(from), ...patch } as SessionCard;
  atomic(from, formatCard(card));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  return to;
}
export function touchCard(ref: CardRef, now?: Date, env?: NodeJS.ProcessEnv): SessionCard {
  const file = cardPath({ domain: ref.project, id: ref.id, session: ref.session }, env);
  const card = { ...readCard(file), last_seen: nowIso(now) };
  atomic(file, formatCard(card));
  return card;
}
export function closeCard(ref: CardRef, opts: { now?: Date; result?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const t = nowIso(opts.now);
  return archiveWith(ref, { status: "closed", ended: t, last_seen: t, ...(opts.result ? { result: opts.result } : {}) }, opts.env);
}
export function markLost(ref: CardRef, opts: { now?: Date; env?: NodeJS.ProcessEnv } = {}): string {
  return archiveWith(ref, { status: "lost", ended: nowIso(opts.now) }, opts.env);
}
