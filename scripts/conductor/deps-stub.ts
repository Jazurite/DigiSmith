// STUBS until DGS-417 (cards, depotDir), DGS-422 (collectState, writeStateBlock, note path) and
// DGS-427 (CatchUp, renderCatchUp) merge. At my rebase each import below switches to the merged
// module and this file is deleted. The contracts follow the settled interfaces S1, S4, S5.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type TimeInput = string | { at: string; fromTool: true };
export interface StatePart {
  done: { key: string; line: string; report?: string }[];
  running: { worker: string; key: string; stage: string; since: TimeInput }[];
  waiting: { question: string; since: TimeInput; pane: string }[];
  decided: { decision: string; why: string; allowedBy: string }[];
  parked: { what: string; why: string; next: string }[];
  next: string[];
  health: { seats: { seat: string; fiveHourPct: number; weeklyPct: number }[]; server: string; tabs: string[] };
}
export interface CatchUp extends StatePart {
  conductor: string;
  window: { from: TimeInput; to: TimeInput };
  identity: string;
  askedBy: string;
}
export interface CardRow {
  id: string;
  session: string;
  last_seen: string;
  status: string;
  domain: string;
  role?: string;
}

export function depotDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.DIGISMITH_DEPOT_DIR || path.join(os.homedir(), ".digismith-depot");
}

function parseFlat(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

/** 417: listCards(project, {scope:"all"}) returns {card, path}[]; here just the rows. */
export function listCards(project: string): CardRow[] {
  const rows: CardRow[] = [];
  for (const dir of ["cards", "archive"]) {
    const d = path.join(depotDir(), "sessions", project, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith(".yml") || f.startsWith(".")) continue;
      const c = parseFlat(fs.readFileSync(path.join(d, f), "utf8"));
      if (c.id && c.session && c.last_seen && c.status && c.domain) rows.push(c as unknown as CardRow);
    }
  }
  return rows;
}

/** 417: findCardBySession(session, project?) over open cards. */
export function findCardBySession(session: string, project?: string): CardRow | undefined {
  const base = path.join(depotDir(), "sessions");
  const projects = project ? [project] : fs.existsSync(base) ? fs.readdirSync(base) : [];
  for (const p of projects) {
    const hit = listCards(p).find((c) => c.session === session && c.status === "open");
    if (hit) return hit;
  }
  return undefined;
}

/** 422: collectState. The stub returns an empty state. */
export async function collectState(_opts: { project: string; conductor: string; since: string; notePath?: string }): Promise<StatePart> {
  return { done: [], running: [], waiting: [], decided: [], parked: [], next: [], health: { seats: [], server: "unknown", tabs: [] } };
}

/** 422: note path chain (flag > env > conductors.json > default). The stub: env, then the default. */
export function resolveNotePath(project: string, conductor: string): string | undefined {
  const fromEnv = process.env.DIGISMITH_CONDUCTOR_NOTE;
  if (fromEnv) return fromEnv;
  const p = path.join(depotDir(), "sessions", project, conductor, "note.md");
  return fs.existsSync(p) ? p : undefined;
}

/** 422: writeStateBlock(notePath, text, marker). Replace between the markers, else append at the END; atomic. */
export function writeStateBlock(notePath: string, text: string, marker: { open: string; close: string }): void {
  const old = fs.readFileSync(notePath, "utf8");
  const block = `${marker.open}\n${text}\n${marker.close}`;
  const start = old.indexOf(marker.open);
  const end = start === -1 ? -1 : old.indexOf(marker.close, start);
  let next: string;
  if (start !== -1 && end !== -1) next = old.slice(0, start) + block + old.slice(end + marker.close.length);
  else if (start !== -1) next = `${old.slice(0, start)}${block}\n${old.slice(start + marker.open.length)}`.replace(`${block}\n\n`, `${block}\n`); // orphan open marker: keep every other byte
  else next = `${old}${old.endsWith("\n") ? "" : "\n"}\n${block}\n`;
  const tmp = path.join(path.dirname(notePath), `.${path.basename(notePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, notePath);
}

/** 427: renderCatchUp. The stub prints the first line only. */
export function renderCatchUp(d: CatchUp): string {
  const t = (x: TimeInput) => (typeof x === "string" ? x : x.at);
  return `# Catch-up: ${d.conductor}\nWindow: ${t(d.window.from)} to ${t(d.window.to)} (UTC+7)   Maestro identity: ${d.identity}   Asked by: ${d.askedBy}\n(stub renderer: DGS-427 not merged)`;
}
