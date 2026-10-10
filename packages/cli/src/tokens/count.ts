import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
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
  const inferred = inferSessionsForTicket(opts.ticket, root).filter((s) => !registered.includes(s)).sort();
  const ticketSessions = new Set([...registered, ...inferred]);
  // A resumed transcript replays earlier responses, so dedupe across sessions too.
  const byResponse = new Map<string, { r: UsageRecord; file: string }>();
  for (const sid of [...new Set([...registered, ...inferred])]) {
    const file = findTranscript(sid, root);
    if (!file) {
      console.error(`tokens: no transcript found for session ${sid}`);
      continue;
    }
    // On a duplicate prefer the record whose own session is a ticket session, then the highest output,
    // then the one read from its own session's file as the tie-breaker.
    const rank = (r: UsageRecord, file: string): number[] => [ticketSessions.has(r.session_id) ? 1 : 0, r.output, r.session_id === file ? 1 : 0];
    const better = (a: number[], b: number[]): boolean => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
      return false;
    };
    for (const r of readClaudeCodeSession(file)) {
      const prior = byResponse.get(r.response_id);
      if (!prior || better(rank(r, sid), rank(prior.r, prior.file))) byResponse.set(r.response_id, { r, file: sid });
    }
  }
  const records = [...byResponse.values()].map((v) => v.r).sort((a, b) => a.ts.localeCompare(b.ts));
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

function git(cwd: string, args: string[]): string | null {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim() || null;
}

function isDigiSmithRoot(root: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf-8")) as { name?: string };
    return manifest.name === "digismith";
  } catch {
    return false;
  }
}

// The checkout root: git's top level, else the nearest parent that holds a plugin manifest.
function checkoutRoot(cwd: string): string | null {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (top) return top;
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, ".claude-plugin", "plugin.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function boardFile(root: string, ticket: string): string | null {
  const board = join(root, ".digismith", "board");
  if (!existsSync(board)) return null;
  const folder = readdirSync(board).find((n) => n.startsWith(`${ticket}—`));
  return folder ? join(board, folder, "tokens.json") : null;
}

export function resolveSnapshotPath(cwd: string, ticket: string): string {
  const root = checkoutRoot(cwd);
  if (root && isDigiSmithRoot(root)) {
    const own = boardFile(root, ticket);
    if (own) return own;
    // A linked worktree has no untracked board folder; it lives in the main checkout.
    const common = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (common) {
      const main = dirname(common);
      if (main !== root) {
        const shared = boardFile(main, ticket);
        if (shared) return shared;
      }
    }
  }
  return join(depotRegistryDir(), `${ticket}.tokens.json`);
}
