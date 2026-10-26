// scripts/workbox-health/drift-check.ts
// Read-only check for DGS-498: tracked files that changed only in line endings (CRLF) or mode.
// The Workbox repos set core.autocrlf=input and core.fileMode=false (DGS-478), so git status hides this; we override both.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

export type Result = { repo: string; eol: number; mode: number; broken: string | null; error: string | null };

const TIMEOUT_MS = 20_000;

function gitCall(repo: string, fileMode: boolean, args: string[], timeoutMs = TIMEOUT_MS): string {
  return execFileSync("git", ["-C", repo, "-c", "core.autocrlf=false", "-c", `core.fileMode=${fileMode}`, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
}

const git = (repo: string, fileMode: boolean, args: string[]) => gitCall(repo, fileMode, args);

const COMMON = ["diff", "--no-renames", "--ignore-submodules=all"];

export function countDrift(repo: string, limitMs = TIMEOUT_MS): { eol: number; mode: number } {
  // one limit for the whole repo: each git call gets what is left of it
  const deadline = Date.now() + limitMs;
  const git = (r: string, fileMode: boolean, args: string[]) => gitCall(r, fileMode, args, Math.max(1, deadline - Date.now()));
  // A: every file whose bytes differ (a CR counts). B: files with a real change (numstat drops CR-only files; --name-only would not).
  const a = new Set(git(repo, false, [...COMMON, "--name-only", "-z"]).split("\0").filter(Boolean));
  const b = new Set<string>();
  for (const rec of git(repo, false, [...COMMON, "--ignore-cr-at-eol", "--numstat", "-z"]).split("\0").filter(Boolean)) {
    b.add(rec.split("\t").slice(2).join("\t"));
  }
  let eol = 0;
  for (const f of a) if (!b.has(f)) eol++;

  // mode: --raw gives exact mode columns; a file already in A is a content change, not a mode-only change.
  let mode = 0;
  const tokens = git(repo, true, [...COMMON, "--raw", "-z"]).split("\0").filter(Boolean);
  for (let i = 0; i < tokens.length; i += 2) {
    const [oldMode, newMode, , , status] = tokens[i].slice(1).split(" ");
    if (status === "M" && oldMode !== newMode && !a.has(tokens[i + 1])) mode++;
  }
  return { eol, mode };
}

const SKIP = new Set([".git", "node_modules", ".debris"]);
const MAX_DEPTH = 6;

export function findCheckouts(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.name === ".git")) found.push(dir);
    if (depth >= MAX_DEPTH) return;
    for (const e of entries) if (e.isDirectory() && !SKIP.has(e.name)) walk(path.join(dir, e.name), depth + 1);
  };
  walk(root, 0);
  return found.sort();
}

export function checkRepo(repo: string, limitMs = TIMEOUT_MS): Result {
  const res: Result = { repo, eol: 0, mode: 0, broken: null, error: null };
  const dotgit = path.join(repo, ".git");
  try {
    if (fs.statSync(dotgit).isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotgit, "utf8"));
      const gitdir = m ? m[1].trim() : "";
      if (!gitdir || !fs.existsSync(path.resolve(repo, gitdir))) { res.broken = gitdir || "(empty)"; return res; }
    }
    Object.assign(res, countDrift(repo, limitMs));
  } catch (e) {
    res.error = (e as NodeJS.ErrnoException).code === "ETIMEDOUT" ? "timeout" : String((e as Error).message).split("\n")[0].slice(0, 120);
  }
  return res;
}

const rel = (repo: string, root: string) => (repo.startsWith(root + path.sep) ? path.relative(root, repo) : repo);

export function formatLine(r: Result, root: string): string | null {
  const name = rel(r.repo, root);
  if (r.broken) return `${name}: broken git link (${r.broken})`;
  if (r.error) return `${name}: check failed (${r.error})`;
  if (r.eol + r.mode === 0) return null;
  return `${name}: ${r.eol} eol, ${r.mode} mode`;
}

const utc7 = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 19).replace("T", " ");

const depotDir = (env: NodeJS.ProcessEnv) => env.DIGISMITH_DEPOT_DIR || path.join(os.homedir(), ".digismith-depot");

export function appendCsv(results: Result[], root: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): void {
  const file = path.join(depotDir(env), "observability", "drift.csv");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, "time_utc7,repo,eol,mode,note\n");
  const t = utc7(now);
  const lines = results.map((r) => {
    const note = r.broken ? "broken-link" : r.error ? "check-failed" : "";
    return [t, rel(r.repo, root), note ? "" : r.eol, note ? "" : r.mode, note].join(",");
  });
  fs.appendFileSync(file, lines.join("\n") + (lines.length ? "\n" : ""));
}

// DGS-557: the scheduled sweep. Same counting as a manual run; it adds a state file and change-only CSV lines.
export type SweepRepo = { repo: string; eol: number | null; mode: number | null; broken: boolean; note: string; gitdir?: string };
export type SweepState = { ranAt: string; ranAtUtc7: string; root?: string; repos: SweepRepo[] };
export type SweepNote = "sweep" | "sweep:recovered" | "broken-link" | "timeout" | "check-failed";

export const REPO_LIMIT_MS = 30_000;
const STALE_MS = 60 * 60_000;
const MAX_ALARM_REPOS = 5;

export function countSweepRepo(repo: string, limitMs: number): SweepRepo {
  const r = checkRepo(repo, limitMs);
  if (r.broken) return { repo, eol: null, mode: null, broken: true, note: "broken-link", gitdir: r.broken };
  if (r.error) return { repo, eol: null, mode: null, broken: false, note: r.error === "timeout" ? "timeout" : "check-failed" };
  return { repo, eol: r.eol, mode: r.mode, broken: false, note: "" };
}

const drifting = (r: SweepRepo) => (r.eol ?? 0) + (r.mode ?? 0) > 0;
const unhealthy = (r: SweepRepo) => r.broken || r.note === "timeout" || r.note === "check-failed";

export function changedRepos(prev: SweepState | null, next: SweepState): { repo: SweepRepo; note: SweepNote }[] {
  const before = new Map((prev?.repos ?? []).map((r) => [r.repo, r]));
  const out: { repo: SweepRepo; note: SweepNote }[] = [];
  for (const n of next.repos) {
    const p = before.get(n.repo);
    const bad = unhealthy(n) || drifting(n);
    const wasBad = p ? unhealthy(p) || drifting(p) : false;
    if (p && p.eol === n.eol && p.mode === n.mode && p.broken === n.broken && p.note === n.note) continue;
    if (!bad) { if (wasBad) out.push({ repo: n, note: "sweep:recovered" }); continue; }
    out.push({ repo: n, note: n.broken ? "broken-link" : n.note === "timeout" ? "timeout" : n.note === "check-failed" ? "check-failed" : "sweep" });
  }
  return out;
}

export function runSweep(opts: { root: string; stateFile: string; csvFile: string; now: () => Date; count: (repo: string, limitMs: number) => SweepRepo }): SweepState {
  if (!fs.statSync(opts.root).isDirectory()) throw new Error(`root is not a folder: ${opts.root}`);
  const now = opts.now();
  const repos = findCheckouts(opts.root).map((repo) => {
    let r: SweepRepo;
    try { r = opts.count(repo, REPO_LIMIT_MS); } catch (e) { r = { repo, eol: null, mode: null, broken: false, note: "check-failed" }; }
    return { ...r, repo: rel(repo, opts.root) };
  });
  const state: SweepState = { ranAt: now.toISOString(), ranAtUtc7: utc7(now), root: opts.root, repos };
  let prev: SweepState | null = null;
  try { prev = JSON.parse(fs.readFileSync(opts.stateFile, "utf8")) as SweepState; } catch { /* first sweep, or an unreadable state: everything drifting is new */ }

  const lines = changedRepos(prev, state).map(({ repo, note }) => {
    const blank = note === "broken-link" || note === "timeout" || note === "check-failed";
    const clean = note === "sweep:recovered";
    return [utc7(now), repo.repo, blank ? "" : clean ? 0 : repo.eol, blank ? "" : clean ? 0 : repo.mode, note].join(",");
  });
  // state tmp file first: if the state cannot be written, no CSV line goes out and the next sweep sees the same changes
  fs.mkdirSync(path.dirname(opts.stateFile), { recursive: true });
  const tmpFile = `${opts.stateFile}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2) + "\n");
  fs.mkdirSync(path.dirname(opts.csvFile), { recursive: true });
  if (!fs.existsSync(opts.csvFile)) fs.writeFileSync(opts.csvFile, "time_utc7,repo,eol,mode,note\n");
  if (lines.length) fs.appendFileSync(opts.csvFile, lines.join("\n") + "\n");
  fs.renameSync(tmpFile, opts.stateFile);
  return state;
}

export function sweepAlarmLines(state: SweepState | null, currentRepo: string, now: Date): string[] {
  if (!state || !Array.isArray(state.repos)) return [];
  const lines: string[] = [];
  if (now.getTime() - Date.parse(state.ranAt) > STALE_MS) lines.push(`DigiSmith: drift sweep has not run since ${state.ranAtUtc7.slice(0, 16)} UTC+7 (job drift-sweep)`);
  const others = state.repos.filter((r) => r.repo !== currentRepo && (r.broken || drifting(r)));
  if (others.length) {
    const named = others.slice(0, MAX_ALARM_REPOS).map((r) => (r.broken ? `${r.repo} broken git link` : `${r.repo} ${r.eol} eol, ${r.mode} mode`));
    const more = others.length > MAX_ALARM_REPOS ? `; and ${others.length - MAX_ALARM_REPOS} more` : "";
    lines.push(`DigiSmith: drift alarm (sweep ${state.ranAtUtc7.slice(11, 16)} UTC+7): ${named.join("; ")}${more}  (DGS-557)`);
  }
  return lines;
}

const sweepStateFile = (env: NodeJS.ProcessEnv) => path.join(depotDir(env), "observability", "drift-sweep.json");

function sweep(root: string, env: NodeJS.ProcessEnv, out: (s: string) => void): number {
  try {
    const state = runSweep({ root, stateFile: sweepStateFile(env), csvFile: path.join(depotDir(env), "observability", "drift.csv"), now: () => new Date(), count: countSweepRepo });
    for (const r of state.repos) {
      if (r.broken) out(`${r.repo}: broken git link (${r.gitdir ?? ""})`);
      else if (r.note) out(`${r.repo}: check failed (${r.note})`);
      else if (drifting(r)) out(`${r.repo}: ${r.eol} eol, ${r.mode} mode`);
    }
    return 0;
  } catch (e) {
    console.error(`drift sweep failed: ${(e as Error).message}`);
    return 1;
  }
}

export function run(argv: string[], env: NodeJS.ProcessEnv = process.env, out: (s: string) => void = (s) => console.log(s)): number {
  if (argv.includes("--alarm")) {
    try {
      const repoArg = argv[argv.indexOf("--repo") + 1];
      const top = git(path.resolve(repoArg), false, ["rev-parse", "--show-toplevel"]).trim();
      const r = checkRepo(top);
      if (!r.broken && !r.error && r.eol + r.mode > 0) out(`DigiSmith: drift alarm: ${top} ${r.eol} eol, ${r.mode} mode (DGS-498)`);
    } catch { /* a hook must not break a session */ }
    try {
      const repoArg = argv[argv.indexOf("--repo") + 1];
      const state = JSON.parse(fs.readFileSync(sweepStateFile(env), "utf8")) as SweepState;
      let current = "";
      try { // outside a git checkout there is no current repo: every drifting repo is "other"
        const top = git(path.resolve(repoArg), false, ["rev-parse", "--show-toplevel"]).trim();
        current = rel(fs.realpathSync(top), fs.realpathSync(state.root ?? path.join(os.homedir(), "Workspace")));
      } catch { /* keep "" */ }
      for (const l of sweepAlarmLines(state, current, new Date())) out(l);
    } catch { /* no sweep state yet, or unreadable: stay silent */ }
    return 0;
  }
  const val = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const root = path.resolve(val("--root") ?? path.join(os.homedir(), "Workspace"));
  if (argv.includes("--sweep")) return sweep(root, env, out);
  const repoArg = val("--repo");
  let repos: string[];
  if (repoArg) {
    try { repos = [git(path.resolve(repoArg), false, ["rev-parse", "--show-toplevel"]).trim()]; } catch { return 0; }
  } else repos = findCheckouts(root);
  const results = repos.map((r) => checkRepo(r));
  if (argv.includes("--json")) out(JSON.stringify(results, null, 2));
  else for (const r of results) { const l = formatLine(r, root); if (l) out(l); }
  if (!argv.includes("--no-log")) appendCsv(results, root, env);
  return results.some((r) => r.broken || r.error || r.eol + r.mode > 0) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(run(process.argv.slice(2)));
