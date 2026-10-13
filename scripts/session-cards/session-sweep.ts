import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { listCards, markLost } from "./cards.ts";

export type Live = { ok: true; sessions: Set<string> } | { ok: false; error: string };
export type Verdict = "kept" | "lost" | "unverifiable";
export type SweepRow = { id: string; session: string; verdict: Verdict; reason: string };
export const DEFAULT_STALE_MIN = 30;

export function liveSessionsFromAgentList(stdout: string): Live {
  try {
    const agents = JSON.parse(stdout)?.result?.agents;
    if (!Array.isArray(agents) || agents.length === 0) return { ok: false, error: "herdr listed no agents: cannot tell what is alive" };
    if (agents.some((a) => typeof a?.agent_session?.value !== "string")) return { ok: false, error: "an agent has no agent_session yet: list incomplete" };
    const sessions = new Set<string>();
    for (const a of agents) if (typeof a?.agent_session?.value === "string") sessions.add(a.agent_session.value);
    return { ok: true, sessions };
  } catch {
    return { ok: false, error: "herdr output is not JSON" };
  }
}

// Read-only: `agent list` only, through the herdr-ws wrapper.
export function readLiveSessions(env: NodeJS.ProcessEnv = process.env): Live {
  const bin = path.join(os.homedir(), ".digismith-depot", "bin", "herdr-ws");
  const r = spawnSync(bin, ["agent", "list"], { env, encoding: "utf8", timeout: 15_000 });
  if (r.error || r.status !== 0) return { ok: false, error: r.error?.message ?? `herdr-ws exit ${r.status}` };
  return liveSessionsFromAgentList(r.stdout);
}

export function sweep(opts: {
  project: string; now?: Date; env?: NodeJS.ProcessEnv; apply?: boolean; staleMin?: number; live?: Live;
}): SweepRow[] {
  const now = opts.now ?? new Date();
  const staleMin = opts.staleMin ?? DEFAULT_STALE_MIN;
  if (!Number.isFinite(staleMin) || staleMin < 0) throw new Error(`stale threshold must be a number of minutes >= 0, got ${staleMin}`);
  const staleMs = staleMin * 60_000;
  const live = opts.live ?? readLiveSessions();
  const rows: SweepRow[] = [];
  for (const { card } of listCards(opts.project, { scope: "open", env: opts.env })) {
    const row = (verdict: Verdict, reason: string) => rows.push({ id: card.id, session: card.session, verdict, reason });
    if (!card.runs_on.startsWith("herdr")) { row("unverifiable", "not on herdr"); continue; }
    if (!live.ok) { row("unverifiable", `herdr read failed: ${live.error}`); continue; }
    if (Number.isNaN(Date.parse(card.last_seen))) { row("unverifiable", "last_seen is not a date"); continue; }
    if (now.getTime() - Date.parse(card.last_seen) < staleMs) { row("kept", "heartbeat is fresh"); continue; }
    if (live.sessions.has(card.session)) { row("kept", "stale but the engine session is alive"); continue; }
    row("lost", "stale heartbeat and the engine session is gone");
    if (opts.apply) markLost({ project: opts.project, id: card.id, session: card.session }, { now, env: opts.env });
  }
  return rows;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) {
  const project = arg("--project");
  if (!project) {
    console.error("usage: session-sweep.ts --project <p> [--apply] [--stale-min 30] [--json]");
    process.exit(2);
  }
  const staleMin = arg("--stale-min") ? Number(arg("--stale-min")) : undefined;
  const rows = sweep({ project, apply: process.argv.includes("--apply"), staleMin });
  if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
  else for (const r of rows) console.log(`${r.verdict}\t${r.id}\t${r.session}\t${r.reason}`);
}
