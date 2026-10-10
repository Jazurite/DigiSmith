import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeProjectsDir, findTranscript, inferSessionsForTicket } from "./attribution.ts";
import { readClaudeCodeSession } from "./claude-code-reader.ts";
import { depotRegistryDir } from "./registry.ts";
import { buildSnapshot } from "./snapshot.ts";
import type { Counts, Registry, Snapshot, UsageRecord } from "./types.ts";

export interface CountOptions {
  ticket: string;
  registry: Registry;
  projectsDir?: string;
  now?: () => string;
  taskAgents?: Record<string, string[]>;
}

export function countTicket(opts: CountOptions): Snapshot {
  const root = opts.projectsDir ?? claudeProjectsDir();
  const entries = opts.registry.read(opts.ticket);
  const registered = entries.flatMap((e) => (e.kind === "session" ? [e.session_id] : []));
  const inferred = inferSessionsForTicket(opts.ticket, root).filter((s) => !registered.includes(s));
  // A resumed transcript replays earlier responses, so dedupe across sessions too.
  const byResponse = new Map<string, UsageRecord>();
  for (const sid of [...new Set([...registered, ...inferred])]) {
    const file = findTranscript(sid, root);
    if (!file) {
      console.error(`tokens: no transcript found for session ${sid}`);
      continue;
    }
    for (const r of readClaudeCodeSession(file)) {
      const prior = byResponse.get(r.response_id);
      if (!prior || r.output > prior.output) byResponse.set(r.response_id, { ...r, session_id: sid });
    }
  }
  const records = [...byResponse.values()].sort((a, b) => a.ts.localeCompare(b.ts));
  return buildSnapshot({
    ticket: opts.ticket,
    generatedAt: (opts.now ?? (() => new Date().toISOString()))(),
    records,
    entries,
    inferredSessions: inferred,
    taskAgents: opts.taskAgents,
  });
}

function row(label: string, model: string, c: Counts): string {
  const n = (v: number) => String(v).padStart(12);
  return `${label.padEnd(15)}${model.padEnd(28)}${n(c.input)}${n(c.output)}${n(c.cache_read)}${n(c.cache_write_5m)}${n(c.cache_write_1h)}${n(c.responses)}`;
}

export function renderTable(snapshot: Snapshot): string {
  const head =
    "step".padEnd(15) + "model".padEnd(28) +
    ["input", "output", "cache_read", "cache_w5m", "cache_w1h", "responses"].map((h) => h.padStart(12)).join("");
  const lines = [`ticket ${snapshot.ticket}`, head];
  for (const [step, models] of Object.entries(snapshot.steps)) {
    for (const [model, c] of Object.entries(models)) lines.push(row(step, model, c));
  }
  for (const [task, models] of Object.entries(snapshot.tasks)) {
    for (const [model, c] of Object.entries(models)) lines.push(row(`task ${task}`, model, c));
  }
  for (const [model, c] of Object.entries(snapshot.unattributed)) lines.push(row("unattributed", model, c));
  lines.push("", `sessions: ${snapshot.sessions.map((s) => `${s.session_id} (${s.attribution})`).join(", ") || "none"}`);
  return lines.join("\n");
}

function isDigiSmithRepo(cwd: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(cwd, ".claude-plugin", "plugin.json"), "utf-8")) as { name?: string };
    return manifest.name === "digismith";
  } catch {
    return false;
  }
}

export function resolveSnapshotPath(cwd: string, ticket: string): string {
  if (isDigiSmithRepo(cwd)) {
    const board = join(cwd, ".digismith", "board");
    if (existsSync(board)) {
      const folder = readdirSync(board).find((n) => n.startsWith(`${ticket}—`));
      if (folder) return join(board, folder, "tokens.json");
    }
  }
  return join(depotRegistryDir(), `${ticket}.tokens.json`);
}
