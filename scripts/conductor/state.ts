// collectState: one answer to "what is going on", from the conductor's note, git, herdr and the session cards.
import * as fs from "node:fs";
import * as path from "node:path";
import { depotDir } from "../depot-dir.ts";
import type { CatchUp } from "../catch-up.ts";
import { extractBlock, parseStateBody, STATE_MARKER, type DecidedRow, type ParkedRow, type RunningRow, type Seat, type WaitingRow } from "./state-block.ts";
import type { Runner } from "./runner.ts";
import { stripMarkers } from "./markers.ts";
import { newestMtime } from "./watch.ts";
import { currentCount } from "../../packages/cli/src/run/limit-check.ts";
import { limitLine } from "../../packages/cli/src/run/limit.ts";

/** an item or block content older than this is flagged in Health (DGS-577) */
export const STALE_AFTER_MS = 2 * 24 * 3600_000;

export interface DoneRow {
  key: string;
  line: string;
  report?: string;
}

export type SourceState = "ok" | "missing" | "failed" | "skipped" | "stub";

/** DGS-427's CatchUp fields, minus the four that DGS-428 adds (conductor, window, identity, askedBy). */
export type CatchUpState = Omit<CatchUp, "window" | "identity" | "askedBy" | "conductor">;

export interface State extends CatchUpState {
  version: 1;
  project: string;
  conductor: string;
  asOf: string;
  note: { path: string; found: boolean; blockFound: boolean; updated?: string; changed?: string; watch?: string[]; stale?: boolean; main?: string };
  /** newest merge on origin/main (plugin version bumps do not count) */
  newestMerge?: { time: string; hash: string };
  done: DoneRow[];
  running: RunningRow[];
  waiting: WaitingRow[];
  decided: DecidedRow[];
  parked: ParkedRow[];
  next: string[];
  health: { seats: Seat[]; server: string; tabs: string[]; limits?: string };
  sources: { note: SourceState; cards: SourceState; git: SourceState; herdr: SourceState; clickup: SourceState };
  warnings: string[];
}

export interface CollectOpts {
  project: string;
  conductor: string;
  note?: string;
  since?: string;
  herdrWorkspace?: string;
  repoDir: string;
}

export interface CardRef {
  card: { name?: string; role?: string; domain?: string; id?: string; under?: string; runs_on?: string; started: string };
  path: string;
}

export interface CollectDeps {
  runner: Runner;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  listCards?: (project: string, opts: { scope: "open" }) => CardRef[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO time at UTC+7, e.g. 2026-10-13T14:05:00+07:00 */
export function iso7(d: Date): string {
  const t = new Date(d.getTime() + 7 * 3600_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}+07:00`;
}

export function startOfDay7(d: Date): string {
  return `${iso7(d).slice(0, 10)}T00:00:00+07:00`;
}

export function resolveNotePath(args: { project: string; conductor: string; note?: string }, env: NodeJS.ProcessEnv = process.env): string {
  if (args.note) return args.note;
  if (env.DIGISMITH_CONDUCTOR_NOTE) return env.DIGISMITH_CONDUCTOR_NOTE;
  const depot = depotDir(env);
  try {
    const map = JSON.parse(fs.readFileSync(path.join(depot, "conductors.json"), "utf-8")) as Record<string, { note?: string }>;
    const hit = map[`${args.project}/${args.conductor}`]?.note;
    if (typeof hit === "string" && hit) return hit;
  } catch {
    // no or broken conductors.json: fall through to the default
  }
  return path.join(depot, "sessions", args.project, args.conductor, "note.md");
}

function findReport(repoDir: string, key: string): string | undefined {
  try {
    const board = path.join(repoDir, ".digismith", "board");
    for (const d of fs.readdirSync(board)) {
      if (!d.startsWith(`${key}—`)) continue;
      for (const w of fs.readdirSync(path.join(board, d))) {
        if (w.startsWith("worker-") && fs.existsSync(path.join(board, d, w, "report.html"))) {
          return `.digismith/board/${d}/${w}/report.html`;
        }
      }
    }
  } catch {
    // no board folder: no report link
  }
  return undefined;
}

const days = (ms: number) => Math.floor(ms / 86_400_000);

/** Age and watch warnings: item age, block content age, project files newer than the block content (DGS-577). */
function ageWarnings(state: State, now: Date, runningUnknown: boolean): void {
  if (!state.note.blockFound) return;
  const w = state.warnings;
  const changed = state.note.changed;
  if (changed) {
    const age = now.getTime() - Date.parse(changed);
    if (age > STALE_AFTER_MS) w.push(`state block content unchanged for ${days(age)} days (since ${changed}): Parked, Decided and Next may be old`);
  } else {
    w.push("state block content change time not recorded (the next refresh that changes it records it)");
  }
  const old = (since: string) => {
    const age = now.getTime() - Date.parse(since);
    return age > STALE_AFTER_MS ? days(age) : undefined;
  };
  if (!runningUnknown) {
    for (const r of state.running) {
      const d = old(r.since);
      if (d !== undefined) w.push(`Running item "${r.worker} | ${r.key}" is ${d} days old`);
    }
  }
  for (const r of state.waiting) {
    const d = old(r.since);
    if (d !== undefined) w.push(`Waiting item "${r.question.slice(0, 50)}" is ${d} days old`);
  }
  const base = changed ?? state.note.updated;
  for (const p of state.note.watch ?? []) {
    const hit = newestMtime(p);
    if (!hit) w.push(`watch path ${p} not found`);
    else if (base && hit.time.getTime() > Date.parse(base)) {
      w.push(`${p} changed ${iso7(hit.time)}, after the block content (${base}): the block may be behind`);
    }
  }
}

export async function collectState(opts: CollectOpts, deps: CollectDeps): Promise<State> {
  const now = (deps.now ?? (() => new Date()))();
  const env = deps.env ?? process.env;
  const warnings: string[] = [];
  const state: State = {
    version: 1,
    project: opts.project,
    conductor: opts.conductor,
    asOf: iso7(now),
    note: { path: resolveNotePath(opts, env), found: false, blockFound: false },
    done: [], running: [], waiting: [], decided: [], parked: [], next: [],
    health: { seats: [], server: "unknown", tabs: [] },
    sources: { note: "missing", cards: "stub", git: "ok", herdr: "ok", clickup: "skipped" },
    warnings,
  };

  // note
  let runningUnknown = false;
  try {
    const text = fs.readFileSync(state.note.path, "utf-8");
    state.note.found = true;
    state.note.updated = iso7(fs.statSync(state.note.path).mtime);
    const block = extractBlock(text, STATE_MARKER);
    state.note.blockFound = block.found;
    if (!block.found) {
      state.sources.note = "failed";
      warnings.push(`note ${state.note.path} has no conductor-state block; the conductor writes one (see state-write)`);
    } else {
      const { state: s, problems } = parseStateBody(block.body, text.slice(0, block.bodyStart).split("\n").length);
      state.sources.note = "ok";
      Object.assign(state, {
        running: s.running,
        waiting: s.waiting.map((w) => ({ ...w, question: stripMarkers(w.question) })),
        decided: s.decided,
        parked: s.parked.map((p) => ({ ...p, what: stripMarkers(p.what) })),
        next: s.next.map(stripMarkers),
      });
      state.health.seats = s.seats;
      if (s.ownerUnknown?.length) state.health.server = `owner unknown: ${s.ownerUnknown.join(", ")}`;
      if (s.updated) state.note.updated = s.updated;
      state.note.main = s.main;
      state.note.changed = s.changed;
      state.note.watch = s.watch;
      if (s.runningUnknown !== undefined) {
        state.running = [{ worker: "unknown", key: "-", stage: `Running cannot be read: ${s.runningUnknown}`, since: s.updated ?? state.asOf }];
        runningUnknown = true;
      }
      warnings.push(...problems.map((p) => `note block: ${p}`));
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") warnings.push(`note ${state.note.path} not found`);
    else {
      state.sources.note = "failed";
      warnings.push(`note ${state.note.path}: ${err.message}`);
    }
  }

  ageWarnings(state, now, runningUnknown);

  // git: only a DigiSmith checkout says anything about this project's work (DGS-577)
  const gitUsable = opts.project === "DigiSmith" && fs.existsSync(path.join(opts.repoDir, ".git"));
  if (!gitUsable) state.sources.git = "skipped";

  // git: what merged since the window start
  const since = opts.since ?? startOfDay7(now);
  if (gitUsable) try {
    const r = await deps.runner("git", ["log", "origin/main", `--since=${since}`, "--format=%H%x09%cI%x09%s"], { cwd: opts.repoDir });
    if (r.code !== 0) throw new Error(r.stderr.trim() || `exit ${r.code}`);
    const seen = new Set<string>();
    for (const row of r.stdout.split("\n")) {
      const subject = row.split("\t").slice(2).join("\t");
      const m = /\bdgs-(\d+)/i.exec(subject);
      if (!m) continue;
      const key = `DGS-${m[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const report = findReport(opts.repoDir, key);
      state.done.push({ key, line: subject.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, ""), ...(report ? { report } : {}) });
    }
  } catch (e) {
    state.sources.git = "failed";
    warnings.push(`git log origin/main failed: ${(e as Error).message}`);
  }

  // the newest merge on origin/main against the block's age (DGS-462)
  if (gitUsable) try {
    const r = await deps.runner("git", ["log", "origin/main", "--max-count=20", "--format=%H%x09%cI%x09%s"], { cwd: opts.repoDir });
    if (r.code === 0) {
      for (const row of r.stdout.split("\n")) {
        const [hash, time, ...subject] = row.split("\t");
        if (!hash || !time || Date.parse(time) > now.getTime() || /^chore: bump plugin version/.test(subject.join("\t"))) continue;
        state.newestMerge = { time, hash: hash.slice(0, 7) };
        break;
      }
    }
  } catch {
    // the age check is skipped; the git section above reports a failing git
  }
  // a recorded hash is exact (a fast-forward keeps its old commit date); without one, compare times
  const behind = state.newestMerge && (state.note.main ? state.note.main !== state.newestMerge.hash : !!state.note.updated && Date.parse(state.newestMerge.time) > Date.parse(state.note.updated));
  if (state.note.blockFound && behind && state.newestMerge) {
    state.note.stale = true;
    warnings.push(`state block updated ${state.note.updated}, older than the newest merge ${state.newestMerge.time} (${state.newestMerge.hash}; the block saw ${state.note.main ?? "no merge hash"}): run state-refresh`);
  }

  // herdr: server and open tabs
  try {
    const st = await deps.runner("herdr", ["--session", "default", "status", "server"]);
    if (st.code === 127) state.sources.herdr = "skipped";
    else if (st.code !== 0) {
      state.sources.herdr = "failed";
      warnings.push(`herdr status failed: ${st.stderr.trim() || `exit ${st.code}`}`);
    } else {
      const up = /^status:\s*(.+)$/m.exec(st.stdout)?.[1].trim() ?? "unknown";
      state.health.server = state.health.server === "unknown" ? up : `${up}; ${state.health.server}`;
      const args = ["--session", "default", "tab", "list", ...(opts.herdrWorkspace ? ["--workspace", opts.herdrWorkspace] : [])];
      const tl = await deps.runner("herdr", args);
      if (tl.code !== 0) throw new Error(tl.stderr.trim() || `tab list exit ${tl.code}`);
      const tabs = (JSON.parse(tl.stdout) as { result?: { tabs?: { tab_id?: string; label?: string }[] } }).result?.tabs ?? [];
      state.health.tabs = tabs.map((t) => `${t.tab_id ?? "?"} ${t.label ?? ""}`.trim());
    }
  } catch (e) {
    state.sources.herdr = "failed";
    warnings.push(`herdr tab list failed: ${(e as Error).message}`);
  }

  // limits (DGS-665): how many runs of each kind are busy; Health never breaks the catch-up, so a failure leaves the field out
  try {
    state.health.limits = limitLine(currentCount(process.env, opts.repoDir).count).replace(/^limits: /, "");
  } catch { /* leave it out */ }

  // cards: cross-check the Running rows against open worker cards
  if (deps.listCards) {
    try {
      const cards = deps.listCards(opts.project, { scope: "open" }).map((c) => c.card).filter((c) => c.role === "worker");
      state.sources.cards = "ok";
      const names = (c: CardRef["card"]) => [c.name, c.domain, c.id].filter(Boolean).map((x) => String(x).toLowerCase());
      for (const c of cards) {
        const hit = state.running.some((r) => names(c).includes(r.worker.toLowerCase()) || names(c).includes(r.key.toLowerCase()));
        if (!hit) warnings.push(`open worker card ${c.name ?? c.id} (${c.domain ?? "?"}) has no row in Running`);
      }
      for (const r of state.running) {
        const hit = cards.some((c) => names(c).includes(r.worker.toLowerCase()) || names(c).includes(r.key.toLowerCase()));
        if (!hit) warnings.push(`Running row ${r.worker} (${r.key}) has no open card`);
      }
    } catch (e) {
      state.sources.cards = "failed";
      warnings.push(`cards: ${(e as Error).message}`);
    }
  }
  return state;
}
