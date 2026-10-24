import * as fs from "node:fs";
import * as path from "node:path";
import { findRunDir, runsDir } from "./paths.ts";
import { readEvents, type EventLine } from "./events.ts";
import { readRun, type RunRecord } from "./record.ts";

export type RunSummary = { events: number; first_ts: string | null; last_ts: string | null; last_type: string | null; ended: boolean };
export type RunRow = { record: RunRecord; summary: RunSummary };

export function summarize(events: EventLine[]): RunSummary {
  const last = events[events.length - 1];
  // /clear fires an ended and then a started, so the run is over only if an ended comes after the last started (file order).
  const lastStarted = events.map((e) => e.type).lastIndexOf("started");
  const lastEnded = events.map((e) => e.type).lastIndexOf("ended");
  return {
    events: events.length,
    first_ts: events[0]?.ts ?? null,
    last_ts: last?.ts ?? null,
    last_type: last?.type ?? null,
    ended: lastEnded > lastStarted,
  };
}

function row(dir: string): RunRow | null {
  try {
    return { record: readRun(dir), summary: summarize(readEvents(dir)) };
  } catch {
    return null;
  }
}

export function listRuns(env: NodeJS.ProcessEnv, ticket?: string): RunRow[] {
  const root = runsDir(env);
  let keys: string[];
  try {
    keys = fs.readdirSync(root);
  } catch {
    return [];
  }
  const rows: RunRow[] = [];
  for (const key of keys) {
    if (ticket !== undefined && key !== ticket) continue;
    const keyDir = path.join(root, key);
    let ids: string[];
    try {
      ids = fs.readdirSync(keyDir);
    } catch {
      continue; // hook-errors.log is a file, not a ticket folder
    }
    for (const id of ids) {
      const r = row(path.join(keyDir, id));
      if (r) rows.push(r);
    }
  }
  return rows.sort((a, b) => (a.record.created_at < b.record.created_at ? 1 : a.record.created_at > b.record.created_at ? -1 : 0));
}

export function showRun(runId: string, env: NodeJS.ProcessEnv): RunRow | null {
  const dir = findRunDir(runId, env);
  return dir ? row(dir) : null;
}

export function tailEvents(runId: string, since: number, env: NodeJS.ProcessEnv): EventLine[] | null {
  const dir = findRunDir(runId, env);
  return dir ? readEvents(dir).filter((e) => e.seq > since) : null;
}

export function formatList(rows: RunRow[]): string {
  if (rows.length === 0) return "no runs";
  return rows
    .map(({ record: r, summary: s }) => [r.run, r.ticket ?? "-", r.role, r.seat ?? "-", r.created_at, `${s.events} events`, s.last_type ?? "-"].join("  "))
    .join("\n");
}

export function formatShow({ record: r, summary: s }: RunRow): string {
  return [
    `run       ${r.run}`,
    `ticket    ${r.ticket ?? "-"}`,
    `role      ${r.role}`,
    `seat      ${r.seat ?? "-"}`,
    `model     ${r.model ?? "-"}`,
    `branch    ${r.branch ?? "-"}`,
    `worktree  ${r.worktree ?? "-"}`,
    `herdr     ${[r.herdr.workspace, r.herdr.tab, r.herdr.pane].map((v) => v ?? "-").join(" / ")}`,
    `created   ${r.created_at}`,
    `events    ${s.events} (last: ${s.last_type ?? "-"} at ${s.last_ts ?? "-"})`,
    `ended     ${s.ended ? "yes" : "no"}`,
  ].join("\n");
}
