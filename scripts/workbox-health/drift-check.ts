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

function git(repo: string, fileMode: boolean, args: string[]): string {
  return execFileSync("git", ["-C", repo, "-c", "core.autocrlf=false", "-c", `core.fileMode=${fileMode}`, ...args], {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
}

const COMMON = ["diff", "--no-renames", "--ignore-submodules=all"];

export function countDrift(repo: string): { eol: number; mode: number } {
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

export function checkRepo(repo: string): Result {
  const res: Result = { repo, eol: 0, mode: 0, broken: null, error: null };
  const dotgit = path.join(repo, ".git");
  try {
    if (fs.statSync(dotgit).isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotgit, "utf8"));
      const gitdir = m ? m[1].trim() : "";
      if (!gitdir || !fs.existsSync(path.resolve(repo, gitdir))) { res.broken = gitdir || "(empty)"; return res; }
    }
    Object.assign(res, countDrift(repo));
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

const depotDir = (env: NodeJS.ProcessEnv) => env.DIGISMITH_DEPOT_DIR || path.join(os.homedir(), ".digismith-depot");

export function appendCsv(results: Result[], root: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): void {
  const file = path.join(depotDir(env), "observability", "drift.csv");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, "time_utc7,repo,eol,mode,note\n");
  const t = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
  const lines = results.map((r) => {
    const note = r.broken ? "broken-link" : r.error ? "check-failed" : "";
    return [t, rel(r.repo, root), note ? "" : r.eol, note ? "" : r.mode, note].join(",");
  });
  fs.appendFileSync(file, lines.join("\n") + (lines.length ? "\n" : ""));
}

export function run(argv: string[], env: NodeJS.ProcessEnv = process.env, out: (s: string) => void = (s) => console.log(s)): number {
  if (argv.includes("--alarm")) {
    try {
      const repoArg = argv[argv.indexOf("--repo") + 1];
      const top = git(path.resolve(repoArg), false, ["rev-parse", "--show-toplevel"]).trim();
      const r = checkRepo(top);
      if (!r.broken && !r.error && r.eol + r.mode > 0) out(`DigiSmith: drift alarm: ${top} ${r.eol} eol, ${r.mode} mode (DGS-498)`);
    } catch { /* a hook must not break a session */ }
    return 0;
  }
  const val = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const root = path.resolve(val("--root") ?? path.join(os.homedir(), "Workspace"));
  const repoArg = val("--repo");
  let repos: string[];
  if (repoArg) {
    try { repos = [git(path.resolve(repoArg), false, ["rev-parse", "--show-toplevel"]).trim()]; } catch { return 0; }
  } else repos = findCheckouts(root);
  const results = repos.map(checkRepo);
  if (argv.includes("--json")) out(JSON.stringify(results, null, 2));
  else for (const r of results) { const l = formatLine(r, root); if (l) out(l); }
  if (!argv.includes("--no-log")) appendCsv(results, root, env);
  return results.some((r) => r.broken || r.error || r.eol + r.mode > 0) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(run(process.argv.slice(2)));
