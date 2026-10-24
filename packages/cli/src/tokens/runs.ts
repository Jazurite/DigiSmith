import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { runsDir } from "../run/paths.ts";
import { bucketStart, countRun, transcriptIndex, writeJsonAtomic } from "./run-count.ts";
import type { RunTokens } from "./run-types.ts";
import { probeDir, readProbeSeats, writeSeats } from "./seats.ts";

export const BURN_SCHEMA = "oculus-burn/v1";
export interface BurnFile { schema: typeof BURN_SCHEMA; generated_at: string; window_min: 60; tokens: number; cost_usd: number | null; runs: number; unpriced_models: string[] }
export interface RunsPassResult { updated: number; skipped: number; failed: number; burn: BurnFile | null; seats: number }

const WEEK_MS = 7 * 24 * 3600_000;
const HOUR_MS = 3600_000;
const STORED_MS = 25 * HOUR_MS; // a file older than this holds no bucket of the last hour

const mtime = (p: string): number | null => { try { return statSync(p).mtimeMs; } catch { return null; } };

function isFinal(dir: string): boolean {
  try { return (JSON.parse(readFileSync(join(dir, "tokens.json"), "utf8")) as { final?: unknown }).final === true; } catch { return false; }
}

function runDirs(env: NodeJS.ProcessEnv): string[] {
  const root = runsDir(env);
  const out: string[] = [];
  let folders: string[] = [];
  try { folders = readdirSync(root); } catch { return out; }
  for (const folder of folders.filter((f) => !f.startsWith(".")).sort()) {
    let ids: string[] = [];
    try { ids = readdirSync(join(root, folder)); } catch { continue; } // hook-errors.log is a file
    for (const id of ids.filter((i) => !i.startsWith(".")).sort()) out.push(join(root, folder, id));
  }
  return out;
}

// The stored tokens.json of every run touched in the last 25 h: the input of the burn. A file that does not parse is skipped.
export function storedSnapshots(env: NodeJS.ProcessEnv, nowMs: number): RunTokens[] {
  const out: RunTokens[] = [];
  for (const dir of runDirs(env)) {
    const file = join(dir, "tokens.json");
    const m = mtime(file);
    if (m === null || nowMs - m > STORED_MS) continue;
    try {
      const s = JSON.parse(readFileSync(file, "utf8")) as RunTokens;
      if (s && Array.isArray(s.buckets) && Array.isArray(s.unpriced_models)) out.push(s);
    } catch { /* skip */ }
  }
  return out;
}

export function runsInScope(env: NodeJS.ProcessEnv, nowMs: number, only?: string): string[] {
  const out: string[] = [];
  for (const dir of runDirs(env)) {
    const runMs = mtime(join(dir, "run.json"));
    if (runMs === null) continue;
    if (only !== undefined) { if (basename(dir) === only) out.push(dir); continue; } // --run counts the named run even if final
    const activity = mtime(join(dir, "events.jsonl")) ?? runMs;
    const tokensMs = mtime(join(dir, "tokens.json"));
    const resumed = tokensMs !== null && tokensMs < activity;
    if (isFinal(dir) && !resumed) continue;
    if (nowMs - activity <= WEEK_MS || resumed) out.push(dir);
  }
  return out;
}

export function burnOf(snapshots: RunTokens[], now: Date): BurnFile {
  const end = Date.parse(bucketStart(now.toISOString()));
  const from = end - HOUR_MS;
  let tokens = 0;
  let cost: number | null = 0;
  let runs = 0;
  const unpriced = new Set<string>();
  for (const s of snapshots) {
    const inWindow = s.buckets.filter((b) => { const t = Date.parse(b.start); return t >= from && t < end; });
    if (inWindow.length === 0) continue;
    runs += 1;
    for (const m of s.unpriced_models) unpriced.add(m);
    for (const b of inWindow) { tokens += b.tokens; cost = cost === null || b.cost_usd === null ? null : cost + b.cost_usd; }
  }
  return { schema: BURN_SCHEMA, generated_at: now.toISOString(), window_min: 60, tokens, cost_usd: cost, runs, unpriced_models: [...unpriced].sort() };
}

export function runTokensPass(opts: { env: NodeJS.ProcessEnv; now: Date; projectsDir: string; run?: string; dryRun?: boolean; log?: (line: string) => void }): RunsPassResult {
  const log = opts.log ?? ((l: string) => console.error(l));
  const dirs = runsInScope(opts.env, opts.now.getTime(), opts.run);
  const index = transcriptIndex(opts.projectsDir);
  const snapshots: RunTokens[] = [];
  let updated = 0, skipped = 0, failed = 0;
  for (const dir of dirs) {
    if (opts.dryRun) { skipped += 1; continue; }
    try {
      const s = countRun(dir, { now: opts.now, index });
      if (s === null) skipped += 1; else { updated += 1; snapshots.push(s); }
    } catch (e) {
      failed += 1;
      log(`tokens runs: ${basename(dir)} failed (${(e as NodeJS.ErrnoException).code ?? (e as Error).name})`);
    }
  }
  // All runs, not only this pass: an ended or unchanged run still has buckets in the last hour.
  const burn = opts.dryRun ? null : burnOf(opts.run === undefined ? storedSnapshots(opts.env, opts.now.getTime()) : snapshots, opts.now);
  let seats = readProbeSeats(probeDir(opts.env)).length;
  if (!opts.dryRun) {
    if (opts.run === undefined && burn !== null) { // a one-run pass sees one run only: it must not replace the all-runs burn
      const tokensDir = join(runsDir(opts.env), ".tokens");
      mkdirSync(tokensDir, { recursive: true });
      writeJsonAtomic(join(tokensDir, "burn.json"), burn);
    }
    seats = writeSeats(probeDir(opts.env), opts.now).seats.length;
  }
  return { updated, skipped, failed, burn, seats };
}
