// state-refresh (DGS-462): rebuild the conductor's state block from herdr, the cards and git, keep the hand-written parts.
// Reads only (herdr, git, cards, ClickUp through an injected status reader); the one write is writeStateBlock.
import * as fs from "node:fs";
import * as path from "node:path";
import { contentKey, extractBlock, parseStateBody, renderStateBody, STATE_MARKER, writeStateBlock, type NoteState, type RunningRow } from "./state-block.ts";
import { iso7, resolveNotePath, type CardRef } from "./state.ts";
import type { Runner } from "./runner.ts";
import { parseMarkers, stripMarkers } from "./markers.ts";

/** True if the path (relative to the repo) exists; a path whose real location leaves the repo throws. */
function repoPathExists(repoDir: string, rel: string): boolean {
  const root = fs.realpathSync(repoDir);
  const full = path.resolve(root, rel);
  let probe = full;
  while (!fs.existsSync(probe) && !isLink(probe)) {
    const up = path.dirname(probe);
    if (up === probe) break;
    probe = up;
  }
  const real = fs.existsSync(probe) ? fs.realpathSync(probe) : probe;
  if (real !== root && !real.startsWith(root + path.sep)) throw new Error(`${rel} leaves the repo`);
  return isLink(full) || fs.existsSync(full);
}

function isLink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

// ---- the refresh ----

export interface RefreshOpts {
  project: string;
  conductor: string;
  note?: string;
  repoDir: string;
  herdrWorkspace?: string;
  /** worker names this conductor owns; undefined = reuse the list stored in the block */
  workers?: string[];
  dryRun?: boolean;
  /** files and folders to compare with the block content time; undefined = reuse the list stored in the block */
  watch?: string[];
  /** allow creating a note that does not exist */
  create?: boolean;
}

export interface RefreshDeps {
  runner: Runner;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  listCards?: (project: string, opts: { scope: "open" }) => CardRef[];
  /** ClickUp status of a ticket key, undefined when it cannot be read */
  ticketStatus?: (key: string) => Promise<string | undefined>;
}

export interface RefreshResult {
  notePath: string;
  written: boolean;
  state: NoteState;
  added: string[];
  removed: string[];
  dropped: string[];
  warnings: string[];
}

interface Agent {
  name?: string;
  agent_status?: string;
  workspace_id?: string;
  pane_id?: string;
  terminal_title_stripped?: string;
}

const DONE_STATUS = new Set(["done", "closed", "complete", "completed"]);
/** a card time in the block's own format (cards may carry seconds fractions or a Z) */
function cardTime(raw?: string): string | undefined {
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? undefined : iso7(new Date(t));
}
const isLead = (name: string) => /-(maestro|conductor)$/i.test(name);
const rowText = (r: RunningRow) => `${r.worker} | ${r.key} | ${r.stage}`;

export async function refreshState(opts: RefreshOpts, deps: RefreshDeps): Promise<RefreshResult> {
  const now = (deps.now ?? (() => new Date()))();
  const env = deps.env ?? process.env;
  const warnings: string[] = [];
  const notePath = resolveNotePath(opts, env);

  if (!fs.existsSync(notePath) && !opts.create) {
    throw new Error(`the note ${notePath} does not exist; check --conductor/--note, or pass --create`);
  }
  let blockText = "";
  let old: NoteState = { running: [], waiting: [], decided: [], parked: [], next: [], seats: [] };
  if (fs.existsSync(notePath)) {
    const text = fs.readFileSync(notePath, "utf-8");
    const block = extractBlock(text, STATE_MARKER);
    if (block.found) {
      const parsed = parseStateBody(block.body, text.slice(0, block.bodyStart).split("\n").length);
      if (parsed.problems.length) {
        throw new Error(`the block in ${notePath} is not valid, nothing was written:\n${parsed.problems.map((p) => `  ${p}`).join("\n")}`);
      }
      old = parsed.state;
      blockText = block.body;
    }
  }
  const repoOk = fs.existsSync(path.join(opts.repoDir, ".digismith"));
  if (!repoOk) warnings.push(`${opts.repoDir} has no .digismith folder (a plugin cache or the wrong checkout?): path and ticket markers are not evaluated`);
  const workers = (opts.workers ?? old.workers ?? []).map((w) => w.toLowerCase());

  // git: merged keys (for [resolves: merged ...])
  const merged = new Set<string>();
  let newestHash: string | undefined;
  let gitOk = true;
  try {
    const r = await deps.runner("git", ["log", "origin/main", "--max-count=300", "--format=%H%x09%cI%x09%s"], { cwd: opts.repoDir });
    if (r.code !== 0) throw new Error(r.stderr.trim() || `exit ${r.code}`);
    for (const row of r.stdout.split("\n")) {
      const [h, , subj = ""] = row.split("\t");
      if (h && !newestHash && !/^chore: bump plugin version/.test(subj)) newestHash = h.slice(0, 7);
      for (const m of row.split("\t").slice(2).join("\t").matchAll(/\bdgs-(\d+)/gi)) merged.add(`DGS-${m[1]}`);
    }
  } catch (e) {
    gitOk = false;
    warnings.push(`git log origin/main failed: ${(e as Error).message}; "merged" markers are kept`);
  }

  // Running: herdr agents of the pinned workspace + open worker cards
  const ownerUnknown: string[] = [];
  let running = old.running;
  let runningUnknown: string | undefined;
  const cards = (() => {
    if (!deps.listCards) return [];
    try {
      return deps.listCards(opts.project, { scope: "open" }).map((c) => c.card);
    } catch (e) {
      warnings.push(`cards: ${(e as Error).message}`);
      return [];
    }
  })();
  const conductorCard = cards.find((c) => c.role === "conductor" && c.name === opts.conductor);
  const owners = new Set([opts.conductor, conductorCard?.id].filter(Boolean).map((x) => String(x).toLowerCase()));
  const workerCards = cards.filter((c) => c.role === "worker");
  const cardOf = (name: string) => workerCards.find((c) => [c.name, c.domain, c.id].some((x) => x && String(x).toLowerCase() === name.toLowerCase()));
  const ownsCard = (c: { under?: string } | undefined) => !!c?.under && owners.has(c.under.toLowerCase());

  const workspace = opts.herdrWorkspace ?? /^herdr (w\d+):/.exec(conductorCard?.runs_on ?? "")?.[1];
  try {
    if (!workspace) {
      throw new Error(
        conductorCard
          ? `conductor card ${opts.conductor} has no runs_on and no workspace is pinned (HERDR_WS or --herdr-workspace)`
          : `no conductor card ${opts.conductor} found and no workspace is pinned (HERDR_WS or --herdr-workspace)`,
      );
    }
    const r = await deps.runner("herdr", ["--session", "default", "agent", "list"]);
    if (r.code !== 0) throw new Error(r.stderr.trim() || `exit ${r.code}`);
    let agents = (JSON.parse(r.stdout) as { result?: { agents?: Agent[] } }).result?.agents ?? [];
    agents = agents.filter((a) => a.workspace_id === workspace);
    const next: RunningRow[] = [];
    const seen = new Set<string>();
    for (const a of agents) {
      const name = a.name ?? a.pane_id ?? "?";
      if (isLead(name) || name.toLowerCase() === opts.conductor.toLowerCase()) continue;
      const card = cardOf(name);
      const mine = workers.includes(name.toLowerCase()) || ownsCard(card);
      if (!mine) {
        ownerUnknown.push(name);
        continue;
      }
      seen.add(name.toLowerCase());
      const key = /DGS-\d+/i.exec(a.terminal_title_stripped ?? "")?.[0].toUpperCase() ?? /dgs-\d+/i.exec(name)?.[0].toUpperCase() ?? "-";
      const before = old.running.find((x) => x.worker.toLowerCase() === name.toLowerCase());
      next.push({ worker: name, key, stage: a.agent_status ?? "unknown", since: cardTime(card?.started) ?? before?.since ?? iso7(now) });
    }
    for (const c of workerCards) {
      if (!ownsCard(c) || [c.name, c.id].some((x) => x && seen.has(String(x).toLowerCase()))) continue;
      next.push({ worker: c.name ?? c.id ?? "?", key: /DGS-\d+/i.exec(`${c.name} ${c.domain}`)?.[0].toUpperCase() ?? "-", stage: "card open, no pane", since: cardTime(c.started) ?? iso7(now) });
    }
    running = next;
  } catch (e) {
    runningUnknown = (e as Error).message;
    running = [];
    warnings.push(`Running is unknown: ${runningUnknown}`);
  }

  // resolved items: only an explicit marker drops one
  const dropped: string[] = [];
  const statusCache = new Map<string, string | undefined>();
  const resolved = async (label: string, head: string): Promise<boolean> => {
    const mk = parseMarkers(head);
    for (const bad of mk.malformed) warnings.push(`"${stripMarkers(head).slice(0, 50)}": bad marker ${bad}; item kept`);
    if (mk.resolvers.length === 0 || mk.malformed.length > 0) return false;
    for (const r of mk.resolvers) {
      let ok: boolean;
      try {
        if (!repoOk && r.kind !== "merged") throw new Error("no .digismith folder in the repo");
        switch (r.kind) {
          case "gone":
          case "exists":
            ok = repoPathExists(opts.repoDir, r.path) === (r.kind === "exists");
            break;
          case "merged":
            if (!gitOk) return false;
            ok = merged.has(r.key);
            break;
          case "ticket": {
            if (!deps.ticketStatus) throw new Error("no ClickUp reader");
            if (!statusCache.has(r.key)) statusCache.set(r.key, await deps.ticketStatus(r.key));
            const st = statusCache.get(r.key);
            if (st === undefined) throw new Error(`status of ${r.key} unreadable`);
            ok = DONE_STATUS.has(st.toLowerCase());
            break;
          }
        }
      } catch (e) {
        warnings.push(`"${stripMarkers(head).slice(0, 50)}": ${(e as Error).message}; item kept`);
        return false;
      }
      if (!ok) return false;
    }
    dropped.push(`${label}: ${stripMarkers(head)}`);
    return true;
  };
  const keep = async <T>(label: string, rows: T[], head: (r: T) => string): Promise<T[]> => {
    const out: T[] = [];
    for (const r of rows) if (!(await resolved(label, head(r)))) out.push(r);
    return out;
  };
  const stray: [string, string][] = [
    ...old.waiting.flatMap((r): [string, string][] => [[r.since, r.pane], [r.pane, r.pane]].map(([x]) => [x, r.question] as [string, string])),
    ...old.parked.flatMap((r): [string, string][] => [[r.why, r.what], [r.next, r.what]]),
    ...old.decided.map((r): [string, string] => [`${r.decision} ${r.why} ${r.allowedBy}`, r.decision]),
  ];
  for (const [field, owner] of stray) {
    if (/\[resolves:/.test(field)) warnings.push(`"${stripMarkers(owner).slice(0, 50)}": a marker outside the first field (or in Decided) is not used`);
  }
  const state: NoteState = {
    main: newestHash ?? old.main,
    updated: iso7(now),
    conductor: old.conductor ?? opts.conductor,
    workers: opts.workers ?? old.workers,
    watch: opts.watch ?? old.watch,
    runningUnknown,
    ownerUnknown,
    running,
    waiting: await keep("Waiting for Jack", old.waiting, (r) => r.question),
    decided: old.decided,
    parked: await keep("Parked or failed", old.parked, (r) => r.what),
    next: await keep("Next", old.next, (r) => r),
    seats: old.seats,
  };
  // the content time moves only when the block text (without the refresh time, content time and Main) changed
  if (contentKey(state) !== contentKey(old)) state.changed = state.updated;
  else state.changed = old.changed;

  const before = new Set(old.running.map(rowText));
  const after = new Set(state.running.map(rowText));
  const added = [...after].filter((x) => !before.has(x));
  const removed = [...before].filter((x) => !after.has(x));
  if (!opts.dryRun) {
    const nowText = fs.existsSync(notePath) ? fs.readFileSync(notePath, "utf-8") : "";
    const nowBlock = extractBlock(nowText, STATE_MARKER);
    if ((nowBlock.found ? nowBlock.body : "") !== blockText) throw new Error(`the block in ${notePath} changed while the refresh ran; nothing was written, run it again`);
  }
  if (!opts.dryRun) writeStateBlock(notePath, renderStateBody(state), STATE_MARKER);
  return { notePath, written: !opts.dryRun, state, added, removed, dropped, warnings };
}

export function renderRefresh(r: RefreshResult): string {
  const out = [`${r.written ? "refreshed" : "dry run, nothing written:"} the state block in ${r.notePath}`];
  out.push(r.state.runningUnknown !== undefined ? `Running: unknown (${r.state.runningUnknown})` : `Running: ${r.state.running.length} rows (+${r.added.length} -${r.removed.length})`);
  for (const a of r.added) out.push(`  + ${a}`);
  for (const a of r.removed) out.push(`  - ${a}`);
  for (const d of r.dropped) out.push(`dropped as resolved: ${d}`);
  if (r.state.ownerUnknown?.length) out.push(`owner unknown: ${r.state.ownerUnknown.join(", ")}`);
  for (const w of r.warnings) out.push(`warning: ${w}`);
  return `${out.join("\n")}\n`;
}
